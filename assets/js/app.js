/* ===== ระบบพิจารณาอนุมัติแผนพัฒนาบุคลากร ประจำปีงบประมาณ 2570 ===== */

const LS_KEYS = {
  reviews: 'ppd2570_reviews_v1',
  imported: 'ppd2570_imported_v1',
  importedMeta: 'ppd2570_imported_meta_v1',
  reviewer: 'ppd2570_reviewer_v1',
  theme: 'ppd2570_theme_v1',
};

const STATE = {
  records: [],
  dataSource: 'sample',
  importedMeta: null,
  activeTab: 'overview',
  filters: { orgLevel: 'divisionName', orgValue: '', courseType: '', inputFactor: '', deliveryType: '', status: '', search: '' },
  openDeptKeys: new Set(),
  selectedId: null,
  noteDraft: null, // in-progress text in the review note field, kept across re-renders
};

/* ---------------- persistence ---------------- */
function loadReviewOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.reviews) || '{}'); } catch (e) { return {}; }
}
function saveReviewOverrides(map) { localStorage.setItem(LS_KEYS.reviews, JSON.stringify(map)); }

function loadBaseRecords() {
  const importedRaw = localStorage.getItem(LS_KEYS.imported);
  if (importedRaw) {
    try {
      STATE.dataSource = 'imported';
      STATE.importedMeta = JSON.parse(localStorage.getItem(LS_KEYS.importedMeta) || 'null');
      return JSON.parse(importedRaw);
    } catch (e) { /* fall through to sample */ }
  }
  STATE.dataSource = 'sample';
  return buildSampleRecords();
}

function applyOverrides(records) {
  const overrides = loadReviewOverrides();
  return records.map((r) => {
    const ov = overrides[r.id];
    return ov ? Object.assign({}, r, ov) : r;
  });
}

function loadAllRecords() {
  STATE.records = applyOverrides(loadBaseRecords());
}

function getReviewerName() { return localStorage.getItem(LS_KEYS.reviewer) || ''; }
function setReviewerName(name) { localStorage.setItem(LS_KEYS.reviewer, name); }

/* ---------------- decision persistence ---------------- */
function commitDecision(id, status, note) {
  const overrides = loadReviewOverrides();
  const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  overrides[id] = {
    reviewStatus: status,
    reviewNote: note || '',
    reviewedBy: getReviewerName() || 'ไม่ระบุผู้พิจารณา',
    reviewedDate: today,
  };
  saveReviewOverrides(overrides);
  loadAllRecords();
}

function resetAllDecisions() {
  localStorage.removeItem(LS_KEYS.reviews);
  loadAllRecords();
}

