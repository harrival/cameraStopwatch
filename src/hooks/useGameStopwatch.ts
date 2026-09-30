// ─── useGameStopwatch Hook (Stage 4) ────────────────────────────────────────
// Orchestration hook: Camera → EXIF + Canvas → Tesseract → DB

import { useState, useCallback, useEffect } from 'react';
import type { ActionType, GameTimingRecord } from '../types';
import { capturePhoto } from '../services/camera.service';
import { extractCaptureTimestamp } from '../services/metadata.service';
import { preprocessImage } from '../services/imageProcessor.service';
import { recognizeText, getWorker, terminateWorker } from '../services/ocr.service';
import {
  recordPlayerTimestamp,
  getPlayersByGame,
} from '../services/database.service';
import { matchUsername } from '../utils/textMatcher';

export interface StopwatchState {
  isProcessing: boolean;
  lastResult: ProcessingResult | null;
  ocrReady: boolean;
}

export interface ProcessingResult {
  success: boolean;
  record?: GameTimingRecord;
  detectedText?: string;
  matchedUsername?: string;
  captureTimestamp?: string;
  error?: string;
  /** When fuzzy match fails, populated for manual review */
  needsManualReview?: boolean;
  imageUri?: string;
}

export function useGameStopwatch(gameId: string | null) {
  const [actionType, setActionType] = useState<ActionType>('START_GAME');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<ProcessingResult | null>(null);
  const [ocrReady, setOcrReady] = useState(false);

  // Warm the Tesseract worker on mount
  useEffect(() => {
    getWorker()
      .then(() => setOcrReady(true))
      .catch((err) => console.error('[useGameStopwatch] Worker init failed:', err));

    return () => {
      terminateWorker();
    };
  }, []);

  /**
   * Full capture → OCR → DB pipeline.
   */
  const triggerCapture = useCallback(async (): Promise<ProcessingResult> => {
    if (!gameId) {
      const r: ProcessingResult = { success: false, error: 'No active game selected.' };
      setLastResult(r);
      return r;
    }

    setIsProcessing(true);
    setLastResult(null);

    try {
      // 1. Camera shutter
      const { imageUri, blob } = await capturePhoto();

      // 2. Parallel: EXIF extraction + Canvas preprocessing
      const [captureTimestamp, processedCanvas] = await Promise.all([
        extractCaptureTimestamp(blob),
        preprocessImage(imageUri),
      ]);

      // 3. Tesseract OCR
      const detectedText = await recognizeText(processedCanvas);

      if (!detectedText) {
        const r: ProcessingResult = {
          success: false,
          error: 'No text detected in image.',
          detectedText: '',
          captureTimestamp,
          needsManualReview: true,
          imageUri,
        };
        setLastResult(r);
        return r;
      }

      // 4. Fuzzy match against registered players
      const players = await getPlayersByGame(gameId);
      const usernames = players.map((p) => p.username);
      const match = matchUsername(detectedText, usernames);

      if (!match.matched) {
        const r: ProcessingResult = {
          success: false,
          error: `Could not match "${detectedText}" to any player.`,
          detectedText,
          captureTimestamp,
          needsManualReview: true,
          imageUri,
        };
        setLastResult(r);
        return r;
      }

      // 5. Database update
      const record = await recordPlayerTimestamp(
        gameId,
        match.username,
        captureTimestamp,
        actionType,
      );

      const r: ProcessingResult = {
        success: true,
        record,
        detectedText,
        matchedUsername: match.username,
        captureTimestamp,
      };
      setLastResult(r);
      return r;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const r: ProcessingResult = { success: false, error: message };
      setLastResult(r);
      return r;
    } finally {
      setIsProcessing(false);
    }
  }, [gameId, actionType]);

  /**
   * Manual assignment: operator picks the player from a dropdown.
   * The captureTimestamp is preserved from the original photo.
   */
  const manualAssign = useCallback(
    async (username: string, captureTimestamp: string): Promise<ProcessingResult> => {
      if (!gameId) {
        return { success: false, error: 'No active game.' };
      }

      try {
        const record = await recordPlayerTimestamp(
          gameId,
          username,
          captureTimestamp,
          actionType,
        );

        const r: ProcessingResult = {
          success: true,
          record,
          matchedUsername: username,
          captureTimestamp,
        };
        setLastResult(r);
        return r;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const r: ProcessingResult = { success: false, error: message };
        setLastResult(r);
        return r;
      }
    },
    [gameId, actionType],
  );

  return {
    actionType,
    setActionType,
    isProcessing,
    lastResult,
    ocrReady,
    triggerCapture,
    manualAssign,
    setLastResult,
  };
}
