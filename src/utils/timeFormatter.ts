// ─── Time Formatter Utility ─────────────────────────────────────────────────
// Converts milliseconds to human-readable formats.

/**
 * Formats a duration in milliseconds to HH:MM:SS.mmm
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return '--:--:--.---';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':') + '.' + String(milliseconds).padStart(3, '0');
}

/**
 * Formats a duration in milliseconds to a compact form: e.g. "2m 34s"
 */
export function formatDurationCompact(ms: number | null): string {
  if (ms === null || ms < 0) return '—';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Formats an ISO 8601 timestamp to a short local time string.
 */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  } catch {
    return iso;
  }
}
