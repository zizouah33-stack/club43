import { supabase } from '@/lib/supabase';

export const IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

const MAX_EDGE_PX = 2000;
const WEBP_QUALITY = 0.86;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function validateImageFile(file: File): string | null {
  if (!IMAGE_ACCEPTED_TYPES.includes(file.type)) return 'صيغة الملف غير مدعومة. استخدم JPG أو PNG أو WebP.';
  if (file.size > IMAGE_MAX_BYTES) return 'حجم الصورة يتجاوز 8 ميغابايت.';
  return null;
}

export async function optimizeImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); return file; }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
  } catch { return file; }
}

function buildPath(contentType: string, folder?: string): string {
  const name = `${crypto.randomUUID()}.${EXTENSIONS[contentType] ?? 'jpg'}`;
  return folder ? `${folder}/${name}` : name;
}

export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

type UploadOptions = { bucket: string; folder?: string; onProgress?: (ratio: number) => void; };

export async function uploadImage(file: File, opts: UploadOptions): Promise<{ path: string; url: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.');

  const body = await optimizeImage(file);
  const path = buildPath(body.type, opts.folder);
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${opts.bucket}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    request.setRequestHeader('Content-Type', body.type);
    request.setRequestHeader('cache-control', 'public, max-age=31536000');
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = event => { if (event.lengthComputable && opts.onProgress) opts.onProgress(event.loaded / event.total); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`upload ${request.status}`)));
    request.onerror = () => reject(new Error('network'));
    request.send(body);
  });

  return { path, url: publicUrl(opts.bucket, path) };
}

export async function removeFile(bucket: string, path: string): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  return !error;
}

export function bucketForResource(resource: string): string {
  if (resource === 'team_members') return 'team';
  if (resource === 'places') return 'places';
  if (resource === 'events') return 'gallery';
  return 'news';
}
