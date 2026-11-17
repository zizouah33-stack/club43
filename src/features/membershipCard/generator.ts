import QRCode from 'qrcode';
import { CARD_TEMPLATE_PATH, type CardMemberData } from '@/features/membershipCard/model';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('card_template_load_failed'));
    image.src = src;
  });
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maximum: number,
  minimum: number,
): number {
  for (let size = maximum; size >= minimum; size -= 1) {
    context.font = `700 ${size}px Arial, Tahoma, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
  }
  return minimum;
}

function drawField(
  context: CanvasRenderingContext2D,
  value: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maximumSize: number,
): void {
  const text = value.trim();
  if (!text) return;
  const fontSize = fitFontSize(context, text, maxWidth, maximumSize, 18);
  context.save();
  context.direction = 'rtl';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#0a4595';
  context.font = `700 ${fontSize}px Arial, Tahoma, sans-serif`;
  context.fillText(text, centerX, centerY, maxWidth);
  context.restore();
}

export async function renderMembershipCard(member: CardMemberData): Promise<HTMLCanvasElement> {
  const [template, qrUrl] = await Promise.all([
    loadImage(CARD_TEMPLATE_PATH),
    QRCode.toDataURL(member.membership_number, {
      errorCorrectionLevel: 'H',
      margin: 0,
      width: 720,
      color: { dark: '#071b4c', light: '#ffffff' },
    }),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = template.naturalWidth || template.width;
  canvas.height = template.naturalHeight || template.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('card_canvas_unavailable');

  context.drawImage(template, 0, 0, canvas.width, canvas.height);

  const scale = canvas.width / 856;
  const drawQr = await loadImage(qrUrl);
  const qrSize = 246 * scale;
  const qrX = 305 * scale;
  const qrY = 604 * scale;
  context.drawImage(drawQr, qrX, qrY, qrSize, qrSize);

  drawField(context, member.first_name ?? '', 322 * scale, 942 * scale, 395 * scale, 34 * scale);
  drawField(context, member.last_name ?? '', 322 * scale, 1026 * scale, 395 * scale, 34 * scale);
  drawField(context, member.membership_number, 322 * scale, 1110 * scale, 395 * scale, 30 * scale);

  return canvas;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, membershipNumber: string): void {
  const link = document.createElement('a');
  link.download = `${membershipNumber}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function printCanvas(canvas: HTMLCanvasElement, membershipNumber: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) throw new Error('print_window_blocked');
  const image = canvas.toDataURL('image/png');
  printWindow.document.write(`<!doctype html><html dir="rtl"><head><title>${membershipNumber}</title><style>@page{size:auto;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:100%;height:auto}</style></head><body><img src="${image}" alt="بطاقة الانخراط" /></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onafterprint = () => printWindow.close();
  window.setTimeout(() => printWindow.print(), 250);
}