// เผื่อกดผิด — ล้างผลพิจารณาของแผนนี้แผนเดียว กลับไปเป็น "รอพิจารณา" แบบไม่มีประวัติเดิมค้างอยู่
function revertToPending(id) {
  const overrides = loadReviewOverrides();
  delete overrides[id];
  saveReviewOverrides(overrides);
  loadAllRecords();
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

function matchesFilters(r) {
  const f = STATE.filters;
  if (f.orgValue && r[f.orgLevel] !== f.orgValue) return false;
  if (f.courseType && r.courseType !== f.courseType) return false;
  if (f.inputFactor && r.inputFactor !== f.inputFactor) return false;
  if (f.deliveryType && deliveryTypeOf(r) !== f.deliveryType) return false;
  if (f.status && r.reviewStatus !== f.status) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [r.nameTh, r.creatorName, r.targetGroupNames, r.divisionName, r.sectionName].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function getFiltered() { return STATE.records.filter(matchesFilters); }

/* ---------------- shared status color/label ---------------- */
function statusColor(status) {
  return { pending: 'var(--status-pending)', approved: 'var(--status-good)', revise: 'var(--status-warning)', rejected: 'var(--status-critical)' }[status];
}
function statusBadge(status) {
  const meta = REVIEW_STATUS[status] || REVIEW_STATUS.pending;
  return `<span class="badge badge-${status}">${meta.label}</span>`;
}
const CATEGORICAL = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

// จำกัดจำนวนหมวดหมู่ที่ใช้สีแยกกันไม่เกิน 8 สี (พ้องกับจำนวนสี categorical ที่ผ่านเกณฑ์แยกแยะ)
// เกินกว่านั้นให้รวมหมวดที่เล็กที่สุดเป็น "อื่นๆ" เพื่อไม่ให้สีวนซ้ำจนแยกหมวดหมู่ไม่ออก
function topNWithOther(items, n) {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n - 1);
  const restTotal = sorted.slice(n - 1).reduce((s, d) => s + d.value, 0);
  head.push({ label: 'อื่นๆ', value: restTotal });
  return head;
}
function categoricalDonutData(records, keyOrFn) {
  const accessor = typeof keyOrFn === 'function' ? keyOrFn : (r) => r[keyOrFn];
  const names = Array.from(new Set(records.map(accessor).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const raw = names.map((name) => ({ label: name, value: records.filter((r) => accessor(r) === name).length }));
  return topNWithOther(raw, 8).map((d, i) => ({ ...d, color: CATEGORICAL[i % CATEGORICAL.length] }));
}

/* ==================================================================== */
/* TAB: OVERVIEW                                                        */
/* ==================================================================== */
function renderOverview() {
  const root = document.getElementById('panel-overview');
  const data = getFiltered();
  const total = data.length;
  const counts = { pending: 0, approved: 0, revise: 0, rejected: 0 };
  data.forEach((r) => { counts[r.reviewStatus] = (counts[r.reviewStatus] || 0) + 1; });

  const kpis = [
    { key: 'total', label: 'แผนทั้งหมด', value: total, color: 'var(--series-1)' },
    { key: 'pending', label: REVIEW_STATUS.pending.label, value: counts.pending, color: 'var(--status-pending)' },
    { key: 'approved', label: REVIEW_STATUS.approved.label, value: counts.approved, color: 'var(--status-good)' },
    { key: 'revise', label: REVIEW_STATUS.revise.label, value: counts.revise, color: 'var(--status-warning)' },
    { key: 'rejected', label: REVIEW_STATUS.rejected.label, value: counts.rejected, color: 'var(--status-critical)' },
  ];

  root.innerHTML = `
    <div class="kpi-grid">
      ${kpis.map((k) => `
        <div class="kpi-card" style="--kpi-color:${k.color}">
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
      <div class="card">
        <div class="card-title">จำนวนแผนต่อหน่วยงาน แยกตามสถานะการพิจารณา</div>
        <div class="card-sub">มุมมองหน่วยงาน: <b id="org-level-label"></b> — เรียงจากมากไปน้อย</div>
        <div id="chart-org-status" style="overflow-x:auto;"></div>
      </div>
      <div class="card"><div class="card-title">สัดส่วนตามประเภทการอบรม</div><div class="card-sub">นับเฉพาะหลักสูตรเสนอเพิ่มเติม — หลักสูตรกลาง อศค. ดำเนินการ ไม่มีข้อมูลนี้</div><div id="chart-deliverytype"></div></div>
    </div>
    <div class="budget-section">
      <div class="budget-main">
        <div class="mini-kpi-grid" id="budget-mini-kpis"></div>
        <div class="card">
          <div class="card-title">งบประมาณรวมต่อหน่วยงาน แยกตามสถานะการพิจารณา</div>
          <div class="card-sub">เรียงตามงบประมาณสูงสุด 10 อันดับ</div>
          <div id="chart-budget" style="overflow-x:auto;"></div>
        </div>
      </div>
      <div id="budget-insight-panel"></div>
    </div>
  `;

  document.getElementById('org-level-label').textContent = ORG_LEVELS.find((o) => o.key === STATE.filters.orgLevel).label;

  // status donut
  renderDonut(document.getElementById('chart-status'), [
    { label: REVIEW_STATUS.pending.label, value: counts.pending, color: 'var(--status-pending)' },
    { label: REVIEW_STATUS.approved.label, value: counts.approved, color: 'var(--status-good)' },
    { label: REVIEW_STATUS.revise.label, value: counts.revise, color: 'var(--status-warning)' },
    { label: REVIEW_STATUS.rejected.label, value: counts.rejected, color: 'var(--status-critical)' },
  ], { centerLabel: 'แผน' });

  // course type donut
  renderDonut(document.getElementById('chart-coursetype'), categoricalDonutData(data, 'courseType'), { centerLabel: 'แผน' });

  // input factor donut
  renderDonut(document.getElementById('chart-inputfactor'), categoricalDonutData(data, 'inputFactor'), { centerLabel: 'แผน' });

  // delivery type donut (ภายใน/ภายนอก) — ช่องว่างถูกจัดเป็น "ไม่ระบุ" แทนการตัดทิ้ง
  renderDonut(document.getElementById('chart-deliverytype'), categoricalDonutData(data, deliveryTypeOf), { centerLabel: 'แผน' });

  // stacked bar by org x status
  const orgLevel = STATE.filters.orgLevel;
  const orgNames = uniqueValues(data, orgLevel);
  const groups = orgNames.map((name) => {
    const rows = data.filter((r) => r[orgLevel] === name);
    const values = { pending: 0, approved: 0, revise: 0, rejected: 0 };
    rows.forEach((r) => { values[r.reviewStatus]++; });
    return { label: name, values, total: rows.length };
  }).sort((a, b) => b.total - a.total);
  const statusSeries = [
    { key: 'pending', label: REVIEW_STATUS.pending.label, color: 'var(--status-pending)' },
    { key: 'approved', label: REVIEW_STATUS.approved.label, color: 'var(--status-good)' },
    { key: 'revise', label: REVIEW_STATUS.revise.label, color: 'var(--status-warning)' },
    { key: 'rejected', label: REVIEW_STATUS.rejected.label, color: 'var(--status-critical)' },
  ];
  if (groups.length) {
    renderStackedBar(document.getElementById('chart-org-status'), groups, statusSeries, { width: 640, labelW: 170 });
  } else {
    document.getElementById('chart-org-status').innerHTML = '<div class="empty-state">ไม่มีข้อมูลตรงตัวกรอง</div>';
  }

  renderBudgetExecutiveSection(data, orgLevel, orgNames);
}

/* ---------------- Budget Executive Section (mini-KPIs + stacked budget bar + insight panel) ---------------- */
function computeOrgBudgetStats(data, orgLevel, orgNames) {
  const orgs = orgNames.map((name) => {
    const rows = data.filter((r) => r[orgLevel] === name);
    const byStatus = { pending: 0, approved: 0, revise: 0, rejected: 0 };
    rows.forEach((r) => { byStatus[r.reviewStatus] += (r.budgetTotal || 0); });
    const total = rows.reduce((s, r) => s + (r.budgetTotal || 0), 0);
    return { name, count: rows.length, total, byStatus, avg: rows.length ? total / rows.length : 0 };
  });
  const grandTotal = orgs.reduce((s, o) => s + o.total, 0);
  return { orgs, grandTotal };
}

function maxOrgBy(orgs, getValue) {
  let best = null;
  orgs.forEach((o) => { const v = getValue(o); if (v > 0 && (!best || v > getValue(best))) best = o; });
  return best;
}

function renderBudgetExecutiveSection(data, orgLevel, orgNames) {
  const { orgs, grandTotal } = computeOrgBudgetStats(data, orgLevel, orgNames);
  const planCount = data.length;
  const avgPerPlan = planCount ? grandTotal / planCount : 0;
  const topOrg = orgs.slice().sort((a, b) => b.total - a.total)[0] || null;
  const pctOf = (v) => (grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : '0.0');

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
      <div class="mini-kpi-label">งบเฉลี่ยต่อแผน</div>
      <div class="mini-kpi-value">${planCount ? fmtBaht(avgPerPlan) : '—'}</div>
    </div>
    <div class="mini-kpi-card">
      <div class="mini-kpi-label">หน่วยงานที่ใช้งบสูงสุด</div>
      <div class="mini-kpi-value" style="font-size:15px;">${topOrg ? escapeHtml(topOrg.name) : '—'}</div>
      <div class="mini-kpi-sub">${topOrg ? `${fmtBaht(topOrg.total)} · ${pctOf(topOrg.total)}%` : ''}</div>
    </div>
  `;

  // B. Budget chart — horizontal stacked bar by status, top 10 by total budget desc
  const statusSeriesBudget = [
    { key: 'pending', label: REVIEW_STATUS.pending.label, color: 'var(--status-pending)' },
    { key: 'approved', label: REVIEW_STATUS.approved.label, color: 'var(--status-good)' },
    { key: 'revise', label: REVIEW_STATUS.revise.label, color: 'var(--status-warning)' },
    { key: 'rejected', label: REVIEW_STATUS.rejected.label, color: 'var(--status-critical)' },
  ];
  const budgetGroups = orgs.slice().sort((a, b) => b.total - a.total).slice(0, 10)
    .map((o) => ({ label: o.name, values: o.byStatus, count: o.count, avg: o.avg }));
  const budgetEl = document.getElementById('chart-budget');
  if (budgetGroups.some((g) => g.count > 0)) {
    renderStackedBar(budgetEl, budgetGroups, statusSeriesBudget, {
      width: 900, labelW: 190, trackPad: 130,
      formatTotal: (t) => `${fmtBaht(t)} · ${pctOf(t)}%`,
      formatLegendValue: fmtBaht,
      tooltipHtml: (g, sr, v, t) => `
        <div class="tt-title">${escapeHtml(g.label)}</div>
        <dl class="tt-grid">
          <dt>จำนวนแผน</dt><dd>${fmtNum(g.count)} แผน</dd>
          <dt>งบประมาณรวม</dt><dd>${fmtBaht(t)}</dd>
          <dt>งบเฉลี่ยต่อแผน</dt><dd>${fmtBaht(g.avg)}</dd>
          <dt>${REVIEW_STATUS.pending.label}</dt><dd>${fmtBaht(g.values.pending || 0)}</dd>
          <dt>${REVIEW_STATUS.approved.label}</dt><dd>${fmtBaht(g.values.approved || 0)}</dd>
          <dt>${REVIEW_STATUS.revise.label}</dt><dd>${fmtBaht(g.values.revise || 0)}</dd>
          <dt>${REVIEW_STATUS.rejected.label}</dt><dd>${fmtBaht(g.values.rejected || 0)}</dd>
          <dt>% ของงบรวมทั้งหมด</dt><dd>${pctOf(t)}%</dd>
        </dl>`,
    });
  } else {
    budgetEl.innerHTML = '<div class="empty-state">ไม่มีข้อมูลงบประมาณ</div>';
  }

  // C. Executive Insight Panel — คำนวณจากข้อมูลที่ผ่าน filter ปัจจุบันทั้งหมด ไม่มีข้อมูลสมมติ
  const top3 = orgs.slice().sort((a, b) => b.total - a.total).filter((o) => o.total > 0).slice(0, 3);
  const maxPending = maxOrgBy(orgs, (o) => o.byStatus.pending);
  const maxApproved = maxOrgBy(orgs, (o) => o.byStatus.approved);
  const maxRejected = maxOrgBy(orgs, (o) => o.byStatus.rejected);
  const maxPlans = orgs.slice().sort((a, b) => b.count - a.count)[0] || null;

  const insightItem = (icon, color, title, bodyHtml) => `
    <div class="insight-item">
      <div class="insight-icon" style="--insight-color:${color}">${icon}</div>
      <div class="insight-body">
        <div class="insight-title">${title}</div>
        ${bodyHtml}
      </div>
    </div>`;

  document.getElementById('budget-insight-panel').innerHTML = `
    <div class="insight-panel">
      <div>
        <div class="card-title">ข้อมูลเชิงลึก (Insight)</div>
        <div class="card-sub" style="margin-bottom:0;">อัปเดตตามตัวกรองปัจจุบัน</div>
      </div>
      ${insightItem('🏆', 'var(--series-1)', '3 หน่วยงานที่ใช้งบสูงสุด',
        top3.length ? `<div class="insight-rank-list">${top3.map((o, i) => `
          <div class="insight-rank-row">
            <span class="insight-rank-num">${i + 1}</span>
            <span class="insight-rank-name">${escapeHtml(o.name)}</span>
            <span class="insight-rank-value">${fmtBaht(o.total)} · ${pctOf(o.total)}%</span>
          </div>`).join('')}</div>` : '<div class="insight-value">—</div>')}
      ${insightItem('📋', 'var(--series-1)', 'หน่วยงานที่มีจำนวนแผนมากที่สุด',
        maxPlans && maxPlans.count > 0 ? `<div class="insight-name">${escapeHtml(maxPlans.name)}</div><div class="insight-value">${fmtNum(maxPlans.count)} แผน</div>` : '<div class="insight-value">—</div>')}
      ${insightItem('✓', 'var(--status-good)', 'หน่วยงานที่มีงบเห็นชอบสูงสุด',
        maxApproved ? `<div class="insight-name">${escapeHtml(maxApproved.name)}</div><div class="insight-value">${fmtBaht(maxApproved.byStatus.approved)}</div>` : '<div class="insight-value">—</div>')}
      ${insightItem('✕', 'var(--status-critical)', 'หน่วยงานที่มีงบไม่เห็นชอบสูงสุด',
        maxRejected ? `<div class="insight-name">${escapeHtml(maxRejected.name)}</div><div class="insight-value">${fmtBaht(maxRejected.byStatus.rejected)}</div>` : '<div class="insight-value">—</div>')}
      ${insightItem('⏳', 'var(--status-pending)', 'หน่วยงานที่มีงบรอพิจารณาสูงสุด',
        maxPending ? `<div class="insight-name">${escapeHtml(maxPending.name)}</div><div class="insight-value">${fmtBaht(maxPending.byStatus.pending)} · ${pctOf(maxPending.byStatus.pending)}%</div>` : '<div class="insight-value">—</div>')}
    </div>
  `;
}

/* ==================================================================== */
/* TAB: REVIEW LIST                                                     */
/* ==================================================================== */
function renderReviewTab() {
  const root = document.getElementById('panel-review');
  const data = getFiltered();
  root.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;">พบ ${fmtNum(data.length)} แผน จากทั้งหมด ${fmtNum(STATE.records.length)} แผน</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>ชื่อหลักสูตร / แผน</th><th>หน่วยงานที่เสนอ</th><th>ประเภทหลักสูตร</th><th>ประเภทการอบรม</th>
          <th class="num">ผู้เข้าอบรม</th><th class="num">งบประมาณ</th><th>สถานะ</th><th></th>
        </tr></thead>
        <tbody>
          ${data.length ? data.map((r) => `
            <tr class="clickable" data-id="${r.id}">
              <td class="cell-name">${escapeHtml(r.nameTh)}</td>
              <td>${escapeHtml(r.sectionName || r.divisionName || r.deptName || '-')}</td>
              <td><span class="pill">${escapeHtml(r.courseType || '-')}</span></td>
              <td>${deliveryTypeOf(r) ? `<span class="pill">${escapeHtml(deliveryTypeOf(r))}</span>` : '<span class="cell-muted">—</span>'}</td>
              <td class="num">${fmtNum(r.participants)}</td>
              <td class="num">${r.budgetTotal ? fmtBaht(r.budgetTotal) : '<span class="cell-muted">-</span>'}</td>
              <td>${statusBadge(r.reviewStatus)}${r.reviewNote ? `<div class="note-snippet" title="${escapeAttr(r.reviewNote)}">📝 ${escapeHtml(truncate(r.reviewNote, 42))}</div>` : ''}</td>
              <td><button class="btn btn-sm review-open-btn" data-id="${r.id}">พิจารณา</button></td>
            </tr>
          `).join('') : `<tr><td colspan="8"><div class="empty-state"><div class="big">🔍</div>ไม่พบแผนที่ตรงกับตัวกรอง</div></td></tr>`}
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
}

/* ==================================================================== */
/* TAB: DEPARTMENT SUMMARY                                              */
/* ==================================================================== */
function renderDeptSummaryTab() {
  const root = document.getElementById('panel-dept');
  const data = getFiltered();
  const orgLevel = STATE.filters.orgLevel;
  const orgNames = uniqueValues(data, orgLevel);
  const rows = orgNames.map((name) => {
    const rows = data.filter((r) => r[orgLevel] === name);
    const counts = { pending: 0, approved: 0, revise: 0, rejected: 0 };
    rows.forEach((r) => { counts[r.reviewStatus]++; });
    const decided = counts.approved + counts.revise + counts.rejected;
    const rate = decided ? (counts.approved / decided) * 100 : null;
    const byCourseType = {};
    rows.forEach((r) => { byCourseType[r.courseType] = (byCourseType[r.courseType] || 0) + 1; });
    const byInputFactor = {};
    rows.forEach((r) => { byInputFactor[r.inputFactor] = (byInputFactor[r.inputFactor] || 0) + 1; });
    const byDeliveryType = {};
    rows.forEach((r) => { const t = deliveryTypeOf(r); if (t) byDeliveryType[t] = (byDeliveryType[t] || 0) + 1; });
    return { name, total: rows.length, counts, rate, byCourseType, byInputFactor, byDeliveryType };
  }).sort((a, b) => b.total - a.total);

  root.innerHTML = `
    <div class="filter-count" style="margin-bottom:10px;">สรุปตามหน่วยงานระดับ <b>${ORG_LEVELS.find((o) => o.key === orgLevel).label}</b> — คลิกแถวเพื่อดูรายละเอียดประเภทแผน</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>หน่วยงาน</th><th class="num">เสนอทั้งหมด</th><th class="num">${REVIEW_STATUS.pending.label}</th>
          <th class="num">${REVIEW_STATUS.approved.label}</th><th class="num">${REVIEW_STATUS.revise.label}</th>
          <th class="num">${REVIEW_STATUS.rejected.label}</th><th style="min-width:160px;">อัตราเห็นชอบ*</th>
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
              <td>
                ${row.rate === null ? '<span class="cell-muted">ยังไม่พิจารณา</span>' : `
                  <div class="rate-bar"><span style="width:${row.rate}%;background:var(--status-good)"></span></div>
                  <span style="font-size:12px;color:var(--text-secondary)">${row.rate.toFixed(0)}% ของที่พิจารณาแล้ว</span>`}
              </td>
            </tr>
            <tr class="dept-detail-row" data-key="${escapeHtml(row.name)}"><td colspan="7"><div class="dept-detail-inner">
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;">แยกตามประเภทหลักสูตร</div>
              <div class="type-breakdown" style="margin-bottom:12px;">
                ${Object.entries(row.byCourseType).map(([t, c]) => `<span class="type-chip">${escapeHtml(t)}: <b>${fmtNum(c)}</b></span>`).join('')}
              </div>
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;">แยกตามปัจจัยนำเข้าหลัก</div>
              <div class="type-breakdown" style="margin-bottom:12px;">
                ${Object.entries(row.byInputFactor).map(([t, c]) => `<span class="type-chip">${escapeHtml(t)}: <b>${fmtNum(c)}</b></span>`).join('')}
              </div>
              ${Object.keys(row.byDeliveryType).length ? `
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;">แยกตามประเภทการอบรม</div>
              <div class="type-breakdown">
                ${Object.entries(row.byDeliveryType).map(([t, c]) => `<span class="type-chip">${escapeHtml(t)}: <b>${fmtNum(c)}</b></span>`).join('')}
              </div>` : ''}
            </div></td></tr>
          `).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="big">📋</div>ไม่พบข้อมูล</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">*อัตราเห็นชอบ = เห็นชอบ ÷ (เห็นชอบ + เห็นชอบแต่ให้ทบทวน + ไม่เห็นชอบ) ไม่นับแผนที่ยังรอพิจารณา</div>
  `;
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
/* DETAIL DRAWER + REVIEW ACTIONS                                       */
/* ==================================================================== */
function fieldRow(label, value) {
  return `<div class="detail-item"><dt>${label}</dt><dd>${value && String(value).trim() ? escapeHtml(value) : '<span class="cell-muted">ไม่ระบุ</span>'}</dd></div>`;
}

function openDrawer(id) {
  STATE.selectedId = id;
  STATE.noteDraft = null;
  renderDrawer();
  document.getElementById('modal-backdrop').classList.add('show');
}
function closeDrawer() {
  document.getElementById('modal-backdrop').classList.remove('show');
  STATE.selectedId = null;
  STATE.noteDraft = null;
}

const DECISION_META = {
  pending: { label: REVIEW_STATUS.pending.label, btnClass: 'btn-pending', icon: '↩' },
  approved: { label: REVIEW_STATUS.approved.label, btnClass: 'btn-good', icon: '✓' },
  revise: { label: REVIEW_STATUS.revise.label, btnClass: 'btn-warning', icon: '↺' },
  rejected: { label: REVIEW_STATUS.rejected.label, btnClass: 'btn-critical', icon: '✕' },
};

function renderDrawer() {
  const r = STATE.records.find((x) => x.id === STATE.selectedId);
  const body = document.getElementById('drawer-body');
  const titleEl = document.getElementById('drawer-title');
  if (!r) { body.innerHTML = ''; return; }
  titleEl.textContent = r.nameTh;

  const history = r.reviewStatus !== 'pending' ? `
    <div class="review-history">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">${statusBadge(r.reviewStatus)}<span style="color:var(--text-muted);font-size:12px;">โดย ${escapeHtml(r.reviewedBy || '-')} · ${escapeHtml(r.reviewedDate || '-')}</span></div>
      ${r.reviewNote ? `<div><b style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">หมายเหตุที่บันทึกไว้</b><div style="margin-top:2px;">${escapeHtml(r.reviewNote)}</div></div>` : '<div style="color:var(--text-muted);font-size:12.5px;">ไม่มีหมายเหตุ</div>'}
    </div>` : '';

  const isCentral = isCentralCourse(r);

  // หลักสูตรกลาง อศค. ดำเนินการ ไม่มีประเภทการอบรม/วัตถุประสงค์/ผลลัพธ์ ฯลฯ กรอกไว้ตั้งแต่ต้น
  // จึงซ่อนช่องเหล่านี้แทนการโชว์ "ไม่ระบุ" ทุกช่อง และอธิบายเหตุผลสั้นๆ แทน
  const considerationSection = isCentral ? `
    <div class="section-heading">ข้อมูลสำหรับพิจารณา</div>
    <div style="color:var(--text-muted);font-size:12.5px;">หลักสูตรกลาง อศค. ดำเนินการ ไม่มีการกรอกวัตถุประสงค์/ผลลัพธ์ที่คาดหวัง/ตัวชี้วัด ฯลฯ แยกเป็นรายหลักสูตร</div>
  ` : `
    <div class="section-heading">ข้อมูลสำหรับพิจารณา</div>
    <dl class="detail-grid">
      <div class="detail-item full">${fieldRow('ความจำเป็น/หลักการและเหตุผล', r.rationale)}</div>
      <div class="detail-item full">${fieldRow('วัตถุประสงค์', r.objective)}</div>
      <div class="detail-item full">${fieldRow('ทักษะ/ความรู้ที่จะได้รับ', r.skillsGained)}</div>
      <div class="detail-item full">${fieldRow('ผลลัพธ์ที่คาดหวัง', r.outcome)}</div>
      <div class="detail-item full">${fieldRow('ตัวชี้วัด (KPI)', r.kpi)}</div>
      <div class="detail-item full">${fieldRow('หมายเหตุ', r.remark)}</div>
    </dl>
  `;

  body.innerHTML = `
    ${history}
    <dl class="detail-grid">
      ${fieldRow('หน่วยงานที่เสนอ (ฝ่าย)', r.deptName)}
      ${fieldRow('หน่วยงานที่เสนอ (กอง)', r.divisionName)}
      ${fieldRow('หน่วยงานที่เสนอ (แผนก)', r.sectionName)}
      ${fieldRow('ประเภทหลักสูตร', r.courseType)}
      ${fieldRow('ปัจจัยนำเข้าหลัก', r.inputFactor)}
      ${fieldRow('สถานะต้นทาง', r.sourceStatus)}
      ${fieldRow('รูปแบบการเรียนรู้', r.learningFormat)}
      ${isCentral ? '' : fieldRow('ประเภทการส่งอบรม', r.deliveryType)}
      ${fieldRow('จำนวนผู้เข้าอบรม (คน)', r.participants)}
      ${fieldRow('จำนวนวันอบรม (วัน)', r.days)}
      ${fieldRow('งบประมาณรวมทั้งหมด', r.budgetTotal ? fmtBaht(r.budgetTotal) : '')}
      ${fieldRow('ค่าจ้างเหมา/วิทยากรภายนอก', r.budgetOutsource ? fmtBaht(r.budgetOutsource) : '')}
      ${fieldRow('วันเริ่มต้น', r.startDate)}
      ${fieldRow('วันสิ้นสุด', r.endDate)}
      ${fieldRow('ผู้เสนอ/ผู้ประสานงาน', r.creatorName)}
      ${fieldRow('ตำแหน่งผู้เสนอ', r.creatorPosition)}
      <div class="detail-item full">${fieldRow('กลุ่มเป้าหมาย', r.targetGroupNames)}</div>
    </dl>
    ${considerationSection}
    <div class="section-heading">การพิจารณา</div>
    <div id="decision-area"></div>
  `;
  renderDecisionArea();
}

function renderDecisionArea() {
  const area = document.getElementById('decision-area');
  const r = STATE.records.find((x) => x.id === STATE.selectedId);
  if (!area || !r) return;
  const draft = STATE.noteDraft != null ? STATE.noteDraft : (r.reviewNote || '');
  area.innerHTML = `
    <label for="decision-note" style="display:block;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.02em;margin-bottom:6px;">หมายเหตุของผู้พิจารณา</label>
    <textarea class="note-field" id="decision-note" placeholder="ระบุประเด็นที่ต้องการให้หน่วยงานแก้ไข เหตุผลการพิจารณา หรือข้อเสนอแนะเพิ่มเติม (จำเป็นเมื่อเลือก &quot;ให้ทบทวน&quot; หรือ &quot;ไม่เห็นชอบ&quot;)">${escapeHtml(draft)}</textarea>
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
  area.querySelectorAll('[data-decision]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.decision;
      if (status === 'pending') {
        revertToPending(r.id);
        STATE.noteDraft = null;
        renderDrawer();
        renderAll();
        return;
      }
      const note = noteField.value.trim();
      const requireNote = status === 'revise' || status === 'rejected';
      if (requireNote && !note) {
        document.getElementById('decision-error').style.display = 'block';
        noteField.focus();
        return;
      }
      commitDecision(r.id, status, note);
      STATE.noteDraft = null;
      renderDrawer();
      renderAll();
    });
  });
}

