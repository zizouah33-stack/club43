import nodemailer from 'npm:nodemailer@6';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SENDER_NAME = 'نادي المسار للعلوم والتكنولوجيا والسياحة';
const MAIL_FROM = '"El-Massar Club Admin" <admin@elmassarclub.dpdns.org>';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_TYPES = ['application_received', 'approval', 'rejection'] as const;
type EmailType = (typeof EMAIL_TYPES)[number];

type Application = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: string;
  rejection_reason: string | null;
  membership_number: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function layout(siteUrl: string, title: string, body: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F6F4EF;font-family:Tahoma,Arial,sans-serif;color:#0B1F3F;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0B1F3F;padding:24px;text-align:center;">
<img src="${siteUrl}/logo-192.png" width="72" height="72" alt="شعار نادي المسار" style="display:block;margin:0 auto 12px;">
<div style="color:#D4A93C;font-weight:bold;font-size:16px;">${SENDER_NAME}</div></td></tr>
<tr><td style="padding:28px 24px;line-height:1.9;font-size:15px;"><h1 style="margin:0 0 16px;font-size:20px;color:#0B1F3F;">${title}</h1>${body}</td></tr>
<tr><td style="padding:16px 24px;background:#F6F4EF;font-size:12px;color:#64748B;text-align:center;">هذه رسالة آلية من ${SENDER_NAME}.</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:#1E88E5;color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">${label}</a></p>`;

function buildEmail(type: EmailType, app: Application, siteUrl: string) {
  const name = escapeHtml(app.first_name ?? app.full_name);
  if (type === 'application_received') {
    return {
      subject: 'تم استلام طلب انخراطك في نادي المسار',
      html: layout(siteUrl, `مرحباً ${name}`, `<p>شكراً لتقديم طلب الانخراط في ${SENDER_NAME}.</p><p>تم استلام طلبك، سنراسلك على بريدك الإلكتروني بعد المراجعة.</p>`),
    };
  }
  if (type === 'approval') {
    const number = escapeHtml(app.membership_number ?? '');
    return {
      subject: `تم قبول انخراطك في نادي المسار – رقم عضويتك ${number}`,
      html: layout(
        siteUrl,
        `مبروك ${name}، تم قبول انخراطك`,
        `<p>يسعدنا أن نرحب بك عضواً في نادي المسار.</p>
<div style="margin:20px 0;padding:18px;border:2px solid #D4A93C;border-radius:12px;text-align:center;">
<div style="font-size:13px;color:#64748B;">رقم عضويتك</div>
<div style="font-size:28px;font-weight:bold;letter-spacing:2px;direction:ltr;">${number}</div></div>
<p>للدخول إلى حسابك على المنصة، اذهب إلى صفحة تسجيل الدخول، واكتب رقم العضوية، وكلمة السر هي تاريخ ميلادك بصيغة يوم شهر سنة بدون فواصل، مثال: 09022006 لمن وُلد في 9 فيفري 2006.</p>
<p>ننصحك بتغيير كلمة السر بعد أول تسجيل دخول من صفحة حسابي.</p>
${button(`${siteUrl}/login`, 'الدخول إلى حسابي')}`,
      ),
    };
  }
  return {
    subject: 'نتيجة طلب انخراطك في نادي المسار',
    html: layout(
      siteUrl,
      `مرحباً ${name}`,
      `<p>شكراً لاهتمامك بالانضمام إلى نادي المسار، ونقدّر الوقت الذي خصصته لتقديم طلبك.</p>
<p>للأسف لم نتمكن من قبول طلب انخراطك هذه المرة.</p>
${app.rejection_reason ? `<p><strong>السبب:</strong> ${escapeHtml(app.rejection_reason)}</p>` : ''}
<p>يمكنك التقدم مجدداً في المستقبل، ونتمنى لك التوفيق.</p>`,
    ),
  };
}

type Caller = 'service' | 'staff' | 'public';

async function resolveCaller(req: Request, admin: ReturnType<typeof createClient>, serviceKey: string): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (token && token === serviceKey) return 'service';
  if (!token) return 'public';
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return 'public';
  const { data: role } = await admin.from('admin_users').select('role').eq('user_id', data.user.id).maybeSingle();
  if (role && ['super_admin', 'admin'].includes(role.role)) return 'staff';
  return 'public';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => null)) as { type?: string; application_id?: string } | null;
    const type = body?.type as EmailType | undefined;
    const applicationId = body?.application_id ?? '';
    if (!type || !EMAIL_TYPES.includes(type) || !UUID.test(applicationId)) {
      return json({ error: 'invalid_request' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const caller = await resolveCaller(req, admin, serviceKey);
    if (caller === 'public' && type !== 'application_received') return json({ error: 'forbidden' }, 403);

    const { data: app, error: appError } = await admin
      .from('membership_applications')
      .select('id, full_name, first_name, last_name, email, status, rejection_reason, membership_number')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError) return json({ error: 'lookup_failed' }, 500);
    if (!app) return json({ error: 'not_found' }, 404);
    const application = app as Application;

    const expectedStatus = type === 'application_received' ? 'pending' : type === 'approval' ? 'approved' : 'rejected';
    if (application.status !== expectedStatus) return json({ error: 'status_mismatch' }, 409);

    if (type === 'application_received') {
      const { count } = await admin
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('application_id', applicationId)
        .eq('email_type', 'application_received')
        .eq('status', 'sent');
      if ((count ?? 0) > 0) return json({ ok: true, status: 'sent', skipped: true });
      if (caller === 'public') {
        const { count: attempts } = await admin
          .from('email_logs')
          .select('id', { count: 'exact', head: true })
          .eq('application_id', applicationId)
          .eq('email_type', 'application_received');
        if ((attempts ?? 0) > 0) return json({ ok: false, status: 'failed', skipped: true }, 409);
      }
    }

    const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
    const gmailUser = Deno.env.get('GMAIL_USER') ?? '';
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD') ?? '';
    const { subject, html } = buildEmail(type, application, siteUrl);

    let status: 'sent' | 'failed' = 'failed';
    let errorMessage: string | null = null;
    if (!siteUrl || !gmailUser || !gmailPassword) {
      errorMessage = 'email_not_configured';
    } else {
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: gmailUser, pass: gmailPassword },
        });
        await transporter.sendMail({
          from: MAIL_FROM,
          to: application.email,
          subject,
          html,
        });
        status = 'sent';
      } catch (sendError) {
        errorMessage = sendError instanceof Error ? sendError.message.slice(0, 300) : 'send_failed';
      }
    }

    await admin.from('email_logs').insert({
      application_id: applicationId,
      recipient: application.email,
      email_type: type,
      subject,
      status,
      error: errorMessage,
    });

    return json({ ok: status === 'sent', status, error: errorMessage });
  } catch (error) {
    console.error('send-email failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
