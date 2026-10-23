/**
 * Shrinks a camera photo before upload: the long side to at most 1600 px, re-encoded as JPEG.
 * Drawing through a canvas also drops EXIF, so the GPS position and camera serial never leave the
 * tablet (the server strips metadata again, without trusting this step).
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const source = bitmap ?? (await loadImage(file));
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas unavailable');
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('encode failed');
  return blob;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image'));
    };
    img.src = url;
  });
}
