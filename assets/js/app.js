/* ===== ระบบพิจารณาแผนพัฒนาบุคลากร (โรงไฟฟ้าบางปะกง) ปี 2570 ===== */

const LS_KEYS = {
  theme: 'ppd2570_theme_v1',
};

const STATE = {
  records: [],
  activeTab: 'overview',
  filters: { orgLevel: 'divisionName', orgValue: '', courseType: '', inputFactor: '', deliveryType: '', status: '', search: '', perCourseMin: '', perCourseMax: '' },
  openDeptKeys: new Set(),
  openDupCourseKeys: new Set(),
  openPersonKeys: new Set(),
  personnelFilters: { search: '', sort: 'count_desc' },
  selectedId: null,
  noteDraft: null, // in-progress text in the review note field, kept across re-renders
  approvedBudgetDraft: null, // in-progress text in the อฟก.-approved-budget field, kept across re-renders

  // "สรุปตามหน่วยงาน" tab display prefs (not filters — these only affect
  // ordering/grouping of what's already shown).
  deptSort: 'count', // 'count' | 'az' | 'orggroup'
  deptBreakdownSort: { courseType: 'count', inputFactor: 'count', deliveryType: 'count' }, // 'count' | 'az'
  deptCourseListFilter: {}, // { [deptName]: { field, value } } — narrows "รายชื่อหลักสูตร" when a breakdown chip is clicked

  // Admin-only history tabs — loaded lazily (only when the tab is first
  // opened) since a Reviewer never triggers this fetch and it would return
  // zero rows anyway (RLS is the real gate, this just avoids a wasted call).
  loginHistory: [], loginHistoryLoaded: false,
  loginHistoryFilters: { search: '', department: '', dateFrom: '', dateTo: '' },
  activityLog: [], activityLogLoaded: false,
  activityLogFilters: { search: '', action: '', dateFrom: '', dateTo: '' },

  // "Approved Data" tab — a separate dataset (final_courses, sheet 1 of
  // the อศค. workbook only), loaded lazily on first visit like the history
  // tabs above, but visible to every user (not admin-only — only its
  // import button is).
  finalCourses: [],
  finalDataLoaded: false, finalDataLastImportInfo: null,
  finalDataFilters: { search: '', courseType: '', sourceStatus: '' },
};

/* ---------------- persistence (central database — see dataClient.js) ---------------- */
async function loadAllRecords() {
  await fetchPlansAndDecisions();
}

/* ---------------- decision persistence ---------------- */
async function commitDecision(id, status, note, approvedBudget) {
  await submitDecisionRemote(id, status, note, approvedBudget);
  await loadAllRecords();
}

// Admin-only (enforced server-side by admin_reset_all_decisions) — clears
// every reviewer's current decision, kept per explicit request even in the
// shared online system, but gated to Admin so no single Reviewer click can
// wipe out everyone else's work.
async function resetAllDecisions() {
  await resetAllDecisionsRemote();
  await loadAllRecords();
}

// เผื่อกดผิด — ล้างผลพิจารณาของแผนนี้แผนเดียว กลับไปเป็น "รอพิจารณา" แบบไม่มีประวัติเดิมค้างอยู่
async function revertToPending(id) {
  await submitDecisionRemote(id, 'pending', null);
  await loadAllRecords();
}

