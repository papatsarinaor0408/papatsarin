/**
 * Authentication + session gating.
 * Login identifier is เลขประจำตัว (employee_id) — Supabase Auth itself is
 * email+password native, so we synthesize a private, never-shown-in-UI email
 * `${employee_id}@pdp2570.local` purely as the internal identifier. The
 * password itself is real and hashed by Supabase — this is not a fabricated
 * credential, just a synthetic username format.
 */

const AUTH_EMAIL_DOMAIN = '@pdp2570.local';
const GENERIC_LOGIN_ERROR = 'เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';

let CURRENT_USER = null; // { id, employee_id, full_name, position, department, role, status, must_change_password }

function employeeIdToEmail(employeeId) {
  return String(employeeId).trim() + AUTH_EMAIL_DOMAIN;
}

async function fetchOwnProfile() {
  const { data: { user } } = await SB.auth.getUser();
  if (!user) return null;
  const { data, error } = await SB.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Attempt login. Returns { ok: true } or { ok: false, message } — the
 * message is intentionally generic (never reveals whether the employee_id
 * exists, or whether the account is merely inactive vs. wrong password).
 */
async function signIn(employeeId, password) {
  const email = employeeIdToEmail(employeeId);
  const { error } = await SB.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  const profile = await fetchOwnProfile();
  if (!profile || profile.status !== 'active') {
    await SB.auth.signOut();
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  CURRENT_USER = profile;
  return { ok: true, mustChangePassword: !!profile.must_change_password };
}

async function signOut() {
  await SB.auth.signOut();
  CURRENT_USER = null;
  window.location.href = 'login.html';
}

/**
 * Submit a new password during the forced first-login (or post-reset) flow.
 * Requires an already-authenticated session (set by signIn()).
 */
async function submitNewPassword(newPassword) {
  const { error: updateErr } = await SB.auth.updateUser({ password: newPassword });
  if (updateErr) {
    return { ok: false, message: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
  const { error: rpcErr } = await SB.rpc('mark_password_changed');
  if (rpcErr) {
    return { ok: false, message: 'บันทึกสถานะรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
  const profile = await fetchOwnProfile();
  CURRENT_USER = profile;
  return { ok: true };
}

/**
 * Dashboard-side gate: called at the top of index.html's init(). Ensures a
 * valid, active session with password already set; redirects to login.html
 * (with the change-password screen if needed) otherwise. Returns the
 * profile on success, or null (after redirecting) on failure.
 */
async function requireSession() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const profile = await fetchOwnProfile();
  if (!profile || profile.status !== 'active') {
    await SB.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  if (profile.must_change_password) {
    window.location.href = 'login.html?mode=changepw';
    return null;
  }

  CURRENT_USER = profile;
  return profile;
}
