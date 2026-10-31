import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const body = (await req.json().catch(() => null)) as { application_id?: string; reason?: string } | null;
    const applicationId = body?.application_id ?? '';
    if (!UUID.test(applicationId)) return json({ error: 'invalid_request' }, 400);
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    const { data: result, error: rejectError } = await admin.rpc('reject_membership_application', {
      p_application: applicationId,
      p_admin: callerId,
      p_reason: reason,
    });
    if (rejectError) {
      if (rejectError.message.includes('ALREADY_APPROVED')) return json({ error: 'already_approved' }, 409);
      if (rejectError.message.includes('NOT_FOUND')) return json({ error: 'not_found' }, 404);
      return json({ error: 'rejection_failed' }, 500);
    }

    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    if (result?.changed) {
      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'rejection', application_id: applicationId }),
        });
        const emailResult = (await emailResponse.json().catch(() => null)) as { status?: string } | null;
        emailStatus = emailResult?.status === 'sent' ? 'sent' : 'failed';
      } catch {
        emailStatus = 'failed';
      }
    }

    return json({ ok: true, email_status: emailStatus });
  } catch (error) {
    console.error('reject-application failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
