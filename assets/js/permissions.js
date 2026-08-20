/**
 * Front-end permission helpers — UI CONVENIENCE ONLY. The real access
 * control is server-side (Postgres RLS + SECURITY DEFINER RPCs / the
 * reset-password Edge Function). Hiding a button here never substitutes
 * for the server rejecting an unauthorized action.
 */

function isAdmin() {
  return !!CURRENT_USER && CURRENT_USER.role === 'Admin';
}

/**
 * Toggles a body class so CSS (`.admin-only`) can show/hide Admin-only
 * controls. Call once after CURRENT_USER is set (post-login, post-refresh).
 */
function applyRoleVisibility() {
  document.body.classList.toggle('role-admin', isAdmin());
}
