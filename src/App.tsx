// ─── App.tsx — Live camera capture with robust OCR & on-screen HUD ────────────
// Shows live camera with aim box. Shutter captures frame, runs dual-pass OCR,
// parses {[username]} with OCR error tolerance, and displays real-time feedback.

import { useState, useEffect, useCallback, useRef } from 'react';
import { startCamera, captureFrame, stopCamera } from './services/camera.service';
import { recognizeWithConfidence, getWorker, terminateWorker } from './services/ocr.service';

import './App.css';

export interface ScanResult {
  username: string | null;
  rawText: string;
  confidence: number;
  time: string;
}

/**
 * Robust username extractor for OCR text.
 * Handles Tesseract's common misidentifications of curly/square brackets:
 *  - Spaces: "{ [ PLAYER ] }" or "{\n[PLAYER]\n}"
 *  - Swapped brackets: "([PLAYER])", "[[PLAYER]]", "{{PLAYER}}", "|[PLAYER]|"
 *  - Single brackets: "[PLAYER]" or "{PLAYER}" or "(PLAYER)"
 *  - Fallback: single isolated alphanumeric token if brackets were obliterated
 */
export function extractUsername(ocrText: string): {
  username: string | null;
  raw: string;
} {
  const raw = (ocrText || '').trim();
  if (!raw) {
    return { username: null, raw: '(no text detected by camera)' };
  }

  // Normalize all line breaks and multiple spaces
  const normalized = raw.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ');

  // 1. Double bracket variations (e.g. {[NAME]}, { [ NAME ] }, ([NAME]), [[NAME]], {{NAME}}, |[NAME]|)
  const doubleBracketRegex = /[{(<\[|1I]\s*[{(<\[|1I]\s*([A-Za-z0-9_\-]+)\s*[})>\]|1I]\s*[})>\]|1I]/i;
  const matchDouble = normalized.match(doubleBracketRegex);
  if (matchDouble && matchDouble[1].trim()) {
    return { username: matchDouble[1].trim().toUpperCase(), raw };
  }

  // 2. Standard single bracket: [NAME] or {NAME}
  const singleBracketRegex = /[{[]\s*([A-Za-z0-9_\-]+)\s*[}\]]/i;
  const matchSingle = normalized.match(singleBracketRegex);
  if (matchSingle && matchSingle[1].trim()) {
    return { username: matchSingle[1].trim().toUpperCase(), raw };
  }

  // 3. Parentheses fallback: (NAME)
  const parenRegex = /\(\s*([A-Za-z0-9_\-]+)\s*\)/i;
  const matchParen = normalized.match(parenRegex);
  if (matchParen && matchParen[1].trim()) {
    return { username: matchParen[1].trim().toUpperCase(), raw };
  }

  // 4. Loose fallback: any opening symbol ... word ... any closing symbol
  const looseRegex = /[{(<\[]\s*([A-Za-z0-9_\-]+)\s*[})>\]]/i;
  const matchLoose = normalized.match(looseRegex);
  if (matchLoose && matchLoose[1].trim()) {
    return { username: matchLoose[1].trim().toUpperCase(), raw };
  }

  // 5. If there's an alphanumeric word that looks like a username token (2 to 15 chars)
  const words = normalized
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
    .filter((w) => w.length >= 2);
  if (words.length === 1 && /^[A-Za-z0-9_\-]+$/.test(words[0])) {
    return { username: words[0].toUpperCase(), raw };
  }

  return { username: null, raw };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Warm Tesseract worker
  useEffect(() => {
    getWorker()
      .then(() => setOcrReady(true))
      .catch((err) => console.error('[App] OCR worker init failed:', err));

    return () => {
      terminateWorker();
    };
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

    return () => {
      stopCamera();
    };
  }, []);

  // ── Capture pipeline: Dual-pass Frame → OCR → Auto-reset ───────────────
  const handleCapture = useCallback(async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    setIsProcessing(true);

    try {
      const captureTimestamp = new Date().toISOString();
      const timeStr = new Date(captureTimestamp).toLocaleTimeString();

      // 1. Capture full camera frame
      const { imageUri } = await captureFrame(videoEl);

      try {
        // 2. Run OCR on the full frame
        const ocrRes = await recognizeWithConfidence(imageUri);
        const extracted = extractUsername(ocrRes.text);

        const scan: ScanResult = {
          username: extracted.username,
          rawText: extracted.raw,
          confidence: ocrRes.confidence,
          time: timeStr,
        };

        setLastResult(scan);
        console.log('[Capture Result]', scan);
      } finally {
        URL.revokeObjectURL(imageUri);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Capture Error]', message);
      setLastResult({
        username: null,
        rawText: `Error: ${message}`,
        confidence: 0,
        time: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="app-shell camera-app">
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

        {/* On-Screen Feedback HUD */}
        {lastResult && (
          <div
            className={`scan-hud ${lastResult.username ? 'hud-success' : 'hud-warning'}`}
            role="status"
          >
            <div className="hud-header">
              <span className="hud-badge">
                {lastResult.username ? '✓ USERNAME FOUND' : '⚠ NO BRACKET MATCH'}
              </span>
              <span className="hud-time">{lastResult.time}</span>
            </div>

            <div className="hud-main">
              {lastResult.username ? (
                <span className="hud-username">
                  {'{['}
                  <strong>{lastResult.username}</strong>
                  {']}'}
                </span>
              ) : (
                <span className="hud-not-found">No username recognized in brackets</span>
              )}
            </div>

            <div className="hud-raw">
              <span className="hud-raw-title">Camera saw:</span>
              <span className="hud-raw-text">"{lastResult.rawText}"</span>
              {lastResult.confidence > 0 && (
                <span className="hud-raw-conf">({lastResult.confidence}% match)</span>
              )}
            </div>
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
                ? 'Loading OCR engine…'
                : isProcessing
                  ? 'Reading photo…'
                  : 'Tap to capture'}
          </p>
        </div>
      </div>
    </div>
  );
}
