// ─── Image Processor Service ────────────────────────────────────────────────
// Preprocessing optimized for real-world camera photos:
// 1. Center crop (focus on user's target area)
// 2. Grayscale conversion + Contrast Stretching (Auto-Levels)
// 3. Inversion support (crucial for light text on dark shirts/screens)

export interface PreprocessOptions {
  cropCenter?: boolean;
  invert?: boolean;
  contrastBoost?: boolean;
}

/**
 * Preprocesses a canvas for optimal OCR accuracy.
 * Performs contrast stretching (normalizing min/max luminance),
 * optional center-cropping, and optional color inversion.
 */
export function processCanvasForOCR(
  sourceCanvas: HTMLCanvasElement,
  options: PreprocessOptions = {},
): HTMLCanvasElement {
  const { cropCenter = false, invert = false, contrastBoost = true } = options;

  let sx = 0;
  let sy = 0;
  let sw = sourceCanvas.width;
  let sh = sourceCanvas.height;

  if (cropCenter) {
    // Focus on 92% width and 86% height matching the full-screen camera viewfinder
    sw = Math.round(sourceCanvas.width * 0.92);
    sh = Math.round(sourceCanvas.height * 0.86);
    sx = Math.round((sourceCanvas.width - sw) / 2);
    sy = Math.round((sourceCanvas.height - sh) / 2);
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;

  const ctx = outCanvas.getContext('2d')!;
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const imgData = ctx.getImageData(0, 0, sw, sh);
  const { data } = imgData;

  // Step 1: Compute grayscale luminance and find min/max for contrast normalization
  let minLum = 255;
  let maxLum = 0;
  const lums = new Uint8Array(sw * sh);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // ITU-R BT.601 standard luminance
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lums[j] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const lumRange = maxLum - minLum || 1;

  // Step 2: Apply contrast stretching (and optional inversion)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    let val: number;

    if (contrastBoost && lumRange > 20) {
      // Contrast stretch: map [minLum, maxLum] -> [0, 255]
      val = Math.round(((lums[j] - minLum) / lumRange) * 255);
    } else {
      val = lums[j];
    }

    if (invert) {
      val = 255 - val;
    }

    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    // alpha remains 255
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Legacy loader + basic preprocessor for backward compatibility.
 */
export async function preprocessImage(
  imageUri: string,
  _threshold: number = 128,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageUri);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  return processCanvasForOCR(canvas, { cropCenter: false, invert: false, contrastBoost: true });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}
