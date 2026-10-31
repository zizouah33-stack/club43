import { useState, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Member } from '@/features/account/types';

type Props = {
  member: Member;
  photoUrl: string | null;
  onSaved: () => void;
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;

export default function ProfileForm({ member, photoUrl, onSaved }: Props) {
  const [phone, setPhone] = useState(member.phone);
  const [address, setAddress] = useState(member.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const cleanPhone = phone.trim();
    if (!PHONE_PATTERN.test(cleanPhone)) return setError('أدخل رقم هاتف صحيحاً.');
    if (address.trim().length < 3) return setError('أدخل العنوان.');

    setBusy(true);
    const { error: updateError } = await supabase
      .from('members')
      .update({ phone: cleanPhone, address: address.trim(), updated_at: new Date().toISOString() })
      .eq('id', member.id);
    setBusy(false);
    if (updateError) return setError('تعذر حفظ البيانات. حاول مرة أخرى.');
    setNotice('تم حفظ بياناتك.');
    onSaved();
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setNotice('');
    if (!ALLOWED_TYPES.includes(file.type)) return setError('الصورة يجب أن تكون JPG أو PNG أو WebP.');
    if (file.size > MAX_BYTES) return setError('حجم الصورة يجب ألا يتجاوز 2 ميغابايت.');

    setBusy(true);
    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${member.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('member-photos').upload(path, file, { contentType: file.type });
    if (uploadError) {
      setBusy(false);
      return setError('تعذر رفع الصورة. حاول مرة أخرى.');
    }
    const { error: updateError } = await supabase.from('members').update({ photo_url: path, updated_at: new Date().toISOString() }).eq('id', member.id);
    setBusy(false);
    if (updateError) return setError('تم رفع الصورة لكن تعذر حفظها في حسابك.');
    setNotice('تم تحديث صورتك.');
    onSaved();
  };

  return (
    <section aria-labelledby="profile-title" className="space-y-6">
      <div className="flex items-center gap-5">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-navy/10 dark:bg-white/10">
          {photoUrl ? (
            <img src={photoUrl} alt="صورة العضو" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-black text-navy dark:text-white">
              {member.full_name.charAt(0)}
            </span>
          )}
        </div>
        <label className="soft-button min-h-11 cursor-pointer">
          <Camera size={16} /> تغيير الصورة
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => void uploadPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <form onSubmit={(event) => void save(event)} noValidate className="space-y-5">
        <h2 id="profile-title" className="text-lg font-black text-navy dark:text-white">بياناتي</h2>
        <label className="block">
          <span className="label">رقم الهاتف</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="input mt-2" required />
        </label>
        <label className="block">
          <span className="label">العنوان</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="input mt-2" required />
        </label>
        <p className="text-xs leading-5 text-muted">الاسم ورقم العضوية وتاريخ الميلاد تحددها الإدارة ولا يمكن تعديلها من هنا.</p>
        {error && <p role="alert" className="error-text">{error}</p>}
        {notice && <p role="status" className="text-sm font-bold text-teal">{notice}</p>}
        <button type="submit" disabled={busy} className="blue-button justify-center disabled:opacity-60">
          {busy ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
        </button>
      </form>
    </section>
  );
}
