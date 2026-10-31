import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SETUP_KEY = 'super_admin';
const BOOTSTRAP_KEY = 'bootstrap';
const SUPER_ADMIN_EMAIL = 'ahraouziad6@gmail.com';
const SUPER_ADMIN_NAME = 'مدير المنصة';
const MIN_PASSWORD_LENGTH = 12;

type Admin = ReturnType<typeof createClient>;

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const constantTimeEquals = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function findUserIdByEmail(admin: Admin, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: completed, error: completedError } = await admin
      .from('system_setup')
      .select('key')
      .eq('key', SETUP_KEY)
      .maybeSingle();
    if (completedError) return json({ error: 'lookup_failed' }, 500);
    if (completed) return json({ error: 'already_completed' }, 410);

    const body = (await req.json().catch(() => null)) as { bootstrap_token?: unknown; password?: unknown } | null;
    const token = typeof body?.bootstrap_token === 'string' ? body.bootstrap_token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!token || password.length < MIN_PASSWORD_LENGTH) return json({ error: 'invalid_request' }, 400);

    const { data: bootstrap, error: bootstrapError } = await admin
      .from('system_setup')
      .select('details')
      .eq('key', BOOTSTRAP_KEY)
      .maybeSingle();
    if (bootstrapError) return json({ error: 'lookup_failed' }, 500);
    if (!bootstrap) return json({ error: 'already_completed' }, 410);

    const expectedHash = String((bootstrap.details as { sha256?: unknown })?.sha256 ?? '');
    const providedHash = await sha256Hex(token.replace(/\s+/g, '').toLowerCase());
    if (!expectedHash || !constantTimeEquals(providedHash, expectedHash)) return json({ error: 'unauthorized' }, 401);

    let userId: string | null = null;
    let created = false;
    const { data: createdData } = await admin.auth.admin.createUser({
      email: SUPER_ADMIN_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: SUPER_ADMIN_NAME },
    });
    if (createdData?.user) {
      userId = createdData.user.id;
      created = true;
    } else {
      userId = await findUserIdByEmail(admin, SUPER_ADMIN_EMAIL);
    }
    if (!userId) return json({ error: 'create_failed' }, 500);

    const { error: roleError } = await admin
      .from('admin_users')
      .upsert({ user_id: userId, role: 'super_admin', display_name: SUPER_ADMIN_NAME, must_change_password: false }, { onConflict: 'user_id' });
    if (roleError) return json({ error: 'role_failed' }, 500);

    const { error: whitelistError } = await admin
      .from('admin_emails')
      .upsert({ email: SUPER_ADMIN_EMAIL, role: 'super_admin' }, { onConflict: 'email' });
    if (whitelistError) return json({ error: 'role_failed' }, 500);

    const { error: setupError } = await admin
      .from('system_setup')
      .upsert({ key: SETUP_KEY, details: { user_id: userId } }, { onConflict: 'key', ignoreDuplicates: true });
    if (setupError) return json({ error: 'setup_record_failed' }, 500);

    const { data: claimed, error: claimError } = await admin
      .from('system_setup')
      .delete()
      .eq('key', BOOTSTRAP_KEY)
      .select('key');
    if (claimError) return json({ error: 'setup_record_failed' }, 500);
    if (!claimed || claimed.length === 0) return json({ error: 'already_completed' }, 410);

    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: null,
      action: 'system.super_admin_provisioned',
      target_type: 'staff_account',
      target_id: userId,
      details: { role: 'super_admin', created },
    });
    if (auditError) console.error('setup-super-admin audit insert failed');

    return json({ ok: true, role: 'super_admin', created });
  } catch (error) {
    console.error('setup-super-admin failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
