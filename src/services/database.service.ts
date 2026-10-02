// ─── Database Service (Stage 3) ─────────────────────────────────────────────
// IndexedDB-backed persistence via the `idb` library.
// Implements the deterministic state machine:
//   CREATED → (Start Game) → IN_PROGRESS → (End Game) → COMPLETED

import { openDB, type IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';
import type { Player, GameSession, GameTimingRecord, ActionType } from '../types';

const DB_NAME = 'camera-stopwatch';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Players store  (index on username + gameId)
        if (!db.objectStoreNames.contains('players')) {
          const playerStore = db.createObjectStore('players', { keyPath: 'id' });
          playerStore.createIndex('by_username', 'username', { unique: false });
          playerStore.createIndex('by_gameId', 'gameId', { unique: false });
        }

        // Game sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }

        // Timing records store (index on gameId + playerId)
        if (!db.objectStoreNames.contains('timingRecords')) {
          const timingStore = db.createObjectStore('timingRecords', { keyPath: 'id' });
          timingStore.createIndex('by_gameId', 'gameId', { unique: false });
          timingStore.createIndex('by_playerId', 'playerId', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// ══════════════════════════════════════════════════════════════════════════════
// Game Sessions
// ══════════════════════════════════════════════════════════════════════════════

export async function createGameSession(title: string): Promise<GameSession> {
  const db = await getDb();
  const session: GameSession = {
    id: uuid(),
    title,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  await db.put('sessions', session);
  return session;
}

export async function getGameSession(id: string): Promise<GameSession | undefined> {
  const db = await getDb();
  return db.get('sessions', id);
}

export async function getAllGameSessions(): Promise<GameSession[]> {
  const db = await getDb();
  return db.getAll('sessions');
}

export async function updateGameSession(session: GameSession): Promise<void> {
  const db = await getDb();
  await db.put('sessions', session);
}

// ══════════════════════════════════════════════════════════════════════════════
// Players
// ══════════════════════════════════════════════════════════════════════════════

export async function addPlayer(
  gameId: string,
  username: string,
  displayName: string,
): Promise<Player> {
  const db = await getDb();
  const player: Player = { id: uuid(), username: username.toUpperCase(), displayName, gameId };
  await db.put('players', player);

  // Also create a CREATED timing record for this player
  const timingRecord: GameTimingRecord = {
    id: uuid(),
    gameId,
    playerId: player.id,
    username: player.username,
    time_started: null,
    time_ended: null,
    time_used: null,
    status: 'CREATED',
    updatedAt: new Date().toISOString(),
  };
  await db.put('timingRecords', timingRecord);

  return player;
}

export async function getPlayersByGame(gameId: string): Promise<Player[]> {
  const db = await getDb();
  return db.getAllFromIndex('players', 'by_gameId', gameId);
}

export async function findPlayerByUsername(
  gameId: string,
  username: string,
): Promise<Player | undefined> {
  const db = await getDb();
  const allPlayers = await db.getAllFromIndex('players', 'by_gameId', gameId);
  return allPlayers.find((p) => p.username === username.toUpperCase());
}

export async function removePlayer(playerId: string, gameId: string): Promise<void> {
  const db = await getDb();
  await db.delete('players', playerId);

  // Also remove associated timing records
  const records = await db.getAllFromIndex('timingRecords', 'by_gameId', gameId);
  for (const record of records) {
    if (record.playerId === playerId) {
      await db.delete('timingRecords', record.id);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Timing Records — Core State Machine
// ══════════════════════════════════════════════════════════════════════════════

export async function getTimingRecordsByGame(gameId: string): Promise<GameTimingRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('timingRecords', 'by_gameId', gameId);
}

/**
 * Deterministic state machine for recording player timestamps.
 *
 * START_GAME: status must be CREATED → sets time_started, transitions to IN_PROGRESS
 * END_GAME:   status must be IN_PROGRESS → sets time_ended, computes time_used, transitions to COMPLETED
 */
export async function recordPlayerTimestamp(
  gameId: string,
  username: string,
  timestamp: string,
  action: ActionType,
): Promise<GameTimingRecord> {
  const db = await getDb();

  // 1. Locate player record
  const player = await findPlayerByUsername(gameId, username);
  if (!player) throw new Error(`Player "${username}" not found in this game.`);

  // 2. Fetch existing timing record
  const allRecords = await db.getAllFromIndex('timingRecords', 'by_gameId', gameId);
  let record = allRecords.find((r) => r.playerId === player.id);

  if (action === 'START_GAME') {
    // Guard: only allow starting if status is CREATED
    if (record && record.status !== 'CREATED') {
      throw new Error(
        `Cannot start game for ${username}: status is ${record.status}, expected CREATED.`,
      );
    }

    if (!record) {
      // Create a new timing record if one doesn't exist
      record = {
        id: uuid(),
        gameId,
        playerId: player.id,
        username: player.username,
        time_started: timestamp,
        time_ended: null,
        time_used: null,
        status: 'IN_PROGRESS',
        updatedAt: new Date().toISOString(),
      };
    } else {
      record = {
        ...record,
        time_started: timestamp,
        status: 'IN_PROGRESS',
        updatedAt: new Date().toISOString(),
      };
    }

    await db.put('timingRecords', record);
  } else if (action === 'END_GAME') {
    // Guard: only allow ending if status is IN_PROGRESS
    if (!record || record.status !== 'IN_PROGRESS') {
      throw new Error(
        `Cannot end game for ${username}: status is ${record?.status ?? 'missing'}, expected IN_PROGRESS.`,
      );
    }
    if (!record.time_started) {
      throw new Error(`Cannot end game for ${username}: time_started is missing.`);
    }

    const startMs = new Date(record.time_started).getTime();
    const endMs = new Date(timestamp).getTime();
    const time_used = Math.max(0, endMs - startMs);

    record = {
      ...record,
      time_ended: timestamp,
      time_used,
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    };

    await db.put('timingRecords', record);
  }

  return record!;
}

/**
 * Manually update a timing record (for manual review corrections).
 */
export async function updateTimingRecord(record: GameTimingRecord): Promise<void> {
  const db = await getDb();
  await db.put('timingRecords', record);
}
