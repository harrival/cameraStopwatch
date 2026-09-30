// ─── ShutterButton Component ────────────────────────────────────────────────
// Big, touch-friendly capture trigger with processing animation.

import type { ActionType } from '../types';

interface ShutterButtonProps {
  onClick: () => void;
  isProcessing: boolean;
  ocrReady: boolean;
  actionType: ActionType;
}

export default function ShutterButton({
  onClick,
  isProcessing,
  ocrReady,
  actionType,
}: ShutterButtonProps) {
  const isStart = actionType === 'START_GAME';

  return (
    <div className="shutter-container">
      <button
        className={`shutter-btn ${isProcessing ? 'processing' : ''} ${isStart ? 'shutter-start' : 'shutter-end'}`}
        onClick={onClick}
        disabled={isProcessing || !ocrReady}
        id="shutter-btn"
        aria-label={isProcessing ? 'Processing capture...' : `Capture photo to ${isStart ? 'start' : 'end'} game`}
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
            : `Tap to capture · ${isStart ? 'START' : 'END'} mode`}
      </p>
    </div>
  );
}
