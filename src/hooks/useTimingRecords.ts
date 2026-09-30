// ─── useTimingRecords Hook ──────────────────────────────────────────────────
// Reactive state hook that polls IndexedDB for the active game's timing records.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameTimingRecord } from '../types';
import { getTimingRecordsByGame } from '../services/database.service';

export function useTimingRecords(gameId: string | null) {
  const [records, setRecords] = useState<GameTimingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setRecords([]);
      return;
    }

    setLoading(true);
    try {
      const data = await getTimingRecordsByGame(gameId);
      // Sort: COMPLETED last, then by username
      data.sort((a, b) => {
        const statusOrder = { CREATED: 0, IN_PROGRESS: 1, COMPLETED: 2 };
        const diff = statusOrder[a.status] - statusOrder[b.status];
        if (diff !== 0) return diff;
        return a.username.localeCompare(b.username);
      });
      setRecords(data);
    } catch (err) {
      console.error('[useTimingRecords] Refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // Poll every 2 seconds for reactivity
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { records, loading, refresh };
}
