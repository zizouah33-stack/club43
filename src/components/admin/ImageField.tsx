import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, uploadImage, validateImageFile } from '@/lib/imageUpload';

type ImageFieldProps = {
  bucket: string;
  folder?: string;
  value: string;
  onChange: (url: string) => void;
  label?: string;
  disabled?: boolean;
};

export default function ImageField({ bucket, folder, value, onChange, label = 'الصورة', disabled }: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(value);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setPreview(value); }, [value]);

  const handleFile = async (file: File) => {
    setError('');
    const problem = validateImageFile(file);
    if (problem) { setError(problem); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setProgress(0);
    try {
      const { url } = await uploadImage(file, { bucket, folder, onProgress: ratio => setProgress(Math.round(ratio * 100)) });
      onChange(url);
    } catch {
      setError('تعذر رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.');
      setPreview(value);
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = () => { onChange(''); setPreview(''); setError(''); };

  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#29435F] bg-[#183653]">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={24} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#A9B8CA]" />}
          {uploading && <div className="absolute inset-0 flex items-center justify-center bg-[#071629]/70"><Loader2 size={20} className="animate-spin text-[#238BE6]" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#29435F] bg-[#112A47] px-4 py-2 text-sm font-bold text-[#F5F7FA] transition hover:border-[#238BE6] ${disabled || uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <ImagePlus size={16} aria-hidden="true" /> اختيار صورة
            <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} className="hidden" disabled={disabled || uploading} onChange={event => { const f = event.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          <p className="mt-1.5 text-xs text-[#A9B8CA]">JPG أو PNG أو WebP، حتى {IMAGE_MAX_BYTES / (1024 * 1024)} ميغابايت</p>
          {uploading && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#183653]"><div className="h-full rounded-full bg-[#238BE6] transition-all duration-300" style={{ width: `${progress}%` }} /></div>}
          {error && <p className="mt-1 text-xs font-bold text-[#FCA5A5]">{error}</p>}
          {value && !uploading && <button type="button" onClick={clear} disabled={disabled} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#F87171] transition hover:text-[#E5484D] disabled:opacity-40"><X size={12} /> إزالة الصورة</button>}
        </div>
      </div>
    </div>
  );
}
