// ─── Image Processor Service (Stage 2) ──────────────────────────────────────
// Canvas-based preprocessing: grayscale → high-contrast binarization
// Optimizes noisy fabric photos for single-line Tesseract OCR.

/**
 * Loads an image from a URI onto an offscreen canvas, applies
 * grayscale conversion and binary thresholding, and returns
 * the processed canvas element ready for Tesseract.
 *
 * Luminance formula: L = 0.299·R + 0.587·G + 0.114·B
 */
export async function preprocessImage(
  imageUri: string,
  threshold: number = 128,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageUri);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // ITU-R BT.601 luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // Binary threshold: above → white, below → black
    const value = luminance >= threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    // alpha channel untouched
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}