/* ---------------- filtering helpers ---------------- */
function uniqueValues(records, key) {
  return Array.from(new Set(records.map((r) => r[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
}

// หลักสูตรกลาง อศค. ดำเนินการ ไม่มีการกรอกประเภทการอบรม/วัตถุประสงค์/ผลลัพธ์ ฯลฯ โดยธรรมชาติของหลักสูตรประเภทนี้
// (ข้อมูลชุดนี้มีเฉพาะหลักสูตรที่หน่วยงานเสนอเพิ่มเติมตาม Training Needs) จึงไม่ถือเป็นข้อมูลขาดหาย
function isCentralCourse(r) { return (r.courseType || '').indexOf('หลักสูตรกลาง') === 0; }

// ประเภทการส่งอบรม (ภายใน/ภายนอก) — คืนค่า null สำหรับหลักสูตรกลาง (ไม่เกี่ยวข้อง ไม่นับเป็น "ไม่ระบุ")
// ส่วนหลักสูตรเสนอเพิ่มเติมที่เว้นว่างจริงๆ ยังคงนับเป็น "ไม่ระบุ" ตามเดิม
function deliveryTypeOf(r) {
  if (isCentralCourse(r)) return null;
  return r.deliveryType || 'ไม่ระบุ';
}
function uniqueDeliveryTypes(records) {
  return Array.from(new Set(records.map(deliveryTypeOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
}

function matchesFilters(r) { return matchesFiltersExcept(r, null); }

function getFiltered() { return STATE.records.filter(matchesFilters); }

/**
 * Same as matchesFilters, but ignores one filter field — used to compute
 * each filter dropdown's own option list from what the OTHER active filters
 * currently allow (cascading/faceted filters), so e.g. picking a หน่วยงาน
 * only shows ประเภทการอบรม values that actually occur there, instead of
 * every possible value regardless of what's already selected.
 */
function matchesFiltersExcept(r, exceptKey) {
  const f = STATE.filters;
  if (exceptKey !== 'orgValue' && f.orgValue && r[f.orgLevel] !== f.orgValue) return false;
  if (exceptKey !== 'courseType' && f.courseType && r.courseType !== f.courseType) return false;
  if (exceptKey !== 'inputFactor' && f.inputFactor && r.inputFactor !== f.inputFactor) return false;
  if (exceptKey !== 'deliveryType' && f.deliveryType && deliveryTypeOf(r) !== f.deliveryType) return false;
  if (exceptKey !== 'status' && f.status) {
    if (f.status === 'decided') { if (r.reviewStatus === 'pending' || r.reviewStatus === 'central') return false; }
    else if (r.reviewStatus !== f.status) return false;
  }
  if (exceptKey !== 'search' && f.search) {
    const q = f.search.toLowerCase();
    const hay = [r.nameTh, r.creatorName, r.targetGroupNames, r.divisionName, r.sectionName].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (exceptKey !== 'perCourse' && (f.perCourseMin !== '' || f.perCourseMax !== '')) {
    const cost = r.effectiveBudget || 0;
    if (f.perCourseMin !== '' && cost < Number(f.perCourseMin)) return false;
    if (f.perCourseMax !== '' && cost > Number(f.perCourseMax)) return false;
  }
  return true;
}
function getFilteredExcept(exceptKey) { return STATE.records.filter((r) => matchesFiltersExcept(r, exceptKey)); }

/* ---------------- shared status color/label ---------------- */
function statusColor(status) {
  return { pending: 'var(--status-pending)', approved: 'var(--status-good)', revise: 'var(--status-warning)', rejected: 'var(--status-critical)', central: 'var(--status-central)' }[status];
}
function statusBadge(status) {
  const meta = REVIEW_STATUS[status] || REVIEW_STATUS.pending;
  return `<span class="badge badge-${status}">${meta.label}</span>`;
}
/** e.g. "20 สิงหาคม 2569 เวลา 17:30 น." — server timestamptz is the source, this only formats it. */
function fmtThaiDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const datePart = d.toLocaleDateString('th-TH-u-ca-buddhist', { year: 'numeric', month: 'long', day: 'numeric' });
  const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${datePart} เวลา ${timePart} น.`;
}
const CATEGORICAL = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

// Selection accent palette (Navy/Indigo/Magenta/Coral/Amber) — cycled across
// filter chips to give each an Active-state color, per the corporate-dashboard
// visual spec. Distinct from CATEGORICAL, which is for chart series.
const ACCENT_PALETTE = ['#003F5C', '#58508D', '#BC5090', '#FF6361', '#FFA600'];

// WCAG relative-luminance check — picks readable text (dark vs white) for a
// solid accent chip background, since white-on-Amber fails contrast badly.
function readableTextOn(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  // Threshold tuned so Coral (~0.31) also gets dark text — white-on-Coral
  // only clears ~3:1, short of the 4.5:1 AA target for chip label text.
  return L > 0.28 ? '#2E2935' : '#ffffff';
}

// จำกัดจำนวนหมวดหมู่ที่ใช้สีแยกกันไม่เกิน 8 สี (พ้องกับจำนวนสี categorical ที่ผ่านเกณฑ์แยกแยะ)
// เกินกว่านั้นให้รวมหมวดที่เล็กที่สุดเป็น "อื่นๆ" เพื่อไม่ให้สีวนซ้ำจนแยกหมวดหมู่ไม่ออก
function topNWithOther(items, n) {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  // rawLabels: the original category label(s) folded into each returned
  // bucket — a plain bucket is just itself, "อื่นๆ" is everything past the
  // cutoff. Purely additive (doesn't change any value/order/bucketing
  // already computed above) — lets a click on a slice filter the real
  // records back out, "อื่นๆ" included, without guessing from its label text.
  if (sorted.length <= n) return sorted.map((d) => ({ ...d, rawLabels: [d.label] }));
  const head = sorted.slice(0, n - 1).map((d) => ({ ...d, rawLabels: [d.label] }));
  const rest = sorted.slice(n - 1);
  const restTotal = rest.reduce((s, d) => s + d.value, 0);
  head.push({ label: 'อื่นๆ', value: restTotal, rawLabels: rest.map((d) => d.label) });
  return head;
}
function categoricalDonutData(records, keyOrFn) {
  const accessor = typeof keyOrFn === 'function' ? keyOrFn : (r) => r[keyOrFn];
  const names = Array.from(new Set(records.map(accessor).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const raw = names.map((name) => ({ label: name, value: records.filter((r) => accessor(r) === name).length }));
  return topNWithOther(raw, 8).map((d, i) => ({ ...d, color: CATEGORICAL[i % CATEGORICAL.length] }));
}

/* ---------------- YoY comparison: ปี 2569 (static, read-only historical) vs ปี 2570 (live) ---------------- */
// Used ONLY to pair a 2569 org label against a live 2570 divisionName —
// never mutates or displays the normalized form, so source labels in
// either dataset are never altered.
function normalizeOrgKey(name) {
  return String(name || '').replace(/[\s.\-]/g, '').toLowerCase();
}

// Explicit colors for the YoY comparison chart's two series, per request.
const YOY_COLOR_2569 = '#64748B'; // Slate Blue-Gray
const YOY_COLOR_2570 = '#8B5CF6'; // Purple

// กรอบงบประมาณพัฒนาบุคลากรที่โรงไฟฟ้าบางปะกงได้รับจัดสรรจาก รวฟ. ปีงบประมาณ 2570
// (ส่วนแบ่งจากกรอบรวม 9,000,000 บาท) — ตัวเลขคงที่ ไม่ได้มาจากฐานข้อมูล
const BUDGET_FRAME_2570 = 894231;

function makeYoyGroup(label, v1, v2, courses2569, isDeptLevel) {
  let kind, pct = null, color;
  if (v1 === 0 && v2 > 0) { kind = 'new'; color = YOY_COLOR_2570; }
  else if (v1 > 0 && v2 === 0) { kind = 'gone'; color = 'var(--status-critical)'; }
  else {
    kind = 'pct';
    pct = v1 > 0 ? ((v2 - v1) / v1) * 100 : 0;
    color = v2 > v1 ? 'var(--status-good)' : (v2 < v1 ? 'var(--status-critical)' : 'var(--text-muted)');
  }
  return { label, v1, v2, diff: v2 - v1, kind, pct, color, courses2569, isDeptLevel: !!isDeptLevel };
}

// Known label variants for the SAME real unit, written differently between
// the 2569 export and the live 2570 system (confirmed by the user) — applied
// to the raw label before normalizeOrgKey() so both sides collapse into one
// group instead of appearing as two unrelated categories.
const YOY_ORG_ALIASES = { 'กบส-ห.': 'กบหก-ฟ.' };
function resolveYoyOrgAlias(label) { return YOY_ORG_ALIASES[label] || label; }

/**
 * Full-dataset comparison (deliberately NOT run through getFilteredExcept —
 * this card is independent of the existing filter bar in both directions).
 * 2570 side: STATE.records grouped by divisionName (กอง). 2569 side:
 * HISTORICAL_2569.records (static, read-only) grouped by divisionGroup.
 * Outer-joined via normalizeOrgKey; sorted by 2570 count descending.
 */
function buildYoyComparison() {
  // Grouped by normalizeOrgKey (not the raw label) on THIS side too — two
  // differently-formatted 2570 labels for the same กอง must collapse into
  // one group, otherwise each would separately (and wrongly) get matched
  // against the full 2569 count for that org.
  //
  // "อฟก." is the ฝ่าย-level code, never a real กอง name — when a plan's
  // divisionName resolves to exactly that (importer.js's org-hierarchy
  // fallback only had the ฝ่าย level to fall back to), it means the more
  // specific กอง/แผนก was left blank on that record, per the user's own
  // observation that data entry sometimes only fills ฝ่าย and sometimes
  // fills แผนก for what is really the same unit. Falling back to sectionName
  // (แผนก) here — the same idea already used for the 2569 "-" case below —
  // lets it correctly re-merge with a matching แผนก-level 2569 group
  // (e.g. หรปก-ฟ./หปอก-ฟ./หสลก-ฟ.) instead of sitting alone as "อฟก.".
  const by2570 = {}; // normalizedKey -> { label, count, isDeptLevel }
  STATE.records.forEach((r) => {
    const isDeptFallback = r.divisionName === 'อฟก.' && !!r.sectionName;
    const rawLabel = r.divisionName === 'อฟก.' ? (r.sectionName || r.divisionName) : (r.divisionName || 'ไม่ระบุ');
    const label = resolveYoyOrgAlias(rawLabel);
    const key = normalizeOrgKey(label);
    if (!by2570[key]) by2570[key] = { label, count: 0, isDeptLevel: isDeptFallback };
    by2570[key].count++;
  });

  // Records whose divisionGroup is "-" (not yet mapped to a กอง) are grouped
  // by their own unit (department_current, แผนก level) instead — each
  // becomes its own X-axis point (e.g. "หรปก-ฟ."), rather than one combined
  // "ยังไม่ Mapping ระดับกอง" bucket.
  const by2569 = {}; // normalizedKey -> { label, count, courses, isDeptLevel }
  HISTORICAL_2569.records.forEach((r) => {
    const isUnmapped = r.divisionGroup === '-';
    const groupLabel = resolveYoyOrgAlias(isUnmapped ? r.unit : r.divisionGroup);
    const key = normalizeOrgKey(groupLabel);
    if (!by2569[key]) by2569[key] = { label: groupLabel, count: 0, courses: [], isDeptLevel: isUnmapped };
    by2569[key].count++;
    by2569[key].courses.push(r);
  });

  const matchedKeys = new Set();
  const groups = Object.keys(by2570).map((key) => {
    const g2570 = by2570[key];
    const match = by2569[key];
    if (match) matchedKeys.add(key);
    return makeYoyGroup(g2570.label, match ? match.count : 0, g2570.count, match ? match.courses : [], g2570.isDeptLevel || (match && match.isDeptLevel));
  });

  Object.keys(by2569).forEach((key) => {
    if (matchedKeys.has(key)) return;
    const g = by2569[key];
    groups.push(makeYoyGroup(g.label, g.count, 0, g.courses, g.isDeptLevel));
  });

  // อฟก. first, then every แผนก-level group (from either fallback path),
  // then real กอง groups — each tier still sorted by v2 descending, per request.
  const rankOf = (g) => (g.label === 'อฟก.' ? 0 : g.isDeptLevel ? 1 : 2);
  return groups.sort((a, b) => {
    const ra = rankOf(a), rb = rankOf(b);
    return ra !== rb ? ra - rb : b.v2 - a.v2;
  });
}

function openHistoricalDetailModal(divisionLabel, courses) {
  document.getElementById('chart-detail-title').textContent = `ข้อมูลการเสนอ ปี 2569 — ${divisionLabel}`;
  const body = document.getElementById('chart-detail-body');

  // Per-unit (แผนก/หน่วยงานจริง) subtotal — dynamically computed from the
  // records passed in, never hard-coded. Only shown when the group actually
  // contains more than one distinct unit (e.g. the "ยังไม่ Mapping ระดับกอง"
  // bucket), so a normal single-unit กอง doesn't get a redundant 1-row table.
  const byUnit = {};
  courses.forEach((c) => {
    const u = c.unit || 'ไม่ระบุ';
    if (!byUnit[u]) byUnit[u] = { count: 0, budget: 0 };
    byUnit[u].count++;
    byUnit[u].budget += c.budgetBaht || 0;
  });
  const units = Object.keys(byUnit).sort((a, b) => byUnit[b].count - byUnit[a].count);
  const totalBudget = courses.reduce((s, c) => s + (c.budgetBaht || 0), 0);
  const unitSummaryHtml = units.length > 1 ? `
    <div class="table-wrap" style="margin-bottom:14px;">
      <table class="data-table">
        <thead><tr><th>หน่วยงาน</th><th>จำนวนหลักสูตร</th><th>งบประมาณรวม</th></tr></thead>
        <tbody>
          ${units.map((u) => `<tr><td>${escapeHtml(u)}</td><td>${fmtNum(byUnit[u].count)}</td><td>${fmtBaht(byUnit[u].budget)}</td></tr>`).join('')}
          <tr style="font-weight:700;"><td>รวม</td><td>${fmtNum(courses.length)}</td><td>${fmtBaht(totalBudget)}</td></tr>
        </tbody>
      </table>
    </div>` : '';

  body.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(courses.length)} หลักสูตร</div>
    ${unitSummaryHtml}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ชื่อหลักสูตร</th><th>งบประมาณ</th><th>หน่วยงานที่เสนอ</th></tr></thead>
        <tbody>
          ${courses.length ? courses.map((c) => `
            <tr>
              <td class="cell-name">${escapeHtml(c.courseName)}</td>
              <td>${c.budgetBaht != null ? fmtBaht(c.budgetBaht) : '<span class="cell-muted">ไม่ระบุ</span>'}</td>
              <td>${escapeHtml(c.unit || 'ไม่ระบุ')}</td>
            </tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><div class="big">🔍</div>ไม่พบข้อมูล</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('chart-detail-backdrop').classList.add('show');
}

const YOY_SERIES = [
  { key: 'v1', label: 'ปี 2569 (ปีที่แล้ว)', color: YOY_COLOR_2569 },
  { key: 'v2', label: 'ปี 2570 (ปีปัจจุบัน)', color: YOY_COLOR_2570 },
];

function renderYoyComparisonCard() {
  const chartEl = document.getElementById('chart-yoy');
  const miniKpisEl = document.getElementById('yoy-mini-kpis');
  if (!chartEl || !miniKpisEl) return;

  const allGroups = buildYoyComparison();

  const total2569 = allGroups.reduce((s, g) => s + g.v1, 0);
  const total2570 = allGroups.reduce((s, g) => s + g.v2, 0);

  renderDualLineChart(chartEl, allGroups, YOY_SERIES, {
    tooltipHtml: (g) => {
      const changeLine = g.kind === 'new'
        ? `<div style="color:${YOY_COLOR_2570};font-weight:600;">ใหม่ในปี 2570</div>`
        : g.kind === 'gone'
        ? '<div style="color:var(--status-critical);font-weight:600;">ไม่มีการเสนอในปี 2570</div>'
        : `<div style="color:${g.color};font-weight:600;">${g.diff >= 0 ? '+' : ''}${fmtNum(g.diff)} หลักสูตร (${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(1)}%)</div>`;
      return `<div><b>${escapeHtml(g.label)}</b></div><div class="tt-row">ปี 2569: <b>${fmtNum(g.v1)}</b> หลักสูตร</div><div class="tt-row">ปี 2570: <b>${fmtNum(g.v2)}</b> หลักสูตร</div>${changeLine}`;
    },
    onClick: (g) => openHistoricalDetailModal(g.label, g.courses2569),
  });
  renderLegend(chartEl, [
    { label: YOY_SERIES[0].label, color: YOY_SERIES[0].color, value: total2569 },
    { label: YOY_SERIES[1].label, color: YOY_SERIES[1].color, value: total2570 },
  ]);
  const diff = total2570 - total2569;
  const pct = total2569 > 0 ? (diff / total2569) * 100 : 0;
  // Increase shown in red (status-critical), decrease in status-good —
  // inverted from the usual green-up/red-down convention, per request:
  // a rise in course count here reads as more workload, not "good news".
  const diffColor = diff > 0 ? 'var(--status-critical)' : diff < 0 ? 'var(--status-good)' : 'var(--text-muted)';
  const diffIcon = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';

  miniKpisEl.innerHTML = `
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">ปี 2569 (ปีที่แล้ว)</div>
      <div class="mini-kpi-value" style="color:${YOY_COLOR_2569};">${fmtNum(total2569)} หลักสูตร</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">ปี 2570 (ปีปัจจุบัน)</div>
      <div class="mini-kpi-value" style="color:${YOY_COLOR_2570};">${fmtNum(total2570)} หลักสูตร</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">ผลต่างรวม</div>
      <div class="mini-kpi-value" style="color:${diffColor};">${diffIcon} ${diff >= 0 ? '+' : ''}${fmtNum(diff)} หลักสูตร</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">เปลี่ยนแปลงรวม</div>
      <div class="mini-kpi-value" style="color:${diffColor};">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</div>
      <div class="mini-kpi-sub">${diff > 0 ? 'เพิ่มขึ้น' : diff < 0 ? 'ลดลง' : 'ไม่เปลี่ยนแปลง'}</div>
    </div>
  `;
}

/* ==================================================================== */
/* TAB: OVERVIEW                                                        */
/* ==================================================================== */
function renderOverview() {
  const root = document.getElementById('panel-overview');
  // Ignores the "สถานะ" filter on purpose — this view breaks everything down
  // BY status itself, so pre-filtering to one status would make its own KPI
  // cards degenerate (total == that one status, everything else zero).
  const data = getFilteredExcept('status');
  const total = data.length;
  const counts = { pending: 0, approved: 0, revise: 0, rejected: 0, central: 0 };
  data.forEach((r) => { counts[r.reviewStatus] = (counts[r.reviewStatus] || 0) + 1; });

  const kpis = [
    { key: 'total', label: 'แผนทั้งหมด', value: total, color: 'var(--kpi-fill-total)' },
    { key: 'pending', label: REVIEW_STATUS.pending.label, value: counts.pending, color: 'var(--kpi-fill-pending)' },
    { key: 'approved', label: REVIEW_STATUS.approved.label, value: counts.approved, color: 'var(--kpi-fill-approved)' },
    { key: 'revise', label: REVIEW_STATUS.revise.label, value: counts.revise, color: 'var(--kpi-fill-revise)' },
    { key: 'rejected', label: REVIEW_STATUS.rejected.label, value: counts.rejected, color: 'var(--kpi-fill-rejected)' },
    { key: 'central', label: REVIEW_STATUS.central.label, value: counts.central, color: 'var(--kpi-fill-central)' },
  ];

  root.innerHTML = `
    <div class="budget-frame-hero" id="budget-frame-hero"></div>
    <div class="kpi-grid">
      ${kpis.map((k) => `
        <div class="kpi-card${k.darkText ? ' kpi-dark-text' : ''}" style="--kpi-color:${k.color}">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${fmtNum(k.value)}</div>
          <div class="kpi-pct">${total ? ((k.value / total) * 100).toFixed(1) : '0.0'}% ของทั้งหมด</div>
        </div>`).join('')}
    </div>
    <div class="analytics-grid-top">
      <div class="card"><div class="card-title">สัดส่วนสถานะการพิจารณา</div><div class="card-sub">จากแผนที่ตรงตัวกรองปัจจุบัน ${fmtNum(total)} แผน</div><div id="chart-status"></div></div>
      <div class="card"><div class="card-title">สัดส่วนตามประเภทหลักสูตร</div><div class="card-sub">ประเภทหลักสูตร (courseType)</div><div id="chart-coursetype"></div></div>
      <div class="card"><div class="card-title">สัดส่วนตามปัจจัยนำเข้าหลัก</div><div class="card-sub">การจัดหมวดเนื้อหาการพัฒนา</div><div id="chart-inputfactor"></div></div>
    </div>
    <div class="charts-grid">
      <div class="card wide chart-summary-card">
        <div class="card-title">จำนวนหลักสูตรที่เสนอ แยกตามหน่วยงาน</div>
        <div class="card-sub">มุมมองหน่วยงาน: <b id="org-level-label"></b> · ภาพรวมแผนพัฒนาบุคลากร ปีงบประมาณ 2570 — เรียงจากมากไปน้อย</div>
        <div class="chart-summary-split">
          <div id="chart-org-status" class="chart-summary-chart" style="overflow-x:auto;"></div>
          <div id="org-exec-summary" class="chart-summary-panel"></div>
        </div>
      </div>
      <div class="card wide chart-summary-card">
        <div class="card-title">เปรียบเทียบการเสนอหลักสูตร ปี 2569–2570</div>
        <div class="card-sub">ข้อมูลปี 2569 เป็นข้อมูลอ้างอิงย้อนหลัง (Read-only) ไม่นับรวมในผลพิจารณาหรือ KPI ปี 2570</div>
        <div class="yoy-chart-frame"><div id="chart-yoy"></div></div>
        <div class="mini-kpi-grid" id="yoy-mini-kpis" style="margin-top:14px;"></div>
      </div>
      <div class="card wide chart-summary-card">
        <div class="card-title">สัดส่วนตามประเภทการอบรม</div>
        <div class="card-sub">นับเฉพาะหลักสูตรเสนอเพิ่มเติม — หลักสูตรกลาง อศค. ดำเนินการ ไม่มีข้อมูลนี้</div>
        <div class="chart-summary-split">
          <div id="chart-deliverytype" class="chart-summary-chart"></div>
          <div id="deliverytype-exec-summary" class="chart-summary-panel"></div>
        </div>
      </div>
    </div>
    <div class="budget-main">
      <div class="mini-kpi-grid" id="budget-mini-kpis"></div>
      <div class="card">
        <div class="card-title">งบประมาณรวมต่อหน่วยงาน แยกตามสถานะการพิจารณา</div>
        <div class="card-sub">เรียงตามงบประมาณสูงสุด 10 อันดับ</div>
        <div id="chart-budget" style="overflow-x:auto;"></div>
      </div>
    </div>
  `;

  document.getElementById('org-level-label').textContent = ORG_LEVELS.find((o) => o.key === STATE.filters.orgLevel).label;

  // status donut — click a slice/legend item to see the matching plans
  renderDonut(document.getElementById('chart-status'), [
    { label: REVIEW_STATUS.pending.label, value: counts.pending, color: 'var(--status-pending)', statusKey: 'pending' },
    { label: REVIEW_STATUS.approved.label, value: counts.approved, color: 'var(--status-good)', statusKey: 'approved' },
    { label: REVIEW_STATUS.revise.label, value: counts.revise, color: 'var(--status-warning)', statusKey: 'revise' },
    { label: REVIEW_STATUS.rejected.label, value: counts.rejected, color: 'var(--status-critical)', statusKey: 'rejected' },
    { label: REVIEW_STATUS.central.label, value: counts.central, color: 'var(--status-central)', statusKey: 'central' },
  ], {
    centerLabel: 'แผน',
    onClick: (d) => openChartDetailModal(`สถานะ: ${d.label}`, data.filter((r) => r.reviewStatus === d.statusKey)),
  });

  // course type donut
  renderDonut(document.getElementById('chart-coursetype'), categoricalDonutData(data, 'courseType'), {
    centerLabel: 'แผน',
    onClick: (d) => openChartDetailModal(`ประเภทหลักสูตร: ${d.label}`, data.filter((r) => d.rawLabels.includes(r.courseType))),
  });

  // input factor donut
  renderDonut(document.getElementById('chart-inputfactor'), categoricalDonutData(data, 'inputFactor'), {
    centerLabel: 'แผน',
    onClick: (d) => openChartDetailModal(`ปัจจัยนำเข้าหลัก: ${d.label}`, data.filter((r) => d.rawLabels.includes(r.inputFactor))),
  });

  // delivery type donut (ภายใน/ภายนอก) — ช่องว่างถูกจัดเป็น "ไม่ระบุ" แทนการตัดทิ้ง
  const deliveryTypeData = categoricalDonutData(data, deliveryTypeOf);
  renderDonut(document.getElementById('chart-deliverytype'), deliveryTypeData, {
    centerLabel: 'แผน',
    onClick: (d) => openChartDetailModal(`ประเภทการอบรม: ${d.label}`, data.filter((r) => d.rawLabels.includes(deliveryTypeOf(r)))),
  });
  renderCategoricalExecSummary(document.getElementById('deliverytype-exec-summary'), deliveryTypeData, {
    top1Label: 'ประเภทการอบรมที่ใช้มากที่สุด', top3Label: 'TOP 3 ประเภทการอบรม', unitLabel: 'แผน', totalLabel: 'แผนทั้งหมด', groupLabel: 'ประเภท',
  });

  // Courses-per-department: same underlying grouping/count/sort as before
  // (label + total, sorted by total descending) — only the rendering below
  // changed (single-series bar + executive summary instead of a stacked-
  // by-status bar), the aggregation itself is untouched.
  const orgLevel = STATE.filters.orgLevel;
  const orgNames = uniqueValues(data, orgLevel);
  const groups = orgNames.map((name) => {
    const rows = data.filter((r) => r[orgLevel] === name);
    const values = { pending: 0, approved: 0, revise: 0, rejected: 0, central: 0 };
    rows.forEach((r) => { values[r.reviewStatus]++; });
    return { label: name, values, total: rows.length, records: rows };
  }).sort((a, b) => b.total - a.total);
  renderOrgCourseChartWithSummary(groups);

  renderYoyComparisonCard();

  renderBudgetExecutiveSection(data, orgLevel, orgNames);
}

/**
 * Renders the "จำนวนหลักสูตรที่เสนอ แยกตามหน่วยงาน" card: a single-series
 * horizontal bar (chart-org-status) plus an executive summary panel
 * (org-exec-summary) built purely from the already-computed, already-sorted
 * `groups` (label + total per org) — no new counting/aggregation logic,
 * this only decides how to lay the numbers out.
 */
function renderOrgCourseChartWithSummary(groups) {
  const chartEl = document.getElementById('chart-org-status');
  const summaryEl = document.getElementById('org-exec-summary');
  if (!chartEl || !summaryEl) return;

  if (!groups.length) {
    chartEl.innerHTML = '<div class="empty-state">ไม่มีข้อมูลตรงตัวกรอง</div>';
    summaryEl.innerHTML = '';
    return;
  }

  const TOP_SHADES = ['var(--seq-700)', 'var(--seq-600)', 'var(--seq-500)'];
  const items = groups.map((g, i) => ({ label: g.label, value: g.total, color: TOP_SHADES[i] || 'var(--seq-300)', records: g.records }));
  renderHBar(chartEl, items, {
    width: 640, rowH: 28, gap: 10, radius: 7,
    onClick: (d) => openChartDetailModal(`หน่วยงาน: ${d.label}`, d.records),
  });

  renderCategoricalExecSummary(summaryEl, items, {
    top1Label: 'เสนอหลักสูตรสูงสุด', top3Label: 'TOP 3 หน่วยงาน', unitLabel: 'หลักสูตร', totalLabel: 'หลักสูตรทั้งหมด', groupLabel: 'หน่วยงาน',
  });
}

/**
 * Generic "executive summary" side panel shared by every chart+summary
 * card on the overview page: top-1 with an icon, a compact top-3 list, two
 * KPIs (total + item count), and a one-line auto insight — built purely
 * from an already-computed, already value-sorted-descending
 * {label, value}[] array (bar/donut data), no aggregation of its own.
 */
function renderCategoricalExecSummary(el, items, opts) {
  if (!el) return;
  opts = opts || {};
  if (!items.length) { el.innerHTML = ''; return; }
  const total = items.reduce((s, d) => s + d.value, 0);
  const top1 = items[0];
  const top3 = items.slice(0, 3);
  const top3Sum = top3.reduce((s, d) => s + d.value, 0);
  const top3Pct = total ? (top3Sum / total) * 100 : 0;
  const unit = opts.unitLabel || 'รายการ';

  let insight = `${escapeHtml(top1.label)} มีจำนวนมากที่สุด ${fmtNum(top1.value)} ${unit}`;
  if (top3.length === 3 && total > 0) {
    insight += ` — 3 อันดับแรกคิดเป็น ${top3Pct.toFixed(0)}% ของทั้งหมด`;
  }

  el.innerHTML = `
    <div class="exec-top1">
      <div class="exec-top1-icon">${opts.icon || '🏆'}</div>
      <div class="exec-top1-label">${escapeHtml(opts.top1Label || 'สูงสุด')}</div>
      <div class="exec-top1-name">${escapeHtml(top1.label)}</div>
      <div class="exec-top1-value">${fmtNum(top1.value)} ${unit}</div>
    </div>
    <div class="exec-top3">
      <div class="exec-top3-label">${escapeHtml(opts.top3Label || 'TOP 3')}</div>
      ${top3.map((d, i) => `
        <div class="exec-top3-row">
          <span class="exec-top3-rank">${String(i + 1).padStart(2, '0')}</span>
          <span class="exec-top3-name">${escapeHtml(d.label)}</span>
          <span class="exec-top3-value">${fmtNum(d.value)}</span>
        </div>`).join('')}
    </div>
    <div class="exec-kpis">
      <div class="exec-kpi"><div class="exec-kpi-value">${fmtNum(total)}</div><div class="exec-kpi-label">${escapeHtml(opts.totalLabel || 'ทั้งหมด')}</div></div>
      <div class="exec-kpi"><div class="exec-kpi-value">${fmtNum(items.length)}</div><div class="exec-kpi-label">${escapeHtml(opts.groupLabel || 'กลุ่ม')}</div></div>
    </div>
    <div class="exec-insight">${insight}</div>
  `;
}

/* ---------------- Budget Executive Section (mini-KPIs + stacked budget bar + insight panel) ---------------- */
function computeOrgBudgetStats(data, orgLevel, orgNames) {
  const orgs = orgNames.map((name) => {
    const rows = data.filter((r) => r[orgLevel] === name);
    const byStatus = { pending: 0, approved: 0, revise: 0, rejected: 0, central: 0 };
    rows.forEach((r) => { byStatus[r.reviewStatus] += (r.effectiveBudget || 0); });
    const total = rows.reduce((s, r) => s + (r.effectiveBudget || 0), 0);
    return { name, count: rows.length, total, byStatus, avg: rows.length ? total / rows.length : 0 };
  });
  const grandTotal = orgs.reduce((s, o) => s + o.total, 0);
  return { orgs, grandTotal };
}

function renderBudgetExecutiveSection(data, orgLevel, orgNames) {
  const { orgs, grandTotal } = computeOrgBudgetStats(data, orgLevel, orgNames);
  const planCount = data.length;
  const topOrg = orgs.slice().sort((a, b) => b.total - a.total)[0] || null;
  const pctOf = (v) => (grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : '0.0');

  // งบที่ "ได้รับอนุมัติ" หมายถึง เห็นชอบ + เห็นชอบแต่ให้ทบทวน รวมกัน (ทั้งคู่มี
  // วงเงินอนุมัติของตัวเองจากผู้พิจารณา) — เดียวกับนิยาม "รวมงบที่เห็นชอบ" ที่ใช้
  // ในตารางงบประมาณและ Insight panel ด้านล่าง ไม่ใช่แค่สถานะ "เห็นชอบ" เพียวๆ
  const isApprovedOrRevise = (r) => r.reviewStatus === 'approved' || r.reviewStatus === 'revise';

  // งบที่ได้รับอนุมัติ (2570, ตามตัวกรองปัจจุบัน) เทียบกับงบรวมปี 2569 ทั้งหมด
  // 36 หลักสูตร (ไม่กรองตามหน่วยงาน — เป็นค่าฐานอ้างอิงคงที่ ตามที่ผู้ใช้ยืนยัน)
  const approvedBudget2570 = data.filter(isApprovedOrRevise).reduce((s, r) => s + (r.effectiveBudget || 0), 0);
  const budget2569Total = HISTORICAL_2569.records.reduce((s, r) => s + (r.budgetBaht || 0), 0);
  const budgetDiff = approvedBudget2570 - budget2569Total;
  const budgetPctChange = budget2569Total > 0 ? (budgetDiff / budget2569Total) * 100 : 0;
  const budgetDiffColor = budgetDiff > 0 ? 'var(--status-good)' : budgetDiff < 0 ? 'var(--status-critical)' : 'var(--text-muted)';
  const budgetDiffIcon = budgetDiff > 0 ? '↑' : budgetDiff < 0 ? '↓' : '→';

  // งบที่ใช้ไปแล้ว (เห็นชอบ) เทียบกับกรอบงบที่ได้รับจัดสรร — ทั้งโรง ไม่กรองตามตัวกรองที่เลือก
  const approvedBudgetPlantWide = STATE.records.filter(isApprovedOrRevise).reduce((s, r) => s + (r.effectiveBudget || 0), 0);
  const frameDiff = approvedBudgetPlantWide - BUDGET_FRAME_2570;
  const framePct = BUDGET_FRAME_2570 > 0 ? (frameDiff / BUDGET_FRAME_2570) * 100 : 0;
  // เกินกรอบ = แย่ (แดง), ต่ำกว่า/เท่ากรอบ = ดี (เขียว)
  // Literal green/red per request — the app's usual --status-good/critical
  // vars are purple/pink, not distinctly green/red.
  const frameDiffColor = frameDiff > 0 ? '#DC2626' : frameDiff < 0 ? '#16A34A' : 'var(--text-muted)';
  const frameDiffIcon = frameDiff > 0 ? '↑' : frameDiff < 0 ? '↓' : '→';

  // A. Mini KPIs — dynamic, ห้าม hard-code
  const miniKpis = document.getElementById('budget-mini-kpis');
  miniKpis.innerHTML = `
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">งบประมาณรวม</div>
      <div class="mini-kpi-value">${fmtBaht(grandTotal)}</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">จำนวนแผน</div>
      <div class="mini-kpi-value">${fmtNum(planCount)} แผน</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">งบที่ได้รับอนุมัติ เทียบกับปี 2569</div>
      <div class="mini-kpi-value">${fmtBaht(approvedBudget2570)}</div>
      <div class="mini-kpi-sub" style="color:${budgetDiffColor};font-weight:700;">${budgetDiffIcon} ${budgetDiff >= 0 ? '+' : '-'}${fmtBaht(Math.abs(budgetDiff))} (${budgetPctChange >= 0 ? '+' : ''}${budgetPctChange.toFixed(1)}%)</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">หน่วยงานที่ใช้งบสูงสุด</div>
      <div class="mini-kpi-value" style="font-size:15px;">${topOrg ? escapeHtml(topOrg.name) : '—'}</div>
      <div class="mini-kpi-sub">${topOrg ? `${fmtBaht(topOrg.total)} · ${pctOf(topOrg.total)}%` : ''}</div>
    </div>
  `;

  // A0. Budget-frame hero — prominent, at the top of the Overview tab
  const frameHero = document.getElementById('budget-frame-hero');
  if (frameHero) {
    // แถบแยกเป็น 2 ส่วน: ในประเทศ (แดง/เขียว ตามเงื่อนไขเดิม) และ ต่างประเทศ
    // (ส้ม/ฟ้า) — เงื่อนไขเกิน/อยู่ในกรอบใช้ตัวเดียวกัน (frameDiff) ต่างกันแค่ชุดสี
    const approvedOverseasBudget = STATE.records
      .filter((r) => isApprovedOrRevise(r) && (deliveryTypeOf(r) || '').indexOf('ต่างประเทศ') !== -1)
      .reduce((s, r) => s + (r.effectiveBudget || 0), 0);
    const approvedDomesticBudget = approvedBudgetPlantWide - approvedOverseasBudget;
    // สัดส่วนจริงระหว่างในประเทศ/ต่างประเทศต้องคงไว้เสมอ แม้ยอดรวมจะเกิน 100%
    // ของกรอบ — คำนวณ % ดิบของทั้งคู่ก่อน แล้วค่อยหด (scale) ทั้งคู่ลงตามอัตราส่วน
    // เดียวกันถ้ารวมกันเกิน 100% แทนที่จะ clamp ทีละส่วนซึ่งจะบีบอีกส่วนจนหายไป
    const domesticPctRaw = BUDGET_FRAME_2570 > 0 ? (approvedDomesticBudget / BUDGET_FRAME_2570) * 100 : 0;
    const overseasPctRaw = BUDGET_FRAME_2570 > 0 ? (approvedOverseasBudget / BUDGET_FRAME_2570) * 100 : 0;
    const totalPctRaw = domesticPctRaw + overseasPctRaw;
    // แถบทั้งเส้นแทน max(ใช้จริง, 100%) ของกรอบ — ถ้าเกินกรอบ เส้นทั้งแถบ = ยอดใช้จริง
    // (เกิน 100 ได้) พร้อมเส้นปะ "100% กรอบงบประมาณ" คั่นไว้ในตำแหน่งที่ถูกต้อง
    // แทนที่จะบีบทุกอย่างให้พอดี 100% เสมอเหมือนเดิม
    const containerMaxPct = Math.max(totalPctRaw, 100);
    const domesticBarWidth = containerMaxPct > 0 ? Math.max((domesticPctRaw / containerMaxPct) * 100, 0) : 0;
    const overseasBarWidth = containerMaxPct > 0 ? Math.max((overseasPctRaw / containerMaxPct) * 100, 0) : 0;
    const frameMarkerPct = containerMaxPct > 0 ? (100 / containerMaxPct) * 100 : 100;
    const domesticBarColor = frameDiff > 0 ? '#0EA5E9' : '#16A34A'; // เกินกรอบ = ฟ้า, อยู่ในกรอบ = เขียว
    const overseasBarColor = frameDiff > 0 ? '#1E3A8A' : '#2563EB'; // เกินกรอบ = น้ำเงินเข้ม, อยู่ในกรอบ = ฟ้า
    // หลักสูตรต่างประเทศไม่นับรวมในยอดนี้ — งบของหลักสูตรเหล่านี้ไปอยู่ในการพิจารณาของ อศค. แยกต่างหาก
    const totalProposedPlantWide = STATE.records
      .filter((r) => (deliveryTypeOf(r) || '').indexOf('ต่างประเทศ') === -1)
      .reduce((s, r) => s + (r.budgetTotal || 0), 0);
    const totalOverseasBudget = STATE.records
      .filter((r) => (deliveryTypeOf(r) || '').indexOf('ต่างประเทศ') !== -1)
      .reduce((s, r) => s + (r.budgetTotal || 0), 0);
    const totalRequestedAll = totalProposedPlantWide + totalOverseasBudget;
    const usedPct = BUDGET_FRAME_2570 > 0 ? (approvedBudgetPlantWide / BUDGET_FRAME_2570) * 100 : 0;
    frameHero.innerHTML = `
      <div class="bfh2-title">
        <span class="bfh2-icon" style="background:#1E293B;">📊</span>
        <span class="bfh2-title-text">เปรียบเทียบงบประมาณพัฒนาบุคลากรที่ได้รับจัดสรร ปีงบประมาณ 2570</span>
      </div>
      <div class="bfh2-stats-row">
        <div class="bfh2-stat-card">
          <span class="bfh2-stat-icon" style="background:color-mix(in srgb, #3B82F6 15%, transparent);">🏦</span>
          <div>
            <div class="bfh2-stat-label">กรอบงบประมาณที่ได้รับจัดสรร</div>
            <div class="bfh2-stat-value">${fmtBaht(BUDGET_FRAME_2570)}</div>
          </div>
        </div>
        <div class="bfh2-vs-connector"><span></span>เทียบกับ<span></span></div>
        <div class="bfh2-stat-card">
          <span class="bfh2-stat-icon" style="background:color-mix(in srgb, #3B82F6 15%, transparent);">💰</span>
          <div>
            <div class="bfh2-stat-label">ใช้ไปแล้ว (หลักสูตรที่เห็นชอบ)</div>
            <div class="bfh2-stat-value">${fmtBaht(approvedBudgetPlantWide)}</div>
          </div>
        </div>
        <div class="bfh2-diff-card" style="background:color-mix(in srgb, ${frameDiffColor} 10%, transparent);">
          <span class="bfh2-stat-icon" style="background:color-mix(in srgb, ${frameDiffColor} 20%, transparent);">${frameDiffIcon}</span>
          <div>
            <div class="bfh2-stat-label">ส่วนต่างงบประมาณ</div>
            <div class="bfh2-diff-value" style="color:${frameDiffColor};">${frameDiffIcon} ${frameDiff >= 0 ? 'เกินกรอบ ' : 'ต่ำกว่ากรอบ '}${fmtBaht(Math.abs(frameDiff))} (${framePct >= 0 ? '+' : ''}${framePct.toFixed(1)}%)</div>
          </div>
        </div>
      </div>
      <div class="bfh2-bar-labels">
        <span>กรอบงบประมาณที่ได้รับจัดสรร <b>${fmtBaht(BUDGET_FRAME_2570)}</b></span>
        <span class="bfh2-bar-frame-label" style="left:${frameMarkerPct}%;">100% กรอบงบประมาณ</span>
        <span>ใช้ไปแล้ว <b>${fmtBaht(approvedBudgetPlantWide)}</b> (${usedPct.toFixed(1)}%)</span>
      </div>
      <div class="bfh-bar-track" style="position:relative;">
        <div class="bfh-bar-fill" style="width:${domesticBarWidth}%;background:${domesticBarColor};" title="หลักสูตรในประเทศ (เห็นชอบ): ${fmtBaht(approvedDomesticBudget)}"></div>
        <div class="bfh-bar-fill" style="width:${overseasBarWidth}%;background:${overseasBarColor};" title="หลักสูตรต่างประเทศ (เห็นชอบ): ${fmtBaht(approvedOverseasBudget)}"></div>
        <div class="bfh2-frame-marker" style="left:${frameMarkerPct}%;"></div>
      </div>
      <div class="bfh2-footnote-row">
        <span class="bfh2-footnote-text">งบประมาณที่เสนอทั้งหมด (ทุกสถานะ ไม่รวมหลักสูตรต่างประเทศ):</span>
        <span class="bfh2-value-text" style="color:${domesticBarColor};">${fmtBaht(totalProposedPlantWide)}</span>
        <span class="bfh2-footnote-arrow">→</span>
        <span class="bfh2-footnote-text">ได้รับอนุมัติ</span>
        <span class="bfh2-value-text" style="color:${domesticBarColor};">${fmtBaht(approvedDomesticBudget)}</span>
      </div>
      <div class="bfh2-footnote-row">
        <span class="bfh2-footnote-text">งบหลักสูตรต่างประเทศที่เสนอ:</span>
        <span class="bfh2-value-text" style="color:${overseasBarColor};">${fmtBaht(totalOverseasBudget)}</span>
        <span class="bfh2-footnote-arrow">→</span>
        <span class="bfh2-footnote-text">ได้รับอนุมัติ</span>
        <span class="bfh2-value-text" style="color:${overseasBarColor};">${fmtBaht(approvedOverseasBudget)}</span>
      </div>
      <div class="bfh2-footnote-row">
        <span class="bfh2-footnote-text">งบที่เสนอขอรวมทั้งหมด:</span>
        <span class="bfh2-value-text" style="color:#0F172A;">${fmtBaht(totalRequestedAll)}</span>
        <span class="bfh2-footnote-arrow">→</span>
        <span class="bfh2-footnote-text">ได้รับอนุมัติ</span>
        <span class="bfh2-value-text" style="color:#0F172A;">${fmtBaht(approvedBudgetPlantWide)}</span>
      </div>
    `;
  }

  // B. Budget table — per-org breakdown by status, top 10 by total budget
  // desc, then อฟก. pinned first among those (stable sort keeps the rest in
  // budget order).
  const budgetGroups = orgs.slice().sort((a, b) => b.total - a.total).slice(0, 10)
    .map((o) => ({ label: o.name, values: o.byStatus, count: o.count, avg: o.avg }))
    .sort((a, b) => (a.label === 'อฟก.' ? -1 : b.label === 'อฟก.' ? 1 : 0));
  const budgetEl = document.getElementById('chart-budget');
  if (budgetGroups.some((g) => g.count > 0)) {
    // "รวม" now means budget already given a positive decision — เห็นชอบ +
    // เห็นชอบแต่ให้ทบทวน — not a sum across every status.
    const approvedTotal = (g) => (g.values.approved || 0) + (g.values.revise || 0);
    const statusCols = [
      { key: 'pending', label: REVIEW_STATUS.pending.label, color: 'var(--status-pending)', text: 'var(--status-pending-text)' },
      { key: 'approved', label: REVIEW_STATUS.approved.label, color: 'var(--status-good)', text: 'var(--status-good-text)' },
      { key: 'revise', label: REVIEW_STATUS.revise.label, color: 'var(--status-warning)', text: 'var(--status-warning-text)' },
      { key: 'rejected', label: REVIEW_STATUS.rejected.label, color: 'var(--status-critical)', text: 'var(--status-critical-text)' },
      { key: 'central', label: REVIEW_STATUS.central.label, color: 'var(--status-central)', text: 'var(--status-central-text)' },
    ];
    const totalsByStatus = {};
    statusCols.forEach((c) => { totalsByStatus[c.key] = budgetGroups.reduce((s, g) => s + (g.values[c.key] || 0), 0); });
    const approvedGrandShown = budgetGroups.reduce((s, g) => s + approvedTotal(g), 0);
    const pctOfApproved = (v) => (approvedGrandShown > 0 ? ((v / approvedGrandShown) * 100).toFixed(1) : '0.0');
    // Always clickable, even when the budget sum shown is "-" — a plan can
    // have a nonzero count with zero budget (e.g. a free course), so the
    // displayed amount alone isn't a reliable signal that nothing's there.
    // data-org omitted (not data-org="") on the totals row/cells so the click
    // handler below can tell "this org" apart from "all shown orgs" cleanly.
    const fmtCell = (value) => value ? fmtBaht(value) : '<span class="cell-muted">-</span>';
    const cell = (value, color, org, statusKey) =>
      `<td class="num cell-clickable" style="background:color-mix(in srgb, ${color} 8%, transparent);" data-status="${statusKey}"${org ? ` data-org="${escapeAttr(org)}"` : ''}>${fmtCell(value)}</td>`;
    budgetEl.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>หน่วยงาน</th>
            ${statusCols.map((c) => `<th class="num" style="background:color-mix(in srgb, ${c.color} 22%, var(--surface-1));color:${c.text};">${c.label}</th>`).join('')}
            <th class="num">รวมงบที่เห็นชอบ</th>
            <th class="num">% ของงบเห็นชอบ</th>
          </tr></thead>
          <tbody>
            ${budgetGroups.map((g) => `
              <tr>
                <td class="cell-name">${escapeHtml(g.label)}</td>
                ${statusCols.map((c) => cell(g.values[c.key] || 0, c.color, g.label, c.key)).join('')}
                <td class="num cell-clickable" style="font-weight:600;" data-status="approved_group" data-org="${escapeAttr(g.label)}">${fmtCell(approvedTotal(g))}</td>
                <td class="num">${pctOfApproved(approvedTotal(g))}%</td>
              </tr>
            `).join('')}
            <tr style="border-top:2px solid var(--border);font-weight:700;">
              <td class="cell-name">รวม</td>
              ${statusCols.map((c) => cell(totalsByStatus[c.key], c.color, '', c.key)).join('')}
              <td class="num cell-clickable" data-status="approved_group">${fmtCell(approvedGrandShown)}</td>
              <td class="num">${pctOfApproved(approvedGrandShown)}%</td>
            </tr>
          </tbody>
        </table>
      </div>`;
    const shownOrgNames = new Set(budgetGroups.map((g) => g.label));
    budgetEl.querySelectorAll('td.cell-clickable').forEach((td) => {
      td.addEventListener('click', () => {
        const org = td.dataset.org || '';
        const status = td.dataset.status;
        const matchesStatus = (r) => {
          if (status === 'all') return true;
          if (status === 'approved_group') return r.reviewStatus === 'approved' || r.reviewStatus === 'revise';
          return r.reviewStatus === status;
        };
        const rows = data.filter((r) => (org ? r[orgLevel] === org : shownOrgNames.has(r[orgLevel])) && matchesStatus(r));
        const statusLabel = status === 'all' ? 'ทุกสถานะ' : status === 'approved_group' ? 'งบที่เห็นชอบ (เห็นชอบ + เห็นชอบแต่ให้ทบทวน)' : REVIEW_STATUS[status].label;
        const title = org ? `${org} — ${statusLabel}` : `รวม 10 หน่วยงานสูงสุด — ${statusLabel}`;
        openChartDetailModal(title, rows);
      });
    });
  } else {
    budgetEl.innerHTML = '<div class="empty-state">ไม่มีข้อมูลงบประมาณ</div>';
  }

}

/* ==================================================================== */
/* TAB: REVIEW LIST                                                     */
/* ==================================================================== */
function renderReviewTab() {
  const root = document.getElementById('panel-review');
  const data = getFiltered();

  // Counts respect every OTHER active filter (org/type/etc.) but not the
  // status filter itself — same cascading logic as the dropdowns — so each
  // chip's number always shows what you'd get by picking it, regardless of
  // which status chip happens to be active right now.
  const statusBase = getFilteredExcept('status');
  const activeStatus = STATE.filters.status;
  const countAll = statusBase.length;
  const countPending = statusBase.filter((r) => r.reviewStatus === 'pending').length;
  const countApproved = statusBase.filter((r) => r.reviewStatus === 'approved').length;
  const countRevise = statusBase.filter((r) => r.reviewStatus === 'revise').length;
  const countRejected = statusBase.filter((r) => r.reviewStatus === 'rejected').length;
  const countCentral = statusBase.filter((r) => r.reviewStatus === 'central').length;
  const countDecided = countApproved + countRevise + countRejected;
  const totalBudget = data.reduce((s, r) => s + (r.effectiveBudget || 0), 0);
  const chip = (status, label, count, extraClass, accentIdx) => {
    const accent = accentIdx != null ? ACCENT_PALETTE[accentIdx % ACCENT_PALETTE.length] : null;
    const style = accent ? ` style="--chip-accent:${accent};--chip-text:${readableTextOn(accent)}"` : '';
    return `<button class="status-chip${extraClass ? ' ' + extraClass : ''}${activeStatus === status ? ' active' : ''}"${style} data-status="${status}">${label} <span class="status-chip-count">${fmtNum(count)}</span></button>`;
  };

  root.innerHTML = `
    <div class="status-quickbar">
      ${chip('', 'ทั้งหมด', countAll, null, 0)}
      ${chip('pending', 'รอพิจารณา', countPending, null, 1)}
      ${chip('decided', 'พิจารณาแล้ว', countDecided, null, 2)}
      ${chip('approved', '↳ เห็นชอบ', countApproved, 'sub sub-approved')}
      ${chip('revise', '↳ เห็นชอบแต่ให้ทบทวน', countRevise, 'sub sub-revise')}
      ${chip('rejected', '↳ ไม่เห็นชอบ', countRejected, 'sub sub-rejected')}
      ${chip('central', 'รวบรวมให้ อศค. ดำเนินการ', countCentral, 'chip-central')}
    </div>
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(data.length)} แผน จากทั้งหมด ${fmtNum(STATE.records.length)} แผน · รวมงบประมาณ ${fmtBaht(totalBudget)}</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>ชื่อหลักสูตร / แผน</th><th>หน่วยงานที่เสนอ</th><th>ประเภทหลักสูตร</th><th>ประเภทการอบรม</th>
          <th class="num">ผู้เข้าอบรม</th><th class="num">งบที่ขอมา</th><th class="num">งบที่อนุมัติ</th><th>สถานะ</th><th></th>
        </tr></thead>
        <tbody>
          ${data.length ? data.map((r) => `
            <tr class="clickable${r.reviewStatus !== 'pending' ? ` row-status-${r.reviewStatus}` : ''}" data-id="${r.id}">
              <td class="cell-name">${escapeHtml(r.nameTh)}</td>
              <td>${escapeHtml(r.sectionName || r.divisionName || r.deptName || '-')}</td>
              <td><span class="pill">${escapeHtml(r.courseType || '-')}</span></td>
              <td>${deliveryTypeOf(r) ? `<span class="pill">${escapeHtml(deliveryTypeOf(r))}</span>` : '<span class="cell-muted">—</span>'}</td>
              <td class="num">${fmtNum(r.participants)}</td>
              <td class="num">${r.budgetTotal ? fmtBaht(r.budgetTotal) : '<span class="cell-muted">-</span>'}</td>
              <td class="num">${r.effectiveBudget ? fmtBaht(r.effectiveBudget) : '<span class="cell-muted">-</span>'}</td>
              <td>${statusBadge(r.reviewStatus)}${r.reviewNote ? `<div class="note-snippet" title="${escapeAttr(r.reviewNote)}">📝 ${escapeHtml(truncate(r.reviewNote, 42))}</div>` : ''}</td>
              <td><button class="btn btn-sm review-open-btn" data-id="${r.id}">พิจารณา</button></td>
            </tr>
          `).join('') : `<tr><td colspan="9"><div class="empty-state"><div class="big">🔍</div>ไม่พบแผนที่ตรงกับตัวกรอง</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  root.querySelectorAll('tr.clickable, .review-open-btn').forEach((elm) => {
    elm.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer(elm.dataset.id || elm.closest('tr').dataset.id);
    });
  });
  root.querySelectorAll('.status-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      STATE.filters.status = btn.dataset.status;
      renderAll();
    });
  });
}

/* ==================================================================== */
/* TAB: DEPARTMENT SUMMARY                                              */
/* ==================================================================== */
function renderDeptSummaryTab() {
  const root = document.getElementById('panel-dept');
  // Same reasoning as renderOverview() — this table's whole point is the
  // per-status column breakdown, so the "สถานะ" filter (incl. the review
  // tab's quick-filter chips, which share the same STATE.filters.status)
  // must not collapse it down to one status.
  const data = getFilteredExcept('status');
  const orgLevel = STATE.filters.orgLevel;
  const orgNames = uniqueValues(data, orgLevel);
  const rows = orgNames.map((name) => {
    const deptRecords = data.filter((r) => r[orgLevel] === name);
    const counts = { pending: 0, approved: 0, revise: 0, rejected: 0, central: 0 };
    deptRecords.forEach((r) => { counts[r.reviewStatus]++; });
    const decided = counts.approved + counts.revise + counts.rejected;
    const rate = decided ? (counts.approved / decided) * 100 : null;
    const byCourseType = {};
    deptRecords.forEach((r) => { byCourseType[r.courseType] = (byCourseType[r.courseType] || 0) + 1; });
    const byInputFactor = {};
    deptRecords.forEach((r) => { byInputFactor[r.inputFactor] = (byInputFactor[r.inputFactor] || 0) + 1; });
    const byDeliveryType = {};
    deptRecords.forEach((r) => { const t = deliveryTypeOf(r); if (t) byDeliveryType[t] = (byDeliveryType[t] || 0) + 1; });
    // Full org ancestry (regardless of the current grouping level) so
    // "เรียงตามกลุ่มหน่วยงาน" can keep sibling units adjacent instead of
    // scattering them by count or by name alone.
    const sample = deptRecords[0];
    const orgPath = sample ? [sample.deptName, sample.divisionName, sample.sectionName].filter(Boolean).join(' / ') : name;
    return { name, total: deptRecords.length, counts, rate, byCourseType, byInputFactor, byDeliveryType, records: deptRecords, orgPath };
  });
  if (STATE.deptSort === 'az') rows.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  else if (STATE.deptSort === 'orggroup') rows.sort((a, b) => a.orgPath.localeCompare(b.orgPath, 'th') || a.name.localeCompare(b.name, 'th'));
  else rows.sort((a, b) => b.total - a.total);

  const sortBreakdownEntries = (obj, mode) => {
    const entries = Object.entries(obj);
    if (mode === 'az') entries.sort((a, b) => a[0].localeCompare(b[0], 'th'));
    else entries.sort((a, b) => b[1] - a[1]);
    return entries;
  };
  const breakdownHeading = (label, dim) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div class="subheading-label">${label}</div>
      <button type="button" class="sort-toggle-btn" data-dim="${dim}">เรียง: ${STATE.deptBreakdownSort[dim] === 'az' ? 'A-Z' : 'มากไปน้อย'}</button>
    </div>`;
  // Dropdown instead of a chip row — fewer always-visible controls, less
  // clutter than one button per value when a dimension has many values.
  // Count stays visible at the end of each option's label.
  const breakdownSelect = (deptName, field, entries) => {
    const cur = STATE.deptCourseListFilter[deptName];
    const curValue = cur && cur.field === field ? cur.value : '';
    return `<select class="breakdown-select" data-dept="${escapeAttr(deptName)}" data-field="${field}">
      <option value="">ทั้งหมด</option>
      ${entries.map(([t, c]) => `<option value="${escapeAttr(t)}" ${t === curValue ? 'selected' : ''}>${escapeHtml(t)} — ${fmtNum(c)}</option>`).join('')}
    </select>`;
  };

  root.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span>สรุปตามหน่วยงานระดับ <b>${ORG_LEVELS.find((o) => o.key === orgLevel).label}</b> — คลิกแถวเพื่อดูรายละเอียดประเภทแผน</span>
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px;">
        <label style="font-size:12px;color:var(--text-muted);">เรียงลำดับ</label>
        <select id="dept-sort">
          <option value="count" ${STATE.deptSort === 'count' ? 'selected' : ''}>มากไปน้อย</option>
          <option value="az" ${STATE.deptSort === 'az' ? 'selected' : ''}>ชื่อ (A-Z)</option>
          <option value="orggroup" ${STATE.deptSort === 'orggroup' ? 'selected' : ''}>ตามกลุ่มหน่วยงาน</option>
        </select>
      </span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>หน่วยงาน</th><th class="num">เสนอทั้งหมด</th><th class="num">${REVIEW_STATUS.pending.label}</th>
          <th class="num">${REVIEW_STATUS.approved.label}</th><th class="num">${REVIEW_STATUS.revise.label}</th>
          <th class="num">${REVIEW_STATUS.rejected.label}</th><th class="num">${REVIEW_STATUS.central.label}</th>
          <th style="min-width:160px;">อัตราเห็นชอบ*</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr class="dept-row-toggle" data-key="${escapeHtml(row.name)}">
              <td class="cell-name"><span class="chev">▸</span>${escapeHtml(row.name)}</td>
              <td class="num">${fmtNum(row.total)}</td>
              <td class="num">${fmtNum(row.counts.pending)}</td>
              <td class="num">${fmtNum(row.counts.approved)}</td>
              <td class="num">${fmtNum(row.counts.revise)}</td>
              <td class="num">${fmtNum(row.counts.rejected)}</td>
              <td class="num">${fmtNum(row.counts.central)}</td>
              <td>
                ${row.rate === null ? '<span class="cell-muted">ยังไม่พิจารณา</span>' : `
                  <div class="rate-bar"><span style="width:${row.rate}%;background:var(--status-good)"></span></div>
                  <span style="font-size:12px;color:var(--text-secondary)">${row.rate.toFixed(0)}% ของที่พิจารณาแล้ว</span>`}
              </td>
            </tr>
            <tr class="dept-detail-row" data-key="${escapeHtml(row.name)}"><td colspan="8"><div class="dept-detail-inner">
              ${breakdownHeading('แยกตามประเภทหลักสูตร', 'courseType')}
              <div style="margin-bottom:12px;">
                ${breakdownSelect(row.name, 'courseType', sortBreakdownEntries(row.byCourseType, STATE.deptBreakdownSort.courseType))}
              </div>
              ${breakdownHeading('แยกตามปัจจัยนำเข้าหลัก', 'inputFactor')}
              <div style="margin-bottom:12px;">
                ${breakdownSelect(row.name, 'inputFactor', sortBreakdownEntries(row.byInputFactor, STATE.deptBreakdownSort.inputFactor))}
              </div>
              ${Object.keys(row.byDeliveryType).length ? `
              ${breakdownHeading('แยกตามประเภทการอบรม', 'deliveryType')}
              <div style="margin-bottom:12px;">
                ${breakdownSelect(row.name, 'deliveryType', sortBreakdownEntries(row.byDeliveryType, STATE.deptBreakdownSort.deliveryType))}
              </div>` : ''}
              ${(() => {
                const courseFilter = STATE.deptCourseListFilter[row.name];
                const listRecords = courseFilter
                  ? row.records.filter((r) => (courseFilter.field === 'deliveryType' ? deliveryTypeOf(r) : r[courseFilter.field]) === courseFilter.value)
                  : row.records;
                return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                <div class="subheading-label">${courseFilter ? `กำลังแสดง: ${escapeHtml(courseFilter.value)} · ${fmtNum(listRecords.length)} รายการ` : `รายชื่อหลักสูตร (${fmtNum(listRecords.length)}) — คลิกแถวเพื่อดูรายละเอียด`}</div>
                ${courseFilter ? `<button type="button" class="sort-toggle-btn dept-course-clear" data-dept="${escapeAttr(row.name)}">✕ ล้างตัวกรอง</button>` : ''}
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>ชื่อหลักสูตร</th><th>ผู้เสนอแผน</th><th>ประเภทหลักสูตร</th><th>ปัจจัยนำเข้าหลัก</th><th>ประเภทการอบรม</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    ${listRecords.length ? listRecords.map((r) => `
                      <tr class="clickable dept-course-row${r.reviewStatus !== 'pending' ? ` row-status-${r.reviewStatus}` : ''}" data-id="${r.id}">
                        <td class="cell-name">${escapeHtml(r.nameTh)}</td>
                        <td>${escapeHtml(r.creatorName || '-')}</td>
                        <td>${escapeHtml(r.courseType || '-')}</td>
                        <td>${escapeHtml(r.inputFactor || '-')}</td>
                        <td>${deliveryTypeOf(r) ? escapeHtml(deliveryTypeOf(r)) : '<span class="cell-muted">—</span>'}</td>
                        <td>${statusBadge(r.reviewStatus)}</td>
                      </tr>
                    `).join('') : `<tr><td colspan="6"><span class="cell-muted">ไม่พบหลักสูตรตามที่กรอง</span></td></tr>`}
                  </tbody>
                </table>
              </div>`;
              })()}
            </div></td></tr>
          `).join('') : `<tr><td colspan="8"><div class="empty-state"><div class="big">📋</div>ไม่พบข้อมูล</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">*อัตราเห็นชอบ = เห็นชอบ ÷ (เห็นชอบ + เห็นชอบแต่ให้ทบทวน + ไม่เห็นชอบ) ไม่นับแผนที่ยังรอพิจารณา</div>
  `;
  root.querySelectorAll('.dept-course-row').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer(tr.dataset.id);
    });
  });
  const deptSortSelect = document.getElementById('dept-sort');
  if (deptSortSelect) deptSortSelect.addEventListener('change', (e) => {
    STATE.deptSort = e.target.value;
    renderDeptSummaryTab();
  });
  root.querySelectorAll('.sort-toggle-btn[data-dim]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dim = btn.dataset.dim;
      STATE.deptBreakdownSort[dim] = STATE.deptBreakdownSort[dim] === 'az' ? 'count' : 'az';
      renderDeptSummaryTab();
    });
  });
  root.querySelectorAll('.breakdown-select').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', (e) => {
      const { dept, field } = sel.dataset;
      const value = e.target.value;
      if (!value) delete STATE.deptCourseListFilter[dept];
      else STATE.deptCourseListFilter[dept] = { field, value };
      renderDeptSummaryTab();
    });
  });
  root.querySelectorAll('.dept-course-clear').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      delete STATE.deptCourseListFilter[btn.dataset.dept];
      renderDeptSummaryTab();
    });
  });
  root.querySelectorAll('.dept-row-toggle').forEach((tr) => {
    tr.addEventListener('click', () => {
      const key = tr.dataset.key;
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(key)}"]`);
      const isOpen = STATE.openDeptKeys.has(key);
      if (isOpen) STATE.openDeptKeys.delete(key); else STATE.openDeptKeys.add(key);
      tr.classList.toggle('open', !isOpen);
      if (detail) detail.classList.toggle('open', !isOpen);
    });
    if (STATE.openDeptKeys.has(tr.dataset.key)) {
      tr.classList.add('open');
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(tr.dataset.key)}"]`);
      if (detail) detail.classList.add('open');
    }
  });
}
function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

