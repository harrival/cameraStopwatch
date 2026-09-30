// ─── Data Models (§4 of the spec) ───────────────────────────────────────────

export interface Player {
  id: string;               // UUID
  username: string;         // Unique shirt identifier (e.g., "SHADOW_01")
  displayName: string;
  gameId: string;
}

export interface GameSession {
  id: string;
  title: string;
  status: 'PENDING' | 'ACTIVE' | 'CONCLUDED';
  createdAt: string;
}

export interface GameTimingRecord {
  id: string;
  gameId: string;
  playerId: string;
  username: string;

  // Timestamps (ISO 8601 strings with millisecond resolution)
  time_started: string | null;
  time_ended: string | null;

  // Computed Duration (time_ended - time_started in milliseconds)
  time_used: number | null;

  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
  updatedAt: string;
}

export interface CaptureQueueItem {
  id: string;
  gameId: string;
  action: 'START_GAME' | 'END_GAME';
  imageUri: string;
  captureTimestamp: string;
  detectedText?: string;
  matchedUsername?: string;
  processingState: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  errorMessage?: string;
}

export type ActionType = 'START_GAME' | 'END_GAME';
