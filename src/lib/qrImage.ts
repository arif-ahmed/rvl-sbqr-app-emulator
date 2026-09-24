import QRCode from 'qrcode';
import jsQR from 'jsqr';

const QR_INK = '#0a1f44';

/**
 * Render a payload as a PNG data URL (dark on white — maximises decodability).
 * Use level H when something (the amount badge) is drawn over the centre.
 */
export function qrDataUrl(payload: string, size = 520, level: 'M' | 'H' = 'M'): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: level,
    margin: 2,
    width: size,
    color: { dark: QR_INK, light: '#ffffff' },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The selected file is not a readable image.'));
    img.src = src;
  });
}

function scan(source: CanvasImageSource, w: number, h: number, maxDim: number): string | null {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch);
  return jsQR(data.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Decode the first QR found in an uploaded image (gallery upload flow). */
export async function decodeQrFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG or JPG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // Try a few resolutions: large photos decode better downscaled, small crops at native size.
    for (const maxDim of [1600, 1000, 700, 2400]) {
      const text = scan(img, img.naturalWidth, img.naturalHeight, maxDim);
      if (text) return text;
    }
    throw new Error('No QR code was found in this image. Try a clearer, uncropped picture.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decode a live camera frame; returns null when nothing is found. */
export function decodeVideoFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null;
  return scan(video, video.videoWidth, video.videoHeight, 800);
}

export interface QrCardInfo {
  bankName: string;
  title: string;
  name: string;
  account: string;
  amount?: string;
  footer: string;
}

/**
 * Compose a shareable PNG ("Bangla QR" card) with the QR and recipient info —
 * what the app hands to the share sheet / saves to the gallery. Generous
 * white quiet zone so it round-trips through the Pay → upload flow.
 */
export async function qrCardPng(payload: string, info: QrCardInfo): Promise<Blob> {
  const W = 900;
  const H = 1240;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, system-ui, sans-serif`;

  // Card background
  const grad = ctx.createLinearGradient(0, 0, W, 260);
  grad.addColorStop(0, '#0a2a5e');
  grad.addColorStop(1, '#1463d6');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 230);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 44);
  ctx.textAlign = 'left';
  ctx.fillText(info.bankName, 60, 100);
  ctx.font = font(500, 30);
  ctx.globalAlpha = 0.85;
  ctx.fillText(info.title, 60, 155);
  ctx.globalAlpha = 1;

  // Bangla QR wordmark
  ctx.textAlign = 'right';
  ctx.font = font(800, 40);
  ctx.fillStyle = '#ff4b50';
  ctx.fillText('BANGLA', W - 60, 100);
  ctx.fillStyle = '#34d399';
  ctx.fillText('QR', W - 60, 148);

  // QR
  const qr = await loadImage(await qrDataUrl(payload, 640));
  const qrSize = 640;
  const qx = (W - qrSize) / 2;
  const qy = 270;
  ctx.drawImage(qr, qx, qy, qrSize, qrSize);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = font(700, 44);
  ctx.fillText(info.name, W / 2, 985);
  ctx.fillStyle = '#475569';
  ctx.font = font(500, 32);
  ctx.fillText(info.account, W / 2, 1035);

  if (info.amount) {
    ctx.fillStyle = '#fde047';
    const label = info.amount;
    ctx.font = font(800, 36);
    const tw = ctx.measureText(label).width + 60;
    ctx.beginPath();
    ctx.roundRect((W - tw) / 2, 1065, tw, 64, 32);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, W / 2, 1110);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = font(500, 24);
  ctx.fillText(info.footer, W / 2, H - 40);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