/* ==================================================================== */
/* FILTER BAR + TABS                                                    */
/* ==================================================================== */
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  const data = STATE.records;
  const orgOptions = uniqueValues(data, STATE.filters.orgLevel);
  const courseTypes = uniqueValues(data, 'courseType');
  const inputFactors = uniqueValues(data, 'inputFactor');
  const deliveryTypes = uniqueDeliveryTypes(data);
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
      <input type="search" id="f-search" placeholder="ชื่อแผน, ผู้เสนอ, กลุ่มเป้าหมาย..." value="${escapeAttr(STATE.filters.search)}" />
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
  bind('f-search', 'search', 'input');
  document.getElementById('f-clear').addEventListener('click', () => {
    STATE.filters = { orgLevel: STATE.filters.orgLevel, orgValue: '', courseType: '', inputFactor: '', deliveryType: '', status: '', search: '' };
    renderAll();
  });
}

function switchTab(tab) {
  hideTooltip(); // a chart tooltip from the outgoing tab must not float over the incoming one
  STATE.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
}

/* ==================================================================== */
/* IMPORT / EXPORT / RESET                                              */
/* ==================================================================== */
function handleFileImport(file) {
  const statusEl = document.getElementById('import-status');
  statusEl.textContent = 'กำลังอ่านไฟล์...';
  importPlanFile(file, (err, result) => {
    if (err) { statusEl.textContent = '⚠ ' + err.message; return; }
    localStorage.setItem(LS_KEYS.imported, JSON.stringify(result.records));
    const meta = { fileName: file.name, importedAt: new Date().toLocaleString('th-TH'), rowCount: result.rowCount };
    localStorage.setItem(LS_KEYS.importedMeta, JSON.stringify(meta));
    localStorage.removeItem(LS_KEYS.reviews);
    loadAllRecords();
    STATE.filters.orgValue = '';
    renderImportBanner();
    renderAll();
    statusEl.textContent = `นำเข้าสำเร็จ ${result.rowCount} รายการ`;
  });
}

