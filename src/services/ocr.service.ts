// ─── OCR Service ─────────────────────────────────────────────────────────────
// Singleton Tesseract.js worker with multi-pass OCR & contrast enhancement.
// Uses SPARSE_TEXT ('11') and SINGLE_BLOCK ('6') page segmentation modes,
// which are designed for scene text, shirts, screens, and isolated usernames.

import Tesseract from 'tesseract.js';
import { processCanvasForOCR } from './imageProcessor.service';

let workerInstance: Tesseract.Worker | null = null;
let initPromise: Promise<Tesseract.Worker> | null = null;

/**
 * Returns (and lazily creates) the singleton Tesseract worker.
 * Reused for all subsequent recognition requests to eliminate loading delay.
 */
export async function getWorker(): Promise<Tesseract.Worker> {
  if (workerInstance) return workerInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[OCR] Initializing Tesseract worker...');
    const worker = await Tesseract.createWorker('eng', undefined, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR Progress] ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });

    // Use SPARSE_TEXT ('11') by default for isolated badges/usernames in photos
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    });

    console.log('[OCR] Tesseract worker ready.');
    workerInstance = worker;
    return worker;
  })();

  return initPromise;
}

/**
 * Runs OCR on a single image source with optional page segmentation mode.
 */
export async function recognizeWithConfidence(
  source: HTMLCanvasElement | string,
  options?: { psm?: Tesseract.PSM },
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker();

  if (options?.psm) {
    await worker.setParameters({
      tessedit_pageseg_mode: options.psm,
    });
  }

  const { data } = await worker.recognize(source);

  console.log('[OCR] Recognition result:', {
    text: data.text,
    confidence: data.confidence,
  });

  return {
    text: (data.text || '').trim(),
    confidence: Math.round(data.confidence ?? 0),
  };
}

/**
 * Check if the recognized text looks like it contains bracketed username content.
 */
function hasLikelyUsername(text: string): boolean {
  if (!text) return false;
  // Matches {[NAME]}, [NAME], (NAME), {NAME}, etc.
  return /[{(<\[|1I]\s*[{(<\[|1I]?\s*[A-Za-z0-9_\-]{2,}\s*[})>\]|1I]?\s*[})>\]|1I]/i.test(text);
}

/**
 * Multi-pass OCR pipeline designed for smartphone camera captures:
 * 1. Pass 1: Center-crop + contrast stretch (standard dark-on-light)
 * 2. Pass 2: Center-crop + inverted contrast (handles light-on-dark: screens, dark shirts)
 * 3. Pass 3: Center-crop with SINGLE_BLOCK ('6') mode
 * 4. Pass 4: Full-frame fallback
 *
 * If any pass detects bracketed username pattern, it returns immediately.
 * Otherwise, returns the pass with the most detected characters.
 */
export async function recognizeWithMultiPass(
  fullCanvas: HTMLCanvasElement,
): Promise<{ text: string; confidence: number; passName: string; processedCanvas: HTMLCanvasElement }> {
  const worker = await getWorker();

  // Pass 1: Center-crop + contrast stretch (Dark text on light background)
  const canvasPass1 = processCanvasForOCR(fullCanvas, { cropCenter: true, invert: false, contrastBoost: true });
  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
  const res1 = await worker.recognize(canvasPass1);
  const text1 = (res1.data.text || '').trim();
  const conf1 = Math.round(res1.data.confidence ?? 0);
  console.log('[OCR Pass 1 - Center Crop Normal]:', text1, `(${conf1}%)`);

  if (hasLikelyUsername(text1)) {
    return { text: text1, confidence: conf1, passName: 'Center Crop', processedCanvas: canvasPass1 };
  }

  // Pass 2: Center-crop + INVERTED contrast (Crucial for white text on dark shirts/screens)
  const canvasPass2 = processCanvasForOCR(fullCanvas, { cropCenter: true, invert: true, contrastBoost: true });
  const res2 = await worker.recognize(canvasPass2);
  const text2 = (res2.data.text || '').trim();
  const conf2 = Math.round(res2.data.confidence ?? 0);
  console.log('[OCR Pass 2 - Center Crop Inverted]:', text2, `(${conf2}%)`);

  if (hasLikelyUsername(text2)) {
    return { text: text2, confidence: conf2, passName: 'Inverted (Dark Mode / Shirt)', processedCanvas: canvasPass2 };
  }

  // Pass 3: Center-crop with SINGLE_BLOCK mode ('6')
  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
  const res3 = await worker.recognize(canvasPass1);
  const text3 = (res3.data.text || '').trim();
  const conf3 = Math.round(res3.data.confidence ?? 0);
  console.log('[OCR Pass 3 - Single Block]:', text3, `(${conf3}%)`);

  if (hasLikelyUsername(text3)) {
    return { text: text3, confidence: conf3, passName: 'Single Block', processedCanvas: canvasPass1 };
  }

  // Pass 4: Full-frame with contrast boost
  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
  const canvasPass4 = processCanvasForOCR(fullCanvas, { cropCenter: false, invert: false, contrastBoost: true });
  const res4 = await worker.recognize(canvasPass4);
  const text4 = (res4.data.text || '').trim();
  const conf4 = Math.round(res4.data.confidence ?? 0);
  console.log('[OCR Pass 4 - Full Frame]:', text4, `(${conf4}%)`);

  if (hasLikelyUsername(text4)) {
    return { text: text4, confidence: conf4, passName: 'Full Frame', processedCanvas: canvasPass4 };
  }

  // If no pass detected bracket pattern, return whichever pass had the most text/highest confidence
  const candidates = [
    { text: text1, confidence: conf1, passName: 'Center Crop', processedCanvas: canvasPass1 },
    { text: text2, confidence: conf2, passName: 'Inverted', processedCanvas: canvasPass2 },
    { text: text3, confidence: conf3, passName: 'Single Block', processedCanvas: canvasPass1 },
    { text: text4, confidence: conf4, passName: 'Full Frame', processedCanvas: canvasPass4 },
  ];

  candidates.sort((a, b) => b.text.length - a.text.length || b.confidence - a.confidence);
  return candidates[0];
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
 * Tears down the worker (useful for testing or app teardown).
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    initPromise = null;
  }
}
