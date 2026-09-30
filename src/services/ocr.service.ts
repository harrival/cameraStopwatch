// ─── OCR Service (Stage 2) ──────────────────────────────────────────────────
// Singleton Tesseract.js worker warmed on first call.
// Permissive config for testing — no character whitelist restriction.

import Tesseract from 'tesseract.js';

let workerInstance: Tesseract.Worker | null = null;
let initPromise: Promise<Tesseract.Worker> | null = null;

/**
 * Returns (and lazily creates) the singleton Tesseract worker.
 * The worker is warmed once and reused for every subsequent recognition.
 */
export async function getWorker(): Promise<Tesseract.Worker> {
  if (workerInstance) return workerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = await Tesseract.createWorker('eng', undefined, {});

    // Use AUTO page segmentation for general photos — much more
    // forgiving than SINGLE_LINE when text location is unknown.
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });

    workerInstance = worker;
    return worker;
  })();

  return initPromise;
}

/**
/**
 * Runs OCR on an image source (canvas, image URL, blob, etc.)
 * and returns both the trimmed text and overall confidence score.
 */
export async function recognizeWithConfidence(
  source: HTMLCanvasElement | string,
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker();
  const { data } = await worker.recognize(source);

  console.log('[OCR] Raw result:', {
    text: data.text,
    confidence: data.confidence,
  });

  return {
    text: data.text.trim(),
    confidence: Math.round(data.confidence ?? 0),
  };
}

/**
 * Runs OCR on an image source and returns the trimmed, uppercased text.
 */
export async function recognizeText(
  source: HTMLCanvasElement | string,
): Promise<string> {
  const { text } = await recognizeWithConfidence(source);
  return text.toUpperCase();
}

/**
 * Tears down the worker (useful on app unmount).
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    initPromise = null;
  }
}
