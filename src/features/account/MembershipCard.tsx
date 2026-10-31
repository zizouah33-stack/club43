import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import type { Member } from '@/features/account/types';

const crest = '/logo-192.png';

type Props = {
  member: Member;
  photoUrl: string | null;
};

const CARD_WIDTH = 856;
const CARD_HEIGHT = 540;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = src;
  });
}

export default function MembershipCard({ member, photoUrl }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(member.membership_number, { margin: 1, width: 240, color: { dark: '#0B1F3F', light: '#FFFFFF' } })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [member.membership_number]);

  const downloadPng = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx || !qr) throw new Error('canvas_unavailable');

      const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
      gradient.addColorStop(0, '#0B1F3F');
      gradient.addColorStop(1, '#1F3A5F');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 36);
      ctx.fill();

      ctx.fillStyle = '#D4A93C';
      ctx.font = 'bold 30px Tahoma, Arial';
      ctx.textAlign = 'right';
      ctx.fillText('نادي المسار', CARD_WIDTH - 56, 90);
      ctx.font = '22px Tahoma, Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('للعلوم والتكنولوجيا والسياحة', CARD_WIDTH - 56, 126);

      ctx.font = 'bold 44px Tahoma, Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(member.full_name, CARD_WIDTH - 56, 290);
      ctx.font = '26px Tahoma, Arial';
      ctx.fillStyle = '#D4A93C';
      ctx.fillText('رقم العضوية', CARD_WIDTH - 56, 340);
      ctx.font = 'bold 40px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(member.membership_number, 56, 420);
      ctx.font = '22px Tahoma, Arial';
      ctx.fillStyle = '#C7D2E0';
      ctx.textAlign = 'right';
      ctx.fillText(`تاريخ الانخراط: ${new Date(member.joined_at).toLocaleDateString('ar-DZ')}`, CARD_WIDTH - 56, 470);

      const qrImage = await loadImage(qr);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(56, 56, 220, 220, 20);
      ctx.fill();
      ctx.drawImage(qrImage, 66, 66, 200, 200);

      const link = document.createElement('a');
      link.download = `${member.membership_number}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      setDownloadError('تعذر تنزيل البطاقة. حاول مرة أخرى.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section aria-labelledby="card-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="card-title" className="text-lg font-black text-navy dark:text-white">بطاقة العضوية</h2>
        <button type="button" onClick={() => void downloadPng()} disabled={downloading || !qr} className="soft-button min-h-11 disabled:opacity-60">
          <Download size={16} /> {downloading ? 'جارٍ التنزيل...' : 'تنزيل PNG'}
        </button>
      </div>
      {downloadError && <p role="alert" className="error-text">{downloadError}</p>}

      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-navy to-[#1F3A5F] p-6 text-white shadow-2xl sm:p-8">
        <div className="absolute -end-16 -top-16 h-56 w-56 rounded-full bg-gold/15 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-gold">نادي المسار</p>
            <p className="text-xs text-white/80">للعلوم والتكنولوجيا والسياحة</p>
          </div>
          <img src={crest} alt="" width="48" height="48" className="h-12 w-12 object-contain" />
        </div>

        <div className="relative mt-8 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="truncate text-2xl font-black">{member.full_name}</p>
            <p className="mt-4 text-xs text-gold">رقم العضوية</p>
            <p className="font-mono text-xl font-bold tracking-wider" dir="ltr">{member.membership_number}</p>
            <p className="mt-3 text-xs text-white/70">تاريخ الانخراط: {new Date(member.joined_at).toLocaleDateString('ar-DZ')}</p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white p-2">
            {qr ? (
              <img src={qr} alt={`رمز QR لرقم العضوية ${member.membership_number}`} width="96" height="96" className="h-24 w-24" />
            ) : (
              <div className="h-24 w-24 animate-pulse rounded-xl bg-navy/10" />
            )}
          </div>
        </div>

        {photoUrl && (
          <img src={photoUrl} alt="" className="absolute bottom-6 end-6 h-16 w-16 rounded-2xl border-2 border-gold object-cover sm:hidden" />
        )}
      </div>
    </section>
  );
}
