// ─── ManualReviewModal Component ────────────────────────────────────────────
// Fallback dialog for when OCR can't read the username.
// Preserves the original capture timestamp.

import { useState } from 'react';
import type { Player } from '../types';

interface ManualReviewModalProps {
  isOpen: boolean;
  detectedText: string;
  captureTimestamp: string;
  imageUri?: string;
  players: Player[];
  onConfirm: (username: string) => void;
  onCancel: () => void;
}

export default function ManualReviewModal({
  isOpen,
  detectedText,
  captureTimestamp,
  imageUri,
  players,
  onConfirm,
  onCancel,
}: ManualReviewModalProps) {
  const [selectedUsername, setSelectedUsername] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" id="manual-review-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Manual Player Selection</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {imageUri && (
            <div className="modal-image-preview">
              <img src={imageUri} alt="Captured photo" />
            </div>
          )}

          <div className="modal-info">
            <div className="modal-info-row">
              <span className="modal-info-label">OCR Detected:</span>
              <span className="modal-info-value mono">
                {detectedText || '(nothing detected)'}
              </span>
            </div>
            <div className="modal-info-row">
              <span className="modal-info-label">Timestamp:</span>
              <span className="modal-info-value mono">
                {new Date(captureTimestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <label className="modal-select-label" htmlFor="player-select">
            Select the correct player:
          </label>
          <select
            id="player-select"
            className="modal-select"
            value={selectedUsername}
            onChange={(e) => setSelectedUsername(e.target.value)}
          >
            <option value="">— Choose player —</option>
            {players.map((p) => (
              <option key={p.id} value={p.username}>
                {p.username} ({p.displayName})
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => selectedUsername && onConfirm(selectedUsername)}
            disabled={!selectedUsername}
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
}