/* ==================================================================== */
/* TAB: DUPLICATE COURSES — same course name proposed by 2+ departments  */
/* ==================================================================== */
function joinUnitsPreview(units, max) {
  max = max || 3;
  const shown = units.slice(0, max).join(', ');
  return units.length > max ? `${shown} +${units.length - max} หน่วยงาน` : shown;
}

function renderDupCoursesTab() {
  const root = document.getElementById('panel-dupcourses');
  if (!root) return;
  const data = getFiltered();
  const unitOf = (r) => r.sectionName || r.divisionName || r.deptName || '-';

  const groups = {};
  data.forEach((r) => { (groups[r.nameTh] = groups[r.nameTh] || []).push(r); });
  const dupGroups = Object.entries(groups)
    .map(([name, records]) => ({ name, records, units: Array.from(new Set(records.map(unitOf))) }))
    .filter((g) => g.units.length >= 2)
    .sort((a, b) => b.units.length - a.units.length || a.name.localeCompare(b.name, 'th'));
  const totalParticipants = (records) => records.reduce((s, r) => s + (Number(r.participants) || 0), 0);

  root.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span>พบหลักสูตรที่มากกว่า 1 หน่วยงานเสนอเหมือนกัน ${fmtNum(dupGroups.length)} หลักสูตร (จากทั้งหมด ${fmtNum(data.length)} แผนที่ตรงตัวกรอง) — คลิกแถวเพื่อดูรายละเอียดแต่ละหน่วยงาน</span>
      <button class="btn" id="export-dupcourses-btn"${dupGroups.length ? '' : ' disabled'}>⬇ ส่งออกรายการซ้ำ (CSV)</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>ชื่อหลักสูตร</th><th>ประเภทหลักสูตร</th><th>ประเภทการอบรม</th>
          <th>หน่วยงานเจ้าของหลักสูตร</th><th class="num">ผู้เข้าอบรม (รวม)</th><th></th>
        </tr></thead>
        <tbody>
          ${dupGroups.length ? dupGroups.map((g) => {
            const sample = g.records[0];
            return `
            <tr class="dept-row-toggle" data-key="${escapeHtml(g.name)}">
              <td class="cell-name"><span class="chev">▸</span>${escapeHtml(g.name)}</td>
              <td>${escapeHtml(sample.courseType || '-')}</td>
              <td>${deliveryTypeOf(sample) ? escapeHtml(deliveryTypeOf(sample)) : '<span class="cell-muted">—</span>'}</td>
              <td>${fmtNum(g.units.length)} หน่วยงาน<div class="cell-muted" style="font-size:11.5px;margin-top:2px;">${escapeHtml(joinUnitsPreview(g.units))}</div></td>
              <td class="num">${fmtNum(totalParticipants(g.records))}</td>
              <td></td>
            </tr>
            <tr class="dept-detail-row" data-key="${escapeHtml(g.name)}"><td colspan="6"><div class="dept-detail-inner">
              <div class="subheading-label" style="margin-bottom:6px;">รายละเอียดแต่ละหน่วยงาน (${fmtNum(g.records.length)}) — คลิกแถวเพื่อดูรายละเอียด</div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>หน่วยงาน</th><th>ผู้เสนอแผน</th><th class="num">ผู้เข้าอบรม</th><th class="num">งบประมาณ</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    ${g.records.map((r) => `
                      <tr class="clickable dept-course-row${r.reviewStatus !== 'pending' ? ` row-status-${r.reviewStatus}` : ''}" data-id="${r.id}">
                        <td class="cell-name">${escapeHtml(unitOf(r))}</td>
                        <td>${escapeHtml(r.creatorName || '-')}</td>
                        <td class="num">${fmtNum(r.participants)}</td>
                        <td class="num">${r.effectiveBudget ? fmtBaht(r.effectiveBudget) : '<span class="cell-muted">-</span>'}</td>
                        <td>${statusBadge(r.reviewStatus)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div></td></tr>
          `;
          }).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="big">🔍</div>ไม่พบหลักสูตรที่มากกว่า 1 หน่วยงานเสนอเหมือนกัน</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll('.dept-course-row').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer(tr.dataset.id);
    });
  });
  root.querySelectorAll('.dept-row-toggle').forEach((tr) => {
    tr.addEventListener('click', () => {
      const key = tr.dataset.key;
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(key)}"]`);
      const isOpen = STATE.openDupCourseKeys.has(key);
      if (isOpen) STATE.openDupCourseKeys.delete(key); else STATE.openDupCourseKeys.add(key);
      tr.classList.toggle('open', !isOpen);
      if (detail) detail.classList.toggle('open', !isOpen);
    });
    if (STATE.openDupCourseKeys.has(tr.dataset.key)) {
      tr.classList.add('open');
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(tr.dataset.key)}"]`);
      if (detail) detail.classList.add('open');
    }
  });

  const exportBtn = root.querySelector('#export-dupcourses-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportDupCoursesCsv(dupGroups, unitOf));
}

