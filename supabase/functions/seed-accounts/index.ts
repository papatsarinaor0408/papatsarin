import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEED_SECRET = Deno.env.get('SEED_SECRET');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SeedRow = {
  employee_id: string;
  full_name: string;
  position: string;
  department: string;
  initial_password: string; // plaintext DDMMBBBB (or test placeholder), used once then discarded
  role: 'Admin' | 'Reviewer';
  status: string; // 'ใช้งาน' etc.
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!SEED_SECRET) return new Response('Seeding disabled: no SEED_SECRET configured', { status: 503 });

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${SEED_SECRET}`) return new Response('Unauthorized', { status: 401 });

  let rows: SeedRow[];
  try {
    const body = await req.json();
    rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows must be a non-empty array');
  } catch (e) {
    return new Response(`Bad request: ${e.message}`, { status: 400 });
  }

  const results: Array<{ employee_id: string; ok: boolean; detail: string }> = [];

  for (const row of rows) {
    const employeeId = String(row.employee_id || '').trim();
    try {
      if (!employeeId || !row.initial_password) throw new Error('missing employee_id or initial_password');
      const email = `${employeeId}@pdp2570.local`;

      const { data: existing } = await admin.from('profiles').select('id').eq('employee_id', employeeId).maybeSingle();
      if (existing) { results.push({ employee_id: employeeId, ok: true, detail: 'already exists, skipped' }); continue; }

      // Admin is decided ONLY by this exact employee_id — never trust the sheet's role
      // column for any other row, per requirement #2.
      const role = employeeId === '596203' ? 'Admin' : 'Reviewer';

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password: row.initial_password, email_confirm: true,
        user_metadata: { employee_id: employeeId },
      });
      if (createErr) throw createErr;

      const { error: profileErr } = await admin.from('profiles').insert({
        id: created.user.id,
        employee_id: employeeId,
        full_name: row.full_name || '',
        position: row.position || '',
        department: row.department || '',
        role,
        status: (row.status === 'ใช้งาน' || row.status === 'active') ? 'active' : 'inactive',
        must_change_password: true,
      });
      if (profileErr) throw profileErr;

      results.push({ employee_id: employeeId, ok: true, detail: 'created' });
    } catch (e) {
      results.push({ employee_id: employeeId, ok: false, detail: String(e.message || e) });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return new Response(JSON.stringify({ total: rows.length, failed, results }, null, 2), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
});