function exportCsv() {
  const cols = [
    ['id', 'รหัส'], ['nameTh', 'ชื่อหลักสูตร'], ['deptName', 'ฝ่าย'], ['divisionName', 'กอง'], ['sectionName', 'แผนก'],
    ['courseType', 'ประเภทหลักสูตร'], ['inputFactor', 'ปัจจัยนำเข้าหลัก'], ['deliveryType', 'ประเภทการอบรม'], ['participants', 'จำนวนผู้เข้าอบรม'],
    ['budgetTotal', 'งบประมาณรวม'], ['reviewStatus', 'สถานะ'], ['reviewNote', 'หมายเหตุการพิจารณา'],
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
  if (STATE.dataSource === 'imported' && STATE.importedMeta) {
    el.style.display = 'flex';
    el.innerHTML = `<span class="icon">📄</span><div class="grow"><div class="title">ใช้ข้อมูลนำเข้า: ${escapeHtml(STATE.importedMeta.fileName)}</div><div>นำเข้าเมื่อ ${escapeHtml(STATE.importedMeta.importedAt)} · ${fmtNum(STATE.importedMeta.rowCount)} รายการ</div></div><button class="btn btn-sm btn-ghost" id="clear-import-btn">กลับไปใช้ข้อมูลตัวอย่าง</button>`;
    document.getElementById('clear-import-btn').addEventListener('click', () => {
      if (!confirm('เปลี่ยนกลับไปใช้ข้อมูลตัวอย่างและล้างผลการพิจารณาปัจจุบัน?')) return;
      localStorage.removeItem(LS_KEYS.imported);
      localStorage.removeItem(LS_KEYS.importedMeta);
      localStorage.removeItem(LS_KEYS.reviews);
      loadAllRecords();
      renderImportBanner();
      renderAll();
    });
  } else {
    el.style.display = 'flex';
    el.innerHTML = `<span class="icon">ℹ️</span><div class="grow"><div class="title">กำลังแสดงข้อมูลตัวอย่าง (สมมติ)</div><div>นำเข้าไฟล์ Excel/CSV จริงของหน่วยงานได้จากปุ่ม "นำเข้าข้อมูล" ด้านบน — ข้อมูลจะถูกประมวลผลในเบราว์เซอร์ของคุณเท่านั้น ไม่ถูกส่งออกไปที่ใด</div></div>`;
  }
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

function init() {
  loadAllRecords();
  initTheme();

  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);

  const reviewerInput = document.getElementById('reviewer-name');
  reviewerInput.value = getReviewerName();
  reviewerInput.addEventListener('change', (e) => setReviewerName(e.target.value.trim()));

  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFileImport(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('import-file-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
  document.getElementById('reset-decisions-btn').addEventListener('click', () => {
    if (confirm('ล้างผลการพิจารณาทั้งหมด (แผนทุกรายการจะกลับเป็น "รอพิจารณา")?')) { resetAllDecisions(); renderImportBanner(); renderAll(); }
  });

  renderImportBanner();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
