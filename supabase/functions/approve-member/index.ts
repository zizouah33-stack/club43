import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_EMAIL_DOMAIN = 'members.elmassar.internal';

const passwordFromBirthDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-');
  return `${day}${month}${year}`;
};

async function findAuthUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

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

    const body = (await req.json().catch(() => null)) as { application_id?: string } | null;
    const applicationId = body?.application_id ?? '';
    if (!UUID.test(applicationId)) return json({ error: 'invalid_request' }, 400);

    const { data: prepared, error: prepareError } = await admin.rpc('prepare_membership_approval', {
      p_application: applicationId,
    });
    if (prepareError) {
      if (prepareError.message.includes('ALREADY_REJECTED')) return json({ error: 'already_rejected' }, 409);
      if (prepareError.message.includes('NOT_FOUND')) return json({ error: 'not_found' }, 404);
      return json({ error: 'approval_failed' }, 500);
    }

    const { data: existing, error: existingError } = await admin
      .from('members')
      .select('id, membership_number')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (existingError) return json({ error: 'approval_failed' }, 500);
    if (existing) {
      return json({ ok: true, already_approved: true, membership_number: existing.membership_number });
    }

    const membershipNumber = prepared.membership_number as string;
    const birthDate = prepared.birth_date as string | null;
    if (!birthDate) return json({ error: 'missing_birth_date' }, 422);

    const memberEmail = `${membershipNumber.toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
    let memberId: string;
    let createdHere = false;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: memberEmail,
      password: passwordFromBirthDate(birthDate),
      email_confirm: true,
      user_metadata: { membership_number: membershipNumber, role: 'member' },
    });

    if (createError || !created.user) {
      const foundId = await findAuthUserIdByEmail(admin, memberEmail);
      if (!foundId) return json({ error: 'account_creation_failed' }, 500);
      memberId = foundId;
    } else {
      memberId = created.user.id;
      createdHere = true;
    }

    const { error: finalizeError } = await admin.rpc('finalize_membership_approval', {
      p_application: applicationId,
      p_user: memberId,
      p_admin: callerId,
    });
    if (finalizeError) {
      if (createdHere) await admin.auth.admin.deleteUser(memberId);
      return json({ error: 'approval_failed' }, 500);
    }

    let emailStatus: 'sent' | 'failed' = 'failed';
    try {
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'approval', application_id: applicationId }),
      });
      const emailResult = (await emailResponse.json().catch(() => null)) as { status?: string } | null;
      if (emailResult?.status === 'sent') emailStatus = 'sent';
    } catch {
      emailStatus = 'failed';
    }

    return json({ ok: true, membership_number: membershipNumber, email_status: emailStatus });
  } catch (error) {
    console.error('approve-member failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
