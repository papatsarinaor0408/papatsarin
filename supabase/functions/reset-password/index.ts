import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Deployed with verify_jwt: true (the default) — the Supabase Gateway
// rejects any request without a valid Supabase session before this code
// even runs. We still resolve *who* the caller is and re-verify Admin
// status ourselves below, never trusting a client-side claim.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }
  const callerId = callerData.user.id;

  // Server-side admin check — NEVER trust a client claim of being admin.
  // Belt-and-suspenders: check both role AND the exact employee_id.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('employee_id, role, status')
    .eq('id', callerId)
    .maybeSingle();

  if (
    profileErr || !callerProfile ||
    callerProfile.role !== 'Admin' ||
    callerProfile.employee_id !== '596203' ||
    callerProfile.status !== 'active'
  ) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), { status: 403 });
  }

  let body: { target_employee_id?: string; new_password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
  const targetEmployeeId = String(body.target_employee_id || '').trim();
  const newPassword = String(body.new_password || '');

  if (!targetEmployeeId || newPassword.length < 8) {
    return new Response(
      JSON.stringify({ error: 'target_employee_id and a new_password (>=8 chars) are required' }),
      { status: 400 },
    );
  }

  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, employee_id')
    .eq('employee_id', targetEmployeeId)
    .maybeSingle();
  if (targetErr || !targetProfile) {
    return new Response(JSON.stringify({ error: 'No account with that employee_id' }), { status: 404 });
  }

  // The actual privileged operation — only reachable after every check above passes.
  const { error: updateErr } = await admin.auth.admin.updateUserById(targetProfile.id, {
    password: newPassword,
  });
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  // Force the target to set their own password at next login (same as any
  // other "initial password" flow — mark_password_changed() clears this).
  await admin
    .from('profiles')
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq('id', targetProfile.id);

  // Audit log — the password value itself is NEVER written anywhere.
  await admin.from('audit_logs').insert({
    user_id: callerId,
    employee_id: callerProfile.employee_id,
    role: callerProfile.role,
    action: 'Reset Password',
    target_type: 'account',
    target_id: targetEmployeeId,
    note: 'Password reset by Admin; must_change_password set to true',
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
