/**
 * Data layer — replaces the old localStorage-backed loadBaseRecords/
 * applyOverrides/commitDecision/etc. Populates STATE.records with the exact
 * same shape the render/chart/filter pipeline already expects (id + every
 * camelCase schema.js FIELDS key + reviewStatus/reviewNote/reviewedBy/
 * reviewedDate), just sourced from Supabase instead of localStorage.
 */

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

function dbRowToRecord(planRow, decisionRow) {
  const rec = { id: planRow.id };
  FIELDS.forEach((f) => {
    const v = planRow[camelToSnake(f.key)];
    rec[f.key] = f.numeric ? Number(v || 0) : (v === undefined || v === null ? '' : v);
  });

  if (decisionRow) {
    rec.reviewStatus = decisionRow.decision;
    rec.reviewNote = decisionRow.remark || '';
    rec.reviewedBy = decisionRow.reviewer_position || '';
    rec.reviewedByName = decisionRow.reviewer_full_name || '';
    rec.reviewedByEmployeeId = decisionRow.reviewer_employee_id || '';
    rec.reviewedByRole = decisionRow.reviewer_role || '';
    rec.reviewedAtRaw = decisionRow.reviewed_at || '';
    rec.reviewedDate = decisionRow.reviewed_at
      ? new Date(decisionRow.reviewed_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
  } else {
    rec.reviewStatus = 'pending';
    rec.reviewNote = '';
    rec.reviewedBy = '';
    rec.reviewedByName = '';
    rec.reviewedByEmployeeId = '';
    rec.reviewedByRole = '';
    rec.reviewedAtRaw = '';
    rec.reviewedDate = '';
  }
  return rec;
}

function recordToDbRow(rec) {
  const row = {};
  FIELDS.forEach((f) => {
    const v = rec[f.key];
    row[camelToSnake(f.key)] = (v === undefined || v === null) ? '' : v;
  });
  return row;
}

/** Populates STATE.records from the central database (active plans only). */
async function fetchPlansAndDecisions() {
  const { data: plans, error: plansErr } = await SB.from('plans').select('*').eq('is_active', true);
  if (plansErr) throw plansErr;

  const { data: decisions, error: decErr } = await SB.from('decisions').select('*');
  if (decErr) throw decErr;

  const decisionByPlanId = {};
  (decisions || []).forEach((d) => { decisionByPlanId[d.plan_id] = d; });

  STATE.records = (plans || []).map((p) => dbRowToRecord(p, decisionByPlanId[p.id]));
}

async function submitDecisionRemote(planId, status, note) {
  const { error } = await SB.rpc('submit_decision', {
    p_plan_id: planId, p_decision: status, p_remark: note || null,
  });
  if (error) throw error;
}

async function resetAllDecisionsRemote() {
  const { error } = await SB.rpc('admin_reset_all_decisions');
  if (error) throw error;
}

/**
 * Parses the structured IMPORT_VALIDATION_FAILED error shape (see
 * admin_import_dataset's `raise exception ... using detail = ...`) into
 * { message, detail } for the UI to render as a row-by-row report. Returns
 * null for any other kind of error (network, permission, etc.).
 */
function parseImportValidationError(error) {
  if (!error || !error.message || error.message.indexOf('IMPORT_VALIDATION_FAILED') === -1) return null;
  let detail = null;
  try { detail = JSON.parse(error.details || 'null'); } catch (e) { detail = null; }
  return { message: error.message, detail };
}

/**
 * Admin-only. rows = the already-parsed records from importer.js
 * (mapRowToRecord output). Returns { new_count, matched_count,
 * reactivated_count, deactivated_count } on success. On validation failure,
 * throws an Error with a `.validation = { message, detail }` property.
 */
async function importDatasetRemote(records, fileName) {
  const rows = records.map(recordToDbRow);
  const { data, error } = await SB.rpc('admin_import_dataset', {
    p_rows: rows, p_file_name: fileName || null,
  });
  if (error) {
    const parsed = parseImportValidationError(error);
    const e = new Error(parsed ? parsed.message : (error.message || 'Import failed'));
    if (parsed) e.validation = parsed;
    throw e;
  }
  return (data && data[0]) || { new_count: 0, matched_count: 0, reactivated_count: 0, deactivated_count: 0 };
}

/**
 * Admin-only (enforced by RLS — a Reviewer gets zero rows even if this is
 * somehow called). Newest first.
 */
async function fetchLoginHistory() {
  const { data, error } = await SB.from('login_events').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Admin-only general activity log (import/decision/account/password-reset/
 * login-and-logout events) — enforced by RLS. Newest first.
 */
async function fetchActivityLog() {
  const { data, error } = await SB.from('audit_logs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Everyone (not just Admin) — exposes only the last import's timestamp/file
 * name via the get_last_import_info RPC, not the full audit trail.
 */
async function fetchLastImportInfo() {
  const { data, error } = await SB.rpc('get_last_import_info');
  if (error) throw error;
  return (data && data[0]) || null;
}

/**
 * Plan-specific decision history for the drawer's "ประวัติการพิจารณา"
 * section. Readable by any active user who can see the plan (RLS scopes
 * audit_logs SELECT to target_type='plan' decision rows for non-admins),
 * chronological oldest-first so it reads top-to-bottom as a timeline.
 */
async function fetchPlanHistory(planId) {
  const { data, error } = await SB.from('audit_logs')
    .select('*')
    .eq('target_type', 'plan')
    .eq('target_id', planId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
