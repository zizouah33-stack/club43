import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['suspend', 'reactivate', 'expel', 'reset_password'] as const;
type Action = (typeof ACTIONS)[number];

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

    const body = (await req.json().catch(() => null)) as { member_id?: string; action?: string } | null;
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
