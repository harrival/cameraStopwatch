// ─── Camera Service ─────────────────────────────────────────────────────────
// Live video stream via getUserMedia — no native picker, no "Use Photo" dialog.

let activeStream: MediaStream | null = null;

/**
 * Starts the rear camera and attaches it to a <video> element.
 * Returns the stream so it can be stopped later.
 */
export async function startCamera(videoEl: HTMLVideoElement): Promise<MediaStream> {
  // Stop any existing stream
  stopCamera();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' }, // rear camera
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  activeStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

/**
 * Captures the current video frame as a Blob (JPEG).
 * Returns both a blob (for EXIF/OCR) and an object URL.
 */
export async function captureFrame(videoEl: HTMLVideoElement): Promise<{
  imageUri: string;
  blob: Blob;
}> {
  const width = videoEl.videoWidth || 1920;
  const height = videoEl.videoHeight || 1080;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(videoEl, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Frame capture failed'))),
      'image/jpeg',
      0.92,
    );
  });

  const imageUri = URL.createObjectURL(blob);
  return { imageUri, blob };
}

/**
 * Captures a photo via file input picker (fallback / standalone capture).
 */
export async function capturePhoto(): Promise<{ imageUri: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No photo selected'));
        return;
      }
      const imageUri = URL.createObjectURL(file);
      resolve({ imageUri, blob: file });
    };

    input.oncancel = () => {
      reject(new Error('Photo capture cancelled'));
    };

    input.click();
  });
}

/**
 * Stops the active camera stream.
 */
export function stopCamera(): void {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
}

