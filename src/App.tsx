// ─── App.tsx — Live camera capture with robust OCR & on-screen HUD ────────────
// Shows live camera with aim box. Shutter captures frame, runs dual-pass OCR,
// parses {[username]} with OCR error tolerance, and displays real-time feedback.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startCamera,
  captureFrame,
  stopCamera,
  applyZoom,
  getZoomCapabilities,
} from './services/camera.service';
import { recognizeWithMultiPass, getWorker } from './services/ocr.service';

import './App.css';

export interface ScanResult {
  username: string | null;
  rawText: string;
  confidence: number;
  time: string;
  previewUrl?: string;
  passName?: string;
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
  const doubleBracketRegex = /[{(<\[|1I]\s*[{(<\[|1I]\s*([A-Za-z0-9_\-\.\s]+?)\s*[})>\]|1I]\s*[})>\]|1I]/i;
  const matchDouble = normalized.match(doubleBracketRegex);
  if (matchDouble && matchDouble[1].trim()) {
    return { username: matchDouble[1].trim().toUpperCase(), raw };
  }

  // 2. Standard single bracket: [NAME] or {NAME}
  const singleBracketRegex = /[{[]\s*([A-Za-z0-9_\-\.\s]+?)\s*[}\]]/i;
  const matchSingle = normalized.match(singleBracketRegex);
  if (matchSingle && matchSingle[1].trim()) {
    return { username: matchSingle[1].trim().toUpperCase(), raw };
  }

  // 3. Parentheses fallback: (NAME)
  const parenRegex = /\(\s*([A-Za-z0-9_\-\.\s]+?)\s*\)/i;
  const matchParen = normalized.match(parenRegex);
  if (matchParen && matchParen[1].trim()) {
    return { username: matchParen[1].trim().toUpperCase(), raw };
  }

  // 4. Loose fallback: any opening symbol ... word ... any closing symbol
  const looseRegex = /[{(<\[]\s*([A-Za-z0-9_\-\.\s]+?)\s*[})>\]]/i;
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
  const previewUrlRef = useRef<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [minZoom, setMinZoom] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(4);
  const [isHardwareZoom, setIsHardwareZoom] = useState<boolean>(false);
  const touchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  // Clean up preview object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Warm Tesseract singleton worker once
  useEffect(() => {
    getWorker()
      .then(() => setOcrReady(true))
      .catch((err) => console.error('[App] OCR worker init failed:', err));
  }, []);

  // Start live camera on mount
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    startCamera(videoEl)
      .then(() => {
        setCameraReady(true);
        const caps = getZoomCapabilities();
        setMinZoom(caps.min);
        setMaxZoom(caps.max);
        setIsHardwareZoom(caps.isHardware);
        setZoom(caps.current || 1);
      })
      .catch((err) => {
        console.error('[App] Camera failed:', err);
        setCameraError(err instanceof Error ? err.message : 'Camera access denied');
      });