/**
 * Flattens every duplicate-course group into one row per org's proposal,
 * grouped together in the file (course name, then org) so the person doing
 * the merge in the external HR system can work through it top-to-bottom
 * without missing a duplicate — one CSV row per record, with the review
 * status included since some duplicates end up "revise" and others
 * "approved", which decides which record they keep and edit.
 */
function exportDupCoursesCsv(dupGroups, unitOf) {
  const rows = [];
  dupGroups.forEach((g) => {
    g.records.slice().sort((a, b) => unitOf(a).localeCompare(unitOf(b), 'th')).forEach((r) => {
      rows.push({ ...r, groupUnitCount: g.units.length, reviewStatusLabel: REVIEW_STATUS[r.reviewStatus].label });
    });
  });
  const cols = [
    ['nameTh', 'ชื่อหลักสูตร'],
    ['groupUnitCount', 'จำนวนหน่วยงานที่ซ้ำ'],
    ['courseType', 'ประเภทหลักสูตร'],
    ['deliveryType', 'ประเภทการอบรม'],
    ['deptName', 'ฝ่ายผู้สร้างหลักสูตร'],
    ['divisionName', 'กองผู้สร้างหลักสูตร'],
    ['sectionName', 'แผนกผู้สร้างหลักสูตร'],
    ['creatorName', 'ผู้สร้างหลักสูตร'],
    ['creatorId', 'เลขประจำตัวผู้สร้างหลักสูตร'],
    ['targetGroupNames', 'กลุ่มเป้าหมาย (รายชื่อ)'],
    ['participants', 'จำนวนผู้เข้าอบรม (คน)'],
    ['budgetTotal', 'งบประมาณที่เสนอ (บาท)'],
    ['approvedBudget', 'วงเงินที่ อฟก. อนุมัติ (บาท)'],
    ['reviewStatusLabel', 'สถานะการพิจารณา'],
    ['remark', 'หมายเหตุ (จากไฟล์นำเข้า)'],
    ['reviewNote', 'หมายเหตุการพิจารณา'],
    ['id', 'รหัสแผน'],
  ];
  downloadCsv('หลักสูตรที่ซ้ำกัน_2570.csv', cols, rows, (row, key) => row[key]);
}

