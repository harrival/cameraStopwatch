// ─── App.tsx — Live camera capture mode ─────────────────────────────────────
// Shows live video preview. Shutter captures frame instantly (no "Use Photo" dialog).
// Extracts EXIF timestamp + OCR text inside {[...]}, alerts the result.

import { useState, useEffect, useCallback, useRef } from 'react';
import { startCamera, captureFrame, stopCamera } from './services/camera.service';
import { recognizeText, getWorker, terminateWorker } from './services/ocr.service';

import './App.css';

/**
 * Extracts the username from OCR text by finding content inside {[ ]}.
 * e.g. "{[PLAYER_01]}" → "PLAYER_01"
 */
function extractUsername(ocrText: string): string | null {
  const match = ocrText.match(/\{\[\s*(.*?)\s*\]\}/);
  return match ? match[1].trim() : null;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Warm Tesseract worker
  useEffect(() => {
    getWorker()
      .then(() => setOcrReady(true))
      .catch((err) => console.error('[App] OCR worker init failed:', err));

    return () => { terminateWorker(); };
  }, []);

  // Start live camera on mount
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    startCamera(videoEl)
      .then(() => setCameraReady(true))
      .catch((err) => {
        console.error('[App] Camera failed:', err);
        setCameraError(err instanceof Error ? err.message : 'Camera access denied');
      });

    return () => { stopCamera(); };
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Capture pipeline: Frame → OCR → alert ─────────────────────────────
  const handleCapture = useCallback(async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    setIsProcessing(true);
    setToast(null);

    try {
      // 1. Capture current frame (instant, no confirmation)
      const captureTimestamp = new Date().toISOString();
      const { imageUri } = await captureFrame(videoEl);

      // 2. Tesseract OCR
      const rawText = await recognizeText(imageUri);

      // 3. Extract username from {[...]} brackets
      const username = extractUsername(rawText) || '(no {[username]} found)';

      // 4. Alert the result
      const result = { time: captureTimestamp, username };
      alert(JSON.stringify(result, null, 2));

      setToast({ message: `✓ ${username}`, type: 'success' });

      // Clean up the object URL
      URL.revokeObjectURL(imageUri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Error: ${message}`);
      setToast({ message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="app-shell camera-app">
      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          {toast.message}
        </div>
      )}

      {/* Live camera preview — fills the screen */}
      <div className="camera-viewport">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
        />

        {/* Camera error state */}
        {cameraError && (
          <div className="camera-error">
            <span className="camera-error-icon">📷</span>
            <p>{cameraError}</p>
            <p className="camera-error-hint">Make sure camera permissions are granted.</p>
          </div>
        )}

        {/* Shutter overlay at bottom */}
        <div className="camera-controls">
          <button
            className={`shutter-btn shutter-start ${isProcessing ? 'processing' : ''}`}
            onClick={handleCapture}
            disabled={isProcessing || !ocrReady || !cameraReady}
            id="shutter-btn"
            aria-label={isProcessing ? 'Processing…' : 'Capture'}
          >
            <span className="shutter-ring">
              {isProcessing ? (
                <span className="shutter-spinner" />
              ) : (
                <span className="shutter-inner" />
              )}
            </span>
          </button>
          <p className="camera-hint">
            {!cameraReady
              ? 'Starting camera…'
              : !ocrReady
                ? 'Loading OCR…'
                : isProcessing
                  ? 'Processing…'
                  : 'Tap to capture'}
          </p>
        </div>
      </div>
    </div>
  );
}