    return () => {
      stopCamera();
    };
  }, []);

  // Zoom control handlers
  const handleZoomChange = useCallback(async (newZoom: number) => {
    const clamped = Math.max(minZoom, Math.min(maxZoom, Math.round(newZoom * 10) / 10));
    setZoom(clamped);
    const res = await applyZoom(clamped);
    setIsHardwareZoom(res.isHardware);
  }, [minZoom, maxZoom]);

  const handleZoomIn = useCallback(() => {
    handleZoomChange(zoom + (zoom >= 2 ? 1 : 0.5));
  }, [zoom, handleZoomChange]);

  const handleZoomOut = useCallback(() => {
    handleZoomChange(zoom - (zoom > 2 ? 1 : 0.5));
  }, [zoom, handleZoomChange]);

  // Touch pinch-to-zoom handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      touchDistanceRef.current = dist;
      initialZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const scale = dist / touchDistanceRef.current;
      handleZoomChange(initialZoomRef.current * scale);
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  // ── Capture pipeline: Multi-pass Frame → OCR → Auto-reset ───────────────
  const handleCapture = useCallback(async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    setIsProcessing(true);

    try {
      const captureTimestamp = new Date().toISOString();
      const timeStr = new Date(captureTimestamp).toLocaleTimeString();

      // 1. Capture camera frame with canvas (incorporating zoom)
      const { imageUri, canvas } = await captureFrame(videoEl, zoom, isHardwareZoom);

      try {
        // 2. Run multi-pass OCR (center-crop, inverted contrast, full-frame)
        const ocrRes = await recognizeWithMultiPass(canvas);
        const extracted = extractUsername(ocrRes.text);

        // Revoke the old preview URL if any
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = imageUri;

        const scan: ScanResult = {
          username: extracted.username,
          rawText: extracted.raw,
          confidence: ocrRes.confidence,
          time: timeStr,
          previewUrl: imageUri,
          passName: ocrRes.passName,
        };

        setLastResult(scan);
        console.log('[Capture Result]', scan);
      } catch (ocrErr) {
        URL.revokeObjectURL(imageUri);
        throw ocrErr;
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
  }, [zoom, isHardwareZoom]);

  return (
    <div className="app-shell camera-app">
      {/* Live camera preview — fills the screen */}
      <div
        className="camera-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
          style={{
            transform: !isHardwareZoom && zoom > 1 ? `scale(${zoom})` : undefined,
            transformOrigin: 'center center',
          }}
        />

        {/* Aim Reticle Viewfinder — Dynamic Full Screen HUD */}
        <div className="camera-reticle" aria-hidden="true">
          <div className="reticle-box">
            <span className="reticle-corner top-left" />
            <span className="reticle-corner top-right" />
            <span className="reticle-corner bottom-left" />
            <span className="reticle-corner bottom-right" />
            <div className="reticle-crosshair" />
            <span className="reticle-hint">Align {'{[username]}'} anywhere in frame</span>
          </div>
        </div>

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
              <div className="hud-header-right">
                <span className="hud-time">{lastResult.time}</span>
                <button
                  type="button"
                  className="hud-close-btn"
                  onClick={() => setLastResult(null)}
                  aria-label="Dismiss result"
                >
                  ✕
                </button>
              </div>
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

            {/* Prominent Raw Recognition Output */}
            <div className="hud-raw-container">
              <div className="hud-raw-bar">
                <span className="hud-raw-title">
                  Camera saw (Raw OCR output)
                  {lastResult.passName && (
                    <span className="hud-pass-tag"> • {lastResult.passName}</span>
                  )}:
                </span>
                {lastResult.confidence > 0 && (
                  <span className="hud-raw-conf">{lastResult.confidence}% confidence</span>
                )}
              </div>

              <div className="hud-raw-details">
                {lastResult.previewUrl && (
                  <img
                    src={lastResult.previewUrl}
                    alt="Captured camera frame"
                    className="hud-preview-img"
                  />
                )}
                <div className="hud-raw-content">
                  <pre className="hud-raw-text">{lastResult.rawText}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shutter & Zoom overlay at bottom */}
        <div className="camera-controls">
          {/* Zoom controls toolbar */}
          {cameraReady && (
            <div className="zoom-toolbar" role="group" aria-label="Camera Zoom">
              <button
                type="button"
                className="zoom-btn-step"
                onClick={handleZoomOut}
                disabled={zoom <= minZoom}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>

              <div className="zoom-presets">
                {[1, 2, 3].filter((p) => p <= maxZoom).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`zoom-preset-btn ${Math.abs(zoom - preset) < 0.2 ? 'active' : ''}`}
                    onClick={() => handleZoomChange(preset)}
                    aria-label={`Zoom ${preset}x`}
                  >
                    {preset}×
                  </button>
                ))}
                {![1, 2, 3].some((p) => Math.abs(zoom - p) < 0.2) && (
                  <span className="zoom-custom-badge">{zoom.toFixed(1)}×</span>
                )}
              </div>

              <button
                type="button"
                className="zoom-btn-step"
                onClick={handleZoomIn}
                disabled={zoom >= maxZoom}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
          )}

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
