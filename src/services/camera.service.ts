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

export interface ZoomInfo {
  min: number;
  max: number;
  step: number;
  current: number;
  isHardware: boolean;
}

/**
 * Inspects the current video track capabilities for hardware optical/sensor zoom.
 */
export function getZoomCapabilities(): ZoomInfo {
  const track = activeStream?.getVideoTracks()[0];
  if (track && typeof track.getCapabilities === 'function') {
    const caps = track.getCapabilities() as { zoom?: { min: number; max: number; step: number } };
    if (caps && caps.zoom) {
      const settings = (typeof track.getSettings === 'function' ? track.getSettings() : {}) as { zoom?: number };
      return {
        min: caps.zoom.min || 1,
        max: caps.zoom.max || 5,
        step: caps.zoom.step || 0.1,
        current: settings.zoom || 1,
        isHardware: true,
      };
    }
  }
  // Digital zoom fallback
  return {
    min: 1,
    max: 4,
    step: 0.1,
    current: 1,
    isHardware: false,
  };
}

/**
 * Applies zoom to the hardware camera track if supported.
 * Returns true if hardware zoom was applied, false if digital zoom fallback is required.
 */
export async function applyZoom(zoomLevel: number): Promise<{ isHardware: boolean }> {
  const track = activeStream?.getVideoTracks()[0];
  if (track && typeof track.getCapabilities === 'function') {
    const caps = track.getCapabilities() as { zoom?: { min: number; max: number } };
    if (caps && caps.zoom) {
      const clamped = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 5, zoomLevel));
      try {
        await track.applyConstraints({
          advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
        });
        return { isHardware: true };
      } catch (e) {
        console.warn('Hardware zoom constraint rejected, using digital zoom:', e);
      }
    }
  }
  return { isHardware: false };
}

/**
 * Captures the current video frame as a Blob (JPEG).
 * Handles optical or digital crop-zoom so the saved frame matches what user sees.
 */
export async function captureFrame(
  videoEl: HTMLVideoElement,
  zoomLevel: number = 1,
  isHardwareZoom: boolean = false,
): Promise<{
  imageUri: string;
  blob: Blob;
  canvas: HTMLCanvasElement;
}> {
  const width = videoEl.videoWidth;
  const height = videoEl.videoHeight;
  if (!width || !height) {
    throw new Error('Camera is not ready yet. Please wait for the video feed to display and try again.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;

  // If digital zoom is applied without hardware sensor zooming, crop center proportional to zoom
  if (zoomLevel > 1 && !isHardwareZoom) {
    const cropW = width / zoomLevel;
    const cropH = height / zoomLevel;
    const cropX = (width - cropW) / 2;
    const cropY = (height - cropH) / 2;
    ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, width, height);
  } else {
    ctx.drawImage(videoEl, 0, 0, width, height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Frame capture failed'))),
      'image/jpeg',
      0.92,
    );
  });

  const imageUri = URL.createObjectURL(blob);
  return { imageUri, blob, canvas };
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

