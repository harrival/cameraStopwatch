// ─── App.tsx — Simplified capture-only mode ─────────────────────────────────
// Captures a photo, extracts EXIF timestamp + OCR text inside {[...]}, alerts the result.

import { useState, useEffect, useCallback } from 'react';
import { extractCaptureTimestamp } from './services/metadata.service';
import { recognizeText, getWorker, terminateWorker } from './services/ocr.service';
import { capturePhoto } from './services/camera.service';

import './App.css';

/**
 * Extracts the username from OCR text by finding content inside {[ ]}.
 * e.g. "{[PLAYER_01]}" → "PLAYER_01"
 * If multiple matches exist, returns the first one.
 */
function extractUsername(ocrText: string): string | null {
  const match = ocrText.match(/\{\[\s*(.*?)\s*\]\}/);
  return match ? match[1].trim() : null;
}

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Warm the Tesseract worker on mount
  useEffect(() => {
    getWorker()
      .then(() => setOcrReady(true))
      .catch((err) => console.error('[App] OCR worker init failed:', err));

    return () => { terminateWorker(); };
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Capture pipeline: Camera → EXIF → OCR → alert ─────────────────────
  const handleCapture = useCallback(async () => {
    setIsProcessing(true);
    setToast(null);

    try {
      // 1. Camera shutter
      const { imageUri, blob } = await capturePhoto();

      // 2. Extract EXIF timestamp
      const captureTimestamp = await extractCaptureTimestamp(blob);

      // 3. Tesseract OCR
      const rawText = await recognizeText(imageUri);

      // 4. Extract username from {[...]} brackets
      const username = extractUsername(rawText) || '(no {[username]} found)';

      // 5. Alert the result
      const result = { time: captureTimestamp, username };
      alert(JSON.stringify(result, null, 2));

      setToast({ message: `✓ ${username}`, type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Error: ${message}`);
      setToast({ message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">⏱</span>
            Camera Stopwatch
          </h1>
        </div>
      </header>

      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          {toast.message}
        </div>
      )}

      <main className="game-main capture-only">
        <section className="controls-section">
          <div className="shutter-container">
            <button
              className={`shutter-btn shutter-start ${isProcessing ? 'processing' : ''}`}
              onClick={handleCapture}
              disabled={isProcessing || !ocrReady}
              id="shutter-btn"
              aria-label={isProcessing ? 'Processing capture...' : 'Capture photo'}
            >
              <span className="shutter-ring">
                {isProcessing ? (
                  <span className="shutter-spinner" />
                ) : (
                  <span className="shutter-inner" />
                )}
              </span>
            </button>
            <p className="shutter-hint">
              {!ocrReady
                ? 'Warming up OCR engine…'
                : isProcessing
                  ? 'Processing…'
                  : 'Tap to capture'}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
