// ─── Text Matcher Utility ───────────────────────────────────────────────────
// Fuzzy string matching with fuzzysort to resolve OCR character swaps.

import fuzzysort from 'fuzzysort';

export interface MatchResult {
  matched: boolean;
  username: string;
  score: number;
  originalText: string;
}

/**
 * Attempts to match raw OCR text against a list of registered usernames.
 *
 * First tries an exact match; if none, falls back to fuzzy matching.
 * Returns the best match if above the confidence threshold.
 *
 * @param rawText   - The raw string from Tesseract OCR
 * @param usernames - The list of registered player usernames
 * @param threshold - Minimum fuzzysort score to accept (default: -500)
 */
export function matchUsername(
  rawText: string,
  usernames: string[],
  threshold: number = -500,
): MatchResult {
  const cleaned = rawText.trim().toUpperCase().replace(/\s+/g, '');

  // 1. Exact match
  const exact = usernames.find((u) => u === cleaned);
  if (exact) {
    return { matched: true, username: exact, score: 0, originalText: rawText };
  }

  // 2. Fuzzy match
  if (usernames.length === 0) {
    return { matched: false, username: '', score: -Infinity, originalText: rawText };
  }

  const results = fuzzysort.go(cleaned, usernames, {
    threshold,
    limit: 1,
  });

  if (results.length > 0 && results[0].score >= threshold) {
    return {
      matched: true,
      username: results[0].target,
      score: results[0].score,
      originalText: rawText,
    };
  }

  return { matched: false, username: '', score: -Infinity, originalText: rawText };
}