/** Shared CSV builder — BOM + CRLF + quote-escaping, matching exportCsv(). */
function downloadCsv(filename, cols, rows, cellFmt) {
  const csvRows = [cols.map((c) => c[1]).join(',')];
  rows.forEach((r) => {
    csvRows.push(cols.map(([key]) => {
      let v = cellFmt(r, key);
      v = String(v == null ? '' : v).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(','));
  });
  const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ==================================================================== */
/* TAB: PERSONNEL IN THE DEVELOPMENT PLAN (บุคลากรในแผนพัฒนา) — a pure    */
/* frontend roll-up of targetGroupNames, no new data/schema of any kind. */
/* ==================================================================== */

/**
 * Splits a "กลุ่มเป้าหมาย" text blob into one segment per person, each
 * segment starting at a 6-digit เลขประจำตัว (the format this field uses).
 * Independent of formatDetailValue's own 'people' display mode on purpose —
 * that one is already working in the drawer and isn't touched here.
 */
function splitPeopleText(text) {
  if (!text) return [];
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return normalized.split(/\s+(?=\d{6}(?:\s|$))/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Extracts { employeeId, name } from one segment, or null if the segment
 * doesn't start with a 6-digit id — a name with no id can't be reliably
 * tied to a person, so it's dropped rather than guessed at.
 */
function parsePersonSegment(segment) {
  const m = String(segment || '').match(/^(\d{6})\s*(.*)$/);
  if (!m) return null;
  const name = m[2].trim();
  return { employeeId: m[1], name: name || '(ไม่ระบุชื่อ)' };
}

/**
 * One pass over `records` building Map<employeeId, { employeeId, name,
 * plans: Map<planId, record> }>. The inner plan map both dedupes (the same
 * id repeated within one plan's text) and keeps each person's actual plan
 * objects for the count/detail view.
 */
function buildPersonnelIndex(records) {
  const byId = new Map();
  records.forEach((r) => {
    const segments = splitPeopleText(r.targetGroupNames);
    if (!segments.length) return;
    const seenInThisPlan = new Set();
    segments.forEach((seg) => {
      const person = parsePersonSegment(seg);
      if (!person || seenInThisPlan.has(person.employeeId)) return;
      seenInThisPlan.add(person.employeeId);
      let entry = byId.get(person.employeeId);
      if (!entry) {
        entry = { employeeId: person.employeeId, name: person.name, plans: new Map() };
        byId.set(person.employeeId, entry);
      }
      if (!entry.plans.has(r.id)) entry.plans.set(r.id, r);
    });
  });
  return byId;
}

function renderPersonnelTab() {
  const root = document.getElementById('panel-personnel');
  if (!root) return;
  // Same reasoning as renderDeptSummaryTab() — this view breaks each person
  // down BY status, so the "สถานะ" filter (incl. the review tab's chips)
  // must not collapse it to one status.
  const data = getFilteredExcept('status');
  const byId = buildPersonnelIndex(data);

  const people = Array.from(byId.values()).map((entry) => {
    const plans = Array.from(entry.plans.values());
    const counts = { pending: 0, approved: 0, revise: 0, rejected: 0, central: 0 };
    plans.forEach((p) => { counts[p.reviewStatus] = (counts[p.reviewStatus] || 0) + 1; });
    // The only department evidence the system actually has is which unit
    // PROPOSED each course this person is named in — not their own home
    // unit (a target can belong to a different department than the
    // proposer, e.g. a centrally-run course), so this is shown as such
    // rather than presented as "their department".
    const proposingUnits = Array.from(new Set(plans.map((p) => p.divisionName || '-')));
    return { employeeId: entry.employeeId, name: entry.name, plans, count: plans.length, counts, proposingUnits };
  });

  const totalPeople = people.length;
  const totalRelations = people.reduce((s, p) => s + p.count, 0);
  const distinctPlanIds = new Set();
  people.forEach((p) => p.plans.forEach((pl) => distinctPlanIds.add(pl.id)));
  const totalCourses = distinctPlanIds.size;
  const avgPerPerson = totalPeople ? totalRelations / totalPeople : 0;

  const f = STATE.personnelFilters;
  let filtered = people;
  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter((p) => p.employeeId.includes(q) || p.name.toLowerCase().includes(q));
  }
  const sorters = {
    count_desc: (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'),
    count_asc: (a, b) => a.count - b.count || a.name.localeCompare(b.name, 'th'),
    name_asc: (a, b) => a.name.localeCompare(b.name, 'th'),
    name_desc: (a, b) => b.name.localeCompare(a.name, 'th'),
  };
  filtered = filtered.slice().sort(sorters[f.sort] || sorters.count_desc);

  root.innerHTML = `
    <div class="subheading-label" style="font-size:15px;margin-bottom:14px;">บุคลากรในแผนพัฒนา ปี 2570</div>
    <div class="mini-kpi-grid mini-kpi-grid-3" style="margin-bottom:16px;">
      <div class="mini-kpi-card"><div class="mini-kpi-label">บุคลากรในแผนทั้งหมด</div><div class="mini-kpi-value">${fmtNum(totalPeople)}</div><div class="mini-kpi-sub">คนไม่ซ้ำ</div></div>
      <div class="mini-kpi-card"><div class="mini-kpi-label">จำนวนหลักสูตรที่เกี่ยวข้อง</div><div class="mini-kpi-value">${fmtNum(totalCourses)}</div><div class="mini-kpi-sub">แผนที่มีรายชื่อบุคลากร</div></div>
      <div class="mini-kpi-card"><div class="mini-kpi-label">เฉลี่ยหลักสูตรต่อคน</div><div class="mini-kpi-value">${avgPerPerson.toFixed(1)}</div><div class="mini-kpi-sub">หลักสูตร/คน</div></div>
    </div>
    <div class="filter-bar" style="margin-bottom:14px;">
      <div class="filter-field filter-search">
        <label>ค้นหา</label>
        <input type="search" id="pp-search" placeholder="เลขประจำตัว หรือ ชื่อ-นามสกุล..." value="${escapeAttr(f.search)}" />
      </div>
      <div class="filter-field">
        <label>เรียงลำดับ</label>
        <select id="pp-sort">
          <option value="count_desc" ${f.sort === 'count_desc' ? 'selected' : ''}>จำนวนหลักสูตร มาก → น้อย</option>
          <option value="count_asc" ${f.sort === 'count_asc' ? 'selected' : ''}>จำนวนหลักสูตร น้อย → มาก</option>
          <option value="name_asc" ${f.sort === 'name_asc' ? 'selected' : ''}>ชื่อ ก → ฮ</option>
          <option value="name_desc" ${f.sort === 'name_desc' ? 'selected' : ''}>ชื่อ ฮ → ก</option>
        </select>
      </div>
    </div>
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(filtered.length)} คน จากทั้งหมด ${fmtNum(totalPeople)} คน</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>หน่วยงานที่เสนอ*</th><th class="num">จำนวนหลักสูตร</th>
          <th class="num">รอพิจารณา</th><th class="num">เห็นชอบ</th><th class="num">เห็นชอบแต่ให้ทบทวน</th><th class="num">ไม่เห็นชอบ</th>
          <th class="num">${REVIEW_STATUS.central.label}</th><th></th>
        </tr></thead>
        <tbody>
          ${filtered.length ? filtered.map((p) => `
            <tr class="dept-row-toggle" data-key="${p.employeeId}">
              <td>${escapeHtml(p.employeeId)}</td>
              <td class="cell-name"><span class="chev">▸</span>${escapeHtml(p.name)}</td>
              <td>${p.proposingUnits.length === 1
                ? escapeHtml(p.proposingUnits[0])
                : `${fmtNum(p.proposingUnits.length)} หน่วยงาน<div class="cell-muted" style="font-size:11.5px;margin-top:2px;">${escapeHtml(joinUnitsPreview(p.proposingUnits))}</div>`}</td>
              <td class="num">${fmtNum(p.count)}</td>
              <td class="num">${fmtNum(p.counts.pending || 0)}</td>
              <td class="num">${fmtNum(p.counts.approved || 0)}</td>
              <td class="num">${fmtNum(p.counts.revise || 0)}</td>
              <td class="num">${fmtNum(p.counts.rejected || 0)}</td>
              <td class="num">${fmtNum(p.counts.central || 0)}</td>
              <td></td>
            </tr>
            <tr class="dept-detail-row" data-key="${p.employeeId}"><td colspan="10"><div class="dept-detail-inner">
              <div class="subheading-label" style="margin-bottom:2px;">${escapeHtml(p.employeeId)} ${escapeHtml(p.name)}</div>
              <div class="cell-muted" style="font-size:12.5px;margin-bottom:10px;">อยู่ในแผนพัฒนา ${fmtNum(p.count)} หลักสูตร</div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr>
                    <th>ชื่อหลักสูตร</th><th>หน่วยงานที่เสนอ</th><th>ประเภทหลักสูตร</th><th>ปัจจัยนำเข้าหลัก</th>
                    <th>ประเภทการอบรม</th><th class="num">จำนวนวัน</th><th class="num">งบประมาณ</th><th>สถานะ</th>
                  </tr></thead>
                  <tbody>
                    ${p.plans.map((pl) => `
                      <tr class="clickable person-plan-row${pl.reviewStatus !== 'pending' ? ` row-status-${pl.reviewStatus}` : ''}" data-id="${pl.id}">
                        <td class="cell-name">${escapeHtml(pl.nameTh)}</td>
                        <td>${escapeHtml(pl.sectionName || pl.divisionName || pl.deptName || '-')}</td>
                        <td>${escapeHtml(pl.courseType || '-')}</td>
                        <td>${escapeHtml(pl.inputFactor || '-')}</td>
                        <td>${deliveryTypeOf(pl) ? escapeHtml(deliveryTypeOf(pl)) : '<span class="cell-muted">—</span>'}</td>
                        <td class="num">${pl.days ? fmtNum(pl.days) : '<span class="cell-muted">-</span>'}</td>
                        <td class="num">${pl.effectiveBudget ? fmtBaht(pl.effectiveBudget) : '<span class="cell-muted">-</span>'}</td>
                        <td>${statusBadge(pl.reviewStatus)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div></td></tr>
          `).join('') : `<tr><td colspan="10"><div class="empty-state"><div class="big">🔍</div>ไม่พบบุคลากรที่ตรงกับการค้นหา</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">*หน่วยงานที่เสนอหลักสูตรที่บุคคลนั้นมีชื่ออยู่ ไม่ใช่หน่วยงานต้นสังกัดของบุคคลโดยตรง (ระบบไม่มีข้อมูลสังกัดรายบุคคลแยกต่างหาก บางหลักสูตรหน่วยงานหนึ่งอาจเสนอแต่ส่งคนจากหลายหน่วยงานเข้าอบรม)</div>
  `;

  root.querySelectorAll('.person-plan-row').forEach((tr) => {
    tr.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(tr.dataset.id); });
  });
  root.querySelectorAll('.dept-row-toggle').forEach((tr) => {
    tr.addEventListener('click', () => {
      const key = tr.dataset.key;
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(key)}"]`);
      const isOpen = STATE.openPersonKeys.has(key);
      if (isOpen) STATE.openPersonKeys.delete(key); else STATE.openPersonKeys.add(key);
      tr.classList.toggle('open', !isOpen);
      if (detail) detail.classList.toggle('open', !isOpen);
    });
    if (STATE.openPersonKeys.has(tr.dataset.key)) {
      tr.classList.add('open');
      const detail = root.querySelector(`.dept-detail-row[data-key="${cssEscape(tr.dataset.key)}"]`);
      if (detail) detail.classList.add('open');
    }
  });
  if (document.getElementById('pp-search')) {
    bindSearchInput('pp-search', (v) => { STATE.personnelFilters.search = v; renderPersonnelTab(); });
  }
  const ppSort = document.getElementById('pp-sort');
  if (ppSort) ppSort.addEventListener('change', (e) => {
    STATE.personnelFilters.sort = e.target.value;
    renderPersonnelTab();
  });
}

/* ==================================================================== */
/* TAB: ADMIN — LOGIN HISTORY (ประวัติการเข้าใช้งาน) — Admin-only, RLS-   */
/* enforced on login_events; the isAdmin() checks here are UI convenience */
/* only, loaded lazily the first time the tab is opened.                 */
/* ==================================================================== */
async function loadLoginHistoryTab() {
  const root = document.getElementById('panel-loginhistory');
  if (!STATE.loginHistoryLoaded) {
    root.innerHTML = '<div class="empty-state"><div class="big">⏳</div>กำลังโหลด...</div>';
    try {
      STATE.loginHistory = await fetchLoginHistory();
      STATE.loginHistoryLoaded = true;
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><div class="big">⚠</div>โหลดประวัติการเข้าใช้งานไม่สำเร็จ: ${escapeHtml(e.message || '')}</div>`;
      return;
    }
  }
  renderLoginHistoryTab();
}

function matchesLoginHistoryFilters(e) {
  const f = STATE.loginHistoryFilters;
  if (f.department && (e.department || '') !== f.department) return false;
  if (f.dateFrom && new Date(e.created_at) < new Date(f.dateFrom + 'T00:00:00')) return false;
  if (f.dateTo && new Date(e.created_at) > new Date(f.dateTo + 'T23:59:59.999')) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [e.employee_id, e.full_name, e.position, e.department].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const LOGIN_EVENT_LABEL = { LOGIN_SUCCESS: 'เข้าสู่ระบบ', LOGOUT: 'ออกจากระบบ' };

function renderLoginHistoryTab() {
  const root = document.getElementById('panel-loginhistory');
  const f = STATE.loginHistoryFilters;
  const departments = Array.from(new Set(STATE.loginHistory.map((e) => e.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const filtered = STATE.loginHistory.filter(matchesLoginHistoryFilters);
  const latest = filtered.length ? filtered[0].created_at : null; // already newest-first from fetchLoginHistory()

  root.innerHTML = `
    <div class="filter-bar" style="margin-bottom:14px;">
      <div class="filter-field filter-search">
        <label>ค้นหา</label>
        <input type="search" id="lh-search" placeholder="เลขประจำตัว, ชื่อ, ตำแหน่ง..." value="${escapeAttr(f.search)}" />
      </div>
      <div class="filter-field">
        <label>หน่วยงาน</label>
        <select id="lh-department"><option value="">ทั้งหมด</option>${departments.map((d) => `<option value="${escapeAttr(d)}" ${d === f.department ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select>
      </div>
      <div class="filter-field">
        <label>จากวันที่</label>
        <input type="date" id="lh-datefrom" value="${escapeAttr(f.dateFrom)}" />
      </div>
      <div class="filter-field">
        <label>ถึงวันที่</label>
        <input type="date" id="lh-dateto" value="${escapeAttr(f.dateTo)}" />
      </div>
      <button class="btn btn-ghost btn-sm" id="lh-clear" style="align-self:flex-end;">ล้างตัวกรอง</button>
      <button class="btn btn-sm" id="lh-export" style="align-self:flex-end;">⬇ ส่งออก (CSV)</button>
    </div>
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(filtered.length)} รายการ จากทั้งหมด ${fmtNum(STATE.loginHistory.length)} รายการ · เข้าใช้งานล่าสุด: ${latest ? escapeHtml(fmtThaiDateTime(latest)) : '-'}</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>วันเวลา</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>สิทธิ์</th><th>เหตุการณ์</th>
        </tr></thead>
        <tbody>
          ${filtered.length ? filtered.map((e) => `
            <tr>
              <td>${escapeHtml(fmtThaiDateTime(e.created_at))}</td>
              <td>${escapeHtml(e.employee_id || '-')}</td>
              <td class="cell-name">${escapeHtml(e.full_name || '-')}</td>
              <td>${escapeHtml(e.position || '-')}</td>
              <td>${escapeHtml(e.department || '-')}</td>
              <td>${escapeHtml(e.role || '-')}</td>
              <td><span class="pill">${escapeHtml(LOGIN_EVENT_LABEL[e.event] || e.event)}</span></td>
            </tr>
          `).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="big">🔍</div>ไม่พบข้อมูลที่ตรงกับตัวกรอง</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const bind = (id, key, evt) => document.getElementById(id).addEventListener(evt || 'change', (e) => {
    STATE.loginHistoryFilters[key] = e.target.value;
    renderLoginHistoryTab();
  });
  bindSearchInput('lh-search', (v) => { STATE.loginHistoryFilters.search = v; renderLoginHistoryTab(); });
  bind('lh-department', 'department');
  bind('lh-datefrom', 'dateFrom');
  bind('lh-dateto', 'dateTo');
  document.getElementById('lh-clear').addEventListener('click', () => {
    STATE.loginHistoryFilters = { search: '', department: '', dateFrom: '', dateTo: '' };
    renderLoginHistoryTab();
  });
  document.getElementById('lh-export').addEventListener('click', () => {
    downloadCsv('ประวัติการเข้าใช้งาน_2570.csv',
      [['created_at', 'วันเวลา'], ['employee_id', 'เลขประจำตัว'], ['full_name', 'ชื่อ-นามสกุล'], ['position', 'ตำแหน่ง'], ['department', 'หน่วยงาน'], ['role', 'สิทธิ์'], ['event', 'เหตุการณ์']],
      filtered,
      (r, key) => key === 'created_at' ? fmtThaiDateTime(r[key]) : (key === 'event' ? (LOGIN_EVENT_LABEL[r[key]] || r[key]) : r[key]));
  });
}

/* ==================================================================== */
/* TAB: ADMIN — ACTIVITY HISTORY (ประวัติการเปลี่ยนแปลง) — reuses         */
/* audit_logs (Admin-only via RLS); Reviewers never see this tab (CSS)   */
/* and would get zero rows from the general Admin-only policy even if   */
/* they somehow triggered the fetch.                                    */
/* ==================================================================== */
async function loadActivityLogTab() {
  const root = document.getElementById('panel-activitylog');
  if (!STATE.activityLogLoaded) {
    root.innerHTML = '<div class="empty-state"><div class="big">⏳</div>กำลังโหลด...</div>';
    try {
      STATE.activityLog = await fetchActivityLog();
      STATE.activityLogLoaded = true;
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><div class="big">⚠</div>โหลดประวัติการเปลี่ยนแปลงไม่สำเร็จ: ${escapeHtml(e.message || '')}</div>`;
      return;
    }
  }
  renderActivityLogTab();
}

function matchesActivityLogFilters(e) {
  const f = STATE.activityLogFilters;
  if (f.action && e.action !== f.action) return false;
  if (f.dateFrom && new Date(e.created_at) < new Date(f.dateFrom + 'T00:00:00')) return false;
  if (f.dateTo && new Date(e.created_at) > new Date(f.dateTo + 'T23:59:59.999')) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [e.employee_id, e.actor_full_name, e.actor_position, e.action, e.target_type, e.target_id, e.note].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Reconstructs a compact "what changed" summary; never hard-codes a specific action list. */
function activityLogDetailLabel(e) {
  if (e.target_type === 'plan' && e.new_value && e.new_value.decision) return planHistoryActionLabel(e);
  if (e.note) return truncate(e.note, 70);
  if (e.new_value) return truncate(JSON.stringify(e.new_value), 70);
  return '-';
}

function renderActivityLogTab() {
  const root = document.getElementById('panel-activitylog');
  const f = STATE.activityLogFilters;
  const actions = Array.from(new Set(STATE.activityLog.map((e) => e.action).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const filtered = STATE.activityLog.filter(matchesActivityLogFilters);

  root.innerHTML = `
    <div class="filter-bar" style="margin-bottom:14px;">
      <div class="filter-field filter-search">
        <label>ค้นหา</label>
        <input type="search" id="al-search" placeholder="เลขประจำตัว, ชื่อผู้ดำเนินการ, รหัสแผน, หมายเหตุ..." value="${escapeAttr(f.search)}" />
      </div>
      <div class="filter-field">
        <label>ประเภทการเปลี่ยนแปลง</label>
        <select id="al-action"><option value="">ทั้งหมด</option>${actions.map((a) => `<option value="${escapeAttr(a)}" ${a === f.action ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select>
      </div>
      <div class="filter-field">
        <label>จากวันที่</label>
        <input type="date" id="al-datefrom" value="${escapeAttr(f.dateFrom)}" />
      </div>
      <div class="filter-field">
        <label>ถึงวันที่</label>
        <input type="date" id="al-dateto" value="${escapeAttr(f.dateTo)}" />
      </div>
      <button class="btn btn-ghost btn-sm" id="al-clear" style="align-self:flex-end;">ล้างตัวกรอง</button>
      <button class="btn btn-sm" id="al-export" style="align-self:flex-end;">⬇ ส่งออก (CSV)</button>
    </div>
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(filtered.length)} รายการ จากทั้งหมด ${fmtNum(STATE.activityLog.length)} รายการ</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>วันเวลา</th><th>ผู้ดำเนินการ</th><th>ประเภทการเปลี่ยนแปลง</th><th>เป้าหมาย</th><th>รายละเอียด</th>
        </tr></thead>
        <tbody>
          ${filtered.length ? filtered.map((e) => `
            <tr>
              <td>${escapeHtml(fmtThaiDateTime(e.created_at))}</td>
              <td class="cell-name">${escapeHtml(e.actor_full_name || '-')}${e.employee_id ? ` <span class="cell-muted">(${escapeHtml(e.employee_id)})</span>` : ''}<div style="color:var(--text-muted);font-size:11.5px;">${escapeHtml(e.actor_position || '')}${e.role ? ` · ${escapeHtml(e.role)}` : ''}</div></td>
              <td><span class="pill">${escapeHtml(e.action)}</span></td>
              <td>${escapeHtml(e.target_type || '-')}${e.target_id ? ` <span class="cell-muted">${escapeHtml(truncate(e.target_id, 24))}</span>` : ''}</td>
              <td>${escapeHtml(activityLogDetailLabel(e))}</td>
            </tr>
          `).join('') : `<tr><td colspan="5"><div class="empty-state"><div class="big">🔍</div>ไม่พบข้อมูลที่ตรงกับตัวกรอง</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const bind = (id, key, evt) => document.getElementById(id).addEventListener(evt || 'change', (e) => {
    STATE.activityLogFilters[key] = e.target.value;
    renderActivityLogTab();
  });
  bindSearchInput('al-search', (v) => { STATE.activityLogFilters.search = v; renderActivityLogTab(); });
  bind('al-action', 'action');
  bind('al-datefrom', 'dateFrom');
  bind('al-dateto', 'dateTo');
  document.getElementById('al-clear').addEventListener('click', () => {
    STATE.activityLogFilters = { search: '', action: '', dateFrom: '', dateTo: '' };
    renderActivityLogTab();
  });
  document.getElementById('al-export').addEventListener('click', () => {
    downloadCsv('ประวัติการเปลี่ยนแปลง_2570.csv',
      [['created_at', 'วันเวลา'], ['employee_id', 'เลขประจำตัว'], ['actor_full_name', 'ชื่อผู้ดำเนินการ'], ['actor_position', 'ตำแหน่ง'], ['role', 'สิทธิ์'], ['action', 'ประเภทการเปลี่ยนแปลง'], ['target_type', 'เป้าหมาย'], ['target_id', 'รหัสเป้าหมาย'], ['detail', 'รายละเอียด']],
      filtered,
      (r, key) => key === 'created_at' ? fmtThaiDateTime(r[key]) : (key === 'detail' ? activityLogDetailLabel(r) : r[key]));
  });
}

/* ==================================================================== */
/* TAB: APPROVED DATA — a separate dataset (final_courses, sheet 1 of the */
/* อศค. workbook only) exported once a course is re-keyed into the central */
/* อศค. tracking system. Unrelated to plans/decisions above — visible to  */
/* everyone, only its import button is admin-only.                      */
/* ==================================================================== */

async function loadFinalDataTab() {
  const root = document.getElementById('panel-finaldata');
  if (!STATE.finalDataLoaded) {
    root.innerHTML = '<div class="empty-state"><div class="big">⏳</div>กำลังโหลด...</div>';
    try {
      await fetchFinalData();
      try { STATE.finalDataLastImportInfo = await fetchLastFinalImportInfo(); }
      catch (e) { STATE.finalDataLastImportInfo = null; }
      STATE.finalDataLoaded = true;
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><div class="big">⚠</div>โหลด Approved Data ไม่สำเร็จ: ${escapeHtml(e.message || '')}</div>`;
      return;
    }
  }
  renderFinalDataTab();
}

/** สถานะหลักสูตรของระบบ อศค. เอง (เช่น ร่าง/รออนุมัติ) — คนละชุดกับ REVIEW_STATUS ของแอปนี้ จึงไม่ใช้ statusBadge()/DECISION_META เดิม */
function finalStatusBadge(status) {
  const s = String(status || '').trim();
  if (!s) return '<span class="cell-muted">-</span>';
  const colorMap = { 'ร่าง': 'var(--status-pending)', 'รออนุมัติ': 'var(--status-warning)', 'อนุมัติ': 'var(--status-good)', 'ไม่อนุมัติ': 'var(--status-critical)' };
  const color = colorMap[s] || 'var(--status-pending)';
  return `<span class="badge" style="background:color-mix(in srgb, ${color} 15%, transparent);color:${color};">${escapeHtml(s)}</span>`;
}

function renderFinalDataTab() {
  const root = document.getElementById('panel-finaldata');
  if (!root) return;
  // "ร่าง" (draft) courses are excluded entirely from this tab — table,
  // filter dropdowns, KPI cards, budget hero, everything — per the user's
  // explicit instruction, not just from the dashboard's aggregate math.
  const courses = STATE.finalCourses.filter((r) => r.sourceStatus !== 'ร่าง');
  const f = STATE.finalDataFilters;

  let filtered = courses;
  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter((r) => (r.nameTh || '').toLowerCase().includes(q) || (r.id || '').toLowerCase().includes(q));
  }
  if (f.courseType) filtered = filtered.filter((r) => r.courseType === f.courseType);
  if (f.sourceStatus) filtered = filtered.filter((r) => r.sourceStatus === f.sourceStatus);

  const courseTypes = uniqueValues(courses, 'courseType');
  const sourceStatuses = uniqueValues(courses, 'sourceStatus');

  const totalBudget = courses.reduce((s, r) => s + (r.budgetTotal || 0), 0);
  // นับคนไม่ซ้ำจากรายชื่อจริง (ชื่อกลุ่มเป้าหมาย) ไม่ใช่บวกยอด participants
  // ของแต่ละหลักสูตรตรงๆ — คนเดียวกันไปหลายหลักสูตรต้องนับเป็น 1 คน ใช้ตัวแยก
  // ข้อความชุดเดียวกับแท็บ "บุคลากรในแผนพัฒนา" (splitPeopleText/parsePersonSegment)
  const uniqueParticipantIds = new Set();
  courses.forEach((r) => {
    splitPeopleText(r.targetGroupNamesRaw).forEach((seg) => {
      const person = parsePersonSegment(seg);
      if (person) uniqueParticipantIds.add(person.employeeId);
    });
  });
  const totalParticipants = uniqueParticipantIds.size;
  const centralCount = courses.filter((r) => r.courseType === 'หลักสูตรกลาง อศค. ดำเนินการ').length;

  // การ์ดสีตามสถานะหลักสูตร (สถานะของระบบ อศค. เอง) — ไม่รวม "ร่าง" เลย (กรองออกแล้วด้านบน)
  // ใช้จานสี --kpi-fill-* ชุดเดียวกับการ์ดสถานะในหน้าภาพรวม เพื่อให้อ่านง่ายในสไตล์เดียวกัน
  const statusColorMap = { 'รออนุมัติ': 'var(--kpi-fill-revise)', 'อนุมัติ': 'var(--kpi-fill-approved)', 'ไม่อนุมัติ': 'var(--kpi-fill-rejected)' };
  const statusOrderPref = ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ'];
  const statusCounts = {};
  courses.forEach((r) => { const s = (r.sourceStatus || '').trim() || 'ไม่ระบุ'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const orderedStatuses = statusOrderPref.filter((s) => statusCounts[s]).concat(Object.keys(statusCounts).filter((s) => !statusOrderPref.includes(s)));
  const statusKpis = [
    { label: 'หลักสูตรทั้งหมด', value: courses.length, color: '#239A91' },
    ...orderedStatuses.map((s) => ({ label: s, value: statusCounts[s], color: statusColorMap[s] || 'var(--kpi-fill-pending)' })),
  ];

  const info = STATE.finalDataLastImportInfo;
  const importLine = info
    ? `อัปเดตล่าสุด: <b>${fmtThaiDateTime(info.imported_at)}</b>${info.file_name ? ` <span style="color:var(--text-muted);">(${escapeHtml(info.file_name)})</span>` : ''}`
    : 'ยังไม่มีการนำเข้า Approved Data';

  root.innerHTML = `
    <div class="subheading-label" style="font-size:15px;margin-bottom:6px;text-transform:none;">Approved Data — หลักสูตรที่บันทึกในระบบกลาง อศค.</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
      <div style="font-size:12.5px;color:var(--text-secondary);">${importLine}</div>
      <div>
        <button class="btn admin-only" id="import-finaldata-btn">⬆ นำเข้า Approved Data (Excel)</button>
        <input type="file" id="import-finaldata-file-input" accept=".xlsx,.xls" hidden />
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin:0 0 14px;white-space:pre-line;" id="import-finaldata-status"></div>

    ${courses.length ? `
    <div class="budget-frame-hero approved-data-hero">
      <div class="bfh-label">ข้อมูล Approved Data — หลักสูตรที่ผ่านการพิจารณาแล้ว บันทึกในระบบกลาง อศค.</div>
      <div class="bfh-row">
        <div class="bfh-stat">
          <div class="bfh-stat-label">งบประมาณรวมทั้งหมด</div>
          <div class="bfh-stat-value">${fmtBaht(totalBudget)}</div>
        </div>
        <div class="bfh-stat">
          <div class="bfh-stat-label">จำนวนหลักสูตร</div>
          <div class="bfh-stat-value">${fmtNum(courses.length)}</div>
        </div>
        <div class="bfh-stat">
          <div class="bfh-stat-label">ผู้เข้าอบรมรวม (ไม่ซ้ำคน)</div>
          <div class="bfh-stat-value">${fmtNum(totalParticipants)} <span style="font-size:14px;font-weight:500;color:var(--text-muted);">คน</span></div>
        </div>
      </div>
      <div class="bfh-footnote">หลักสูตรกลาง อศค. ดำเนินการ: <span class="bfh-value-badge" style="background:var(--kpi-fill-central);">${fmtNum(centralCount)}</span> จาก ${fmtNum(courses.length)} หลักสูตร</div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px;">
      ${statusKpis.map((k) => `
        <div class="kpi-card${k.darkText ? ' kpi-dark-text' : ''}" style="--kpi-color:${k.color}">
          <div class="kpi-label">${escapeHtml(k.label)}</div>
          <div class="kpi-value">${fmtNum(k.value)}</div>
          <div class="kpi-pct">${courses.length ? ((k.value / courses.length) * 100).toFixed(1) : '0.0'}% ของทั้งหมด</div>
        </div>`).join('')}
    </div>
    <div class="filter-bar" style="margin-bottom:14px;">
      <div class="filter-field filter-search">
        <label>ค้นหา</label>
        <input type="search" id="fd-search" placeholder="ชื่อหลักสูตร / รหัส" value="${escapeAttr(f.search)}" />
      </div>
      <div class="filter-field">
        <label>ประเภทหลักสูตร</label>
        <select id="fd-coursetype"><option value="">ทั้งหมด</option>${courseTypes.map((v) => `<option value="${escapeAttr(v)}"${f.courseType === v ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
      </div>
      <div class="filter-field">
        <label>สถานะหลักสูตร</label>
        <select id="fd-status"><option value="">ทั้งหมด</option>${sourceStatuses.map((v) => `<option value="${escapeAttr(v)}"${f.sourceStatus === v ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(filtered.length)} หลักสูตร จากทั้งหมด ${fmtNum(courses.length)} หลักสูตร — คลิกแถวเพื่อดูรายละเอียด</div>
    <div class="table-wrap">
      <table class="data-table approved-data-table">
        <thead><tr>
          <th>รหัส</th><th>ชื่อหลักสูตร</th><th>ประเภทหลักสูตร</th><th>ประเภทการส่งอบรม</th>
          <th class="num">ผู้เข้าอบรม</th><th class="num">งบประมาณรวม</th><th>สถานะหลักสูตร</th>
        </tr></thead>
        <tbody>
          ${filtered.length ? filtered.map((r) => `
            <tr class="clickable" data-id="${escapeAttr(r.id)}">
              <td class="cell-muted">${escapeHtml(r.id)}</td>
              <td class="cell-name">${escapeHtml(r.nameTh || '-')}</td>
              <td>${escapeHtml(r.courseType || '-')}</td>
              <td>${escapeHtml(r.deliveryType || '-')}</td>
              <td class="num">${fmtNum(r.participants)}</td>
              <td class="num">${r.budgetTotal ? fmtBaht(r.budgetTotal) : '<span class="cell-muted">-</span>'}</td>
              <td>${finalStatusBadge(r.sourceStatus)}</td>
            </tr>
          `).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="big">🔍</div>ไม่พบหลักสูตรที่ตรงกับตัวกรอง</div></td></tr>`}
        </tbody>
      </table>
    </div>
    ` : `<div class="empty-state"><div class="big">📄</div>ยังไม่มี Approved Data — กด "นำเข้า Approved Data" เพื่ออัปโหลดไฟล์</div>`}
  `;

  root.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => openFinalCourseDrawer(tr.dataset.id));
  });
  if (courses.length) {
    bindSearchInput('fd-search', (v) => { STATE.finalDataFilters.search = v; renderFinalDataTab(); });
    document.getElementById('fd-coursetype').addEventListener('change', (e) => { STATE.finalDataFilters.courseType = e.target.value; renderFinalDataTab(); });
    document.getElementById('fd-status').addEventListener('change', (e) => { STATE.finalDataFilters.sourceStatus = e.target.value; renderFinalDataTab(); });
  }
  const importBtn = root.querySelector('#import-finaldata-btn');
  const importInput = root.querySelector('#import-finaldata-file-input');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      importInput.value = '';
      if (file) handleFinalDataFileImport(file);
    });
  }
}

/** ใช้กล่อง drawer เดียวกับ openDrawer() (plan) แต่เติมเนื้อหาเอง ไม่ผ่าน renderDrawer() เพราะข้อมูลคนละชุด/คนละรูปแบบกันโดยสิ้นเชิง */
function openFinalCourseDrawer(courseId) {
  const r = STATE.finalCourses.find((x) => x.id === courseId);
  if (!r) return;
  document.getElementById('drawer-title').textContent = r.nameTh || r.id;
  document.getElementById('drawer-title-pill').textContent = r.courseType || 'ไม่ระบุ';
  const body = document.getElementById('drawer-body');

  const orgPath = [r.deputyLine, r.assistantGovernor, r.deptName, r.workingGroup].filter(Boolean).join(' › ');
  const targetUnit = [r.targetDivision, r.targetSection].filter(Boolean).join(' / ');
  const field = (label, value) => `<div><div class="subheading-label">${label}</div><div style="margin-top:2px;">${value}</div></div>`;

  body.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:18px;">
      ${field('รหัส', escapeHtml(r.id))}
      ${field('สายบังคับบัญชา', escapeHtml(orgPath || '-'))}
      ${field('ประเภทการส่งอบรม', escapeHtml(r.deliveryType || '-'))}
      ${field('งบประมาณรวม', fmtBaht(r.budgetTotal))}
      ${field('สถานะหลักสูตร', finalStatusBadge(r.sourceStatus))}
      ${targetUnit ? field('หน่วยงานกลุ่มเป้าหมาย', escapeHtml(targetUnit)) : ''}
    </div>
    ${r.rationale ? `<div style="margin-bottom:18px;">${field('หลักการและเหตุผล', formatDetailValue(r.rationale, 'numbered'))}</div>` : ''}
    <div>${field('กลุ่มเป้าหมาย (ควบรวมแล้ว)', formatDetailValue(r.targetGroupNamesRaw, 'people'))}</div>
  `;
  document.getElementById('modal-backdrop').classList.add('show');
}

function handleFinalDataFileImport(file) {
  if (!isAdmin()) return; // server-side RLS/RPC is the real gate — this is defense in depth only
  const statusEl = document.getElementById('import-finaldata-status');
  if (statusEl) statusEl.textContent = 'กำลังอ่านไฟล์...';
  importFinalDataFile(file, async (err, result) => {
    if (err) {
      const el = document.getElementById('import-finaldata-status');
      if (el) el.textContent = '⚠ ' + err.message;
      return;
    }

    const confirmMsg = `การนำเข้าไฟล์นี้จะปรับปรุง Approved Data ที่มีอยู่ (พบ ${result.courses.length} หลักสูตรในไฟล์), เพิ่มหลักสูตรใหม่ที่ยังไม่มี, และนำหลักสูตรที่ไม่มีในไฟล์นี้ออกจากรายการปัจจุบัน ยืนยันดำเนินการ?`;
    if (!confirm(confirmMsg)) {
      const el = document.getElementById('import-finaldata-status');
      if (el) el.textContent = '';
      return;
    }

    const busyEl = document.getElementById('import-finaldata-status');
    if (busyEl) busyEl.textContent = 'กำลังนำเข้าข้อมูล...';
    try {
      const counts = await importFinalDataRemote(result, file.name);
      await fetchFinalData();
      try { STATE.finalDataLastImportInfo = await fetchLastFinalImportInfo(); }
      catch (e) { STATE.finalDataLastImportInfo = null; }
      renderFinalDataTab();
      const doneEl = document.getElementById('import-finaldata-status');
      if (doneEl) doneEl.textContent = `นำเข้าสำเร็จ — เพิ่มใหม่ ${counts.new_count}, ปรับปรุง ${counts.matched_count}, กลับมาใช้งาน ${counts.reactivated_count}, นำออกจากรายการปัจจุบัน ${counts.deactivated_count}`;
    } catch (e) {
      const errEl = document.getElementById('import-finaldata-status');
      if (errEl) errEl.textContent = '⚠ นำเข้าไม่สำเร็จ: ' + (e.validation ? e.validation.message : (e.message || 'เกิดข้อผิดพลาด'));
    }
  });
}

/* ==================================================================== */
/* DETAIL DRAWER + REVIEW ACTIONS                                       */
/* ==================================================================== */
function formatDetailValue(value, mode = 'plain') {
  if (!value || !String(value).trim()) return '<span class="cell-muted">ไม่ระบุ</span>';

  let text = String(value).trim();

  // ข้อความแบบลำดับข้อ: แยก 1. 2. 3. ... ให้ขึ้นบรรทัดใหม่อัตโนมัติ
  if (mode === 'numbered') {
    text = text.replace(/\s+(?=\d{1,2}\.\s)/g, '\n');
  }

  // กลุ่มเป้าหมาย: เลขประจำตัว 6 หลักถือเป็นจุดเริ่มต้นของบุคคลใหม่
  if (mode === 'people') {
    text = text.replace(/\s+(?=\d{6}(?:\s|$))/g, '\n');
  }

  // Escape HTML ก่อน แล้วค่อยแปลง line break เป็น <br> เพื่อป้องกัน XSS
  const safe = escapeHtml(text);
  return mode === 'plain' ? safe : safe.replace(/\r?\n/g, '<br>');
}

function fieldRow(label, value, mode = 'plain') {
  return `<div class="detail-item"><dt>${label}</dt><dd>${formatDetailValue(value, mode)}</dd></div>`;
}

// หลักสูตรเสนอเพิ่มเติมตาม Training Needs ต้องกรอกงบประมาณเสมอ — ถ้าไม่กรอก
// ให้เน้นด้วยสีแดงแทน "ไม่ระบุ" สีเทาปกติ เพื่อให้เห็นชัดว่าเป็นข้อมูลที่ขาดไป
function budgetFieldRow(label, amount, warnIfMissing) {
  if (amount) return fieldRow(label, fmtBaht(amount));
  if (warnIfMissing) return `<div class="detail-item"><dt>${label}</dt><dd><span class="cell-danger">ไม่ระบุงบประมาณ</span></dd></div>`;
  return fieldRow(label, '');
}

const TH_SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/**
 * Best-effort parse of the "14 ต.ค. 2570" Thai-locale short-date strings
 * this app displays (see importer.js's toDateLabel) into a comparable
 * value — returns null on anything that doesn't match cleanly, so callers
 * only ever compare when BOTH sides parsed successfully (no false
 * positives from an unexpected format).
 */
function parseThaiShortDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthIdx = TH_SHORT_MONTHS.indexOf(m[2]);
  const year = Number(m[3]);
  if (monthIdx < 0 || !day || !year) return null;
  return year * 372 + monthIdx * 31 + day; // relative ordering only, not a real timestamp
}

/**
 * "รายละเอียดหลักสูตร" summary section at the top of the plan drawer —
 * same fields as the old plain detail-grid (nothing new, nothing removed),
 * just organized into a KPI-style summary row + two info cards + a
 * schedule card instead of one long stacked list.
 */
function renderPlanSummarySection(r, isCentral, hasConsiderationSection) {
  const infoRow = (icon, label, value, mode, highlight) => `
    <div class="psum-row"><span class="psum-row-icon">${icon}</span>
      <div><div class="psum-row-label">${label}</div><div class="psum-row-value${highlight ? ' cell-danger' : ''}">${formatDetailValue(value, mode || 'plain')}</div></div>
    </div>`;

  const startParsed = parseThaiShortDate(r.startDate);
  const endParsed = parseThaiShortDate(r.endDate);
  const dateWarning = (startParsed != null && endParsed != null && endParsed < startParsed)
    ? '<div class="psum-warning">⚠️ วันที่สิ้นสุดไม่สอดคล้องกับวันที่เริ่มต้น กรุณาตรวจสอบข้อมูล</div>' : '';

  return `
    <div class="psum-cards">
      <div class="psum-card psum-card-highlight">
        <div class="psum-card-icon">💰</div>
        <div class="psum-card-label">งบประมาณรวมทั้งสิ้น</div>
        <div class="psum-card-value">${r.effectiveBudget ? fmtBaht(r.effectiveBudget) : '<span class="cell-muted">ไม่ระบุ</span>'}</div>
        <div class="psum-card-sub">${r.approvedBudget != null ? `เสนอมา ${fmtBaht(r.budgetTotal || 0)}` : 'งบประมาณที่ใช้ในการอบรม'}</div>
      </div>
      <div class="psum-card">
        <div class="psum-card-icon">👥</div>
        <div class="psum-card-label">จำนวนผู้เข้าอบรม</div>
        <div class="psum-card-value">${fmtNum(r.participants)} <span class="psum-card-unit">คน</span></div>
        <div class="psum-card-sub">กลุ่มเป้าหมาย</div>
      </div>
      <div class="psum-card">
        <div class="psum-card-icon">📅</div>
        <div class="psum-card-label">ระยะเวลาอบรม</div>
        <div class="psum-card-value">${fmtNum(r.days)} <span class="psum-card-unit">วัน</span></div>
        <div class="psum-card-sub">ระยะเวลาในการอบรม</div>
      </div>
      ${!isCentral ? `
      <div class="psum-card">
        <div class="psum-card-icon">✈️</div>
        <div class="psum-card-label">ประเภทการอบรม</div>
        <div class="psum-card-value" style="font-size:15px;">${r.deliveryType ? escapeHtml(r.deliveryType) : '<span class="cell-muted">ไม่ระบุ</span>'}</div>
        <div class="psum-card-sub">ประเภทการส่งอบรม</div>
      </div>` : ''}
    </div>
    <div class="psum-info-grid">
      <div class="psum-info-card">
        <div class="psum-info-title"><span class="psum-info-icon">📖</span>ข้อมูลหลักสูตร</div>
        ${infoRow('🔑', 'ปัจจัยนำเข้าหลัก', r.inputFactor)}
        ${infoRow('📄', 'ประเภทหลักสูตร', r.courseType, 'plain', isCentral)}
        ${infoRow('🏫', 'รูปแบบการเรียนรู้', r.learningFormat)}
        ${!isCentral ? infoRow('✈️', 'ประเภทการส่งอบรม', r.deliveryType) : ''}
        ${infoRow('👤', 'ค่าจ้างเหมา/วิทยากรภายนอก', r.budgetOutsource ? fmtBaht(r.budgetOutsource) : '')}
      </div>
      <div class="psum-info-card">
        <div class="psum-info-title"><span class="psum-info-icon">🏢</span>หน่วยงานและผู้เสนอ</div>
        ${infoRow('🏢', 'หน่วยงานที่เสนอ (ฝ่าย)', r.deptName)}
        ${infoRow('🏢', 'หน่วยงานที่เสนอ (กอง)', r.divisionName)}
        ${infoRow('🏢', 'หน่วยงานที่เสนอ (แผนก)', r.sectionName)}
        ${infoRow('👤', 'ผู้เสนอ/ผู้ประสานงาน', r.creatorName)}
        ${infoRow('🪪', 'ตำแหน่งผู้เสนอ', r.creatorPosition)}
        ${infoRow('🏷️', 'สถานะต้นทาง', r.sourceStatus)}
      </div>
    </div>
    <div class="psum-schedule-card">
      <div class="psum-info-title"><span class="psum-info-icon">📅</span>กำหนดการและการจัดอบรม</div>
      <div class="psum-schedule-grid">
        <div class="psum-schedule-item"><span class="psum-row-icon">📅</span><div><div class="psum-row-label">วันเริ่มต้น</div><div class="psum-row-value">${formatDetailValue(r.startDate)}</div></div></div>
        <div class="psum-schedule-item"><span class="psum-row-icon">📅</span><div><div class="psum-row-label">วันสิ้นสุด</div><div class="psum-row-value">${formatDetailValue(r.endDate)}</div></div></div>
        <div class="psum-schedule-item"><span class="psum-row-icon">👤</span><div><div class="psum-row-label">วิทยากร/สถาบันผู้จัดอบรม</div><div class="psum-row-value">${formatDetailValue(r.externalInstructor)}</div></div></div>
      </div>
      ${dateWarning}
      <div class="psum-schedule-item" style="margin-top:12px;"><span class="psum-row-icon">👥</span><div><div class="psum-row-label">กลุ่มเป้าหมาย</div><div class="psum-row-value">${formatDetailValue(r.targetGroupNames, 'people')}</div></div></div>
    </div>
    ${r.remark && String(r.remark).trim() ? `
    <div class="consider-remark" style="margin-bottom:14px;">
      <span class="consider-remark-icon">ℹ️</span>
      <div><div class="consider-subtitle">หมายเหตุ</div><div>${formatDetailValue(r.remark, 'numbered')}</div></div>
    </div>` : ''}
    ${hasConsiderationSection ? '<a href="#plan-consideration-section" class="psum-jump-link">ดูข้อมูลสำหรับพิจารณา →</a>' : ''}
  `;
}

/**
 * Splits a "1. ... 2. ... 3. ..." (or plain multi-line) text blob into
 * individual item strings, stripping the leading number — same splitting
 * convention formatDetailValue's 'numbered' mode already uses for display,
 * just returned as an array instead of joined with <br> so each item can
 * become its own <li>. A field with no numbering just becomes one item.
 */
function splitNumberedItems(text) {
  if (!text || !String(text).trim()) return [];
  const normalized = String(text).trim().replace(/\s+(?=\d{1,2}\.\s)/g, '\n');
  return normalized.split(/\n+/).map((s) => s.replace(/^\d{1,2}\.\s*/, '').trim()).filter(Boolean);
}

/**
 * Card-based "ข้อมูลสำหรับพิจารณา" layout — same underlying fields as
 * before (rationale/objective/skillsGained/outcome/kpi/remark), just
 * presented as icon-labeled boxes with numbered/bulleted items instead of
 * plain stacked text blocks.
 */
function renderConsiderationCard(r) {
  const box = (title, icon, colorClass, items, ordered) => {
    const tag = ordered ? 'ol' : 'ul';
    // colorClass on the list too (not just the title) — the numbered/bullet
    // markers use currentColor, which only inherits down the DOM, not across
    // the title/list sibling boundary.
    const listClass = `consider-list ${colorClass}${ordered ? ' consider-list-numbered' : ''}`;
    return `
      <div class="consider-box">
        <div class="consider-box-title ${colorClass}"><span class="consider-box-icon">${icon}</span>${title}</div>
        ${items.length
          ? `<${tag} class="${listClass}">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</${tag}>`
          : '<div class="cell-muted" style="font-size:12.5px;">ไม่ระบุ</div>'}
      </div>`;
  };

  return `
    <div class="consider-card">
      <div class="consider-header"><span class="consider-header-icon">📋</span><span class="consider-header-title">ข้อมูลสำหรับพิจารณา</span></div>
      <div class="consider-rationale">
        <div class="consider-subtitle">ความจำเป็น/หลักการและเหตุผล</div>
        <div class="consider-rationale-text">${formatDetailValue(r.rationale, 'numbered')}</div>
      </div>
      <div class="consider-grid">
        ${box('วัตถุประสงค์', '🎯', 'consider-purple', splitNumberedItems(r.objective), true)}
        ${box('ทักษะ/ความรู้ที่จะได้รับ', '🎓', 'consider-indigo', splitNumberedItems(r.skillsGained), false)}
        ${box('ผลลัพธ์ที่คาดหวัง', '📈', 'consider-pink', splitNumberedItems(r.outcome), true)}
        ${box('ตัวชี้วัด (KPI)', '📊', 'consider-amber', splitNumberedItems(r.kpi), false)}
      </div>
      ${r.remark && String(r.remark).trim() ? `
      <div class="consider-remark">
        <span class="consider-remark-icon">ℹ️</span>
        <div><div class="consider-subtitle">หมายเหตุ</div><div>${formatDetailValue(r.remark, 'numbered')}</div></div>
      </div>` : ''}
    </div>
  `;
}

function openDrawer(id) {
  STATE.selectedId = id;
  STATE.noteDraft = null;
  STATE.approvedBudgetDraft = null;
  renderDrawer();
  document.getElementById('modal-backdrop').classList.add('show');
}
function closeDrawer() {
  document.getElementById('modal-backdrop').classList.remove('show');
  STATE.selectedId = null;
  STATE.noteDraft = null;
  STATE.approvedBudgetDraft = null;
}

/**
 * A second, independent modal (separate DOM ids, same .modal-backdrop/
 * .drawer CSS as the plan-detail one) for "here's the underlying list of
 * plans behind that chart click" — kept fully separate from openDrawer()/
 * closeDrawer() so this never risks the single-plan decision flow. Rows
 * inside it re-open the real plan drawer via the existing openDrawer(id).
 */
function openChartDetailModal(title, records) {
  document.getElementById('chart-detail-title').textContent = title;
  const body = document.getElementById('chart-detail-body');
  body.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(records.length)} รายการ</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ชื่อหลักสูตร / แผน</th><th>หน่วยงานที่เสนอ</th><th>ประเภทหลักสูตร</th><th>สถานะ</th></tr></thead>
        <tbody>
          ${records.length ? records.map((r) => `
            <tr class="clickable chart-detail-row${r.reviewStatus !== 'pending' ? ` row-status-${r.reviewStatus}` : ''}" data-id="${r.id}">
              <td class="cell-name">${escapeHtml(r.nameTh)}</td>
              <td>${escapeHtml(r.sectionName || r.divisionName || r.deptName || '-')}</td>
              <td>${escapeHtml(r.courseType || '-')}</td>
              <td>${statusBadge(r.reviewStatus)}</td>
            </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><div class="big">🔍</div>ไม่พบข้อมูล</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  body.querySelectorAll('.chart-detail-row').forEach((tr) => {
    tr.addEventListener('click', () => {
      closeChartDetailModal();
      openDrawer(tr.dataset.id);
    });
  });
  document.getElementById('chart-detail-backdrop').classList.add('show');
}
function closeChartDetailModal() {
  document.getElementById('chart-detail-backdrop').classList.remove('show');
}

const DECISION_META = {
  pending: { label: REVIEW_STATUS.pending.label, btnClass: 'btn-pending', icon: '↩' },
  approved: { label: REVIEW_STATUS.approved.label, btnClass: 'btn-good', icon: '✓' },
  revise: { label: REVIEW_STATUS.revise.label, btnClass: 'btn-warning', icon: '↺' },
  rejected: { label: REVIEW_STATUS.rejected.label, btnClass: 'btn-critical', icon: '✕' },
  central: { label: REVIEW_STATUS.central.label, btnClass: 'btn-central', icon: '↪' },
};

function renderDrawer() {
  const r = STATE.records.find((x) => x.id === STATE.selectedId);
  const body = document.getElementById('drawer-body');
  const titleEl = document.getElementById('drawer-title');
  if (!r) { body.innerHTML = ''; return; }
  titleEl.textContent = r.nameTh;
  document.getElementById('drawer-title-pill').textContent = r.courseType || 'ไม่ระบุ';

  const actorLine = [
    r.reviewedByName || r.reviewedBy || '-',
    r.reviewedByEmployeeId ? `(${r.reviewedByEmployeeId})` : '',
    r.reviewedByRole || '',
  ].filter(Boolean).join(' · ');
  const history = r.reviewStatus !== 'pending' ? `
    <div class="review-history">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">${statusBadge(r.reviewStatus)}<span style="color:var(--text-muted);font-size:12px;">โดย ${escapeHtml(actorLine)} · ${escapeHtml(fmtThaiDateTime(r.reviewedAtRaw))}</span></div>
      ${r.reviewNote ? `<div><b class="subheading-label" style="font-size:11px;">หมายเหตุที่บันทึกไว้</b><div style="margin-top:2px;">${escapeHtml(r.reviewNote)}</div></div>` : '<div style="color:var(--text-muted);font-size:12.5px;">ไม่มีหมายเหตุ</div>'}
    </div>` : '';

  const isCentral = isCentralCourse(r);

  // หลักสูตรกลาง อศค. ดำเนินการ ไม่มีประเภทการอบรม/วัตถุประสงค์/ผลลัพธ์ ฯลฯ กรอกไว้ตั้งแต่ต้น
  // ตามคำขอผู้ใช้จึงซ่อนหัวข้อนี้ไปทั้งหมด (ไม่ต้องมีแม้แต่ข้อความอธิบาย) แทนที่จะโชว์ "ไม่ระบุ" ทุกช่อง
  const considerationSection = isCentral ? '' : renderConsiderationCard(r);

  body.innerHTML = `
    ${history}
    ${renderPlanSummarySection(r, isCentral, !isCentral)}
    <div id="plan-consideration-section">${considerationSection}</div>
    <div class="section-heading">การพิจารณา</div>
    <div id="decision-area"></div>
    <div class="section-heading">ประวัติการพิจารณา</div>
    <div id="plan-history-section"><div class="plan-history-empty">กำลังโหลด...</div></div>
  `;
  renderDecisionArea();
  renderPlanHistorySection(r.id);
}

/** old → new status label from an audit_logs row (submit_decision entries only). */
function planHistoryActionLabel(e) {
  const oldStatus = (e.old_value && e.old_value.decision) || 'pending';
  const newStatus = (e.new_value && e.new_value.decision) || 'pending';
  const oldLabel = (REVIEW_STATUS[oldStatus] || REVIEW_STATUS.pending).label;
  const newLabel = (REVIEW_STATUS[newStatus] || REVIEW_STATUS.pending).label;
  return `${oldLabel} → ${newLabel}`;
}

/**
 * Async by nature (network fetch) — the drawer may already have closed or
 * moved to a different plan by the time this resolves, so re-check
 * STATE.selectedId before touching the DOM (race guard).
 */
async function renderPlanHistorySection(planId) {
  let rows;
  try {
    rows = await fetchPlanHistory(planId);
  } catch (e) {
    if (STATE.selectedId !== planId) return;
    const el = document.getElementById('plan-history-section');
    if (el) el.innerHTML = '<div class="plan-history-empty">ไม่สามารถโหลดประวัติการพิจารณาได้</div>';
    return;
  }
  if (STATE.selectedId !== planId) return;
  const el = document.getElementById('plan-history-section');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="plan-history-empty">ยังไม่มีประวัติการพิจารณา</div>';
    return;
  }
  el.innerHTML = `<div class="plan-history-list">${rows.map((e) => {
    const actor = [e.actor_full_name || '-', e.employee_id ? `(${e.employee_id})` : '', e.role || ''].filter(Boolean).join(' · ');
    return `
    <div class="plan-history-item">
      <div class="plan-history-time">${escapeHtml(fmtThaiDateTime(e.created_at))}</div>
      <div class="plan-history-action">${escapeHtml(planHistoryActionLabel(e))}</div>
      <div class="plan-history-actor">โดย ${escapeHtml(actor)}</div>
      ${e.note ? `<div class="plan-history-note">${escapeHtml(e.note)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function renderDecisionArea() {
  const area = document.getElementById('decision-area');
  const r = STATE.records.find((x) => x.id === STATE.selectedId);
  if (!area || !r) return;
  // Reviewers are view-only — decision buttons are server-side Admin-only
  // (submit_decision RPC), this is just the matching UI treatment.
  if (!isAdmin()) {
    area.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;">การบันทึกผลพิจารณาทำได้โดยผู้ดูแลระบบ (Admin) เท่านั้น</div>`;
    return;
  }
  const draft = STATE.noteDraft != null ? STATE.noteDraft : (r.reviewNote || '');
  const budgetDraft = STATE.approvedBudgetDraft != null ? STATE.approvedBudgetDraft : (r.approvedBudget != null ? String(r.approvedBudget) : '');
  area.innerHTML = `
    <label for="decision-note" class="subheading-label" style="display:block;font-size:11px;margin-bottom:6px;">หมายเหตุของผู้พิจารณา</label>
    <textarea class="note-field" id="decision-note" placeholder="ระบุประเด็นที่ต้องการให้หน่วยงานแก้ไข เหตุผลการพิจารณา หรือข้อเสนอแนะเพิ่มเติม (จำเป็นเมื่อเลือก &quot;ให้ทบทวน&quot; หรือ &quot;ไม่เห็นชอบ&quot;)">${escapeHtml(draft)}</textarea>
    <label for="decision-approved-budget" class="subheading-label" style="display:block;font-size:11px;margin:10px 0 6px;">วงเงินที่ อฟก. อนุมัติ (บาท) — เว้นว่างเพื่อใช้วงเงินที่เสนอมา (${fmtBaht(r.budgetTotal || 0)})</label>
    <input type="text" inputmode="numeric" class="note-field" id="decision-approved-budget" placeholder="${r.budgetTotal || 0}" value="${escapeAttr(budgetDraft)}" />
    <div id="decision-error" style="color:var(--status-critical);font-size:12px;margin-top:4px;display:none;">กรุณาระบุหมายเหตุก่อนบันทึกผล "เห็นชอบแต่ให้ทบทวน" หรือ "ไม่เห็นชอบ"</div>
    <div class="action-row">
      ${Object.entries(DECISION_META).map(([status, meta]) => `<button class="btn ${meta.btnClass}" data-decision="${status}">${meta.icon} ${meta.label}</button>`).join('')}
    </div>
  `;
  const noteField = document.getElementById('decision-note');
  noteField.addEventListener('input', () => {
    STATE.noteDraft = noteField.value;
    document.getElementById('decision-error').style.display = 'none';
  });
  const budgetField = document.getElementById('decision-approved-budget');
  budgetField.addEventListener('input', () => {
    STATE.approvedBudgetDraft = budgetField.value;
  });
  area.querySelectorAll('[data-decision]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.decision;
      const errorEl = document.getElementById('decision-error');
      const allButtons = Array.from(area.querySelectorAll('[data-decision]'));

      if (status !== 'pending') {
        const note = noteField.value.trim();
        const requireNote = status === 'revise' || status === 'rejected';
        if (requireNote && !note) {
          errorEl.textContent = 'กรุณาระบุหมายเหตุก่อนบันทึกผล "เห็นชอบแต่ให้ทบทวน" หรือ "ไม่เห็นชอบ"';
          errorEl.style.display = 'block';
          noteField.focus();
          return;
        }
      }

      allButtons.forEach((b) => { b.disabled = true; });
      errorEl.style.display = 'none';
      try {
        if (status === 'pending') {
          await revertToPending(r.id);
        } else {
          const approvedBudget = budgetField.value.trim().replace(/[^\d]/g, '');
          await commitDecision(r.id, status, noteField.value.trim(), approvedBudget);
        }
        STATE.noteDraft = null;
        STATE.approvedBudgetDraft = null;
        renderDrawer();
        renderAll();
      } catch (err) {
        errorEl.textContent = (err && err.message) ? err.message : 'บันทึกผลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        errorEl.style.display = 'block';
        allButtons.forEach((b) => { b.disabled = false; });
      }
    });
  });
}

/* ==================================================================== */
/* FILTER BAR + TABS                                                    */
/* ==================================================================== */
// Full re-renders (renderAll/renderLoginHistoryTab/renderActivityLogTab
// all rebuild their container via innerHTML) destroy and recreate the
// search <input>, which drops focus and reflows everything below it —
// jarring if it fired on every keystroke. Debounced so the actual
// filter/render only runs once typing pauses; focus + cursor position are
// restored right after that render (synchronous, since innerHTML updates
// are synchronous), so a burst of typing never causes any layout jump.
function bindSearchInput(id, onInput) {
  let timer = null;
  document.getElementById(id).addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    const value = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      onInput(value);
      const el = document.getElementById(id);
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }, 300);
  });
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');

  // Cascading/faceted options: each dropdown's choices reflect what the
  // OTHER currently active filters allow, not the full unfiltered dataset —
  // so a value with zero matching records under the current selection never
  // shows up as pickable. If the currently-selected value in a dropdown is
  // no longer among its (now narrower) options, clear that filter so the UI
  // and STATE never disagree about what's actually selected.
  const orgOptions = uniqueValues(getFilteredExcept('orgValue'), STATE.filters.orgLevel);
  if (STATE.filters.orgValue && !orgOptions.includes(STATE.filters.orgValue)) STATE.filters.orgValue = '';
  const courseTypes = uniqueValues(getFilteredExcept('courseType'), 'courseType');
  if (STATE.filters.courseType && !courseTypes.includes(STATE.filters.courseType)) STATE.filters.courseType = '';
  const inputFactors = uniqueValues(getFilteredExcept('inputFactor'), 'inputFactor');
  if (STATE.filters.inputFactor && !inputFactors.includes(STATE.filters.inputFactor)) STATE.filters.inputFactor = '';
  const deliveryTypes = uniqueDeliveryTypes(getFilteredExcept('deliveryType'));
  if (STATE.filters.deliveryType && !deliveryTypes.includes(STATE.filters.deliveryType)) STATE.filters.deliveryType = '';
  // Unlike org/courseType/inputFactor/deliveryType (dynamic values that can
  // genuinely disappear from the dataset), status is a fixed 4-value
  // enumeration plus the synthetic 'decided' group — a status with 0
  // current matches is still a valid, meaningful selection (e.g. "show me
  // the 0 approved plans"), so it must never be auto-cleared here. Doing so
  // previously made the review tab's เห็นชอบ/ทบทวน/ไม่เห็นชอบ chips silently
  // snap back to "ทั้งหมด" whenever none of that status currently existed.
  // Autocomplete suggestions for the search box — course names under the
  // other active filters, so it stays consistent with the cascading dropdowns above.
  const courseNameOptions = uniqueValues(getFilteredExcept('search'), 'nameTh');

  bar.innerHTML = `
    <div class="filter-field">
      <label>มุมมองหน่วยงาน</label>
      <select id="f-orglevel">${ORG_LEVELS.map((o) => `<option value="${o.key}" ${o.key === STATE.filters.orgLevel ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>หน่วยงาน</label>
      <select id="f-orgvalue"><option value="">ทั้งหมด</option>${orgOptions.map((o) => `<option value="${escapeAttr(o)}" ${o === STATE.filters.orgValue ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>ประเภทหลักสูตร</label>
      <select id="f-coursetype"><option value="">ทั้งหมด</option>${courseTypes.map((o) => `<option value="${escapeAttr(o)}" ${o === STATE.filters.courseType ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>ปัจจัยนำเข้าหลัก</label>
      <select id="f-inputfactor"><option value="">ทั้งหมด</option>${inputFactors.map((o) => `<option value="${escapeAttr(o)}" ${o === STATE.filters.inputFactor ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>ประเภทการอบรม</label>
      <select id="f-deliverytype"><option value="">ทั้งหมด</option>${deliveryTypes.map((o) => `<option value="${escapeAttr(o)}" ${o === STATE.filters.deliveryType ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>สถานะ</label>
      <select id="f-status"><option value="">ทั้งหมด</option>${Object.entries(REVIEW_STATUS).map(([k, v]) => `<option value="${k}" ${k === STATE.filters.status ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    </div>
    <div class="filter-field filter-search">
      <label>ค้นหา</label>
      <input type="search" id="f-search" list="course-suggestions" placeholder="ชื่อแผน, ผู้เสนอ, กลุ่มเป้าหมาย..." value="${escapeAttr(STATE.filters.search)}" />
      <datalist id="course-suggestions">${courseNameOptions.map((n) => `<option value="${escapeAttr(n)}"></option>`).join('')}</datalist>
    </div>
    <div class="filter-field">
      <label>ค่าใช้จ่าย/หลักสูตร (บาท)</label>
      <div class="filter-range-row">
        <input type="text" inputmode="numeric" id="f-pc-min" placeholder="ต่ำสุด" value="${escapeAttr(STATE.filters.perCourseMin)}" />
        <span class="filter-range-sep">–</span>
        <input type="text" inputmode="numeric" id="f-pc-max" placeholder="สูงสุด" value="${escapeAttr(STATE.filters.perCourseMax)}" />
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" id="f-clear" style="align-self:flex-end;">ล้างตัวกรอง</button>
  `;
  const bind = (id, key, evt) => document.getElementById(id).addEventListener(evt || 'change', (e) => {
    STATE.filters[key] = e.target.value;
    if (key === 'orgLevel') STATE.filters.orgValue = '';
    renderAll();
  });
  bind('f-orglevel', 'orgLevel');
  bind('f-orgvalue', 'orgValue');
  bind('f-coursetype', 'courseType');
  bind('f-inputfactor', 'inputFactor');
  bind('f-deliverytype', 'deliveryType');
  bind('f-status', 'status');
  bindSearchInput('f-search', (v) => { STATE.filters.search = v; renderAll(); });
  bindSearchInput('f-pc-min', (v) => { STATE.filters.perCourseMin = v.replace(/[^\d]/g, ''); renderAll(); });
  bindSearchInput('f-pc-max', (v) => { STATE.filters.perCourseMax = v.replace(/[^\d]/g, ''); renderAll(); });
  document.getElementById('f-clear').addEventListener('click', () => {
    STATE.filters = { orgLevel: STATE.filters.orgLevel, orgValue: '', courseType: '', inputFactor: '', deliveryType: '', status: '', search: '', perCourseMin: '', perCourseMax: '' };
    renderAll();
  });
}

function switchTab(tab) {
  hideTooltip(); // a chart tooltip from the outgoing tab must not float over the incoming one
  STATE.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
  // Server-side RLS is the real gate (a Reviewer gets zero rows regardless) —
  // the isAdmin() check here only avoids a pointless fetch for a tab that's
  // hidden from Reviewers by CSS anyway.
  if (tab === 'loginhistory' && isAdmin()) loadLoginHistoryTab();
  if (tab === 'activitylog' && isAdmin()) loadActivityLogTab();
  // Visible to everyone (unlike the two admin-only tabs above) — RLS scopes
  // what a Reviewer's SELECT returns the same way it does for plans.
  if (tab === 'finaldata' && !STATE.finalDataLoaded) loadFinalDataTab();
}

/* ==================================================================== */
/* IMPORT / EXPORT / RESET                                              */
/* ==================================================================== */
function formatImportValidationDetail(validation) {
  if (!validation || !validation.detail) return '';
  const rows = validation.detail;
  const lines = rows.slice(0, 20).map((d) => {
    if (d.row_indexes) return `- แถวที่ ${d.row_indexes.join(', ')}: ค่าซ้ำกัน (${d.stable_key})`;
    return `- แถวที่ ${d.row_index}${d.name_th ? ' (' + d.name_th + ')' : ''}${d.creator_id ? ' [เลขประจำตัวผู้สร้าง: ' + d.creator_id + ']' : ''}: ${d.reason}`;
  });
  return lines.join('\n') + (rows.length > 20 ? `\n... และอีก ${rows.length - 20} รายการ` : '');
}

function handleFileImport(file) {
  if (!isAdmin()) return; // server-side RLS/RPC is the real gate — this is defense in depth only
  const statusEl = document.getElementById('import-status');
  statusEl.textContent = 'กำลังอ่านไฟล์...';
  importPlanFile(file, async (err, result) => {
    if (err) { statusEl.textContent = '⚠ ' + err.message; return; }

    const confirmMsg = 'การนำเข้าไฟล์นี้จะปรับปรุงข้อมูลแผนที่มีอยู่ (คงผลการพิจารณาเดิมไว้), เพิ่มแผนใหม่ที่ยังไม่มี, และนำแผนที่ไม่มีในไฟล์นี้ออกจากรายการปัจจุบัน (ประวัติการพิจารณายังคงอยู่) ยืนยันดำเนินการ?';
    if (!confirm(confirmMsg)) { statusEl.textContent = ''; return; }

    statusEl.textContent = 'กำลังนำเข้าข้อมูล...';
    try {
      const counts = await importDatasetRemote(result.records, file.name);
      await loadAllRecords();
      try { STATE.lastImportInfo = await fetchLastImportInfo(); }
      catch (e) { STATE.lastImportInfo = null; }
      STATE.filters.orgValue = '';
      renderImportBanner();
      renderAll();
      statusEl.textContent = `นำเข้าสำเร็จ — เพิ่มใหม่ ${counts.new_count}, ปรับปรุง ${counts.matched_count}, กลับมาใช้งาน ${counts.reactivated_count}, นำออกจากรายการปัจจุบัน ${counts.deactivated_count}`;
    } catch (e) {
      if (e.validation) {
        statusEl.textContent = '⚠ นำเข้าไม่สำเร็จ: ' + e.validation.message + '\n' + formatImportValidationDetail(e.validation);
      } else {
        statusEl.textContent = '⚠ นำเข้าไม่สำเร็จ: ' + (e.message || 'เกิดข้อผิดพลาด');
      }
    }
  });
}

function exportCsv() {
  // คอลัมน์แรกๆ ให้หน้าตาตรงกับข้อมูลที่นำเข้ามา (FIELDS ตามลำดับเดิม =
  // เหมือนไฟล์ต้นฉบับที่อัปโหลด) แล้วต่อท้ายด้วยคอลัมน์ผลการพิจารณา
  const cols = [
    ['id', 'รหัส'],
    ...FIELDS.map((f) => [f.key, f.header]),
    ['approvedBudget', 'วงเงินที่ อฟก. อนุมัติ'], ['reviewStatus', 'สถานะ'], ['reviewNote', 'หมายเหตุการพิจารณา'],
    ['reviewedBy', 'ผู้พิจารณา'], ['reviewedDate', 'วันที่พิจารณา'],
  ];
  const rows = [cols.map((c) => c[1]).join(',')];
  STATE.records.forEach((r) => {
    rows.push(cols.map(([key]) => {
      let v = key === 'reviewStatus' ? REVIEW_STATUS[r[key]].label : (r[key] === undefined || r[key] === null ? '' : r[key]);
      v = String(v).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(','));
  });
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ผลการพิจารณาแผนพัฒนาบุคลากร_2570.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

function renderImportBanner() {
  const el = document.getElementById('import-banner');
  el.style.display = 'flex';
  const info = STATE.lastImportInfo;
  const updatedLine = info
    ? `<div>ข้อมูลอัปเดตล่าสุด: <b>${fmtThaiDateTime(info.imported_at)}</b> <span style="color:var(--text-muted);">(ข้อมูลจากไฟล์ที่นำเข้าปัจจุบัน)</span></div>`
    : '';
  el.innerHTML = `<span class="icon">📄</span><div class="grow"><div class="title">ข้อมูลนำเข้า</div><div>แผนที่ใช้งานอยู่ในระบบขณะนี้: ${fmtNum(STATE.records.length)} รายการ</div>${updatedLine}</div>`;
}

/* ==================================================================== */
/* UTIL + BOOT                                                          */
/* ==================================================================== */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function renderAll() {
  hideTooltip(); // rebuilding chart DOM removes the hovered element without firing mouseleave
  renderFilterBar();
  renderOverview();
  renderReviewTab();
  renderDeptSummaryTab();
  renderDupCoursesTab();
  renderPersonnelTab();
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  localStorage.setItem(LS_KEYS.theme, mode);
  const icon = { light: '☀️', dark: '🌙', system: '🖥️' }[mode];
  document.getElementById('theme-toggle').textContent = icon;
}

function initTheme() {
  const saved = localStorage.getItem(LS_KEYS.theme) || 'system';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const order = ['system', 'light', 'dark'];
    const cur = localStorage.getItem(LS_KEYS.theme) || 'system';
    applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
  });
}

async function init() {
  const profile = await requireSession(); // redirects to login.html and returns null if not allowed in
  if (!profile) return;

  applyRoleVisibility();
  document.getElementById('user-name').textContent = profile.full_name || profile.employee_id;
  document.getElementById('user-position').textContent = profile.position || '';
  document.getElementById('user-role-pill').textContent = profile.role === 'Admin' ? 'Admin' : 'Reviewer';
  document.getElementById('logout-btn').addEventListener('click', signOut);
  // Reuses login.html's own change-password screen (already handles an
  // already-authenticated session via ?mode=changepw) — no separate form needed here.
  document.getElementById('change-password-btn').addEventListener('click', () => {
    window.location.href = 'login.html?mode=changepw';
  });

  await loadAllRecords();
  try { STATE.lastImportInfo = await fetchLastImportInfo(); }
  catch (e) { STATE.lastImportInfo = null; }
  initTheme();

  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('chart-detail-backdrop').addEventListener('click', (e) => { if (e.target.id === 'chart-detail-backdrop') closeChartDetailModal(); });
  document.getElementById('chart-detail-close').addEventListener('click', closeChartDetailModal);

  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFileImport(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('import-file-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
  document.getElementById('reset-decisions-btn').addEventListener('click', async () => {
    if (!confirm('ล้างผลการพิจารณาทั้งหมด (แผนทุกรายการจะกลับเป็น "รอพิจารณา")?')) return;
    try {
      await resetAllDecisions();
      renderImportBanner();
      renderAll();
    } catch (e) {
      alert('ล้างผลการพิจารณาไม่สำเร็จ: ' + (e.message || 'เกิดข้อผิดพลาด'));
    }
  });

  renderImportBanner();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
