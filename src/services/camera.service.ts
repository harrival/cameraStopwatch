// ─── Camera Service (Stage 1) ───────────────────────────────────────────────
// Wraps @capacitor/camera for native shutter access.
// Falls back to an HTML <input type="file"> capture for browser/dev.

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CaptureResult {
  /** Local file URI (capacitor) or object URL (web fallback) */
  imageUri: string;
  /** Raw blob for EXIF + OCR processing */
  blob: Blob;
}

/**
 * Opens the native camera, captures a photo, and returns both
 * the local URI and the raw Blob for downstream processing.
 */
export async function capturePhoto(): Promise<CaptureResult> {
  if (Capacitor.isNativePlatform()) {
    return captureNative();
  }
  return captureWeb();
}

// ── Native (Capacitor) path ─────────────────────────────────────────────────

async function captureNative(): Promise<CaptureResult> {
  const photo = await Camera.getPhoto({
    quality: 90,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    correctOrientation: true,
  });

  const imageUri = photo.webPath ?? photo.path ?? '';
  const response = await fetch(imageUri);
  const blob = await response.blob();

  return { imageUri, blob };
}

// ── Web fallback (file input) ───────────────────────────────────────────────

function captureWeb(): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // rear camera on mobile browsers

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      const imageUri = URL.createObjectURL(file);
      resolve({ imageUri, blob: file });
    };

    input.oncancel = () => reject(new Error('Camera capture cancelled'));
    input.click();
  });
}
