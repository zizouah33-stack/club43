import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['suspend', 'reactivate', 'expel', 'reset_password', 'update_profile'] as const;
type Action = (typeof ACTIONS)[number];

const TEXT_FIELDS: Record<string, { max: number }> = {
  first_name: { max: 60 },
  last_name: { max: 60 },
  full_name: { max: 120 },
  education_or_job: { max: 120 },
  motivation: { max: 1000 },
  guardian_name: { max: 120 },
  guardian_phone: { max: 20 },
  phone: { max: 20 },
  address: { max: 200 },
  real_email: { max: 254 },
  photo_url: { max: 600 },
};
const BOOLEAN_FIELDS = ['guardian_consent', 'bylaws_accepted'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+?[0-9 ]{8,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INTERESTS = ['علوم', 'تكنولوجيا', 'سياحة', 'ثقافة'];

function sanitizeProfile(input: unknown): { values: Record<string, unknown> } | { error: string } {
  if (typeof input !== 'object' || input === null) return { error: 'invalid_request' };
  const source = input as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const [field, rule] of Object.entries(TEXT_FIELDS)) {
    if (!(field in source)) continue;
    const raw = source[field];
    if (raw === null || raw === '') {
      values[field] = field === 'full_name' || field === 'real_email' ? '' : null;
      continue;
    }
    if (typeof raw !== 'string') return { error: 'invalid_request' };
    const text = raw.trim();
    if (text.length > rule.max) return { error: 'invalid_request' };
    if ((field === 'phone' || field === 'guardian_phone') && text !== '' && !PHONE.test(text)) return { error: 'invalid_request' };
    if (field === 'real_email' && text !== '' && !EMAIL.test(text)) return { error: 'invalid_request' };
    values[field] = field === 'guardian_name' || field === 'guardian_phone' || field === 'photo_url' ? (text === '' ? null : text) : text;
  }
  if ('gender' in source) {
    const gender = source.gender;
    if (gender === null || gender === '') values.gender = null;
    else if (gender === 'male' || gender === 'female') values.gender = gender;
    else return { error: 'invalid_request' };
  }
  if ('birth_date' in source) {
    const birth = source.birth_date;
    if (typeof birth !== 'string' || !ISO_DATE.test(birth) || isNaN(Date.parse(birth))) return { error: 'invalid_request' };
    values.birth_date = birth;
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in source)) continue;
    if (typeof source[field] !== 'boolean') return { error: 'invalid_request' };
    values[field] = source[field];
  }
  if ('interests' in source) {
    const interests = source.interests;
    if (!Array.isArray(interests) || !interests.every((item) => typeof item === 'string' && INTERESTS.includes(item))) {
      return { error: 'invalid_request' };
    }
    values.interests = interests;
  }
  if (Object.keys(values).length === 0) return { error: 'invalid_request' };
  return { values };
}

const STATUS_BY_ACTION: Partial<Record<Action, 'active' | 'suspended' | 'expelled'>> = {
  suspend: 'suspended',
  reactivate: 'active',
  expel: 'expelled',
};

const passwordFromBirthDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return `${day}${month}${year}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    if (!token) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
    const callerId = userData.user.id;

    const { data: caller } = await admin.from('admin_users').select('role').eq('user_id', callerId).maybeSingle();
    if (!caller || !['super_admin', 'admin'].includes(caller.role)) return json({ error: 'forbidden' }, 403);

    const body = (await req.json().catch(() => null)) as
      | { member_id?: string; action?: string; profile?: Record<string, unknown> }
      | null;
    const memberId = body?.member_id ?? '';
    const action = body?.action as Action | undefined;
    if (!UUID.test(memberId) || !action || !ACTIONS.includes(action)) {
      return json({ error: 'invalid_request' }, 400);
    }

    const { data: member, error: memberError } = await admin
      .from('members')
      .select('id, membership_number, birth_date, status')
      .eq('id', memberId)
      .maybeSingle();
    if (memberError) return json({ error: 'lookup_failed' }, 500);
    if (!member) return json({ error: 'not_found' }, 404);

    if (action === 'update_profile') {
      const sanitized = sanitizeProfile(body?.profile);
      if ('error' in sanitized) return json({ error: sanitized.error }, 400);
      const { error: updateError } = await admin
        .from('members')
        .update({ ...sanitized.values, updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (updateError) return json({ error: 'update_failed' }, 500);
      await admin.from('audit_log').insert({
        actor_id: callerId,
        action: 'member_update_profile',
        target_type: 'member',
        target_id: memberId,
        details: { fields: Object.keys(sanitized.values), membership_number: member.membership_number },
      });
      return json({ ok: true });
    }

    if (action === 'reset_password') {
      const { error: passwordError } = await admin.auth.admin.updateUserById(memberId, {
        password: passwordFromBirthDate(member.birth_date),
      });
      if (passwordError) return json({ error: 'reset_failed' }, 500);
      const { error: flagError } = await admin.from('members').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('id', memberId);
      if (flagError) return json({ error: 'reset_failed' }, 500);
    } else {
      const nextStatus = STATUS_BY_ACTION[action];
      if (!nextStatus) return json({ error: 'invalid_request' }, 400);
      const { error: statusError } = await admin
        .from('members')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (statusError) return json({ error: 'update_failed' }, 500);
    }

    await admin.from('audit_log').insert({
      actor_id: callerId,
      action: `member_${action}`,
      target_type: 'member',
      target_id: memberId,
      details: { membership_number: member.membership_number },
    });

    return json({ ok: true });
  } catch (error) {
    console.error('manage-member failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
