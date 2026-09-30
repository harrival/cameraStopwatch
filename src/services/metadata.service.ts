// ─── Metadata Service (Stage 1) ─────────────────────────────────────────────
// Extracts EXIF DateTimeOriginal from a photo blob using exifreader.
// Falls back to the current system time if EXIF data is unavailable.

import ExifReader from 'exifreader';

/**
 * Extracts the capture timestamp from EXIF metadata.
 * Returns an ISO 8601 string with millisecond precision.
 *
 * Priority chain:
 *  1. DateTimeOriginal + SubSecTimeOriginal
 *  2. DateTimeOriginal alone
 *  3. Current device time (fallback)
 */
export async function extractCaptureTimestamp(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);

    const dateTimeTag = tags['DateTimeOriginal'];
    if (!dateTimeTag?.description) {
      console.warn('[MetadataService] No DateTimeOriginal found; using system time.');
      return new Date().toISOString();
    }

    // EXIF format: "YYYY:MM:DD HH:MM:SS"
    const raw = dateTimeTag.description;
    const isoDate = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');

    // Append subsecond precision if available
    const subSec = tags['SubSecTimeOriginal']?.description;
    if (subSec) {
      return new Date(`${isoDate}.${subSec}`).toISOString();
    }

    return new Date(isoDate).toISOString();
  } catch (error) {
    console.warn('[MetadataService] EXIF extraction failed; using system time.', error);
    return new Date().toISOString();
  }
}
