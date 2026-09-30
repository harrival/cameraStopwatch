// ─── ModeSelector Component ─────────────────────────────────────────────────
// Toggle between Start Game and End Game modes.

import type { ActionType } from '../types';

interface ModeSelectorProps {
  actionType: ActionType;
  onChange: (type: ActionType) => void;
  disabled?: boolean;
}

export default function ModeSelector({ actionType, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      <button
        className={`mode-btn mode-start ${actionType === 'START_GAME' ? 'active' : ''}`}
        onClick={() => onChange('START_GAME')}
        disabled={disabled}
        id="mode-start-btn"
      >
        <span className="mode-icon">▶</span>
        <span className="mode-label">Start Game</span>
      </button>
      <button
        className={`mode-btn mode-end ${actionType === 'END_GAME' ? 'active' : ''}`}
        onClick={() => onChange('END_GAME')}
        disabled={disabled}
        id="mode-end-btn"
      >
        <span className="mode-icon">⏹</span>
        <span className="mode-label">End Game</span>
      </button>
    </div>
  );
}
