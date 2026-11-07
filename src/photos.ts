import exifr from 'exifr';
import { newId, type Photo } from './db';

export interface PhotoMeta {
  gps: { lat: number; lng: number } | null;
  takenAt: string | null;
}

/** Read GPS and capture time from the original file. Android often strips GPS; then gps is null. */
export async function readMeta(file: File): Promise<PhotoMeta> {
  let gps: PhotoMeta['gps'] = null;
  let takenAt: string | null = null;
  try {
    const g = await exifr.gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) {
      gps = { lat: g.latitude, lng: g.longitude };
    }
  } catch { /* no exif */ }
  try {
    const t = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const d: unknown = t?.DateTimeOriginal ?? t?.CreateDate;
    if (d instanceof Date && !isNaN(d.getTime())) takenAt = d.toISOString();
  } catch { /* no exif */ }
  return { gps, takenAt };
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // honours the EXIF orientation of phone photos
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // fallback (e.g. HEIC on some devices): let the <img> decoder try
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function resize(src: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht gespeichert werden'))), 'image/jpeg', quality));
}

/** Compress a photo for storage on the phone (about 0.5–1 MB) and make a thumbnail. */
export async function makePhoto(file: File, findId: string, takenAt: string | null): Promise<Photo> {
  const img = await decode(file);
  const blob = await resize(img, 2048, 0.85);
  const thumb = await resize(img, 320, 0.75);
  if ('close' in img) img.close();
  return { id: newId(), findId, blob, thumb, takenAt, name: file.name || 'foto.jpg' };
}
