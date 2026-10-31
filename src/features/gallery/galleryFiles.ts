import { supabase } from '@/lib/supabase';

export const GALLERY_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const GALLERY_MAX_BYTES = 8 * 1024 * 1024;

const MAX_EDGE_PX = 2000;
const WEBP_QUALITY = 0.86;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function validateGalleryFile(file: File): string | null {
  if (!GALLERY_ACCEPTED_TYPES.includes(file.type)) return 'صيغة الملف غير مدعومة. استخدم JPG أو PNG أو WebP.';
  if (file.size > GALLERY_MAX_BYTES) return 'حجم الصورة يتجاوز 8 ميغابايت.';
  return null;
}

export async function optimizeGalleryImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function buildGalleryPath(contentType: string): string {
  return `${crypto.randomUUID()}.${EXTENSIONS[contentType] ?? 'jpg'}`;
}

export function galleryPublicUrl(path: string): string {
  return supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
}

export async function uploadGalleryObject(path: string, body: Blob, onProgress: (ratio: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.');

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/gallery/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    request.setRequestHeader('Content-Type', body.type);
    request.setRequestHeader('cache-control', 'public, max-age=31536000');
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`upload ${request.status}`)));
    request.onerror = () => reject(new Error('network'));
    request.send(body);
  });
}
