/* ============================================================
   PEA BPK Team Calendar - Application logic (vanilla JS, no build step)
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- Constants ---------------- */
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const THAI_MONTHS_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const WD_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const WD_FULL = ["วันอาทิตย์","วันจันทร์","วันอังคาร","วันพุธ","วันพฤหัสบดี","วันศุกร์","วันเสาร์"];

  // การไฟฟ้าต้นสังกัด (บางปะกง) — ในระบบมีชื่อซ้อนกัน 2 แบบจากข้อมูลตั้งต้นคนละชุด
  // ("กฟฟ.บางปะกง" กับ "PEA อำเภอบางปะกง") เลยเก็บเป็นลิสต์ ใช้ยันกันทั้งคู่แทนที่จะเทียบสตริงตรงๆ
  const HOME_UNIT_PEA_VARIANTS = ["กฟฟ.บางปะกง", "PEA อำเภอบางปะกง"];
  const HOME_UNIT_PEA = HOME_UNIT_PEA_VARIANTS[0];
  function isHomeUnitPea(targetPea) { return HOME_UNIT_PEA_VARIANTS.includes((targetPea || "").trim()); }
  const LEAVE_TYPES = ["ลาป่วย", "ลากิจส่วนตัว", "ลาพักผ่อน", "ลาคลอดบุตร", "ลาอุปสมบท", "อื่นๆ"];
  // งานที่มีเวลานัดหมายหน้างาน (appointTime) ตั้งแต่เวลานี้เป็นต้นไป นับเป็นโอที แม้จะเป็นวันทำงานปกติ
  const OT_AFTER_HOURS_TIME = "16:30";

  /* ---------------- Date helpers (local-time, no TZ surprises) ---------------- */
  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fromISO(iso) { return new Date(iso + "T00:00:00"); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
  function addYears(d, n) { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; }
  function startOfWeek(d) { return addDays(d, -d.getDay()); }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function lastOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function isSameDay(a, b) { return toISO(a) === toISO(b); }
  function beYear(d) { return d.getFullYear() + 543; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function isValidTime24(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function attachTime24Formatter(input) {
    // ป้อนเวลาแบบ 24 ชม. ล้วน ไม่มี AM/PM — พิมพ์ตัวเลขแล้วใส่ ":" ให้อัตโนมัติ
    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "").slice(0, 4);
      input.value = digits.length >= 3 ? digits.slice(0, 2) + ":" + digits.slice(2) : digits;
    });
  }
  // คลิกตรงไหนก็ได้ในช่องวันที่ (ไม่ใช่แค่ไอคอนปฏิทินเล็กๆ) ก็เปิดปฏิทินให้เลือกเลย — ผูกที่ document
  // แบบ event delegation ครั้งเดียว ครอบคลุมช่อง <input type="date"> ทุกช่องทั้งแอป ไม่ต้องผูกทีละฟอร์ม
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest('input[type="date"]');
    if (el && !el.disabled && !el.readOnly && typeof el.showPicker === "function") {
      try { el.showPicker(); } catch (e) {}
    }
  });

  const TODAY = new Date();
  const TODAY_ISO = toISO(TODAY);

  /* ---------------- Auth: login by employee number, sha256(salt+password) ----------------
     ไม่มีเซิร์ฟเวอร์ auth จริง (แอปนี้เป็น static SPA คุยกับ Supabase ตรงๆ) — เช็ครหัสผ่านฝั่ง
     เบราว์เซอร์เทียบกับ hash ที่เก็บไว้ เหมาะกับทีมเล็กใช้ภายในเท่านั้น ไม่ใช่ระดับความปลอดภัย
     สาธารณะ (ผู้ที่เข้าถึง Supabase โดยตรงยังเห็น hash ได้ เพราะ RLS ยังเปิดกว้างเหมือนตารางอื่น) */
  const AUTH_STORAGE_KEY = "pea_cal_auth_session";
  let CURRENT_USER = null; // { id, name, position, employeeNo, role }
  let modalLocked = false; // true ระหว่างบังคับให้ตั้งรหัสผ่านใหม่ — ปิด modal ด้วยวิธีอื่นไม่ได้

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function randomHex(nBytes) {
    const arr = new Uint8Array(nBytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function hashPassword(password, salt) { return sha256Hex(salt + ":" + password); }
  function loadSession() {
    try { const raw = sessionStorage.getItem(AUTH_STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function saveSession(user) { try { sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch (e) {} }
  function clearSession() { try { sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {} }
  function isAdmin() { return !!CURRENT_USER && CURRENT_USER.role === "admin"; }

  /* ---------------- State ---------------- */
  const state = {
    view: "month",
    cursor: new Date(TODAY),
    selectedDate: new Date(TODAY),
    filters: {
      dateFrom: "", dateTo: "", month: "", year: "",
      jobType: "", workArea: "", targetPEA: "", team: "", vehicle: "",
      travelOrderStatus: "", status: ""
    }
  };

  /* ---------------- Data (loaded from Supabase) ---------------- */
  let TASKS = [];
  let taskById = {};
  function rebuildTaskIndex() {
    taskById = {};
    TASKS.forEach(t => { taskById[t.id] = t; });
  }

  /* พื้นที่ปฏิบัติงาน / การไฟฟ้าปลายทาง / รถ / ทีม — โหลดจาก calendar_options + calendar_teams
     เก็บทั้งค่าดิบ (มี id ไว้ลบ/แก้) และค่าที่แปลงเป็นรายการชื่อไว้ใช้กับฟอร์ม/ตัวกรอง */
  let OPTION_ROWS = [];
  let TEAM_ROWS = [];
  let WORK_AREAS = [];
  let TARGET_PEA_OFFICES = [];
  let VEHICLES = [];
  let CIRCUITS = [];
  let TEAMS = {};

  function optionValuesFor(category) {
    return OPTION_ROWS.filter(o => o.category === category).map(o => o.value).sort((a, b) => a.localeCompare(b, "th"));
  }

  async function loadOptions() {
    const [optRes, teamRes] = await Promise.all([
      CAL_SB.from("calendar_options").select("*"),
      CAL_SB.from("calendar_teams").select("*")
    ]);
    if (!optRes.error && optRes.data) {
      OPTION_ROWS = optRes.data;
      WORK_AREAS = optionValuesFor("work_area");
      TARGET_PEA_OFFICES = optionValuesFor("target_pea");
      VEHICLES = optionValuesFor("vehicle");
      CIRCUITS = optionValuesFor("circuit");
    }
    if (!teamRes.error && teamRes.data) {
      TEAM_ROWS = teamRes.data.slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
      TEAMS = {};
      TEAM_ROWS.forEach(t => { TEAMS[t.name] = t.members || []; });
    }
  }

  /* ---------------- Employees + leave records (individual calendar / OT) ---------------- */
  let EMPLOYEES = [];
  let LEAVES = [];

  async function loadPeopleData() {
    const [empRes, leaveRes] = await Promise.all([
      CAL_SB.from("calendar_employees").select("*"),
      CAL_SB.from("calendar_leaves").select("*")
    ]);
    // is_field_staff = false คือบัญชีสำหรับสิทธิ์เข้าใช้เท่านั้น (เช่น ผู้ดูแลระบบสำรอง) ไม่ใช่คนทำงานจริง
    // เลยไม่เอาไปแสดงในรายการเลือกคน/คนขับ/ปฏิทินรายบุคคล/สรุปทีมที่ไหนเลย
    if (!empRes.error && empRes.data) EMPLOYEES = empRes.data.filter(e => e.is_field_staff !== false).slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
    if (!leaveRes.error && leaveRes.data) LEAVES = leaveRes.data;
  }

  /* ---------------- Monthly to-do checklist (งานที่ต้องทำเดือนนี้) ---------------- */
  let MONTHLY_TODOS = [];
  async function loadMonthlyTodos() {
    const { data, error } = await CAL_SB.from("calendar_monthly_todos").select("*").order("created_at", { ascending: true });
    if (!error && data) MONTHLY_TODOS = data;
  }

  /* ---------------- Team plan Gantt (แผนงานประจำเดือน / คำสั่งเดินทางของทีม) ----------------
     แผนงานแต่ละรายการ = ช่วงวันที่ (date_from..date_to) ที่มีคำสั่งเดินทางของ "ทั้งทีม" โดยค่าเริ่มต้น
     ยกเว้นคนที่ถูกตัดออก (excluded_employees) เช่น คนที่ลาช่วงนั้น — เป็นข้อมูลของตัวเอง ไม่ผูกกับ calendar_tasks */
  let TEAM_PLANS = [];
  async function loadTeamPlans() {
    const { data, error } = await CAL_SB.from("calendar_team_plans").select("*").order("date_from", { ascending: true });
    if (!error && data) TEAM_PLANS = data;
  }

  function leavesOnDate(employeeName, iso) {
    return LEAVES.filter(l => l.employee_name === employeeName && iso >= l.date_from && iso <= l.date_to);
  }
  function tasksForEmployeeOnDate(employeeName, iso) {
    return TASKS.filter(t => t.date === iso && (t.teamMembers || []).some(m => m.includes(employeeName)));
  }
  // นับ "วันทำการ" (จันทร์-ศุกร์ ไม่ใช่วันหยุดนักขัตฤกษ์) ทั้งเดือน เทียบกับที่ผ่านไปแล้วถึงวันนี้
  // (เดือนที่ผ่านไปแล้วทั้งเดือน = ผ่านครบทุกวันทำการ, เดือนในอนาคต = ยังไม่ผ่านสักวัน)
  function businessDaysProgress(year, month0) {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const isPastMonth = year < TODAY.getFullYear() || (year === TODAY.getFullYear() && month0 < TODAY.getMonth());
    const isCurrentMonth = year === TODAY.getFullYear() && month0 === TODAY.getMonth();
    let total = 0, elapsed = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dow = new Date(year, month0, day).getDay();
      const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (dow === 0 || dow === 6 || HOLIDAYS[iso]) continue;
      total++;
      if (isPastMonth || (isCurrentMonth && day <= TODAY.getDate())) elapsed++;
    }
    return { total, elapsed };
  }
  function getPersonMonthData(employeeName, year, month0) {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const out = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = new Date(year, month0, day).getDay();
      const holiday = HOLIDAYS[iso];
      const isWeekend = dow === 0 || dow === 6;
      const leaves = leavesOnDate(employeeName, iso);
      const leave = leaves[0] || null;
      const tasksForDay = tasksForEmployeeOnDate(employeeName, iso);
      const worked = tasksForDay.length > 0;
      // วันที่ลาแล้ว ไม่นับเป็นวันปฏิบัติงาน/OT/คำสั่งเดินทาง แม้จะมีงานติดอยู่ในระบบก็ตาม
      // นับเป็นวันโอที ถ้าเป็นวันเสาร์/อาทิตย์/วันหยุดนักขัตฤกษ์ หรือมีงานที่เวลานัดหมายหน้างานหลัง 16:30 น. (งานด่วนนอกเวลาราชการ)
      const isOT = !leave && worked && (isWeekend || !!holiday || tasksForDay.some(t => t.appointTime && t.appointTime > OT_AFTER_HOURS_TIME));
      const hasTravelOrder = !leave && tasksForDay.some(t => t.travelOrder);
      // "ปฏิบัติงาน บปก." = อยู่ที่การไฟฟ้าบางปะกงจริงๆ (ไม่ใช่แค่ areaStatus "ในพื้นที่" ทั่วไป) และไม่มีคำสั่งเดินทาง
      const inArea = !leave && worked && tasksForDay.some(t => isHomeUnitPea(t.targetPEA) && !t.travelOrder);
      out.push({ iso, day, dow, holiday, isWeekend, leave, leaves, tasksForDay, worked, isOT, hasTravelOrder, inArea });
    }
    return out;
  }

  function rowToTask(r) {
    return {
      id: r.id,
      title: r.title,
      date: r.task_date,
      departTime: (r.depart_time || "00:00").slice(0, 5),
      appointTime: (r.appoint_time || "00:00").slice(0, 5),
      jobType: r.job_type,
      workArea: r.work_area,
      targetPEA: r.target_pea,
      areaStatus: r.area_status,
      priority: r.priority,
      travelOrder: r.travel_order,
      travelOrderNo: r.travel_order_no || "-",
      travelOrderStatus: r.travel_order_status,
      team: r.team || "",
      teamMembers: r.team_members || [],
      vehicles: r.vehicle_assignments || [],
      circuits: r.circuits || [],
      equipment: r.equipment || [],
      equipmentOwner: r.equipment_owner || "",
      coordinator: r.coordinator || "",
      coordinatorPhone: r.coordinator_phone || "",
      status: r.status,
      note: r.note || ""
    };
  }

  async function loadTasks() {
    loadNoteEl.classList.remove("hidden", "error");
    loadNoteEl.textContent = "กำลังโหลดข้อมูลงานจากฐานข้อมูล...";
    const { data, error } = await CAL_SB.from("calendar_tasks").select("*")
      .order("task_date", { ascending: true }).order("depart_time", { ascending: true });
    if (error) {
      loadNoteEl.classList.add("error");
      loadNoteEl.textContent = "โหลดข้อมูลไม่สำเร็จ: " + error.message;
      return;
    }
    TASKS = (data || []).map(rowToTask);
    rebuildTaskIndex();
    loadNoteEl.classList.add("hidden");
  }

  /* ---------------- Filtering ---------------- */
  function applyFieldFilters(tasks) {
    const f = state.filters;
    return tasks.filter(t => {
      if (f.dateFrom && t.date < f.dateFrom) return false;
      if (f.dateTo && t.date > f.dateTo) return false;
      if (f.month && (fromISO(t.date).getMonth() + 1) !== Number(f.month)) return false;
      if (f.year && fromISO(t.date).getFullYear() !== Number(f.year)) return false;
      if (f.jobType && t.jobType !== f.jobType) return false;
      if (f.workArea && t.workArea !== f.workArea) return false;
      if (f.targetPEA && t.targetPEA !== f.targetPEA) return false;
      if (f.team && t.team !== f.team) return false;
      if (f.vehicle && !(t.vehicles || []).some(v => v.vehicle === f.vehicle)) return false;
      if (f.travelOrderStatus && t.travelOrderStatus !== f.travelOrderStatus) return false;
      if (f.status && t.status !== f.status) return false;
      return true;
    });
  }
  function periodRange() {
    const anchor = state.view === "day" ? state.selectedDate : state.cursor;
    if (state.view === "day") return [anchor, anchor];
    if (state.view === "week") { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
    if (state.view === "year") return [new Date(anchor.getFullYear(), 0, 1), new Date(anchor.getFullYear(), 11, 31)];
    return [firstOfMonth(anchor), lastOfMonth(anchor)];
  }
  function inRange(iso, start, end) { return iso >= toISO(start) && iso <= toISO(end); }

  function getRenderTasks() {
    return applyFieldFilters(TASKS);
  }
  function getPeriodTasks() {
    const [s, e] = periodRange();
    return applyFieldFilters(TASKS).filter(t => inRange(t.date, s, e));
  }
  function getTasksForDate(iso) {
    return getRenderTasks().filter(t => t.date === iso).sort((a, b) => a.departTime.localeCompare(b.departTime));
  }

  /* ---------------- DOM refs ---------------- */
  const $ = sel => document.querySelector(sel);
  const statRowEl = $("#stat-row");
  const ganttPanelEl = $("#gantt-panel");
  const todoMonthLabelEl = $("#todo-month-label");
  const todoListEl = $("#todo-list");
  const todoAddFormEl = $("#todo-add-form");
  const periodLabelEl = $("#period-label");
  const viewSwitchEl = $("#view-switch");
  const filterGridEl = $("#filter-grid");
  const filterNoteEl = $("#filter-active-note");
  const calendarViewEl = $("#calendar-view");
  const sideColEl = $("#side-col");
  const sidePanelEl = $("#side-panel");
  const modalBackdropEl = $("#modal-backdrop");
  const modalBodyEl = $("#modal-body");
  const todayBadgeEl = $("#today-badge");
  const loadNoteEl = $("#load-note");
  const addTaskBtnEl = $("#add-task-btn");
  const personBtnEl = $("#person-btn");
  const equipmentBtnEl = $("#equipment-btn");
  const leaveBtnEl = $("#leave-btn");
  const accessLogBtnEl = $("#access-log-btn");
  const appShellEl = $("#app-shell");
  const equipmentPageEl = $("#equipment-page");
  const equipmentPageBodyEl = $("#equipment-page-body");
  const equipmentBackBtnEl = $("#equipment-back-btn");
  const equipmentPageCountEl = $("#equipment-page-count");
  const leavePageEl = $("#leave-page");
  const leavePageBodyEl = $("#leave-page-body");
  const leaveBackBtnEl = $("#leave-back-btn");
  const auditBtnEl = $("#audit-btn");
  const auditPageEl = $("#audit-page");
  const auditPageBodyEl = $("#audit-page-body");
  const auditBackBtnEl = $("#audit-back-btn");
  const personPageEl = $("#person-page");
  const personPageBodyEl = $("#person-page-body");
  const personBackBtnEl = $("#person-back-btn");
  const accessLogPageEl = $("#access-log-page");
  const accessLogPageBodyEl = $("#access-log-page-body");
  const accessLogBackBtnEl = $("#access-log-back-btn");
  const loginScreenEl = $("#login-screen");
  const appRootEl = $("#app-root");
  const loginFormEl = $("#login-form");
  const loginErrorEl = $("#login-error");
  const userNameLabelEl = $("#user-name-label");
  const changePasswordBtnEl = $("#change-password-btn");
  const logoutBtnEl = $("#logout-btn");
  const viewOverviewBtnEl = $("#view-overview-btn");
  const visitorToggleBtnEl = $("#visitor-toggle-btn");
  const visitorFormEl = $("#visitor-form");
  const overviewPageEl = $("#overview-page");
  const overviewPageBodyEl = $("#overview-page-body");
  const ovModalBackdropEl = $("#ov-modal-backdrop");
  const ovModalBodyEl = $("#ov-modal-body");

  /* ---------------- Header today badge ---------------- */
  todayBadgeEl.textContent = `วันนี้ ${WD_FULL[TODAY.getDay()]} ${TODAY.getDate()} ${THAI_MONTHS[TODAY.getMonth()]} พ.ศ. ${beYear(TODAY)}`;

  /* ---------------- Stat row (สรุปรวมทั้งทีม ตามช่วงที่กำลังดูอยู่) ---------------- */
  function isOTTask(t) {
    const dow = fromISO(t.date).getDay();
    return dow === 0 || dow === 6 || !!HOLIDAYS[t.date] || (t.appointTime && t.appointTime > OT_AFTER_HOURS_TIME);
  }
  function countUniqueDays(tasks, predicate) {
    const days = new Set();
    tasks.forEach(t => { if (predicate(t)) days.add(t.date); });
    return days.size;
  }
  function renderStatRow() {
    const periodTasks = getPeriodTasks();
    const bizDays = businessDaysProgress(state.cursor.getFullYear(), state.cursor.getMonth());
    const inAreaCount = countUniqueDays(periodTasks, t => isHomeUnitPea(t.targetPEA) && !t.travelOrder);
    const travelOrderCount = countUniqueDays(periodTasks, t => t.travelOrder);
    const otCount = countUniqueDays(periodTasks, isOTTask);
    statRowEl.innerHTML = `
      <div class="stat-card workday" data-stat="workday"><div class="stat-label">วันทำการ</div><div class="stat-value">${bizDays.total}/${bizDays.elapsed}</div></div>
      <div class="stat-card inarea" data-stat="inarea"><div class="stat-label">ปฏิบัติงาน บปก.</div><div class="stat-value">${inAreaCount} วัน</div></div>
      <div class="stat-card travel" data-stat="travel"><div class="stat-label">คำสั่งเดินทาง</div><div class="stat-value">${travelOrderCount} วัน</div></div>
      <div class="stat-card urgent" data-stat="ot"><div class="stat-label">OT</div><div class="stat-value">${otCount} วัน</div></div>
      <div class="stat-card taskcount" data-stat="taskcount"><div class="stat-label">จำนวนงาน</div><div class="stat-value">${periodTasks.length} งาน</div></div>
    `;
    statRowEl.querySelectorAll(".stat-card").forEach(card => {
      card.addEventListener("click", () => openStatDetailModal(card.getAttribute("data-stat")));
    });
  }
  function statTaskListModalHtml(title, tasksByDate) {
    const dates = Object.keys(tasksByDate).sort();
    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">สรุปตามช่วงเวลาที่กำลังแสดงอยู่</div>
          <h2>${esc(title)}</h2>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        ${dates.length ? dates.map(iso => {
          const d = fromISO(iso);
          const items = tasksByDate[iso];
          return `
            <div class="detail-section">
              <div class="detail-section-title">${WD_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${beYear(d)} (${items.length} งาน)</div>
              <div class="detail-list">
                ${items.map(t => `<div class="stat-detail-task" data-task-id="${esc(t.id)}">${esc(t.appointTime || t.departTime || "-")} น. · ${esc(t.title)} · ${esc(t.targetPEA)}</div>`).join("")}
              </div>
            </div>`;
        }).join("") : `<div class="empty-state">ไม่มีรายการในช่วงเวลานี้</div>`}
      </div>`;
  }
  function openStatDetailModal(kind) {
    if (kind === "workday") { openWorkdayDetailModal(); return; }
    const periodTasks = getPeriodTasks();
    let title, filterFn;
    if (kind === "inarea") { title = "ปฏิบัติงาน บปก."; filterFn = t => isHomeUnitPea(t.targetPEA) && !t.travelOrder; }
    else if (kind === "travel") { title = "คำสั่งเดินทาง"; filterFn = t => t.travelOrder; }
    else if (kind === "ot") { title = "OT"; filterFn = isOTTask; }
    else if (kind === "taskcount") { title = "จำนวนงานทั้งหมด"; filterFn = () => true; }
    else return;

    const filtered = periodTasks.filter(filterFn);
    const tasksByDate = {};
    filtered.forEach(t => { (tasksByDate[t.date] = tasksByDate[t.date] || []).push(t); });
    Object.values(tasksByDate).forEach(list => list.sort((a, b) => (a.appointTime || "").localeCompare(b.appointTime || "")));

    modalBodyEl.innerHTML = statTaskListModalHtml(title, tasksByDate);
    modalLocked = false;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    modalBodyEl.querySelectorAll(".stat-detail-task").forEach(row => {
      row.addEventListener("click", () => openModal(row.getAttribute("data-task-id")));
    });
  }
  function openWorkdayDetailModal() {
    const year = state.cursor.getFullYear(), month0 = state.cursor.getMonth();
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = new Date(year, month0, day).getDay();
      if (dow === 0 || dow === 6 || HOLIDAYS[iso]) continue;
      const isPast = iso <= TODAY_ISO;
      rows.push(`<div>${WD_FULL[dow]} ${day} ${THAI_MONTHS[month0]} ${beYear(fromISO(iso))} ${isPast ? "✅ ผ่านแล้ว" : "⏳ ยังไม่ถึง"}</div>`);
    }
    modalBodyEl.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-id">สรุปตามช่วงเวลาที่กำลังแสดงอยู่</div>
          <h2>วันทำการ</h2>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <div class="detail-section">
          <div class="detail-section-title">วันทำการทั้งหมดในเดือนนี้ (${rows.length} วัน)</div>
          <div class="detail-list">${rows.join("")}</div>
        </div>
      </div>`;
    modalLocked = false;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
  }

  /* ---------------- Team plan Gantt (แผนงานประจำเดือน / คำสั่งเดินทางของทีม) ---------------- */
  // แผนงานทีมที่ครอบคลุมวันนั้น (ไม่ว่าจะมีงานรายวันของใครถูกกรอกไว้ในวันนั้นจริงหรือยัง) — ใช้โชว์
  // เป็นป้ายในช่องวันของปฏิทินหลัก ให้เห็นว่าวันนั้นมีแผนเดินทางทีมอยู่แล้ว แม้ยังไม่มีงานรายวัน
  function plansForDate(iso) {
    return TEAM_PLANS.filter(p => iso >= p.date_from && iso <= p.date_to);
  }
  const GANTT_COLORS = ["#5EB6A0", "#3081AB", "#EBB348"];
  function ganttPlanBounds(plan, monthStart, monthEnd) {
    const from = fromISO(plan.date_from), to = fromISO(plan.date_to);
    if (to < monthStart || from > monthEnd) return null;
    const clippedFrom = from < monthStart ? monthStart : from;
    const clippedTo = to > monthEnd ? monthEnd : to;
    return { startDay: clippedFrom.getDate(), endDay: clippedTo.getDate() };
  }
  function ganttDurationLabel(plan) {
    const days = Math.round((fromISO(plan.date_to) - fromISO(plan.date_from)) / 86400000) + 1;
    return `${days} วัน`;
  }
  function ganttBarLabel(plan) {
    const from = fromISO(plan.date_from), to = fromISO(plan.date_to);
    if (from.getTime() === to.getTime()) return `${from.getDate()} ${THAI_MONTHS_ABBR[from.getMonth()]}`;
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    return sameMonth
      ? `${from.getDate()} - ${to.getDate()} ${THAI_MONTHS_ABBR[to.getMonth()]}`
      : `${from.getDate()} ${THAI_MONTHS_ABBR[from.getMonth()]} - ${to.getDate()} ${THAI_MONTHS_ABBR[to.getMonth()]}`;
  }
  // พื้นหลังคอลัมน์วันหยุดสุดสัปดาห์ — ไล่สีแดงจางๆ เฉพาะคอลัมน์เสาร์/อาทิตย์ ด้วย hard-stop gradient
  // (คำนวณตำแหน่ง % ของแต่ละวันเอง เพราะวันหยุดไม่ได้เรียงเป็นแพทเทิร์นซ้ำที่ใช้ repeating-gradient ได้ตรงๆ)
  function ganttWeekendBackground(year, month0, daysInMonth) {
    const colPct = 100 / daysInMonth;
    const parts = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month0, d).getDay();
      const color = (dow === 0 || dow === 6) ? "rgba(220,38,38,0.07)" : "transparent";
      parts.push(`${color} ${((d - 1) * colPct).toFixed(4)}%`, `${color} ${(d * colPct).toFixed(4)}%`);
    }
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }
  // เส้นตารางบางๆ ไล่ตามความกว้างคอลัมน์วัน (แต่ละคอลัมน์กว้าง 100%/daysInMonth) ให้ดูออกว่า
  // แถบสีเริ่ม-จบตรงวันไหน ใช้ background-image เส้นเดียวไล่ซ้ำ (background-size) แทนการเพิ่ม DOM ต่อวัน
  // ซ้อนทับกับพื้นหลังคอลัมน์วันหยุดสุดสัปดาห์อีกชั้นหนึ่ง
  function ganttTrackStyle(year, month0, daysInMonth) {
    const colPct = 100 / daysInMonth;
    const weekendBg = ganttWeekendBackground(year, month0, daysInMonth);
    return `grid-template-columns: repeat(${daysInMonth}, minmax(0,1fr)); background-image: ${weekendBg}, linear-gradient(to right, #E2E2E2 1px, transparent 1px); background-size: 100% 100%, ${colPct}% 100%;`;
  }
  // จัดกลุ่มแผนงานที่ปลายทางเดียวกันไว้แถวเดียวกัน (คนละช่วงวันที่ก็ยังเป็นแถวเดียว) แทนที่จะขึ้นแถวซ้ำ
  function ganttGroupKey(plan) {
    return plan.target_pea || plan.work_area || plan.title || "แผนงานทีม";
  }
  function ganttGroupPlans(plans) {
    const groups = [];
    const byKey = new Map();
    plans.forEach(p => {
      const key = ganttGroupKey(p);
      if (!byKey.has(key)) {
        const g = { key, plans: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      byKey.get(key).plans.push(p);
    });
    return groups;
  }
  function ganttRowHtml(group, i, year, month0, monthStart, monthEnd, daysInMonth) {
    const color = GANTT_COLORS[i % GANTT_COLORS.length];
    const dest = group.key;
    const bars = group.plans.map(plan => {
      const bounds = ganttPlanBounds(plan, monthStart, monthEnd);
      if (!bounds) return "";
      const barLabel = ganttBarLabel(plan);
      return `<div class="gantt-bar" data-action="detail" data-id="${esc(plan.id)}" style="grid-column: ${bounds.startDay} / ${bounds.endDay + 1}; background:${color};" title="คลิกดูรายละเอียด: ${esc(dest)} (${esc(barLabel)})"></div>`;
    }).join("");
    // แถวที่มีแผนงานเดียว กดไอคอนท้ายแถวจัดการได้ตรงตัวเลย — แถวที่ปลายทางซ้ำ (หลายแผนงาน) ให้คลิกที่แถบสีของแต่ละช่วง
    // เพื่อเปิดรายละเอียดแล้วจัดการจากในนั้นแทน (ไม่งั้นจะไม่รู้ว่าไอคอนท้ายแถวหมายถึงแผนงานไหน)
    const singlePlan = group.plans.length === 1 ? group.plans[0] : null;
    return `
      <div class="gantt-row">
        <div class="gantt-row-num">${i + 1}</div>
        <div class="gantt-row-label" style="--gantt-accent:${color}">
          <div class="gantt-row-title">${esc(dest)}</div>
        </div>
        <div class="gantt-row-track" style="${ganttTrackStyle(year, month0, daysInMonth)}">
          ${bars}
        </div>
        <div class="gantt-row-actions admin-only">
          ${singlePlan ? `
            <button type="button" class="gantt-icon-btn" data-action="exclude" data-id="${esc(singlePlan.id)}" title="ยกเว้นบางคน (เช่นคนที่ลา)">👤</button>
            <button type="button" class="gantt-icon-btn" data-action="delete" data-id="${esc(singlePlan.id)}" title="ลบแผนงาน">🗑</button>
          ` : ""}
        </div>
      </div>`;
  }
  function ganttPanelHtml() {
    const year = state.cursor.getFullYear(), month0 = state.cursor.getMonth();
    const monthStart = new Date(year, month0, 1);
    const monthEnd = new Date(year, month0 + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const plans = TEAM_PLANS.filter(p => ganttPlanBounds(p, monthStart, monthEnd));
    const groups = ganttGroupPlans(plans);
    return `
      <div class="gantt-toolbar gantt-toolbar-v2">
        <div>
          <div class="gantt-title-v2">Operational Schedule</div>
          <div class="gantt-subtitle-v2">แผนงานประจำเดือน (คำสั่งเดินทางของทีม)</div>
        </div>
        <div class="gantt-toolbar-right">
          <div class="gantt-month-pill">
            <span>📅</span>
            <button type="button" class="gantt-month-nav-btn" id="gantt-prev">‹</button>
            <span class="gantt-month-pill-label">${THAI_MONTHS[month0]} ${beYear(monthStart)}</span>
            <button type="button" class="gantt-month-nav-btn" id="gantt-next">›</button>
          </div>
          <button type="button" class="btn-secondary admin-only" id="gantt-add-btn">+ เพิ่มแผนงาน</button>
        </div>
      </div>
      <form id="gantt-add-form" class="gantt-add-form admin-only hidden">
        <div class="form-grid">
          <div class="form-field"><label>วันที่เริ่ม <span class="req">*</span></label><input type="date" name="dateFrom" required /></div>
          <div class="form-field"><label>วันที่สิ้นสุด <span class="req">*</span></label><input type="date" name="dateTo" required /></div>
          <div class="form-field">
            <label>พื้นที่ปฏิบัติงาน</label>
            <select name="workArea">
              <option value="">— ไม่ระบุ —</option>
              ${WORK_AREAS.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label>การไฟฟ้าปลายทาง <span class="req">*</span></label>
            <select name="targetPEA" required>
              <option value="" selected disabled>— เลือกการไฟฟ้าปลายทาง —</option>
              ${combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}
            </select>
            <div class="form-hint">เลือกพื้นที่ปฏิบัติงานก่อน รายการนี้จะกรองเหลือเฉพาะการไฟฟ้าในจังหวัดนั้นให้อัตโนมัติ — ชื่อแผนงานจะใช้การไฟฟ้าปลายทางนี้เป็นชื่อแสดงผลอัตโนมัติ</div>
          </div>
          <div class="form-field span2">
            <label>สถานะพื้นที่ปฏิบัติงาน</label>
            <div class="radio-group" id="gantt-area-status-group">
              <label class="radio-option checked-in"><input type="radio" name="areaStatus" value="in" checked/> 🟢 ในพื้นที่ต้นสังกัด</label>
              <label class="radio-option"><input type="radio" name="areaStatus" value="out"/> 🟠 นอกพื้นที่ (มีคำสั่งเดินทาง)</label>
            </div>
          </div>
          <div class="form-field"><label>ผู้ประสานงาน/เจ้าของงาน</label><input type="text" name="coordinator" /></div>
          <div class="form-field"><label>เบอร์โทรผู้ประสานงาน</label><input type="tel" name="coordinatorPhone" placeholder="08x-xxx-xxxx" /></div>
          <div class="form-field span2">
            <label>เลขใบตัดงบปลายทาง (สำหรับเบิกค่าเบี้ยเลี้ยง)</label>
            <div class="radio-group" id="gantt-budget-group">
              <label class="radio-option"><input type="radio" name="budgetRefStatus" value="none" checked/> ไม่มี</label>
              <label class="radio-option"><input type="radio" name="budgetRefStatus" value="has"/> มี</label>
            </div>
          </div>
          <div class="form-field" id="gantt-budget-no-field" style="display:none;">
            <label>เลขที่ใบตัดงบ</label>
            <input type="text" name="budgetRefNo" placeholder="ไม่ทราบเลขตอนนี้ กรอกภายหลังได้" />
          </div>
        </div>
        <div id="gantt-add-error"></div>
        <div class="form-actions">
          <span class="form-hint">ค่าเริ่มต้นมีผลกับทั้งทีม ตัดคนออกเฉพาะกรณีได้ภายหลัง (เช่น คนที่ลาช่วงนั้น)</span>
          <div class="form-actions-right"><button type="submit" class="btn-primary">+ บันทึกแผนงาน</button></div>
        </div>
      </form>
      ${groups.length ? `
        <div class="gantt-wrap">
          <div class="gantt-header-row">
            <div class="gantt-row-num">ลำดับ</div>
            <div class="gantt-row-label">พื้นที่ปฏิบัติงาน</div>
            <div class="gantt-row-track" style="${ganttTrackStyle(year, month0, daysInMonth)}">
              ${Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dow = new Date(year, month0, day).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return `<div class="gantt-daynum ${isWeekend ? "weekend" : ""}"><div>${day}</div><div class="gantt-daynum-wd">${WD_SHORT[dow]}</div></div>`;
              }).join("")}
            </div>
            <div class="gantt-row-actions">ผู้รับผิดชอบ</div>
          </div>
          ${groups.map((g, i) => ganttRowHtml(g, i, year, month0, monthStart, monthEnd, daysInMonth)).join("")}
        </div>
      ` : `<div class="gantt-empty">ยังไม่มีแผนงานในเดือนนี้</div>`}`;
  }
  function openGanttDetailModal(planId) {
    const plan = TEAM_PLANS.find(p => p.id === planId);
    if (!plan) return;
    const excluded = plan.excluded_employees || [];
    const dest = plan.target_pea || plan.work_area || plan.title || "แผนงานทีม";
    modalBodyEl.innerHTML = `
      <div class="modal-head">
        <div><div class="modal-id">แผนงานทีม</div><h2>${esc(dest)}</h2></div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          ${detailItem("ช่วงวันที่", `${plan.date_from} – ${plan.date_to} (${ganttDurationLabel(plan)})`)}
          ${detailItem("พื้นที่ปฏิบัติงาน", plan.work_area || "-")}
          ${detailItem("การไฟฟ้าปลายทาง", plan.target_pea || "-")}
          ${detailItem("สถานะพื้นที่ปฏิบัติงาน", plan.area_status === "out" ? "🟠 นอกพื้นที่ (มีคำสั่งเดินทาง)" : "🟢 ในพื้นที่ต้นสังกัด")}
          ${detailItem("ผู้ประสานงาน/เจ้าของงาน", plan.coordinator || "-")}
          ${detailItem("เบอร์โทรผู้ประสานงาน", plan.coordinator_phone || "-", true)}
          ${detailItem("เลขใบตัดงบปลายทาง", plan.budget_ref_status === "has" ? (plan.budget_ref_no ? plan.budget_ref_no : "มี (ยังไม่ระบุเลข)") : "ไม่มี")}
        </div>
        <div class="detail-section" style="margin-top:14px;">
          <div class="detail-section-title">ผู้ที่ยกเว้นจากแผนงานนี้ (เช่น คนที่ลา)</div>
          ${excluded.length ? `<div class="gantt-exclude-summary">${excluded.map(n => `<span class="pls-type-tag">${esc(n)}</span>`).join("")}</div>` : `<div class="form-hint">ไม่มีใครถูกยกเว้น — มีผลกับทั้งทีม</div>`}
        </div>
      </div>
      <div class="detail-actions admin-only">
        <button class="btn-secondary" id="gantt-exclude-btn">👤 ยกเว้นบางคน</button>
        <button class="btn-danger" id="gantt-delete-btn">🗑 ลบแผนงาน</button>
      </div>`;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    $("#gantt-exclude-btn").addEventListener("click", () => openGanttExcludeModal(plan.id));
    $("#gantt-delete-btn").addEventListener("click", async () => {
      if (!confirm("ยืนยันลบแผนงานนี้?")) return;
      const { error } = await CAL_SB.from("calendar_team_plans").delete().eq("id", plan.id);
      if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
      await loadTeamPlans();
      renderTeamPlanGantt();
      closeModal();
    });
  }
  function openGanttExcludeModal(planId) {
    const plan = TEAM_PLANS.find(p => p.id === planId);
    if (!plan) return;
    const excluded = new Set(plan.excluded_employees || []);
    const dest = plan.target_pea || plan.work_area || plan.title || "แผนงานทีม";
    modalBodyEl.innerHTML = `
      <div class="modal-head">
        <div><div class="modal-id">แผนงานทีม</div><h2>${esc(dest)}</h2></div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-hint" style="margin-bottom:10px;">ค่าเริ่มต้นคำสั่งนี้มีผลกับทั้งทีม ติ๊กออกเฉพาะคนที่ไม่เกี่ยวข้องช่วงนี้ (เช่น คนที่ลา)</div>
        <div class="gantt-exclude-list">
          ${EMPLOYEES.map(e => `
            <label class="gantt-exclude-item">
              <input type="checkbox" data-name="${esc(e.name)}" ${excluded.has(e.name) ? "" : "checked"} />
              <span>${esc(e.name)}</span>
            </label>`).join("")}
        </div>
      </div>`;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    modalBodyEl.querySelectorAll(".gantt-exclude-item input").forEach(cb => {
      cb.addEventListener("change", async () => {
        const name = cb.getAttribute("data-name");
        const set = new Set(plan.excluded_employees || []);
        if (cb.checked) set.delete(name); else set.add(name);
        const newExcluded = Array.from(set);
        const { error } = await CAL_SB.from("calendar_team_plans").update({ excluded_employees: newExcluded }).eq("id", plan.id);
        if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); cb.checked = !cb.checked; return; }
        plan.excluded_employees = newExcluded;
        renderTeamPlanGantt();
      });
    });
  }
  function bindGanttEvents() {
    // ปุ่มเลื่อนเดือนในการ์ด Gantt ใช้ตัวเดียวกับ toolbar หลัก (navigate) ให้เดือนที่ดูอยู่ตรงกันเสมอ
    const ganttPrevBtn = $("#gantt-prev");
    const ganttNextBtn = $("#gantt-next");
    if (ganttPrevBtn) ganttPrevBtn.addEventListener("click", () => navigate(-1));
    if (ganttNextBtn) ganttNextBtn.addEventListener("click", () => navigate(1));
    const addBtn = $("#gantt-add-btn");
    const addForm = $("#gantt-add-form");
    if (addBtn && addForm) {
      addBtn.addEventListener("click", () => addForm.classList.toggle("hidden"));

      // เลือก "พื้นที่ปฏิบัติงาน" แล้วกรอง "การไฟฟ้าปลายทาง" เหลือเฉพาะจังหวัดนั้น (เหมือนฟอร์มเพิ่มงานหลัก)
      const workAreaSel = addForm.querySelector('select[name=workArea]');
      const targetPeaSel = addForm.querySelector('select[name=targetPEA]');
      workAreaSel.addEventListener("change", () => {
        const allOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
        const filtered = targetPeaOptionsForWorkArea(allOpts, workAreaSel.value);
        targetPeaSel.innerHTML = `<option value="" selected disabled>— เลือกการไฟฟ้าปลายทาง —</option>` + filtered.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      });
      function syncGanttAreaStatus() {
        const checked = addForm.querySelector("input[name=areaStatus]:checked");
        if (!checked) return;
        addForm.querySelectorAll("#gantt-area-status-group .radio-option").forEach(o => o.classList.remove("checked-in", "checked-out"));
        checked.closest(".radio-option").classList.add(checked.value === "in" ? "checked-in" : "checked-out");
      }
      addForm.querySelectorAll("input[name=areaStatus]").forEach(r => r.addEventListener("change", syncGanttAreaStatus));
      targetPeaSel.addEventListener("change", () => {
        if (isHomeUnitPea(targetPeaSel.value)) {
          const inRadio = addForm.querySelector('input[name=areaStatus][value=in]');
          if (inRadio && !inRadio.checked) { inRadio.checked = true; syncGanttAreaStatus(); }
        }
      });

      // เลขใบตัดงบปลายทาง — ติ๊ก "มี" ค่อยผุดช่องกรอกเลข (จะยังไม่กรอกเลขตอนนี้ก็ได้)
      const budgetNoField = $("#gantt-budget-no-field");
      function syncGanttBudgetRef() {
        const checked = addForm.querySelector("input[name=budgetRefStatus]:checked");
        budgetNoField.style.display = checked && checked.value === "has" ? "" : "none";
      }
      addForm.querySelectorAll("input[name=budgetRefStatus]").forEach(r => r.addEventListener("change", syncGanttBudgetRef));

      addForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData(addForm);
        const targetPEA = (fd.get("targetPEA") || "").trim();
        const workArea = (fd.get("workArea") || "").trim();
        const dateFrom = fd.get("dateFrom");
        const dateTo = fd.get("dateTo");
        const errEl = $("#gantt-add-error");
        errEl.innerHTML = "";
        if (!targetPEA || !dateFrom || !dateTo) { errEl.innerHTML = `<div class="form-error">กรุณากรอกให้ครบ</div>`; return; }
        if (dateTo < dateFrom) { errEl.innerHTML = `<div class="form-error">วันสิ้นสุดต้องไม่ก่อนวันเริ่ม</div>`; return; }
        const btn = addForm.querySelector("button[type=submit]");
        btn.disabled = true;
        const budgetRefStatus = fd.get("budgetRefStatus") || "none";
        const row = {
          title: targetPEA, date_from: dateFrom, date_to: dateTo,
          work_area: workArea || null,
          target_pea: targetPEA,
          area_status: fd.get("areaStatus") || "in",
          coordinator: (fd.get("coordinator") || "").trim() || null,
          coordinator_phone: (fd.get("coordinatorPhone") || "").trim() || null,
          budget_ref_status: budgetRefStatus,
          budget_ref_no: budgetRefStatus === "has" ? ((fd.get("budgetRefNo") || "").trim() || null) : null
        };
        const { error } = await CAL_SB.from("calendar_team_plans").insert([row]);
        if (error) { errEl.innerHTML = `<div class="form-error">บันทึกไม่สำเร็จ: ${esc(error.message)}</div>`; btn.disabled = false; return; }
        await loadTeamPlans();
        renderTeamPlanGantt();
      });
    }
    ganttPanelEl.querySelectorAll('[data-action="detail"]').forEach(el => {
      el.addEventListener("click", () => openGanttDetailModal(el.getAttribute("data-id")));
    });
    ganttPanelEl.querySelectorAll('[data-action="exclude"]').forEach(btn => {
      btn.addEventListener("click", () => openGanttExcludeModal(btn.getAttribute("data-id")));
    });
    ganttPanelEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("ยืนยันลบแผนงานนี้?")) return;
        const { error } = await CAL_SB.from("calendar_team_plans").delete().eq("id", btn.getAttribute("data-id"));
        if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        await loadTeamPlans();
        renderTeamPlanGantt();
      });
    });
  }
  function renderTeamPlanGantt() {
    ganttPanelEl.innerHTML = ganttPanelHtml();
    bindGanttEvents();
  }

  /* ---------------- Toolbar ---------------- */
  const VIEW_LABELS = { day: "รายวัน", week: "รายสัปดาห์", month: "รายเดือน", year: "รายปี" };
  function renderToolbar() {
    viewSwitchEl.innerHTML = ["week", "month", "day", "year"].map(v =>
      `<button data-view="${v}" class="${state.view === v ? "active" : ""}">${VIEW_LABELS[v]}</button>`
    ).join("");
    viewSwitchEl.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => { setView(btn.getAttribute("data-view")); });
    });

    const anchor = state.view === "day" ? state.selectedDate : state.cursor;
    if (state.view === "day") {
      periodLabelEl.textContent = `${WD_FULL[anchor.getDay()]} ${anchor.getDate()} ${THAI_MONTHS[anchor.getMonth()]} พ.ศ. ${beYear(anchor)}`;
    } else if (state.view === "week") {
      const s = startOfWeek(anchor), e = addDays(s, 6);
      if (s.getMonth() === e.getMonth()) {
        periodLabelEl.textContent = `${s.getDate()} - ${e.getDate()} ${THAI_MONTHS[s.getMonth()]} พ.ศ. ${beYear(s)}`;
      } else {
        periodLabelEl.textContent = `${s.getDate()} ${THAI_MONTHS[s.getMonth()]} - ${e.getDate()} ${THAI_MONTHS[e.getMonth()]} พ.ศ. ${beYear(e)}`;
      }
    } else if (state.view === "year") {
      periodLabelEl.textContent = `ปี พ.ศ. ${beYear(anchor)}`;
    } else {
      periodLabelEl.textContent = `${THAI_MONTHS[anchor.getMonth()]} พ.ศ. ${beYear(anchor)}`;
    }
  }

  function setView(v) {
    state.view = v;
    state.cursor = new Date(state.selectedDate);
    renderAll();
  }
  function navigate(dir) {
    if (state.view === "day") { state.selectedDate = addDays(state.selectedDate, dir); state.cursor = new Date(state.selectedDate); }
    else if (state.view === "week") state.cursor = addDays(state.cursor, dir * 7);
    else if (state.view === "month") state.cursor = addMonths(state.cursor, dir);
    else state.cursor = addYears(state.cursor, dir);
    renderAll();
  }
  function goToday() {
    state.cursor = new Date(TODAY);
    state.selectedDate = new Date(TODAY);
    renderAll();
  }
  $("#nav-prev").addEventListener("click", () => navigate(-1));
  $("#nav-next").addEventListener("click", () => navigate(1));
  $("#nav-today").addEventListener("click", goToday);

  /* ---------------- Filter bar ---------------- */
  function getFilterDefs() {
    // A function (not a computed-once const) so it always reflects the current
    // WORK_AREAS/TARGET_PEA_OFFICES/VEHICLES/TEAMS after loadOptions() runs or
    // the settings modal adds/removes an option.
    return [
      { key: "dateFrom", label: "จากวันที่", type: "date" },
      { key: "dateTo", label: "ถึงวันที่", type: "date" },
      { key: "month", label: "เดือน", type: "select", options: THAI_MONTHS.map((m, i) => [String(i + 1), m]) },
      { key: "year", label: "ปี (พ.ศ.)", type: "select", options: [2025, 2026, 2027].map(y => [String(y), String(y + 543)]) },
      { key: "jobType", label: "ประเภทงาน", type: "select", options: JOB_TYPES.map(v => [v, v]) },
      { key: "workArea", label: "พื้นที่ปฏิบัติงาน", type: "select", options: WORK_AREAS.map(v => [v, v]) },
      { key: "targetPEA", label: "การไฟฟ้าปลายทาง", type: "select", options: TARGET_PEA_OFFICES.map(v => [v, v]) },
      { key: "team", label: "ทีมปฏิบัติงาน", type: "select", options: Object.keys(TEAMS).map(v => [v, v]) },
      { key: "vehicle", label: "รถ", type: "select", options: VEHICLES.map(v => [v, v]) },
      { key: "travelOrderStatus", label: "สถานะคำสั่งเดินทาง", type: "select", options: TRAVEL_ORDER_STATUS_OPTIONS.map(v => [v, v]) },
      { key: "status", label: "สถานะงาน", type: "select", options: STATUS_OPTIONS.map(v => [v, v]) }
    ];
  }

  function renderFilterBar() {
    filterGridEl.innerHTML = getFilterDefs().map(f => {
      if (f.type === "date") {
        return `<div class="filter-field"><label>${f.label}</label>
          <input type="date" data-filter="${f.key}" value="${esc(state.filters[f.key])}" /></div>`;
      }
      const opts = `<option value="">ทั้งหมด</option>` + f.options.map(([val, txt]) =>
        `<option value="${esc(val)}" ${state.filters[f.key] === val ? "selected" : ""}>${esc(txt)}</option>`).join("");
      return `<div class="filter-field"><label>${f.label}</label><select data-filter="${f.key}">${opts}</select></div>`;
    }).join("");

    filterGridEl.querySelectorAll("[data-filter]").forEach(el => {
      el.addEventListener("change", () => {
        state.filters[el.getAttribute("data-filter")] = el.value;
        renderAll();
      });
    });

    const activeCount = Object.values(state.filters).filter(v => v).length;
    if (activeCount > 0) {
      filterNoteEl.classList.remove("hidden");
      filterNoteEl.textContent = `กำลังใช้ตัวกรอง ${activeCount} รายการ · พบ ${getRenderTasks().length} งาน`;
    } else {
      filterNoteEl.classList.add("hidden");
    }
  }
  $("#filter-clear-btn").addEventListener("click", () => {
    Object.keys(state.filters).forEach(k => state.filters[k] = "");
    renderAll();
  });

  /* ---------------- Card renderers ---------------- */
  function areaClass(t) { return t.areaStatus === "in" ? "" : "out"; }
  function areaLabel(t) { return t.areaStatus === "in" ? "ในพื้นที่" : "นอกพื้นที่"; }

  function miniCardHtml(t) {
    return `<div class="mini-card ${areaClass(t)}" data-task="${t.id}" title="${esc(t.title)} · ${esc(t.targetPEA)}">
      <div class="mc-row"><b>${esc(t.departTime)}</b> <span class="mc-tag">${areaLabel(t)}</span></div>
      <div class="mc-title">${esc(t.title)}</div>
      <div class="mc-pea">📍 ${esc(t.targetPEA)}</div>
    </div>`;
  }
  function fullCardHtml(t) {
    return `<button class="task-card ${areaClass(t)}" data-task="${t.id}">
      <div class="tc-time">🕐 ${esc(t.departTime)} น. · ${esc(t.jobType)}</div>
      <div class="tc-title">${esc(t.title)}</div>
      <div class="tc-area">📍 ${esc(t.workArea)} · ${esc(t.targetPEA)}</div>
      <div class="tc-badges">
        <span class="pill ${t.areaStatus === "in" ? "pill-in" : "pill-out"}">${areaLabel(t)}</span>
        ${t.priority === "ด่วน" ? `<span class="pill pill-urgent">ด่วน</span>` : ""}
        ${t.circuits.length ? `<span class="pill pill-circuit">${t.circuits.length} วงจร</span>` : ""}
      </div>
    </button>`;
  }

  function bindTaskClicks(root) {
    root.querySelectorAll("[data-task]").forEach(el => {
      el.addEventListener("click", (ev) => { ev.stopPropagation(); openModal(el.getAttribute("data-task")); });
    });
  }

  /* ---------------- Month view ---------------- */
  function renderMonthView() {
    const anchor = state.cursor;
    const startDow = firstOfMonth(anchor).getDay();
    const daysInMonth = lastOfMonth(anchor).getDate();
    const gridStart = addDays(firstOfMonth(anchor), -startDow);
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    let html = `<div class="weekday-row">${WD_SHORT.map((w, i) =>
      `<div class="wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("")}</div>`;
    html += `<div class="month-grid">`;
    for (let i = 0; i < totalCells; i++) {
      const d = addDays(gridStart, i);
      const iso = toISO(d);
      const dow = d.getDay();
      const holiday = HOLIDAYS[iso];
      const dayTasks = getTasksForDate(iso);
      const classes = ["day-cell"];
      if (d.getMonth() !== anchor.getMonth()) classes.push("out-month");
      if (dow === 0 || dow === 6) classes.push("weekend");
      if (holiday) classes.push("holiday");
      if (isSameDay(d, TODAY)) classes.push("is-today");
      if (isSameDay(d, state.selectedDate)) classes.push("is-selected");

      const shown = dayTasks.slice(0, 3);
      const more = dayTasks.length - shown.length;
      const isOTDay = dayTasks.length > 0 && (dow === 0 || dow === 6 || !!holiday);
      const dayPlans = plansForDate(iso);
      html += `<div class="${classes.join(" ")}" data-date="${iso}">
        <div class="day-cell-head">
          <span class="day-num">${d.getDate()}</span>
          <div class="day-cell-head-right">
            ${isOTDay ? `<span class="day-ot-badge">⚡ OT</span>` : ""}
            <span class="day-count-badge ${dayTasks.length === 0 ? "zero" : ""}">${dayTasks.length} งาน</span>
          </div>
        </div>
        ${holiday ? `<div class="holiday-name">${esc(holiday)}</div>` : ""}
        ${dayPlans.length ? `<div class="day-plan-badges">${dayPlans.map(p => `<span class="day-plan-badge ${p.area_status === "out" ? "out" : "in"}" title="แผนงานทีม: ${esc(p.target_pea || p.work_area || p.title || "")}">🧭 ${esc(p.target_pea || p.work_area || p.title || "แผนงานทีม")}</span>`).join("")}</div>` : ""}
        <div class="day-cards">
          ${shown.map(miniCardHtml).join("")}
          ${more > 0 ? `<div class="mini-more">+${more} เพิ่มเติม</div>` : ""}
        </div>
      </div>`;
    }
    html += `</div>`;
    calendarViewEl.innerHTML = html;

    calendarViewEl.querySelectorAll(".day-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        const iso = cell.getAttribute("data-date");
        const d = fromISO(iso);
        state.selectedDate = d;
        if (d.getMonth() !== state.cursor.getMonth() || d.getFullYear() !== state.cursor.getFullYear()) {
          state.cursor = d;
        }
        renderAll();
      });
    });
    bindTaskClicks(calendarViewEl);
  }

  /* ---------------- Week view ---------------- */
  function renderWeekView() {
    const start = startOfWeek(state.cursor);
    let html = `<div class="week-grid">`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const iso = toISO(d);
      const dow = d.getDay();
      const holiday = HOLIDAYS[iso];
      const dayTasks = getTasksForDate(iso);
      const classes = ["week-col"];
      if (dow === 0 || dow === 6) classes.push("weekend");
      if (holiday) classes.push("holiday");
      if (isSameDay(d, TODAY)) classes.push("is-today");
      if (isSameDay(d, state.selectedDate)) classes.push("is-selected");

      html += `<div class="${classes.join(" ")}" data-date="${iso}">
        <div class="week-col-head">
          <div class="wd-name">${WD_SHORT[dow]}</div>
          <div class="wd-num">${d.getDate()}</div>
          ${holiday ? `<div class="holiday-name">${esc(holiday)}</div>` : `<div class="day-count-badge ${dayTasks.length === 0 ? "zero" : ""}">${dayTasks.length} งาน</div>`}
        </div>
        <div class="week-col-cards">
          ${dayTasks.length ? dayTasks.map(fullCardHtml).join("") : `<div class="week-empty">ไม่มีงาน</div>`}
        </div>
      </div>`;
    }
    html += `</div>`;
    calendarViewEl.innerHTML = html;

    calendarViewEl.querySelectorAll(".week-col").forEach(col => {
      col.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-task]")) return;
        state.selectedDate = fromISO(col.getAttribute("data-date"));
        renderAll();
      });
    });
    bindTaskClicks(calendarViewEl);
  }

  /* ---------------- Day view ---------------- */
  function renderDayView() {
    const d = state.selectedDate;
    const iso = toISO(d);
    const dow = d.getDay();
    const holiday = HOLIDAYS[iso];
    const dayTasks = getTasksForDate(iso);
    let html = `<div class="day-view-head ${holiday ? "holiday" : ""}">
      <div>
        <div class="day-view-title ${dow === 0 || dow === 6 ? "weekend" : ""}">${WD_FULL[dow]} ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ. ${beYear(d)}</div>
        ${holiday ? `<div class="day-view-sub">🎌 ${esc(holiday)}</div>` : ""}
      </div>
      <span class="day-count-badge">${dayTasks.length} งาน</span>
    </div>`;
    html += `<div class="day-view-list">`;
    html += dayTasks.length ? dayTasks.map(fullCardHtml).join("") : `<div class="empty-state">ไม่มีงานในวันนี้</div>`;
    html += `</div>`;
    calendarViewEl.innerHTML = html;
    bindTaskClicks(calendarViewEl);
  }

  /* ---------------- Year view ---------------- */
  function renderYearView() {
    const year = state.cursor.getFullYear();
    let html = `<div class="year-grid">`;
    for (let m = 0; m < 12; m++) {
      const monthDate = new Date(year, m, 1);
      const startDow = monthDate.getDay();
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const monthTasks = getRenderTasks().filter(t => t.date.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`));
      const isCurrent = (year === TODAY.getFullYear() && m === TODAY.getMonth());

      let cells = "";
      for (let i = 0; i < startDow; i++) cells += `<div class="year-mini-cell out-month"></div>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dTasks = monthTasks.filter(t => t.date === iso);
        const cls = ["year-mini-cell"];
        if (HOLIDAYS[iso]) cls.push("is-holiday");
        else if (dTasks.some(t => t.priority === "ด่วน")) cls.push("has-urgent");
        else if (dTasks.length) cls.push("has-task");
        if (iso === TODAY_ISO) cls.push("is-today");
        cells += `<div class="${cls.join(" ")}" data-date="${iso}" title="${dTasks.length} งาน">${day}</div>`;
      }
      html += `<div class="year-month-card ${isCurrent ? "is-current" : ""}" data-month="${m}">
        <div class="year-month-title"><span>${THAI_MONTHS[m]}</span><span class="ym-count">${monthTasks.length} งาน</span></div>
        <div class="year-mini-grid">${cells}</div>
      </div>`;
    }
    html += `</div>`;
    calendarViewEl.innerHTML = html;

    calendarViewEl.querySelectorAll(".year-month-card").forEach(card => {
      card.addEventListener("click", (ev) => {
        const dateCell = ev.target.closest("[data-date]");
        const m = Number(card.getAttribute("data-month"));
        state.cursor = new Date(year, m, 1);
        state.selectedDate = dateCell ? fromISO(dateCell.getAttribute("data-date")) : new Date(year, m, 1);
        setView("month");
      });
    });
  }

  /* ---------------- Side panel ---------------- */
  function renderSidePanel() {
    const d = state.selectedDate;
    const iso = toISO(d);
    const dow = d.getDay();
    const holiday = HOLIDAYS[iso];
    const dayTasks = getTasksForDate(iso);
    sidePanelEl.innerHTML = `
      <div class="side-panel-title">รายละเอียดวันที่เลือก</div>
      <div class="side-panel-date" style="${dow === 0 || dow === 6 ? "color:var(--weekend-text)" : ""}">${WD_FULL[dow]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${beYear(d)}</div>
      ${holiday ? `<div class="side-panel-holiday">🎌 ${esc(holiday)}</div>` : ""}
      <div class="side-panel-count">พบทั้งหมด ${dayTasks.length} งาน</div>
      <div class="side-panel-list">
        ${dayTasks.length ? dayTasks.map(fullCardHtml).join("") : `<div class="side-panel-empty">ไม่มีงานในวันนี้</div>`}
      </div>`;
    bindTaskClicks(sidePanelEl);
  }

  /* ---------------- Modal ---------------- */
  function openModal(id) {
    const t = taskById[id];
    if (!t) return;
    modalBodyEl.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-id">รหัสงาน ${esc(t.id)}</div>
          <h2>${esc(t.title)}</h2>
          <div class="modal-badges">
            <span class="pill ${t.areaStatus === "in" ? "pill-in" : "pill-out"}">${areaLabel(t)}</span>
            ${t.priority === "ด่วน" ? `<span class="pill pill-urgent">งานด่วน</span>` : ""}
            <span class="status-pill status-${esc(t.status)}">${esc(t.status)}</span>
          </div>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <div class="detail-section">
          <div class="detail-section-title">ข้อมูลงานและกำหนดการ</div>
          <div class="detail-grid">
            ${detailItem("วันที่ปฏิบัติงาน", `${WD_FULL[fromISO(t.date).getDay()]} ${fromISO(t.date).getDate()} ${THAI_MONTHS[fromISO(t.date).getMonth()]} ${beYear(fromISO(t.date))}`)}
            ${detailItem("ประเภทงาน", t.jobType)}
            ${detailItem("เวลาออกเดินทาง", t.departTime + " น.")}
            ${detailItem("เวลานัดหมายหน้างาน", t.appointTime + " น.")}
            ${detailItem("พื้นที่ปฏิบัติงาน", t.workArea)}
            ${detailItem("การไฟฟ้าปลายทาง", t.targetPEA)}
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">วงจรที่ปฏิบัติงาน (รวม ${t.circuits.length} วงจร)</div>
          <div class="detail-list">${t.circuits.map(c => `<div>${esc(c)}</div>`).join("") || "-"}</div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">คำสั่งเดินทาง</div>
          <div class="detail-grid">
            ${detailItem("คำสั่งเดินทาง", t.travelOrder ? "มีคำสั่งเดินทาง (นอกพื้นที่)" : "ไม่มีคำสั่งเดินทาง (ในพื้นที่ต้นสังกัด)")}
            ${detailItem("เลขคำสั่งเดินทาง", t.travelOrderNo, true)}
            ${detailItem("สถานะคำสั่งเดินทาง", t.travelOrderStatus)}
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">ทีมปฏิบัติงานและทรัพยากร</div>
          <div class="detail-grid">
            <div class="detail-item" style="grid-column:1/-1">
              <div class="di-label">ทีมปฏิบัติงาน (${esc(t.team)})</div>
              <div class="detail-list">${(t.teamMembers || []).map(m => `<div>${esc(m)}</div>`).join("") || "-"}</div>
            </div>
            <div class="detail-item" style="grid-column:1/-1">
              <div class="di-label">รถที่ใช้</div>
              <div class="detail-list">${(t.vehicles || []).length ? t.vehicles.map(v => `<div>${esc(v.vehicle)}${v.driver ? ` — คนขับ: ${esc(v.driver)}` : ""}</div>`).join("") : "-"}</div>
            </div>
            ${detailItem("ผู้รับผิดชอบเตรียมอุปกรณ์", t.equipmentOwner)}
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">ผู้ประสานงาน</div>
          <div class="detail-grid">
            ${detailItem("ผู้ประสานงาน/เจ้าของงาน", t.coordinator)}
            ${detailItem("เบอร์โทรผู้ประสานงาน", t.coordinatorPhone, true)}
          </div>
        </div>
        ${t.note ? `<div class="detail-section"><div class="detail-section-title">หมายเหตุ</div><div class="note-box">${esc(t.note)}</div></div>` : ""}
      </div>
      <div class="detail-actions admin-only">
        ${t.status !== "เสร็จสิ้น" ? `<button class="btn-primary" id="mark-done-btn">✓ งานเสร็จสิ้น</button>` : ""}
        <button class="btn-secondary" id="edit-task-btn">✎ แก้ไขงาน</button>
        <button class="btn-danger" id="delete-task-btn">🗑 ลบงาน</button>
      </div>`;
    modalLocked = false;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    $("#edit-task-btn").addEventListener("click", () => openFormModal(t));
    $("#delete-task-btn").addEventListener("click", () => deleteTask(t));
    if ($("#mark-done-btn")) $("#mark-done-btn").addEventListener("click", () => markTaskDone(t));
  }
  async function markTaskDone(t) {
    if (!isAdmin()) return;
    const btn = $("#mark-done-btn");
    if (btn) { btn.disabled = true; btn.textContent = "กำลังบันทึก..."; }
    const { error } = await CAL_SB.from("calendar_tasks").update({ status: "เสร็จสิ้น" }).eq("id", t.id);
    if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); if (btn) { btn.disabled = false; btn.textContent = "✓ งานเสร็จสิ้น"; } return; }
    await loadTasks();
    closeModal();
    renderAll();
  }
  function detailItem(label, value, mono) {
    return `<div class="detail-item"><div class="di-label">${esc(label)}</div><div class="di-value ${mono ? "mono" : ""}">${esc(value)}</div></div>`;
  }
  function closeModal() { if (modalLocked) return; modalBackdropEl.classList.remove("open"); }
  modalBackdropEl.addEventListener("click", (ev) => { if (ev.target === modalBackdropEl) closeModal(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });

  /* ---------------- Task form (add / edit) ---------------- */
  function combinedOptions(constList, getter) {
    const s = new Set(constList);
    TASKS.forEach(t => { const v = getter(t); if (v) s.add(v); });
    return Array.from(s);
  }
  function datalistOptionsHtml(values) {
    return values.map(v => `<option value="${esc(v)}"></option>`).join("");
  }
  function datalistHtml(id, values) {
    return `<datalist id="${id}">${datalistOptionsHtml(values)}</datalist>`;
  }

  // เลือก "พื้นที่ปฏิบัติงาน" เป็นจังหวัด (หรือชื่ออำเภอที่รู้จัก) แล้ว กรอง "การไฟฟ้าปลายทาง" ให้เหลือ
  // เฉพาะของจังหวัดนั้น — ถ้าพื้นที่ที่พิมพ์ไม่ตรงกับจังหวัดที่รู้จัก จะโชว์ตัวเลือกทั้งหมดแทน (กันพลาด)
  function provinceOfWorkArea(workAreaValue) {
    const v = (workAreaValue || "").trim();
    if (!v) return null;
    if (TARGET_PEA_BY_PROVINCE[v]) return v;
    if (PROVINCE_ALIASES[v]) return PROVINCE_ALIASES[v];
    return null;
  }
  function targetPeaOptionsForWorkArea(allOpts, workAreaValue) {
    const province = provinceOfWorkArea(workAreaValue);
    if (!province) return allOpts;
    const inProvince = new Set(TARGET_PEA_BY_PROVINCE[province] || []);
    const filtered = allOpts.filter(v => inProvince.has(v));
    return filtered.length ? filtered : allOpts;
  }

  // ชื่อวงจรส่วนใหญ่เป็นรูปแบบ "รหัส-เลข" (เช่น BWA-01..BWA-10) — จัดกลุ่มตามรหัสแล้วโชว์แค่ตัวเลข
  // เพื่อลดความลายตา/เสี่ยงติ๊กผิดวงจรตอนหน้างาน แทนที่จะแสดงชื่อเต็มซ้ำๆ กันเป็นสิบรายการ
  function groupCircuitOptions(circuitOpts) {
    const groups = {};
    const others = [];
    circuitOpts.forEach(c => {
      const m = /^([A-Za-z]+)-(\d+)$/.exec(c);
      if (m) { (groups[m[1]] = groups[m[1]] || []).push({ value: c, num: m[2] }); }
      else others.push(c);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => Number(a.num) - Number(b.num)));
    return { groups, others };
  }
  function circuitPickerHtml(circuitOpts, selected) {
    const { groups, others } = groupCircuitOptions(circuitOpts);
    const codes = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    let html = codes.length ? `<div class="circuit-groups">` + codes.map(code => {
      const items = groups[code];
      return `<div class="circuit-group">
        <div class="circuit-group-title"><span>${esc(code)}</span><span class="circuit-group-count">${items.length} วงจร</span></div>
        <div class="circuit-num-grid">
          ${items.map(it => `<label class="circuit-num-chip ${selected.includes(it.value) ? "is-checked" : ""}" title="${esc(it.value)}"><input type="checkbox" name="circuit" value="${esc(it.value)}" ${selected.includes(it.value) ? "checked" : ""}/>${esc(it.num)}</label>`).join("")}
        </div>
      </div>`;
    }).join("") + `</div>` : "";
    if (others.length) {
      html += `<div class="check-grid" style="margin-top:${codes.length ? "8px" : "0"}">${others.map(c => `<label class="check-option"><input type="checkbox" name="circuit" value="${esc(c)}" ${selected.includes(c) ? "checked" : ""}/> ${esc(c)}</label>`).join("")}</div>`;
    }
    return html;
  }
  function showFormError(msg) {
    const el = $("#form-error");
    if (el) el.innerHTML = `<div class="form-error">${esc(msg)}</div>`;
  }

  function buildFormHtml(task) {
    const isEdit = !!task;
    const t = task || {
      title: "", date: toISO(state.selectedDate), departTime: "08:00", appointTime: "08:30",
      jobType: JOB_TYPES[0], workArea: "", targetPEA: "", areaStatus: "in", priority: "ตามแผน",
      travelOrderNo: "", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "", teamMembers: [], vehicles: [],
      circuits: [], equipment: [], equipmentOwner: "", coordinator: "", coordinatorPhone: "", status: "วางแผน", note: ""
    };
    // พื้นที่ปฏิบัติงานเป็นดรอปดาวเลือกอย่างเดียว (ห้ามพิมพ์เอง กันเลือกผิด) — ถ้างานเดิมมีค่าที่ไม่อยู่ใน
    // รายการปัจจุบันแล้ว (เช่นตัวเลือกถูกลบไปทีหลัง) ให้แทรกไว้เป็นตัวเลือกพิเศษ กันข้อมูลเดิมหาย
    const workAreaOptsForSelect = t.workArea && !WORK_AREAS.includes(t.workArea) ? [...WORK_AREAS, t.workArea] : WORK_AREAS;
    const targetPEAOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
    const targetPeaFilteredOpts = targetPeaOptionsForWorkArea(targetPEAOpts, t.workArea);
    const targetPeaOptsForSelect = t.targetPEA && !targetPeaFilteredOpts.includes(t.targetPEA)
      ? [...targetPeaFilteredOpts, t.targetPEA] : targetPeaFilteredOpts;
    // รายการรถให้เลือกเฉพาะรถในทะเบียนจริง (VEHICLES) เท่านั้น — ไม่ต้องมี safety net เหมือน
    // workArea/targetPEA เพราะช่อง "อื่นๆ (ระบุเอง)" รองรับค่าที่ไม่อยู่ในทะเบียนอยู่แล้ว
    // (ถ้าเผื่อค่าจากงานอื่นๆ ปนเข้ามาด้วย ชื่อรถที่เคยพิมพ์ในงานหนึ่งจะโผล่เป็นตัวเลือกถาวรของงานอื่น)
    const vehicleOptsForSelect = VEHICLES;
    const teamOpts = combinedOptions(Object.keys(TEAMS), x => x.team);
    const extraEquipment = t.equipment.filter(e => !EQUIPMENT_POOL.includes(e));
    const extraMembers = (t.teamMembers || []).filter(m => !EMPLOYEES.some(e => m.includes(e.name)));
    const circuitOpts = Array.from(new Set([...CIRCUITS, ...TASKS.flatMap(x => x.circuits || [])]));
    const extraCircuits = (t.circuits || []).filter(c => !circuitOpts.includes(c));

    function vehicleAssignRowHtml(i) {
      const existing = (t.vehicles || [])[i] || {};
      const isOther = !!existing.vehicle && !vehicleOptsForSelect.includes(existing.vehicle);
      return `
        <div class="vehicle-assign-row" data-row="${i + 1}">
          <select name="vehicle${i + 1}" class="va-vehicle-select">
            <option value="">— รถคันที่ ${i + 1}: ไม่ใช้ —</option>
            ${vehicleOptsForSelect.map(v => `<option value="${esc(v)}" ${existing.vehicle === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
            <option value="__other__" ${isOther ? "selected" : ""}>อื่นๆ (ระบุเอง)</option>
          </select>
          <input type="text" name="vehicleOther${i + 1}" class="va-vehicle-other-input ${isOther ? "" : "hidden"}" placeholder="ระบุชื่อ/ทะเบียนรถคันอื่น" value="${esc(isOther ? existing.vehicle : "")}" />
          <select name="driver${i + 1}" class="va-driver-select" ${existing.vehicle ? "" : "disabled"}>
            <option value="">— ระบุคนขับ (ไม่บังคับ) —</option>
          </select>
        </div>`;
    }

    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">${isEdit ? "แก้ไขงาน " + esc(t.id) : "เพิ่มงานใหม่"}</div>
          <h2>${isEdit ? "แก้ไขข้อมูลงาน" : "เพิ่มงานปฏิบัติงานใหม่"}</h2>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <form id="task-form">
          <div class="form-grid">
            <div class="form-field span2">
              <label>ชื่องาน <span class="req">*</span></label>
              <input type="text" name="title" required value="${esc(t.title)}" placeholder="เช่น ปฏิบัติงาน Hotline เปลี่ยนลูกถ้วยแขวนชำรุด" />
            </div>
            <div class="form-field">
              <label>วันที่ปฏิบัติงาน <span class="req">*</span></label>
              <input type="date" name="date" required value="${esc(t.date)}" />
            </div>
            <div class="form-field">
              <label>ประเภทงาน <span class="req">*</span></label>
              <select name="jobType" required>${JOB_TYPES.map(v => `<option value="${esc(v)}" ${t.jobType === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
            </div>
            <div class="form-field">
              <label>เวลาออกเดินทาง (24 ชม.)</label>
              <input type="text" inputmode="numeric" name="departTime" value="${esc(t.departTime)}" placeholder="เช่น 07:30" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" maxlength="5" />
            </div>
            <div class="form-field">
              <label>เวลานัดหมายหน้างาน (24 ชม.)</label>
              <input type="text" inputmode="numeric" name="appointTime" value="${esc(t.appointTime)}" placeholder="เช่น 16:30" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" maxlength="5" />
            </div>
            <div class="form-field">
              <label>พื้นที่ปฏิบัติงาน <span class="req">*</span></label>
              <select name="workArea" required>
                <option value="" ${t.workArea ? "" : "selected"} disabled>— เลือกพื้นที่ปฏิบัติงาน —</option>
                ${workAreaOptsForSelect.map(v => `<option value="${esc(v)}" ${t.workArea === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
              </select>
            </div>
            <div class="form-field">
              <label>การไฟฟ้าปลายทาง <span class="req">*</span></label>
              <select name="targetPEA" required>
                <option value="" ${t.targetPEA ? "" : "selected"} disabled>— เลือกการไฟฟ้าปลายทาง —</option>
                ${targetPeaOptsForSelect.map(v => `<option value="${esc(v)}" ${t.targetPEA === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
              </select>
              <div class="form-hint">เลือกพื้นที่ปฏิบัติงานเป็นจังหวัดก่อน รายการตรงนี้จะกรองเหลือเฉพาะการไฟฟ้าในจังหวัดนั้นให้อัตโนมัติ</div>
            </div>
            <div class="form-field span2">
              <label>สถานะพื้นที่ปฏิบัติงาน</label>
              <div class="radio-group" id="area-status-group">
                <label class="radio-option ${t.areaStatus === "in" ? "checked-in" : ""}"><input type="radio" name="areaStatus" value="in" ${t.areaStatus === "in" ? "checked" : ""}/> 🟢 ในพื้นที่ต้นสังกัด</label>
                <label class="radio-option ${t.areaStatus === "out" ? "checked-out" : ""}"><input type="radio" name="areaStatus" value="out" ${t.areaStatus === "out" ? "checked" : ""}/> 🟠 นอกพื้นที่ (มีคำสั่งเดินทาง)</label>
              </div>
            </div>
            <div class="form-field" id="travel-no-field">
              <label>เลขคำสั่งเดินทาง</label>
              <input type="text" name="travelOrderNo" value="${esc(t.travelOrderNo === "-" ? "" : t.travelOrderNo)}" placeholder="เช่น คส.นอกพื้นที่ 001/2569" />
            </div>
            <div class="form-field" id="travel-status-field">
              <label>สถานะคำสั่งเดินทาง</label>
              <select name="travelOrderStatus">${TRAVEL_ORDER_STATUS_OPTIONS.map(v => `<option value="${esc(v)}" ${t.travelOrderStatus === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
            </div>
            <div class="form-field">
              <label>ชื่อทีม / ป้ายกำกับงานนี้</label>
              <input type="text" name="team" id="team-input" list="dl-team" value="${esc(t.team)}" placeholder="เช่น ทีม A หรือ ตั้งชื่อเองได้ เช่น ทีมออกบางปะกง" />
              <div class="form-hint">พิมพ์ชื่อทีมที่เคยมี แล้วออกจากช่อง ระบบจะช่วยเลือกรายชื่อทีมนั้นให้ หรือจะตั้งชื่อเองก็ได้</div>
            </div>
            <div class="form-field span2">
              <label>ชื่อวงจรที่ปฏิบัติงาน (เลือกได้มากกว่า 1 วงจร) <span class="circuit-sum-badge" id="circuit-sum-badge">รวม ${t.circuits.length} วงจร</span></label>
              <div id="circuit-check-grid">
                ${circuitOpts.length ? circuitPickerHtml(circuitOpts, t.circuits) : `<span class="form-hint">ยังไม่มีรายชื่อวงจรในระบบ — เพิ่มได้ที่ "⚙ จัดการตัวเลือก"</span>`}
              </div>
              <input type="text" name="circuitOther" style="margin-top:6px" placeholder="ชื่อวงจรอื่นๆ นอกเหนือรายการ (คั่นด้วยจุลภาค)" value="${esc(extraCircuits.join(", "))}" />
            </div>
            <div class="form-field span2">
              <label>คนที่ไปงานนี้ (เลือกชื่อ — จัดทีมตามความเหมาะสมของแต่ละงานได้อิสระ)</label>
              <div class="check-grid" id="team-check-grid">
                ${EMPLOYEES.map(e => `<label class="check-option"><input type="checkbox" name="teamMemberEmp" value="${esc(e.name)}" ${t.teamMembers.some(m => m.includes(e.name)) ? "checked" : ""}/> ${esc(e.name)}${e.position ? ` (${esc(e.position)})` : ""}</label>`).join("") || `<span class="form-hint">ยังไม่มีรายชื่อพนักงานในระบบ — เพิ่มได้ที่ปฏิทินรายบุคคล</span>`}
              </div>
              <input type="text" name="teamMembersOther" style="margin-top:6px" placeholder="ชื่อเพิ่มเติมนอกทะเบียนพนักงาน (คั่นด้วยจุลภาค)" value="${esc(extraMembers.join(", "))}" />
            </div>
            <div class="form-field span2">
              <label>รถที่ใช้ (เลือกได้สูงสุด 2 คัน)</label>
              <div class="vehicle-assign-rows" id="vehicle-assign-rows">
                ${vehicleAssignRowHtml(0)}
                ${vehicleAssignRowHtml(1)}
              </div>
              <div class="form-hint">ถ้าใช้รถคันอื่นนอกทะเบียน เลือก "อื่นๆ (ระบุเอง)" แล้วพิมพ์ชื่อ/ทะเบียนได้ — เลือกคนขับให้รถคันหนึ่งแล้ว ชื่อนั้นจะไม่ขึ้นให้เลือกซ้ำกับอีกคัน (ไม่บังคับต้องระบุคนขับ)</div>
            </div>
            <div class="form-field span2">
              <div class="equip-pick-head">
                <label>อุปกรณ์ที่ต้องใช้</label>
                <button type="button" class="equip-pick-toggle" id="equip-pick-toggle">เลือกอุปกรณ์ (เลือกไว้ <span id="equip-pick-count">${t.equipment.filter(e => EQUIPMENT_POOL.includes(e)).length}</span>/${EQUIPMENT_POOL.length}) ▾</button>
              </div>
              <div class="check-grid hidden" id="equipment-check-grid">
                <label class="check-option check-option-all"><input type="checkbox" id="equip-select-all-cb" /> <b>เลือกทั้งหมด</b></label>
                ${EQUIPMENT_POOL.map(item => `<label class="check-option"><input type="checkbox" name="equipment" value="${esc(item)}" ${t.equipment.includes(item) ? "checked" : ""}/> ${esc(item)}</label>`).join("")}
              </div>
              <input type="text" name="equipmentOther" style="margin-top:6px" placeholder="อุปกรณ์อื่นๆ นอกเหนือรายการ (คั่นด้วยจุลภาค)" value="${esc(extraEquipment.join(", "))}" />
            </div>
            <div class="form-field">
              <label>ผู้รับผิดชอบเตรียมอุปกรณ์</label>
              <input type="text" name="equipmentOwner" value="${esc(t.equipmentOwner)}" />
            </div>
            <div class="form-field">
              <label>สถานะงาน</label>
              <select name="status">${STATUS_OPTIONS.map(v => `<option value="${esc(v)}" ${t.status === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
            </div>
            <div class="form-field">
              <label>ผู้ประสานงาน/เจ้าของงาน</label>
              <input type="text" name="coordinator" value="${esc(t.coordinator)}" />
            </div>
            <div class="form-field">
              <label>เบอร์โทรผู้ประสานงาน</label>
              <input type="tel" name="coordinatorPhone" value="${esc(t.coordinatorPhone)}" placeholder="08x-xxx-xxxx" />
            </div>
            <div class="form-field span2">
              <label class="urgent-toggle"><input type="checkbox" name="urgent" ${t.priority === "ด่วน" ? "checked" : ""}/> ⚡ เลือกถ้าเป็นงานด่วน (ไม่เลือก = งานตามแผน)</label>
            </div>
            <div class="form-field span2">
              <label>หมายเหตุ</label>
              <textarea name="note">${esc(t.note)}</textarea>
            </div>
          </div>
          <div id="form-error"></div>
          <div class="form-actions">
            <span class="form-hint">${isEdit ? "แก้ไขแล้วกด “บันทึกการแก้ไข”" : "กรอกข้อมูลแล้วกด “บันทึกงาน” เพื่อเพิ่มลงปฏิทินทันที"}</span>
            <div class="form-actions-right">
              <button type="button" class="btn-secondary" id="form-cancel-btn">ยกเลิก</button>
              <button type="submit" class="btn-primary">${isEdit ? "บันทึกการแก้ไข" : "บันทึกงาน"}</button>
            </div>
          </div>
        </form>
      </div>
      ${datalistHtml("dl-team", teamOpts)}
    `;
  }

  function openFormModal(task) {
    if (!isAdmin()) return;
    modalLocked = false;
    modalBodyEl.innerHTML = buildFormHtml(task);
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    $("#form-cancel-btn").addEventListener("click", closeModal);

    const travelNoField = $("#travel-no-field");
    const travelStatusField = $("#travel-status-field");
    const travelStatusSelect = travelStatusField.querySelector("select[name=travelOrderStatus]");
    function syncAreaStatus(userTriggered) {
      const val = document.querySelector("input[name=areaStatus]:checked").value;
      document.querySelectorAll("#area-status-group .radio-option").forEach(o => o.classList.remove("checked-in", "checked-out"));
      document.querySelector(`input[name=areaStatus][value=${val}]`).closest(".radio-option").classList.add(val === "in" ? "checked-in" : "checked-out");
      travelNoField.style.display = val === "out" ? "" : "none";
      travelStatusField.style.display = val === "out" ? "" : "none";
      // Keep the travel-order-status select consistent with the radio choice so a
      // "out of area" task never gets saved with the "no order needed" status.
      if (userTriggered) {
        if (val === "out" && travelStatusSelect.value === "ไม่ต้องขอคำสั่ง") travelStatusSelect.value = "รออนุมัติ";
        if (val === "in") travelStatusSelect.value = "ไม่ต้องขอคำสั่ง";
      }
    }
    document.querySelectorAll("input[name=areaStatus]").forEach(r => r.addEventListener("change", () => syncAreaStatus(true)));
    syncAreaStatus(false);

    document.querySelectorAll('input[name=departTime], input[name=appointTime]').forEach(attachTime24Formatter);

    const circuitGrid = $("#circuit-check-grid");
    const circuitSumBadge = $("#circuit-sum-badge");
    if (circuitGrid && circuitSumBadge) {
      circuitGrid.addEventListener("change", (ev) => {
        const n = circuitGrid.querySelectorAll('input[name=circuit]:checked').length;
        circuitSumBadge.textContent = `รวม ${n} วงจร`;
        const chip = ev.target.closest(".circuit-num-chip");
        if (chip) chip.classList.toggle("is-checked", ev.target.checked);
      });
    }

    // รายการอุปกรณ์ยาว — พับเก็บไว้เป็นค่าเริ่มต้น กดปุ่มค่อยขยายออกมาเลือก + มีติ๊ก "เลือกทั้งหมด"
    const equipPickToggle = $("#equip-pick-toggle");
    const equipCheckGrid = $("#equipment-check-grid");
    const equipPickCount = $("#equip-pick-count");
    const equipSelectAllCb = $("#equip-select-all-cb");
    if (equipPickToggle && equipCheckGrid) {
      equipPickToggle.addEventListener("click", () => {
        equipCheckGrid.classList.toggle("hidden");
        equipPickToggle.classList.toggle("open", !equipCheckGrid.classList.contains("hidden"));
      });
      const equipCbs = Array.from(equipCheckGrid.querySelectorAll('input[name=equipment]'));
      function updateEquipPickCount() {
        const n = equipCbs.filter(cb => cb.checked).length;
        equipPickCount.textContent = n;
        equipSelectAllCb.checked = n === equipCbs.length;
        equipSelectAllCb.indeterminate = n > 0 && n < equipCbs.length;
      }
      equipSelectAllCb.addEventListener("change", () => {
        equipCbs.forEach(cb => { cb.checked = equipSelectAllCb.checked; });
        updateEquipPickCount();
      });
      equipCbs.forEach(cb => cb.addEventListener("change", updateEquipPickCount));
      updateEquipPickCount();
    }

    // เลือก "พื้นที่ปฏิบัติงาน" เป็นจังหวัด แล้วกรองรายการ "การไฟฟ้าปลายทาง" ให้เหลือเฉพาะจังหวัดนั้น
    // (เปลี่ยนจังหวัดแล้วต้องเลือกการไฟฟ้าปลายทางใหม่ ของเดิมอาจไม่อยู่ในจังหวัดใหม่แล้ว)
    const workAreaSelectForFilter = document.querySelector('select[name=workArea]');
    const targetPeaSelectEl = document.querySelector('select[name=targetPEA]');
    workAreaSelectForFilter.addEventListener("change", () => {
      const allOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
      const filtered = targetPeaOptionsForWorkArea(allOpts, workAreaSelectForFilter.value);
      targetPeaSelectEl.innerHTML = `<option value="" selected disabled>— เลือกการไฟฟ้าปลายทาง —</option>` +
        filtered.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    });

    // รถที่ใช้ + คนขับ: รายชื่อคนขับดึงจากพนักงานทั้งหมดในทีม (ไม่ต้องติ๊ก "คนที่ไปงานนี้" ก่อน)
    // ห้ามเลือกรถซ้ำคันหรือคนขับซ้ำคนระหว่าง 2 แถว
    function currentTeamMemberNames() {
      // "พขร." เป็นตัวเลือกคนขับทั่วไป ไม่ผูกกับพนักงานคนใดคนหนึ่งในระบบ (ยังไม่มีชื่อจริงให้ใส่)
      return [...EMPLOYEES.map(e => e.name), "พขร."];
    }
    function vehicleDriverRows() {
      return [1, 2].map(i => ({
        vSel: document.querySelector(`select[name=vehicle${i}]`),
        dSel: document.querySelector(`select[name=driver${i}]`),
        vOtherInput: document.querySelector(`input[name=vehicleOther${i}]`)
      }));
    }
    function populateDriverOptions(forceValues) {
      const names = currentTeamMemberNames();
      vehicleDriverRows().forEach((row, idx) => {
        const want = forceValues && forceValues[idx] !== undefined ? forceValues[idx] : row.dSel.value;
        const candidates = want && !names.includes(want) ? [...names, want] : names;
        row.dSel.innerHTML = `<option value="">— ระบุคนขับ —</option>` +
          candidates.map(n => `<option value="${esc(n)}" ${want === n ? "selected" : ""}>${esc(n)}${names.includes(n) ? "" : " (ไม่ได้อยู่ในทีมแล้ว)"}</option>`).join("");
      });
      syncVehicleDriverRows();
    }
    function syncVehicleDriverRows() {
      const rows = vehicleDriverRows();
      rows.forEach((row, idx) => {
        const other = rows[1 - idx];
        // "อื่นๆ (ระบุเอง)" ไม่ผูกเป็นรถคันเดียวกันเสมอไป เลยไม่กันซ้ำแบบรถในทะเบียน
        Array.from(row.vSel.options).forEach(opt => {
          if (opt.value && opt.value !== "__other__") opt.disabled = opt.value === other.vSel.value;
        });
        Array.from(row.dSel.options).forEach(opt => { if (opt.value) opt.disabled = opt.value === other.dSel.value; });
        const hasVehicle = !!row.vSel.value;
        row.dSel.disabled = !hasVehicle;
        if (!hasVehicle && row.dSel.value) row.dSel.value = "";
        if (row.vOtherInput) row.vOtherInput.classList.toggle("hidden", row.vSel.value !== "__other__");
      });
    }
    document.querySelectorAll(".va-vehicle-select, .va-driver-select").forEach(sel => {
      sel.addEventListener("change", () => syncVehicleDriverRows());
    });
    populateDriverOptions([
      ((task && task.vehicles) || [])[0] ? task.vehicles[0].driver || "" : "",
      ((task && task.vehicles) || [])[1] ? task.vehicles[1].driver || "" : ""
    ]);

    // การไฟฟ้าต้นสังกัด (บางปะกง) — เลือกแล้วช่วยติ๊ก "ในพื้นที่" ให้ (แก้เองได้ทีหลัง)
    targetPeaSelectEl.addEventListener("change", () => {
      if (isHomeUnitPea(targetPeaSelectEl.value)) {
        const inRadio = document.querySelector('input[name=areaStatus][value=in]');
        if (inRadio && !inRadio.checked) { inRadio.checked = true; syncAreaStatus(true); }
      }
    });

    $("#team-input").addEventListener("change", (ev) => {
      const preset = TEAMS[ev.target.value];
      if (!preset) return;
      document.querySelectorAll('input[name=teamMemberEmp]').forEach(cb => {
        cb.checked = preset.some(m => m.includes(cb.value));
      });
    });

    $("#task-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      submitTaskForm(ev.target, task);
    });
  }

  async function submitTaskForm(form, existingTask) {
    if (!isAdmin()) return;
    const fd = new FormData(form);
    const title = (fd.get("title") || "").trim();
    const date = fd.get("date");
    const workArea = (fd.get("workArea") || "").trim();
    const targetPEA = (fd.get("targetPEA") || "").trim();
    if (!title || !date || !workArea || !targetPEA) {
      showFormError("กรุณากรอกชื่องาน วันที่ พื้นที่ปฏิบัติงาน และการไฟฟ้าปลายทางให้ครบ");
      return;
    }
    const departTimeVal = (fd.get("departTime") || "").trim();
    const appointTimeVal = (fd.get("appointTime") || "").trim();
    if (departTimeVal && !isValidTime24(departTimeVal)) {
      showFormError("รูปแบบเวลาออกเดินทางไม่ถูกต้อง กรุณากรอกแบบ 24 ชม. เช่น 07:30");
      return;
    }
    if (appointTimeVal && !isValidTime24(appointTimeVal)) {
      showFormError("รูปแบบเวลานัดหมายหน้างานไม่ถูกต้อง กรุณากรอกแบบ 24 ชม. เช่น 16:30");
      return;
    }
    const areaStatus = fd.get("areaStatus") || "in";
    const equipment = fd.getAll("equipment");
    const otherEquipment = (fd.get("equipmentOther") || "").split(",").map(s => s.trim()).filter(Boolean);
    const checkedMembers = fd.getAll("teamMemberEmp").map(name => {
      const e = EMPLOYEES.find(x => x.name === name);
      return e && e.position ? `${e.name} (${e.position})` : name;
    });
    const otherMembers = (fd.get("teamMembersOther") || "").split(",").map(s => s.trim()).filter(Boolean);
    const teamMembers = [...checkedMembers, ...otherMembers];
    const checkedCircuits = fd.getAll("circuit");
    const otherCircuits = (fd.get("circuitOther") || "").split(",").map(s => s.trim()).filter(Boolean);
    const circuits = [...checkedCircuits, ...otherCircuits];
    const vehicleAssignments = [1, 2]
      .map(i => {
        const picked = (fd.get(`vehicle${i}`) || "").trim();
        const vehicle = picked === "__other__" ? (fd.get(`vehicleOther${i}`) || "").trim() : picked;
        return { vehicle, driver: (fd.get(`driver${i}`) || "").trim() };
      })
      .filter(v => v.vehicle)
      .map(v => ({ vehicle: v.vehicle, driver: v.driver || null }));

    const row = {
      title,
      task_date: date,
      depart_time: departTimeVal || null,
      appoint_time: appointTimeVal || null,
      job_type: fd.get("jobType"),
      work_area: workArea,
      target_pea: targetPEA,
      area_status: areaStatus,
      priority: fd.get("urgent") ? "ด่วน" : "ตามแผน",
      travel_order: areaStatus === "out",
      travel_order_no: areaStatus === "out" ? ((fd.get("travelOrderNo") || "").trim() || null) : null,
      travel_order_status: areaStatus === "out" ? fd.get("travelOrderStatus") : "ไม่ต้องขอคำสั่ง",
      team: (fd.get("team") || "").trim() || null,
      team_members: teamMembers,
      vehicle_assignments: vehicleAssignments,
      circuits,
      equipment: [...equipment, ...otherEquipment],
      equipment_owner: (fd.get("equipmentOwner") || "").trim() || null,
      coordinator: (fd.get("coordinator") || "").trim() || null,
      coordinator_phone: (fd.get("coordinatorPhone") || "").trim() || null,
      status: fd.get("status"),
      note: (fd.get("note") || "").trim() || null
    };

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังบันทึก...";

    const { error } = existingTask
      ? await CAL_SB.from("calendar_tasks").update(row).eq("id", existingTask.id)
      : await CAL_SB.from("calendar_tasks").insert([row]);

    if (error) {
      showFormError("บันทึกไม่สำเร็จ: " + error.message);
      submitBtn.disabled = false;
      submitBtn.textContent = existingTask ? "บันทึกการแก้ไข" : "บันทึกงาน";
      return;
    }

    await loadTasks();
    await ensureTeamPlanForTask(row);
    state.selectedDate = fromISO(date);
    closeModal();
    renderAll();
  }

  // งานที่กรอกในปฏิทินแล้วออกนอกพื้นที่ต้นสังกัด (areaStatus "out") ให้ขึ้นในตารางแผนงานประจำเดือนด้วย
  // โดยไม่ต้องมากรอกซ้ำ — เติมแค่ตอนยังไม่มีแผนงานปลายทางเดียวกันครอบคลุมวันนั้นอยู่แล้ว กันสร้างซ้ำซ้อน
  async function ensureTeamPlanForTask(row) {
    if (row.area_status !== "out" || !row.target_pea) return;
    const covered = TEAM_PLANS.some(p => p.target_pea === row.target_pea && row.task_date >= p.date_from && row.task_date <= p.date_to);
    if (covered) return;
    const planRow = {
      title: row.target_pea,
      date_from: row.task_date,
      date_to: row.task_date,
      work_area: row.work_area || null,
      target_pea: row.target_pea,
      area_status: "out",
      coordinator: row.coordinator || null,
      coordinator_phone: row.coordinator_phone || null,
      budget_ref_status: "none",
      budget_ref_no: null
    };
    const { error } = await CAL_SB.from("calendar_team_plans").insert([planRow]);
    if (!error) await loadTeamPlans();
  }

  async function deleteTask(t) {
    if (!isAdmin()) return;
    if (!confirm(`ยืนยันลบงาน "${t.title}" วันที่ ${t.date} ใช่หรือไม่?`)) return;
    const { error } = await CAL_SB.from("calendar_tasks").delete().eq("id", t.id);
    if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
    await loadTasks();
    closeModal();
    renderAll();
  }

  addTaskBtnEl.addEventListener("click", () => openFormModal(null));

  /* ---------------- Person modal: individual calendar / leave / OT ---------------- */
  const personState = { employeeName: "", cursor: new Date(TODAY), mode: "individual" };

  function computeEmployeeMonthStats(employeeName, year, month0) {
    const monthData = getPersonMonthData(employeeName, year, month0);
    return {
      workDays: monthData.filter(d => d.worked && !d.leave).length,
      travelOrderDays: monthData.filter(d => d.hasTravelOrder).length,
      inAreaDays: monthData.filter(d => d.inArea).length,
      otDays: monthData.filter(d => d.isOT).length,
      leaveDays: monthData.filter(d => d.leave).length
    };
  }

  function buildTeamSummaryHtml(year, month0) {
    if (!EMPLOYEES.length) return `<div class="empty-state">ยังไม่มีรายชื่อพนักงานในระบบ</div>`;
    const bizDays = businessDaysProgress(year, month0);
    // หัวหน้าชุด (role_title) ให้อยู่แถวบนสุดเสมอ ไม่ว่าชื่อจะเรียงตามตัวอักษรตรงไหน
    const sortedEmployees = EMPLOYEES.slice().sort((a, b) => (b.role_title ? 1 : 0) - (a.role_title ? 1 : 0));
    const rows = sortedEmployees.map(e => ({ e, stats: computeEmployeeMonthStats(e.name, year, month0) }));
    return `
      <div class="team-summary-wrap">
        <table class="team-summary-table">
          <thead>
            <tr>
              <th>ทีมปฏิบัติงาน Hotline</th>
              <th>ปฏิบัติงาน / วันทำการ</th>
              <th>คำสั่งเดินทาง</th>
              <th>ประจำสำนักงาน</th>
              <th>OT</th>
              <th>ลา</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ e, stats }) => `
              <tr class="team-summary-row" data-employee="${esc(e.name)}">
                <td class="ts-name-cell">
                  ${esc(e.name)}${e.role_title ? ` <span class="role-title-badge">${esc(e.role_title)}</span>` : ""}
                  ${e.position ? `<div class="form-hint">${esc(e.position)}</div>` : ""}
                </td>
                <td>${stats.workDays}/${bizDays.total} วัน</td>
                <td>${stats.travelOrderDays} วัน</td>
                <td>${stats.inAreaDays} วัน</td>
                <td>${stats.otDays} วัน</td>
                <td>${stats.leaveDays} วัน</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="form-hint" style="margin-top:8px;">คลิกชื่อพนักงานเพื่อดูปฏิทิน/รายละเอียดรายบุคคล</div>`;
  }

  function showLeaveFormError(msg) {
    const el = $("#leave-form-error");
    if (el) el.innerHTML = `<div class="form-error">${esc(msg)}</div>`;
  }
  function showLeaveFormSuccess(msg) {
    const el = $("#leave-form-error");
    if (el) el.innerHTML = `<div class="form-success">${esc(msg)}</div>`;
  }

  function buildPersonModalHtml() {
    if (!personState.employeeName && EMPLOYEES.length) personState.employeeName = EMPLOYEES[0].name;
    const employee = personState.employeeName;
    const empObj = EMPLOYEES.find(e => e.name === employee) || null;
    const cursor = personState.cursor;
    const year = cursor.getFullYear(), month0 = cursor.getMonth();
    const monthData = employee ? getPersonMonthData(employee, year, month0) : [];
    const leaveDays = monthData.filter(d => d.leave);
    const otDays = monthData.filter(d => d.isOT).length;
    const travelOrderDays = monthData.filter(d => d.hasTravelOrder).length;
    const inAreaDays = monthData.filter(d => d.inArea).length;
    const taskCount = monthData.reduce((sum, d) => sum + (d.leave ? 0 : d.tasksForDay.length), 0);
    const bizDays = businessDaysProgress(year, month0);

    const leaveByType = {};
    leaveDays.forEach(d => { d.leaves.forEach(l => { leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + 1; }); });

    const startDow = new Date(year, month0, 1).getDay();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    monthData.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);

    const employeeLeaves = LEAVES.filter(l => l.employee_name === employee).sort((a, b) => b.date_from.localeCompare(a.date_from));

    const mode = personState.mode === "team" ? "team" : "individual";

    return `
        ${EMPLOYEES.length ? `
        <div class="person-toolbar">
          <div class="person-mode-switch">
            <button type="button" class="pm-tab ${mode === "individual" ? "active" : ""}" data-mode="individual">รายบุคคล</button>
            <button type="button" class="pm-tab ${mode === "team" ? "active" : ""}" data-mode="team">สรุปทีมรายเดือน</button>
          </div>
          ${mode === "individual" ? `<select id="person-select">${EMPLOYEES.map(e => `<option value="${esc(e.name)}" ${e.name === employee ? "selected" : ""}>${esc(e.name)}${e.position ? " (" + esc(e.position) + ")" : ""}</option>`).join("")}</select>` : ""}
          <div class="person-nav">
            <button type="button" class="nav-btn" id="person-prev">‹</button>
            <span class="person-month-label">${THAI_MONTHS[month0]} พ.ศ. ${beYear(cursor)}</span>
            <button type="button" class="nav-btn" id="person-next">›</button>
          </div>
        </div>
        ${mode === "team" ? buildTeamSummaryHtml(year, month0) : `
        <div class="detail-section admin-only">
          <div class="detail-section-title">บันทึกวันลาใหม่ (คลิกวันที่ในปฏิทินด้านล่างเพื่อเติมวันที่ให้อัตโนมัติ)</div>
          <form id="leave-form">
            <div class="form-grid">
              <div class="form-field">
                <label>พนักงาน <span class="req">*</span></label>
                <select name="employeeName" id="leave-employee-select" required>${EMPLOYEES.map(e => `<option value="${esc(e.name)}" ${e.name === employee ? "selected" : ""}>${esc(e.name)}${e.position ? " (" + esc(e.position) + ")" : ""}</option>`).join("")}</select>
              </div>
              <div class="form-field">
                <label>ตั้งแต่วันที่ <span class="req">*</span></label>
                <input type="date" name="dateFrom" id="leave-date-from" required />
              </div>
              <div class="form-field">
                <label>ถึงวันที่ <span class="req">*</span></label>
                <input type="date" name="dateTo" id="leave-date-to" required />
              </div>
              <div class="form-field">
                <label>ประเภทการลา <span class="req">*</span></label>
                <select name="leaveType" required>${LEAVE_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
              </div>
              <div class="form-field">
                <label>หมายเหตุ</label>
                <input type="text" name="note" placeholder="ไม่บังคับ" />
              </div>
            </div>
            <div id="leave-form-error"></div>
            <div class="form-actions">
              <span class="form-hint">เลือกพนักงานได้อิสระ ไม่จำเป็นต้องตรงกับปฏิทินที่กำลังดูอยู่</span>
              <div class="form-actions-right"><button type="submit" class="btn-primary">+ บันทึกวันลา</button></div>
            </div>
          </form>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">ประวัติวันลาทั้งหมดของ ${esc(employee)}</div>
          ${employeeLeaves.length ? `<div class="leave-history-list">${employeeLeaves.map(l => `
            <div class="leave-history-row">
              <div><b>${esc(l.leave_type)}</b> · ${esc(l.date_from)}${l.date_from !== l.date_to ? " ถึง " + esc(l.date_to) : ""}${l.note ? " · " + esc(l.note) : ""}</div>
              <button type="button" class="btn-danger leave-del-btn admin-only" data-id="${l.id}">🗑</button>
            </div>`).join("")}</div>` : `<div class="form-hint">ยังไม่มีประวัติการลา</div>`}
        </div>

        <div class="person-calendar-card">
          ${empObj && (empObj.role_title || empObj.position || empObj.employee_no || empObj.duties) ? `
          <div class="detail-section person-profile-card">
            <div class="detail-section-title">ข้อมูลประจำตัว</div>
            <div class="person-profile-head">
              <div>
                <b>${esc(empObj.name)}</b>${empObj.position ? ` <span class="form-hint">(${esc(empObj.position)})</span>` : ""}
                ${empObj.employee_no ? `<div class="form-hint">รหัสพนักงาน ${esc(empObj.employee_no)}</div>` : ""}
              </div>
              ${empObj.role_title ? `<span class="role-title-badge">${esc(empObj.role_title)}</span>` : ""}
            </div>
            ${empObj.duties ? `<div class="person-duties-title">หน้าที่รับผิดชอบ</div><ul class="person-duties-list">${empObj.duties.split("\n").map(d => d.trim()).filter(Boolean).map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
          </div>` : ""}
          <div class="person-stat-row">
            <div class="person-stat workday"><div class="person-stat-label">วันทำการ</div><div class="person-stat-value">${bizDays.total}/${bizDays.elapsed}</div></div>
            <div class="person-stat"><div class="person-stat-label">ปฏิบัติงาน บปก.</div><div class="person-stat-value">${inAreaDays} วัน</div></div>
            <div class="person-stat travel"><div class="person-stat-label">คำสั่งเดินทาง</div><div class="person-stat-value">${travelOrderDays} วัน</div></div>
            <div class="person-stat ot"><div class="person-stat-label">OT</div><div class="person-stat-value">${otDays} วัน</div></div>
            <div class="person-stat taskcount"><div class="person-stat-label">จำนวนงาน</div><div class="person-stat-value">${taskCount} งาน</div></div>
          </div>
          <div class="person-main-layout">
            <div class="person-calendar-col">
              <div class="weekday-row">${WD_SHORT.map((w, i) => `<div class="wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("")}</div>
              <div class="person-month-grid">
                ${cells.map(d => {
                  if (!d) return `<div class="person-day-cell empty"></div>`;
                  const cls = ["person-day-cell"];
                  if (d.isWeekend) cls.push("weekend");
                  if (d.holiday) cls.push("holiday");
                  if (d.leave) cls.push("has-leave");
                  if (d.iso === TODAY_ISO) cls.push("is-today");
                  return `<div class="${cls.join(" ")}" data-date="${d.iso}">
                    <div class="pd-num">${d.day}</div>
                    ${d.holiday ? `<div class="pd-holiday">${esc(d.holiday)}</div>` : ""}
                    ${d.leaves.map(l => `<div class="pd-leave-tag">${esc(l.leave_type)}</div>`).join("")}
                    ${d.worked ? `<div class="pd-work-tag ${d.isOT ? "ot" : ""}">${d.isOT ? "⚡" : ""} ${d.tasksForDay.length} งาน</div>` : ""}
                  </div>`;
                }).join("")}
              </div>
            </div>
            <div class="person-leave-summary">
              <div class="pls-head">
                <div class="pls-title">🗒️ สรุปวันลาเดือนนี้</div>
                <div class="pls-total ${leaveDays.length ? "has" : "none"}">${leaveDays.length ? `รวม ${leaveDays.length} วัน` : "ไม่มีวันลา"}</div>
              </div>
              ${leaveDays.length ? `
              <div class="pls-list">
                ${leaveDays.map(d => `
                  <div class="pls-row">
                    <div class="pls-date">${WD_SHORT[d.dow]} ${d.day} ${THAI_MONTHS[month0]}</div>
                    <div class="pls-types">${d.leaves.map(l => `<span class="pls-type-tag">${esc(l.leave_type)}</span>`).join("")}</div>
                  </div>`).join("")}
              </div>
              <div class="pls-breakdown">
                ${Object.entries(leaveByType).map(([t, c]) => `<div class="pls-breakdown-row"><span>${esc(t)}</span><b>${c} วัน</b></div>`).join("")}
              </div>
              ` : `<div class="pls-empty">เดือนนี้ยังไม่มีการลา</div>`}
            </div>
          </div>
        </div>
        `}
        ` : `<div class="empty-state">ยังไม่มีรายชื่อพนักงานในระบบ</div>`}`;
  }

  function openPersonPage() {
    personPageBodyEl.innerHTML = buildPersonModalHtml();
    bindPersonEvents();
    appShellEl.classList.add("hidden");
    personPageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function closePersonPage() {
    personPageEl.classList.add("hidden");
    appShellEl.classList.remove("hidden");
  }

  async function refreshPersonPage() {
    await loadPeopleData();
    personPageBodyEl.innerHTML = buildPersonModalHtml();
    bindPersonEvents();
  }

  function bindPersonEvents() {
    if (!EMPLOYEES.length) return;

    document.querySelectorAll(".pm-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        personState.mode = btn.getAttribute("data-mode");
        personPageBodyEl.innerHTML = buildPersonModalHtml();
        bindPersonEvents();
      });
    });
    document.querySelectorAll(".team-summary-row").forEach(row => {
      row.addEventListener("click", () => {
        personState.employeeName = row.getAttribute("data-employee");
        personState.mode = "individual";
        personPageBodyEl.innerHTML = buildPersonModalHtml();
        bindPersonEvents();
      });
    });
    const personSelectEl = $("#person-select");
    if (personSelectEl) personSelectEl.addEventListener("change", (ev) => {
      personState.employeeName = ev.target.value;
      personPageBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    $("#person-prev").addEventListener("click", () => {
      personState.cursor = addMonths(personState.cursor, -1);
      personPageBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    $("#person-next").addEventListener("click", () => {
      personState.cursor = addMonths(personState.cursor, 1);
      personPageBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    personPageBodyEl.querySelectorAll(".person-day-cell[data-date]").forEach(cell => {
      cell.addEventListener("click", () => {
        const iso = cell.getAttribute("data-date");
        $("#leave-date-from").value = iso;
        $("#leave-date-to").value = iso;
      });
    });

    const leaveFormEl = $("#leave-form");
    if (leaveFormEl) leaveFormEl.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!isAdmin()) return;
      const fd = new FormData(ev.target);
      const employeeName = (fd.get("employeeName") || "").trim();
      const dateFrom = fd.get("dateFrom");
      const dateTo = fd.get("dateTo") || dateFrom;
      if (!employeeName) { showLeaveFormError("กรุณาเลือกพนักงาน"); return; }
      if (!dateFrom || !dateTo) { showLeaveFormError("กรุณาเลือกวันที่ให้ครบ"); return; }
      if (dateTo < dateFrom) { showLeaveFormError("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"); return; }
      const row = {
        employee_name: employeeName,
        date_from: dateFrom,
        date_to: dateTo,
        leave_type: fd.get("leaveType"),
        note: (fd.get("note") || "").trim() || null
      };
      const btn = ev.target.querySelector("button[type=submit]");
      btn.disabled = true;
      const { error } = await CAL_SB.from("calendar_leaves").insert([row]);
      if (error) { showLeaveFormError("บันทึกไม่สำเร็จ: " + error.message); btn.disabled = false; return; }
      await refreshPersonPage();
      const dateLabel = dateTo !== dateFrom ? `${dateFrom} ถึง ${dateTo}` : dateFrom;
      showLeaveFormSuccess(`✓ บันทึกวันลาให้ ${employeeName} (${dateLabel}) เรียบร้อยแล้ว`);
    });

    personPageBodyEl.querySelectorAll(".leave-del-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!isAdmin()) return;
        if (!confirm("ลบวันลานี้ออกจากประวัติ?")) return;
        const { error } = await CAL_SB.from("calendar_leaves").delete().eq("id", btn.getAttribute("data-id"));
        if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        await refreshPersonPage();
      });
    });
  }

  personBtnEl.addEventListener("click", openPersonPage);
  personBackBtnEl.addEventListener("click", closePersonPage);

  /* ---------------- Equipment manual (คู่มืออุปกรณ์) — ข้อมูลอ้างอิงคงที่ ดูได้ทุกสิทธิ์ ---------------- */
  function equipCellHtml(value, warn) {
    if (!value) return `<td>-</td>`;
    return `<td class="${warn ? "eq-warn" : ""}">${esc(value)}</td>`;
  }
  function equipmentManualGroupsHtml() {
    const groups = {};
    EQUIPMENT_MANUAL.forEach(e => { (groups[e.group] = groups[e.group] || []).push(e); });
    const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return groupNames.map(g => `
      <div class="equip-group">
        <div class="equip-group-title">${esc(g)} (${groups[g].length} รายการ)</div>
        <div class="equip-table-wrap">
          <table class="equip-table">
            <thead>
              <tr>
                <th>อุปกรณ์</th>
                <th>การใช้งาน</th>
                <th>ตรวจสอบก่อนใช้</th>
                <th>ห้ามใช้ / Stop Work</th>
                <th>ดูแลหลังใช้งาน</th>
                <th>ข้อกำหนดความปลอดภัย</th>
              </tr>
            </thead>
            <tbody>
              ${groups[g].map(e => `
                <tr>
                  <td class="eq-name-cell">
                    <div class="equip-name-th">${esc(e.name_th)}</div>
                    ${e.name_en ? `<div class="equip-name-en">${esc(e.name_en)}</div>` : ""}
                    ${e.reading ? `<div class="equip-name-reading">อ่านว่า “${esc(e.reading)}”</div>` : ""}
                  </td>
                  ${equipCellHtml(e.usage)}
                  ${equipCellHtml(e.pre_check)}
                  ${equipCellHtml(e.stop_conditions, true)}
                  ${equipCellHtml(e.care_after)}
                  ${equipCellHtml(e.safety_requirement, true)}
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`).join("");
  }
  function openEquipmentPage() {
    equipmentPageCountEl.textContent = `คู่มืออุปกรณ์ (${EQUIPMENT_MANUAL.length} รายการ)`;
    equipmentPageBodyEl.innerHTML = equipmentManualGroupsHtml();
    appShellEl.classList.add("hidden");
    equipmentPageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function closeEquipmentPage() {
    equipmentPageEl.classList.add("hidden");
    appShellEl.classList.remove("hidden");
  }
  equipmentBtnEl.addEventListener("click", openEquipmentPage);
  equipmentBackBtnEl.addEventListener("click", closeEquipmentPage);

  /* ---------------- คู่มือระเบียบการลา — ข้อมูลอ้างอิงคงที่ ดูได้ทุกสิทธิ์ ---------------- */
  const LEAVE_RISK_CLASS = { "ต่ำ-ปานกลาง": "risk-low", "ปานกลาง": "risk-medium", "สูง": "risk-high", "สูงมาก": "risk-critical" };
  function leaveMultilineHtml(value) {
    if (!value) return "";
    return value.split(" | ").map(part => `<div>${esc(part.trim())}</div>`).join("");
  }
  const LEAVE_CAT_ICON_COLORS = ["#0ea5e9", "#7c3aed", "#f97316", "#ec4899", "#8b5cf6", "#14b8a6"];
  function leaveTypeCardHtml(t, i) {
    const iconColor = LEAVE_CAT_ICON_COLORS[i % LEAVE_CAT_ICON_COLORS.length];
    return `
      <div class="leave-cat-card">
        <div class="leave-cat-head">
          <div class="leave-cat-icon" style="background:${iconColor}">${t.icon}</div>
          <span class="leave-cat-badge">หมวด ${esc(t.no)}</span>
        </div>
        <div class="leave-cat-title">${esc(t.title)}</div>
        <div class="leave-cat-row"><div class="leave-cat-label">คุณสมบัติ/ขอบเขต</div><div class="leave-cat-value">${leaveMultilineHtml(t.eligibility)}</div></div>
        <div class="leave-cat-row"><div class="leave-cat-label">โควตา</div><div class="leave-cat-value">${leaveMultilineHtml(t.quota)}</div></div>
        <div class="leave-cat-row"><div class="leave-cat-label">วิธีนับวัน</div><div class="leave-cat-value">${leaveMultilineHtml(t.dayCount)}</div></div>
        <div class="leave-cat-row"><div class="leave-cat-label">สิทธิรับเงินเดือน</div><div class="leave-cat-value">${leaveMultilineHtml(t.salary)}</div></div>
        <div class="leave-cat-row"><div class="leave-cat-label">เอกสาร/การยื่น</div><div class="leave-cat-value">${leaveMultilineHtml(t.docs)}</div></div>
        <div class="leave-cat-gap-box"><span class="leave-cat-gap-icon">⚠️</span><div><b>Gap / ข้อควรระวัง</b><div>${leaveMultilineHtml(t.gap)}</div></div></div>
      </div>`;
  }
  function leaveGapCardHtml(g) {
    const riskClass = LEAVE_RISK_CLASS[g.risk] || "risk-medium";
    return `
      <div class="leave-gap-card ${riskClass}">
        <div class="leave-gap-card-head">
          <div class="leave-gap-card-title">${esc(g.title)}</div>
          <span class="leave-risk-badge ${riskClass}">🛡️ ความเสี่ยง: ${esc(g.risk)}</span>
        </div>
        <div class="leave-row"><div class="leave-row-label">เข้าใจผิด</div><div class="leave-row-value leave-text-wrong">${leaveMultilineHtml(g.pitfall)}</div></div>
        <div class="leave-row"><div class="leave-row-label">หลักเกณฑ์ที่ถูกต้อง</div><div class="leave-row-value leave-text-correct">${leaveMultilineHtml(g.correctRule)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ความเสี่ยง</div><div class="leave-row-value">${leaveMultilineHtml(g.riskDesc)}</div></div>
        <div class="leave-row"><div class="leave-row-label">แนวทางปฏิบัติ</div><div class="leave-row-value">${leaveMultilineHtml(g.sop)}</div></div>
      </div>`;
  }
  const LEAVE_IMPACT_ICONS = ["🩺", "🛡️", "💼", "🤱", "🏖️", "🤰"];
  const LEAVE_IMPACT_COLUMNS = [
    { key: "salaryDuring", label: "เงินเดือนระหว่างลา", icon: "💳" },
    { key: "attendance", label: "Attendance", icon: "📅" },
    { key: "behaviorKpi", label: "Behavior/KPI", icon: "👤" },
    { key: "stepReview", label: "เลื่อนขั้นเงินเดือน", icon: "📈" },
    { key: "bonus", label: "โบนัสประจำปี", icon: "🎁" },
    { key: "threshold", label: "Threshold (เกณฑ์เพดานสูงสุด)", icon: "🎯" }
  ];
  function leaveImpactTone(text) {
    if (/งด|ห้าม|ตัดสิทธิ|เด็ดขาด|ไล่ออก|ขาดงาน/.test(text)) return "red";
    if (/หัก|จำกัด|ตัด|ลด/.test(text)) return "orange";
    if (/ยกเว้น|เต็ม 100%|เต็มจำนวน|เต็มตาม|ไม่ถูกหัก|ไม่มีผลกระทบ|ไม่มีการหัก|ไม่มีผลงานประเมิน|ไม่มีผล/.test(text)) return "green";
    return "blue";
  }
  function leaveImpactTableHtml() {
    return `
      <div class="equip-table-wrap">
        <table class="equip-table leave-impact-matrix">
          <thead><tr>
            <th><span class="leave-impact2-info">ⓘ</span> ประเภทการลา</th>
            ${LEAVE_IMPACT_COLUMNS.map(c => `<th><div class="leave-impact2-th"><span>${c.icon}</span><span>${esc(c.label)}</span></div></th>`).join("")}
            <th><div class="leave-impact2-th"><span>📋</span><span>สรุปภาพรวม</span></div></th>
          </tr></thead>
          <tbody>
            ${LEAVE_REG_IMPACTS.map((r, i) => `
              <tr class="leave-impact2-row">
                <td class="leave-impact2-type">
                  <div class="leave-impact2-type-inner">
                    <span class="leave-impact2-num" style="background:${LEAVE_CAT_ICON_COLORS[i % LEAVE_CAT_ICON_COLORS.length]}">${i + 1}</span>
                    <div class="leave-impact2-type-title">${LEAVE_IMPACT_ICONS[i] || ""} ${esc(r.type)}</div>
                  </div>
                </td>
                ${LEAVE_IMPACT_COLUMNS.map(c => `<td data-label="${esc(c.icon)} ${esc(c.label)}"><span class="leave-impact2-pill ${leaveImpactTone(r[c.key])}">${esc(r[c.key])}</span></td>`).join("")}
                <td class="leave-impact2-summary" data-label="📋 สรุปภาพรวม">${esc(r.summary)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="leave-impact2-absent">
        <div class="leave-impact2-absent-head">
          <span class="leave-impact2-absent-icon">⚠️</span>
          <div>
            <b>${esc(LEAVE_REG_ABSENTEEISM.type)}</b>
            <div class="leave-impact2-absent-sub">กรณีนี้ไม่ใช่ “การลา” แต่เป็นความผิดทางวินัยขั้นร้ายแรง ต้องแยกให้ชัดเจนจากการลาทุกประเภทข้างต้น</div>
          </div>
        </div>
        <div class="leave-impact2-absent-grid">
          ${LEAVE_IMPACT_COLUMNS.map(c => `<div class="leave-impact2-absent-item"><span>${c.icon}</span>${esc(LEAVE_REG_ABSENTEEISM[c.key])}</div>`).join("")}
        </div>
      </div>`;
  }
  function leaveApprovalTableHtml() {
    return `
      <div class="equip-table-wrap">
        <table class="equip-table leave-approval-table">
          <thead><tr>
            <th>กลุ่มตำแหน่งผู้ขอลา</th><th>ผู้บังคับบัญชาชั้นต้น</th><th>ลาป่วย/ลากิจ</th>
            <th>ลาพักผ่อนประจำปี</th><th>ลาคลอด/ช่วยภริยาคลอด</th><th>ลาอุปสมบท/ฮัจย์</th><th>ลาเลี้ยงดูบุตร/ติดตามคู่สมรส</th>
          </tr></thead>
          <tbody>
            ${LEAVE_REG_APPROVALS.map(a => `<tr>
              <td class="leave-impact-type">${esc(a.level)}</td>
              <td>${esc(a.supervisor)}</td>
              <td>${esc(a.sickPersonal)}</td>
              <td>${esc(a.vacation)}</td>
              <td>${esc(a.maternity)}</td>
              <td>${esc(a.ordination)}</td>
              <td>${esc(a.childcareSpouse)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  function leavePageHtml() {
    return `
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">1/4</span> สรุปสิทธิการลา ${LEAVE_REG_TYPES.length} หมวด</div>
        <div class="leave-cat-grid">${LEAVE_REG_TYPES.map(leaveTypeCardHtml).join("")}</div>
        <div class="audit-table-footnote">
          <span>ℹ️ หมายเหตุ: สิทธิการลาแบ่งตามระเบียบมาตรฐาน กฟภ. โปรดตรวจสอบระเบียบปัจจุบันและประสานฝ่ายทรัพยากรบุคคลก่อนดำเนินการทุกครั้ง</span>
        </div>
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">2/4</span> การวิเคราะห์ปิด Gap เชิงปฏิบัติการและข้อยกเว้น</div>
        <div class="leave-gap-grid">${LEAVE_REG_GAPS.map(leaveGapCardHtml).join("")}</div>
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">3/4</span> ผลกระทบต่อเงินเดือน โบนัส และการเลื่อนขั้น</div>
        ${leaveImpactTableHtml()}
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">4/4</span> ตารางสายอำนาจการอนุมัติการลา</div>
        ${leaveApprovalTableHtml()}
      </div>`;
  }
  function openLeavePage() {
    leavePageBodyEl.innerHTML = leavePageHtml();
    appShellEl.classList.add("hidden");
    leavePageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function closeLeavePage() {
    leavePageEl.classList.add("hidden");
    appShellEl.classList.remove("hidden");
  }
  leaveBtnEl.addEventListener("click", openLeavePage);
  leaveBackBtnEl.addEventListener("click", closeLeavePage);

  /* ---------------- ระเบียบวินัย ความปลอดภัย และสภาพการจ้าง (Zero-Gap Audit) ---------------- */
  function auditDocCardHtml(d) {
    return `
      <div class="leave-type-card">
        <div class="leave-type-head">
          <div class="leave-type-icon">📄</div>
          <div>
            <div class="leave-type-no">${esc(d.code)}</div>
            <div class="leave-type-title">${esc(d.name)}</div>
          </div>
        </div>
        <div class="leave-row"><div class="leave-row-label">สถานะการบังคับใช้</div><div class="leave-row-value">${leaveMultilineHtml(d.status)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ฐานอำนาจการออกกฎหมาย</div><div class="leave-row-value">${leaveMultilineHtml(d.basis)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ประเด็นที่ควบคุมหลัก</div><div class="leave-row-value">${leaveMultilineHtml(d.mainIssues)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ขอบเขตการนำไปบังคับใช้และข้อพึงระวัง</div><div class="leave-row-value">${leaveMultilineHtml(d.scope)}</div></div>
      </div>`;
  }
  function auditPenaltyCompareCardHtml(c) {
    return `
      <div class="leave-type-card">
        <div class="leave-type-head">
          <div class="leave-type-icon">${c.icon}</div>
          <div class="leave-type-title">${esc(c.title)}</div>
        </div>
        <div class="leave-row"><div class="leave-row-label">ลักษณะการหักเงิน</div><div class="leave-row-value">${leaveMultilineHtml(c.deduction)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ผลกระทบต่อชีวิตพนักงาน</div><div class="leave-row-value leave-text-wrong">${leaveMultilineHtml(c.impact)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ใครมีอำนาจสั่งได้บ้าง</div><div class="leave-row-value">${leaveMultilineHtml(c.authority)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ผลต่อการเลื่อนขั้นเงินเดือน</div><div class="leave-row-value">${leaveMultilineHtml(c.salaryStepEffect)}</div></div>
      </div>`;
  }
  const AUDIT_RULE_ICONS = ["🛡️", "🔨", "⚖️", "📈"];
  function auditPowerRuleCardHtml(r, i) {
    return `
      <div class="audit-rule-card">
        <div class="audit-rule-head">
          <div class="audit-rule-icon">${AUDIT_RULE_ICONS[i % AUDIT_RULE_ICONS.length]}</div>
          <div class="audit-rule-title">${esc(r.topic)}</div>
          <span class="audit-rule-badge">กลุ่ม ${i + 1}</span>
        </div>
        <div class="audit-rule-section">
          <div class="audit-rule-label green">🔖 สาระสำคัญ</div>
          <div class="audit-rule-text">${leaveMultilineHtml(r.rule)}</div>
        </div>
        <div class="audit-rule-divider"></div>
        <div class="audit-rule-section">
          <div class="audit-rule-label purple">👥 เหตุผลเชิงการบริหาร</div>
          <div class="audit-rule-text">${leaveMultilineHtml(r.rationale)}</div>
        </div>
        <div class="audit-rule-example">
          <span class="audit-rule-example-icon">💡</span>
          <div><b>ตัวอย่างในชีวิตจริง</b><div>${leaveMultilineHtml(r.example)}</div></div>
        </div>
      </div>`;
  }
  function auditBossViewCardHtml(b) {
    return `
      <div class="leave-gap-card">
        <div class="leave-gap-card-head">
          <div class="leave-gap-card-title">${esc(b.position)}</div>
        </div>
        <div class="leave-row"><div class="leave-row-label">ลูกน้องที่อยู่ในข่ายอำนาจ</div><div class="leave-row-value">${leaveMultilineHtml(b.subordinatesInScope)}</div></div>
        <div class="leave-row"><div class="leave-row-label">อำนาจสูงสุดที่สั่งได้เอง</div><div class="leave-row-value leave-text-correct">${leaveMultilineHtml(b.maxOwnAuthority)}</div></div>
        <div class="leave-row"><div class="leave-row-label">สิ่งที่ไม่มีอำนาจทำ (ห้ามสั่งเด็ดขาด)</div><div class="leave-row-value leave-text-wrong">${leaveMultilineHtml(b.forbidden)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ถ้าลูกน้องผิดหนักกว่าอำนาจเรา</div><div class="leave-row-value">${leaveMultilineHtml(b.escalation)}</div></div>
        <div class="leave-gap-box"><span class="leave-gap-icon">⚠️</span><div><b>ข้อควรระวังทางวินัย</b><div>${leaveMultilineHtml(b.caution)}</div></div></div>
      </div>`;
  }
  function auditPositionMapTableHtml() {
    return `
      <div class="equip-table-wrap">
        <table class="equip-table leave-impact-table">
          <thead><tr>
            <th>ชื่อตำแหน่งตามระเบียบ 2517</th><th>ระดับปัจจุบัน</th><th>ตำแหน่งงานปัจจุบัน</th>
            <th>ลักษณะหน้าที่ความรับผิดชอบ</th><th>กลุ่มงาน</th>
          </tr></thead>
          <tbody>
            ${AUDIT_POSITION_MAP.map(r => `<tr>
              <td class="leave-impact-type">${esc(r.oldTitle)}</td>
              <td>${esc(r.level)}</td>
              <td>${esc(r.currentTitle)}</td>
              <td>${esc(r.duties)}</td>
              <td>${esc(r.group)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  const AUDIT_PENALTY_GROUP_ICONS = {
    "ประธานกรรมการ กฟภ.": "👑",
    "ผู้ว่าการ หรือ รองผู้ว่าการ": "👥",
    "ผู้ช่วยผู้ว่าการ / ผอ.ฝ่าย / รอง ผอ.ฝ่าย": "🛡️",
    "ผอ.กอง / หน.กอง / รอง หน.กอง": "🏢"
  };
  function auditPenaltyGroups() {
    const map = new Map();
    AUDIT_PENALTY_AUTHORITY.forEach(r => {
      if (!map.has(r.authority)) map.set(r.authority, []);
      map.get(r.authority).push(r);
    });
    return Array.from(map.entries()).map(([authority, rows]) => ({ authority, rows }));
  }
  function auditPenaltyTableHtml() {
    const groups = auditPenaltyGroups();
    return `
      <div class="audit-group-search">
        <input type="text" id="audit-penalty-search" placeholder="🔍 ค้นหาตำแหน่ง..." />
      </div>
      <div class="equip-table-wrap">
        <table class="equip-table audit-group-table" id="audit-penalty-table">
          <thead><tr>
            <th>ระดับ</th><th>ตำแหน่งพนักงานผู้กระทำผิด</th><th>ลดเงินเดือน</th>
            <th>ตัดเงินเดือน</th><th>ระยะเวลา</th><th>อำนาจสั่งไล่ออก/ปลดออก</th>
          </tr></thead>
          <tbody>
            ${groups.map((g, gi) => `
              <tr class="audit-group-row" data-group="${gi}">
                <td colspan="6">
                  <div class="audit-group-head" data-group-toggle="${gi}">
                    <span class="audit-group-badge">${gi + 1}</span>
                    <span class="audit-group-icon">${AUDIT_PENALTY_GROUP_ICONS[g.authority] || "🧑‍💼"}</span>
                    <span class="audit-group-title">${esc(g.authority)}</span>
                    <span class="audit-group-chevron">▾</span>
                  </div>
                </td>
              </tr>
              ${g.rows.map((r, ri) => `
                <tr class="audit-data-row" data-group="${gi}" data-search="${esc((r.position || "").toLowerCase())}">
                  <td class="audit-row-idx">${String(ri + 1).padStart(2, "0")}</td>
                  <td>${esc(r.position.replace(/^\d+\.\s*/, ""))}</td>
                  <td>${r.reduceCap === "ไม่มีอำนาจสั่งลด" ? `<span class="audit-dash">–</span>` : `<span class="audit-pill orange">${esc(r.reduceCap)}</span>`}</td>
                  <td><span class="audit-pill red">${esc(r.deductCap)}</span></td>
                  <td><span class="audit-pill blue">${esc(r.months)}</span></td>
                  <td><span class="audit-pill ${r.dismissal.startsWith("ไม่มีอำนาจ") ? "gray" : "green"}">${esc(r.dismissal)}</span></td>
                </tr>`).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>`;
  }
  const AUDIT_WORKER_GROUP_ICONS = {
    "พนักงานระดับ 1 – 2 หรือเทียบเท่า": "👥",
    "ประจำแผนก / ผู้ช่วย หน.แผนก / หัวหน้าหมวด": "🧑‍💼",
    "หัวหน้าแผนก (หน.ผ.) หรือเทียบเท่า": "💼",
    "ผู้อำนวยการกอง (ผอ.กอง) / หัวหน้ากอง": "🏛️",
    "ผู้อำนวยการฝ่าย (ผอ.ฝ่าย) / ผู้เชี่ยวชาญ": "🎖️"
  };
  function splitTempCut(text) {
    const m = text.match(/^(.*?)\s*(นาน.*)$/);
    if (!m) return { pct: text, dur: null };
    return { pct: m[1].trim(), dur: m[2].trim() };
  }
  function auditWorkerMatrixTableHtml() {
    return `
      <div class="audit-group-search">
        <input type="text" id="audit-worker-search" placeholder="🔍 ค้นหาตำแหน่ง/ผู้บังคับบัญชา..." />
      </div>
      <div class="equip-table-wrap">
        <table class="equip-table audit-group-table" id="audit-worker-table">
          <thead><tr>
            <th>ผู้บังคับบัญชาที่มีคำสั่งลงโทษ</th><th>อำนาจตัดเงินเดือนชั่วคราว</th><th>อำนาจลดเงินเดือนถาวร</th>
            <th>อำนาจสั่งไล่ออก/ปลดออก</th><th>สรุป</th>
          </tr></thead>
          <tbody>
            ${AUDIT_WORKER_MATRIX.map((g, gi) => `
              <tr class="audit-group-row" data-group="${gi}">
                <td colspan="5">
                  <div class="audit-group-head" data-group-toggle="${gi}">
                    <span class="audit-group-badge">${gi + 1}</span>
                    <span class="audit-group-icon">${AUDIT_WORKER_GROUP_ICONS[g.position] || "🧑‍💼"}</span>
                    <span class="audit-group-title">${esc(g.position)} <span class="form-hint">(${esc(g.level)})</span></span>
                    <span class="audit-group-chevron">▾</span>
                  </div>
                </td>
              </tr>
              ${g.rows.map(r => {
                const tc = splitTempCut(r.tempCut);
                return `<tr class="audit-data-row" data-group="${gi}" data-search="${esc((r.supervisor || "").toLowerCase())}">
                  <td class="leave-impact-type">${esc(r.supervisor)}</td>
                  <td>${tc.dur ? `<span class="audit-pill orange">${esc(tc.pct)}</span> <span class="audit-pill blue">${esc(tc.dur)}</span>` : `<span class="audit-dash">${esc(tc.pct)}</span>`}</td>
                  <td>${r.permCut === "ไม่มีอำนาจสั่งลด" ? `<span class="audit-pill gray">${esc(r.permCut)}</span>` : `<span class="audit-pill red">${esc(r.permCut)}</span>`}</td>
                  <td><span class="audit-pill ${r.dismissal.startsWith("ไม่มีอำนาจ") ? "gray" : "green"}">${esc(r.dismissal)}</span></td>
                  <td>${esc(r.summary)}</td>
                </tr>`;
              }).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>`;
  }
  function bindAuditGroupTableEvents(tableId, searchId) {
    const tableEl = $("#" + tableId);
    if (!tableEl) return;
    tableEl.querySelectorAll("[data-group-toggle]").forEach(headEl => {
      headEl.addEventListener("click", () => {
        const gi = headEl.getAttribute("data-group-toggle");
        const collapsed = headEl.classList.toggle("collapsed");
        tableEl.querySelectorAll(`.audit-data-row[data-group="${gi}"]`).forEach(row => {
          row.classList.toggle("audit-row-hidden", collapsed);
        });
        headEl.querySelector(".audit-group-chevron").textContent = collapsed ? "▸" : "▾";
      });
    });
    const searchEl = $("#" + searchId);
    if (searchEl) searchEl.addEventListener("input", () => {
      const q = searchEl.value.trim().toLowerCase();
      tableEl.querySelectorAll(".audit-group-head").forEach(h => { h.classList.remove("collapsed"); h.querySelector(".audit-group-chevron").textContent = "▾"; });
      const visibleGroups = new Set();
      tableEl.querySelectorAll(".audit-data-row").forEach(row => {
        const match = !q || row.getAttribute("data-search").includes(q);
        row.classList.toggle("audit-row-hidden", !match);
        if (match) visibleGroups.add(row.getAttribute("data-group"));
      });
      tableEl.querySelectorAll(".audit-group-row").forEach(gRow => {
        gRow.classList.toggle("audit-row-hidden", !visibleGroups.has(gRow.getAttribute("data-group")));
      });
    });
  }
  function auditInvestigationCardHtml(s) {
    return `
      <div class="leave-gap-card">
        <div class="leave-gap-card-head">
          <div class="leave-gap-card-title">${esc(s.topic)}</div>
          <span class="leave-risk-badge risk-low">${esc(s.article)}</span>
        </div>
        <div class="leave-row"><div class="leave-row-label">ข้อกำหนดภาคบังคับ</div><div class="leave-row-value">${leaveMultilineHtml(s.requirement)}</div></div>
        <div class="leave-row"><div class="leave-row-label">เงื่อนไขเฉพาะและข้อยกเว้น</div><div class="leave-row-value">${leaveMultilineHtml(s.exception)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ผลทางกฎหมายหากปฏิบัติไม่ถูกต้อง</div><div class="leave-row-value leave-text-wrong">${leaveMultilineHtml(s.consequence)}</div></div>
        <div class="leave-row"><div class="leave-row-label">มาตรการควบคุมความถูกต้อง</div><div class="leave-row-value leave-text-correct">${leaveMultilineHtml(s.control)}</div></div>
      </div>`;
  }
  function auditSafetyStatsHtml() {
    const orderCount = AUDIT_SAFETY_ORDERS.length;
    const respSet = new Set();
    AUDIT_SAFETY_ORDERS.forEach(r => r.responsible.split(/[,/]/).forEach(s => { const t = s.trim(); if (t) respSet.add(t); }));
    const evidenceSet = new Set();
    AUDIT_SAFETY_ORDERS.forEach(r => r.evidence.split(/[+/]/).forEach(s => { const t = s.trim(); if (t) evidenceSet.add(t); }));
    return `
      <div class="audit-stat-row">
        <div class="audit-stat-card">
          <div class="audit-stat-icon purple">🛡️</div>
          <div><div class="audit-stat-value">${orderCount}</div><div class="audit-stat-label">ข้อสั่งการด้านความปลอดภัย</div></div>
        </div>
        <div class="audit-stat-card">
          <div class="audit-stat-icon violet">👥</div>
          <div><div class="audit-stat-value">${respSet.size}</div><div class="audit-stat-label">ผู้รับผิดชอบหลักที่เกี่ยวข้อง</div></div>
        </div>
        <div class="audit-stat-card">
          <div class="audit-stat-icon orange">📄</div>
          <div><div class="audit-stat-value">${evidenceSet.size}</div><div class="audit-stat-label">เอกสารหลักฐานที่ต้องตรวจ</div></div>
        </div>
        <div class="audit-stat-card">
          <div class="audit-stat-icon green">✅</div>
          <div><div class="audit-stat-value">${orderCount}</div><div class="audit-stat-label">จุดควบคุมความปลอดภัย</div></div>
        </div>
      </div>`;
  }
  function auditSafetyTableHtml() {
    return `
      ${auditSafetyStatsHtml()}
      <div class="equip-table-wrap">
        <table class="equip-table leave-impact-table">
          <thead><tr>
            <th>ข้อสั่งการ</th><th>มาตรการความปลอดภัยภาคบังคับ</th><th>ผู้ที่เกี่ยวข้อง/รับผิดชอบ</th>
            <th>📄 เอกสารหลักฐาน</th><th>ฐานความผิดหรือระเบียบ</th><th>✅ จุดควบคุมความปลอดภัย</th>
          </tr></thead>
          <tbody>
            ${AUDIT_SAFETY_ORDERS.map((r, i) => `<tr>
              <td class="leave-impact-type"><span class="audit-item-badge">${i + 1}</span> ${esc(r.no)}</td>
              <td>${esc(r.measure)}</td>
              <td>${esc(r.responsible)}</td>
              <td>${esc(r.evidence)}</td>
              <td>${esc(r.liability)}</td>
              <td>${esc(r.control)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="audit-table-footnote">
        <span>ℹ️ หมายเหตุ: ใช้สำหรับกำกับติดตามการปฏิบัติตามข้อสั่งการด้านความปลอดภัย</span>
        <span>อ้างอิงจากไฟล์ PEA_Audit_Master_Verification_100Percent.xlsx</span>
      </div>`;
  }
  function auditEmploymentTableHtml() {
    return `
      <div class="equip-table-wrap">
        <table class="equip-table leave-impact-table">
          <thead><tr>
            <th>หมวดสภาพการจ้าง</th><th>ข้อ/มาตรา</th><th>อัตรา/สิทธิประโยชน์ที่ได้รับ</th>
            <th>ข้อยกเว้น</th><th>ผู้มีสิทธิได้รับ</th><th>ข้อกำหนดภาคบังคับและกฎหมายห้าม</th>
          </tr></thead>
          <tbody>
            ${AUDIT_EMPLOYMENT_CONDITIONS.map(r => `<tr>
              <td class="leave-impact-type">${esc(r.category)}</td>
              <td>${esc(r.refArticle)}</td>
              <td>${esc(r.benefit)}</td>
              <td>${esc(r.exception)}</td>
              <td>${esc(r.entitled)}</td>
              <td>${esc(r.mandatoryRule)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }
  function auditChecklistCardHtml(g) {
    return `
      <div class="leave-gap-card risk-low">
        <div class="leave-gap-card-head">
          <div class="leave-gap-card-title">${esc(g.issue)}</div>
          <span class="leave-risk-badge risk-low">✔ VERIFIED</span>
        </div>
        <div class="leave-row"><div class="leave-row-label">เอกสารอ้างอิง</div><div class="leave-row-value">${leaveMultilineHtml(g.refDoc)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ข้อกำหนดที่ถูกต้อง 100%</div><div class="leave-row-value leave-text-correct">${leaveMultilineHtml(g.correctRule)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ความเสี่ยงหากปฏิบัติผิดพลาด</div><div class="leave-row-value leave-text-wrong">${leaveMultilineHtml(g.risk)}</div></div>
        <div class="leave-row"><div class="leave-row-label">หลักฐานที่ต้องเรียกตรวจ</div><div class="leave-row-value">${leaveMultilineHtml(g.evidence)}</div></div>
        <div class="leave-row"><div class="leave-row-label">ผู้รับผิดชอบหลัก</div><div class="leave-row-value">${leaveMultilineHtml(g.responsible)}</div></div>
      </div>`;
  }
  function auditPageHtml() {
    return `
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">1/6</span> อ้างอิง (${AUDIT_DOCS.length} ฉบับ)</div>
        <div class="leave-type-grid">${AUDIT_DOCS.map(auditDocCardHtml).join("")}</div>
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">2/6</span> อำนาจลงโทษทางวินัย กฟภ. — ฉบับเข้าใจง่าย</div>
        <div class="form-hint" style="margin-bottom:10px;">1. เข้าใจ 2 โทษหลักให้ชัด</div>
        <div class="leave-type-grid">${AUDIT_PENALTY_COMPARE.map(auditPenaltyCompareCardHtml).join("")}</div>
        <div class="form-hint" style="margin:18px 0 10px;">2. โครงสร้างอำนาจ (กฎเหล็กที่ต้องรู้)</div>
        <div class="audit-rule-grid">${AUDIT_POWER_RULES.map(auditPowerRuleCardHtml).join("")}</div>
        <div class="form-hint" style="margin:18px 0 10px;">3. มุมมองผู้ปฏิบัติงาน — หาระดับตัวเอง ดูว่าใครสั่งลงโทษได้แค่ไหน</div>
        ${auditWorkerMatrixTableHtml()}
        <div class="form-hint" style="margin:18px 0 10px;">4. มุมมองหัวหน้า — ฉันสั่งอะไรได้บ้าง และห้ามทำอะไร</div>
        <div class="leave-gap-grid">${AUDIT_BOSS_VIEW.map(auditBossViewCardHtml).join("")}</div>
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">3/6</span> หมวดวินัย การลงโทษ การสอบสวน และการอุทธรณ์ (ตารางเต็มตามข้อบังคับ)</div>
        <div class="form-hint" style="margin-bottom:10px;">1. ตารางอำนาจการลงโทษทางวินัย (ลดเงินเดือน / ตัดเงินเดือน)</div>
        ${auditPenaltyTableHtml()}
        <div class="form-hint" style="margin:18px 0 10px;">2. ขั้นตอนการสอบสวน การพักงาน และการอุทธรณ์</div>
        <div class="leave-gap-grid">${AUDIT_INVESTIGATION_STEPS.map(auditInvestigationCardHtml).join("")}</div>
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">4/6</span> ความปลอดภัย อุบัติเหตุ และ SOP (10 ข้อสั่งการ กฟน.1)</div>
        ${auditSafetyTableHtml()}
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">5/6</span> สภาพการจ้างขั้นต่ำและเงินทดแทน</div>
        ${auditEmploymentTableHtml()}
      </div>
      <div class="leave-section">
        <div class="leave-section-title"><span class="leave-section-badge">6/6</span> Checklist ตรวจสอบและปิดทุก Gap (${AUDIT_CHECKLIST.length} รายการ) และเทียบตำแหน่ง 2517 vs ปัจจุบัน</div>
        <div class="leave-gap-grid">${AUDIT_CHECKLIST.map(auditChecklistCardHtml).join("")}</div>
        <div class="form-hint" style="margin:18px 0 10px;">เทียบตำแหน่งตามระเบียบ พ.ศ. 2517 กับตำแหน่งงานในปัจจุบัน</div>
        ${auditPositionMapTableHtml()}
      </div>`;
  }
  function openAuditPage() {
    auditPageBodyEl.innerHTML = auditPageHtml();
    bindAuditGroupTableEvents("audit-penalty-table", "audit-penalty-search");
    bindAuditGroupTableEvents("audit-worker-table", "audit-worker-search");
    appShellEl.classList.add("hidden");
    auditPageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  function closeAuditPage() {
    auditPageEl.classList.add("hidden");
    appShellEl.classList.remove("hidden");
  }
  auditBtnEl.addEventListener("click", openAuditPage);
  auditBackBtnEl.addEventListener("click", closeAuditPage);

  /* ---------------- Access log (ประวัติการใช้งาน) — เฉพาะผู้ดูแลระบบ ---------------- */
  function fmtLogTime(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${beYear(d)} เวลา ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} น.`;
  }
  async function openAccessLogPage() {
    if (!isAdmin()) return;
    accessLogPageBodyEl.innerHTML = `<div class="empty-state">กำลังโหลดประวัติการใช้งาน...</div>`;
    appShellEl.classList.add("hidden");
    accessLogPageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
    const { data, error } = await CAL_SB.from("calendar_access_log").select("*").order("created_at", { ascending: false });
    const rows = (!error && data) || [];
    accessLogPageBodyEl.innerHTML = `
      ${error ? `<div class="form-error">โหลดประวัติไม่สำเร็จ: ${esc(error.message)}</div>` : ""}
      <div class="access-log-summary">พบทั้งหมด ${rows.length} รายการ${rows.length ? ` · เข้าใช้งานล่าสุด: ${esc(fmtLogTime(rows[0].created_at))}` : ""}</div>
      <div class="access-log-table-wrap">
        <table class="access-log-table">
          <thead><tr><th>วันเวลา</th><th>เลขประจำตัว</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>สิทธิ์</th><th>ผลลัพธ์</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>
              <td>${esc(fmtLogTime(r.created_at))}</td>
              <td>${esc(r.employee_no)}</td>
              <td>${esc(r.employee_name)}</td>
              <td>${esc(r.position || "-")}</td>
              <td>${esc(r.department || "-")}</td>
              <td><span class="access-log-role-text ${r.role === "admin" ? "admin" : r.role === "visitor" ? "visitor" : "reviewer"}">${r.role === "admin" ? "ผู้ดูแลระบบ" : r.role === "visitor" ? "ผู้เยี่ยมชม (Visitor)" : "ผู้ดูข้อมูล"}</span></td>
              <td><span class="access-log-event-badge ${r.event === "logout" ? "logout" : "login"}">${r.event === "logout" ? "ออกจากระบบ" : "เข้าสู่ระบบ"}</span></td>
            </tr>`).join("") : `<tr><td colspan="7" style="text-align:center; color:var(--text-faint);">ยังไม่มีประวัติการเข้าใช้งาน</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }
  function closeAccessLogPage() {
    accessLogPageEl.classList.add("hidden");
    appShellEl.classList.remove("hidden");
  }
  accessLogBtnEl.addEventListener("click", openAccessLogPage);
  accessLogBackBtnEl.addEventListener("click", closeAccessLogPage);

  /* ---------------- Visitor overview (Operations Overview) — read-only, no login required ----------------
     สำหรับผู้ที่ไม่มีบัญชี/รหัสผ่าน: ระบุรหัสประจำตัว+ชื่อ-นามสกุลเพื่อบันทึกประวัติการเข้าชม (calendar_access_log,
     role="visitor") แล้วเข้าดูหน้าภาพรวม (อ่านอย่างเดียว) แยกต่างหากจากแอปหลักทั้งหมด ไม่มีสิทธิ์แก้ไขข้อมูลใดๆ */
  const ovState = { cursor: new Date(TODAY) };

  function ovMinStaffing() { return Math.max(1, Math.ceil(EMPLOYEES.length / 2)); }
  function ovEmployeeStatusOnDate(empName, iso) {
    if (leavesOnDate(empName, iso).length) return "leave";
    const tasks = tasksForEmployeeOnDate(empName, iso);
    if (tasks.some(t => t.travelOrder)) return "travel";
    if (tasks.some(t => !isHomeUnitPea(t.targetPEA))) return "out";
    return "available";
  }
  function ovTeamStatusForDate(iso) {
    const buckets = { available: [], out: [], travel: [], leave: [] };
    EMPLOYEES.forEach(e => buckets[ovEmployeeStatusOnDate(e.name, iso)].push(e.name));
    return buckets;
  }
  function tasksInMonth(year, month0) {
    return TASKS.filter(t => { const d = fromISO(t.date); return d.getFullYear() === year && d.getMonth() === month0; });
  }
  // นับ "คนที่มีชื่อทำงานวันนั้น" เฉพาะวันหยุดราชการ/วันหยุดนักขัตฤกษ์ (เสาร์-อาทิตย์ หรืออยู่ใน HOLIDAYS)
  // เป็นตัวเลขโอทีของวันนั้นในปฏิทินภาพรวม — ไม่รวมเงื่อนไข "นัดหมายหลังเวลา" ของ isOTTask เพราะอันนั้นวัดโอทีระดับงาน ไม่ใช่ระดับวันหยุด
  function isHolidayDate(iso) {
    const dow = fromISO(iso).getDay();
    return dow === 0 || dow === 6 || !!HOLIDAYS[iso];
  }
  function ovOTCountForDate(iso) {
    if (!isHolidayDate(iso)) return 0;
    const names = new Set();
    TASKS.filter(t => t.date === iso).forEach(t => (t.teamMembers || []).forEach(m => names.add(m)));
    return names.size;
  }
  function ovMonthAvailability(year, month0) {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const out = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = new Date(year, month0, day).getDay();
      const b = ovTeamStatusForDate(iso);
      out.push({ iso, day, dow, available: b.available.length, out: b.out.length, travel: b.travel.length, leave: b.leave.length, ot: ovOTCountForDate(iso) });
    }
    return out;
  }
  function ovWorkDistribution(tasks) {
    const buckets = { hotline: 0, travel: 0, ot: 0, office: 0, other: 0 };
    tasks.forEach(t => {
      if (t.travelOrder) buckets.travel++;
      else if (isOTTask(t)) buckets.ot++;
      else if (isHomeUnitPea(t.targetPEA)) buckets.hotline++;
      else if (t.targetPEA) buckets.office++;
      else buckets.other++;
    });
    return buckets;
  }
  function ovStatCardHtml(icon, cls, label, value) {
    return `<div class="ov-stat-card ${cls}"><div class="ov-stat-icon">${icon}</div><div><div class="ov-stat-value">${esc(value)}</div><div class="ov-stat-label">${esc(label)}</div></div></div>`;
  }
  function ovStatusBarHtml(counts, total) {
    const pct = k => total ? (counts[k] / total * 100) : 0;
    return `
      <div class="ov-status-bar">
        <div class="ov-status-seg available" style="width:${pct("available")}%"></div>
        <div class="ov-status-seg out" style="width:${pct("out")}%"></div>
        <div class="ov-status-seg travel" style="width:${pct("travel")}%"></div>
        <div class="ov-status-seg leave" style="width:${pct("leave")}%"></div>
      </div>`;
  }
  function ovCalCellHtml(d) {
    // วันที่ยังไม่ถึง — เลขจำนวน "พร้อมปฏิบัติงาน" เป็นแค่ค่าตั้งต้น (ยังไม่เกิดจริง) ให้ขึ้นสีเทาแทนสีเขียว
    // กันสับสนว่าเป็นสถานะที่ยืนยันแล้ว
    const isFuture = d.iso > TODAY_ISO;
    const parts = [];
    // วันที่มีทั้งโอที (ม่วง) และพร้อมปฏิบัติงาน (เขียว) พร้อมกัน ให้โชว์แค่ม่วง กันตัวเลขซ้อนกันแน่นเกินไป
    if (d.available && !d.ot) parts.push(`<span class="ov-cal-num ${isFuture ? "future" : "available"}">${d.available}</span>`);
    if (d.out) parts.push(`<span class="ov-cal-num out">${d.out}</span>`);
    if (d.travel) parts.push(`<span class="ov-cal-num travel">${d.travel}</span>`);
    if (d.leave) parts.push(`<span class="ov-cal-num leave">${d.leave}</span>`);
    if (d.ot) parts.push(`<span class="ov-cal-num ot" title="โอที (วันหยุดราชการ/นักขัตฤกษ์)">⚡${d.ot}</span>`);
    return `<div class="ov-cal-cell ${d.iso === TODAY_ISO ? "is-today" : ""}" data-iso="${d.iso}"><div class="ov-cal-day">${d.day}</div><div class="ov-cal-nums">${parts.join("")}</div></div>`;
  }
  function ovCapacityRowHtml(emp, year, month0, bizDaysTotal) {
    const stats = computeEmployeeMonthStats(emp.name, year, month0);
    const pct = bizDaysTotal ? Math.round(stats.workDays / bizDaysTotal * 100) : 0;
    return `
      <div class="ov-capacity-row">
        <div class="ov-capacity-name">${esc(emp.name)}${emp.role_title ? ` <span class="role-title-badge">${esc(emp.role_title)}</span>` : ""}</div>
        <div class="ov-capacity-bar-wrap"><div class="ov-capacity-bar" style="width:${pct}%"></div></div>
        <div class="ov-capacity-pct">${pct}%</div>
      </div>`;
  }
  const OV_DIST_SEGMENTS = [
    { key: "hotline", label: "Local Duty", color: "#7E4D7A", desc: "งานในพื้นที่ กฟฟ.บางปะกง ไม่มีคำสั่งเดินทาง" },
    { key: "travel", label: "Official Travel", color: "#B39DDB", desc: "งานที่มีคำสั่งเดินทางออกนอกพื้นที่" },
    { key: "office", label: "Off-site Duty", color: "#E78FA3", desc: "งานนอกพื้นที่บ้าน ไม่มีคำสั่งเดินทาง" },
    { key: "ot", label: "Overtime (OT)", color: "#FFC7A6", desc: "งานที่นับเป็นวันโอที (นอกเวลา/วันหยุด)" },
    { key: "other", label: "Unspecified", color: "#F1F3F5", desc: "งานที่ไม่ได้ระบุการไฟฟ้าปลายทาง" }
  ];
  function ovDonutHtml(dist) {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    let acc = 0;
    const stops = OV_DIST_SEGMENTS.map(s => {
      const val = dist[s.key] || 0;
      const pct = total ? (val / total * 100) : 0;
      const from = acc; acc += pct;
      return `${s.color} ${from}% ${acc}%`;
    }).join(", ");
    return `
      <div class="ov-donut-wrap">
        <div class="ov-donut" style="background: conic-gradient(${total ? stops : "var(--border-soft) 0% 100%"});"><div class="ov-donut-hole"><b>${total}</b><span>งาน</span></div></div>
        <div class="ov-donut-legend">
          ${OV_DIST_SEGMENTS.map(s => {
            const val = dist[s.key] || 0;
            const pct = total ? Math.round(val / total * 100) : 0;
            return `<div class="ov-donut-legend-row">
              <span class="ov-donut-dot" style="background:${s.color}"></span>
              <div class="ov-donut-legend-text"><div class="ov-donut-legend-head"><span>${esc(s.label)}</span><b>${val} (${pct}%)</b></div><div class="ov-donut-legend-desc">${esc(s.desc)}</div></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }
  function ovSummaryTableHtml(year, month0) {
    const bizDays = businessDaysProgress(year, month0);
    const sorted = EMPLOYEES.slice().sort((a, b) => (b.role_title ? 1 : 0) - (a.role_title ? 1 : 0));
    return `
      <div class="team-summary-wrap">
        <table class="team-summary-table">
          <thead><tr>
            <th>พนักงาน</th><th>บทบาท</th><th>ปฏิบัติงาน / วันทำการ</th><th>คำสั่งเดินทาง (วัน)</th><th>OT (วัน)</th><th>ลา (วัน)</th><th>Work Activity</th>
          </tr></thead>
          <tbody>
            ${sorted.map(e => {
              const stats = computeEmployeeMonthStats(e.name, year, month0);
              const pct = bizDays.total ? Math.round(stats.workDays / bizDays.total * 100) : 0;
              const pctColor = pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--orange)" : "var(--red)";
              return `<tr class="ov-summary-row" data-employee="${esc(e.name)}">
                <td class="ts-name-cell">${esc(e.name)}${e.role_title ? ` <span class="role-title-badge">${esc(e.role_title)}</span>` : ""}</td>
                <td>${esc(e.position || "-")}</td>
                <td>${stats.workDays} / ${bizDays.total} วัน</td>
                <td>${stats.travelOrderDays}</td>
                <td>${stats.otDays}</td>
                <td>${stats.leaveDays}</td>
                <td><b style="color:${pctColor}">${pct}%</b></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }
  // คลิกแถวพนักงานในตารางสรุป (โหมด Visitor) แล้วดูได้แค่ "พื้นที่ปฏิบัติงาน" + "ชื่องาน" ต่อวัน
  // ไม่แสดงรายละเอียดอื่น (เวลา/ทีม/รถ/ผู้ประสาน/หมายเหตุ ฯลฯ) ตามที่ขอ
  function ovEmployeeWorkListHtml(employeeName, year, month0) {
    const tasks = tasksInMonth(year, month0).filter(t => (t.teamMembers || []).some(m => m.includes(employeeName)));
    const byDate = {};
    tasks.forEach(t => { (byDate[t.date] = byDate[t.date] || []).push(t); });
    const dates = Object.keys(byDate).sort();
    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">พื้นที่ปฏิบัติงานและงานที่มอบหมาย (${THAI_MONTHS[month0]} พ.ศ. ${beYear(new Date(year, month0, 1))})</div>
          <h2>${esc(employeeName)}</h2>
        </div>
        <button class="modal-close" id="ov-modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        ${dates.length ? dates.map(iso => {
          const d = fromISO(iso);
          const items = byDate[iso];
          return `
            <div class="detail-section">
              <div class="detail-section-title">${WD_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${beYear(d)}</div>
              <div class="detail-list">
                ${items.map(t => `<div class="ov-work-item"><b>${esc(t.workArea || "-")}</b><span>${esc(t.title)}</span></div>`).join("")}
              </div>
            </div>`;
        }).join("") : `<div class="empty-state">ไม่มีงานที่มอบหมายในเดือนนี้</div>`}
      </div>`;
  }
  function openOvEmployeeModal(employeeName, year, month0) {
    ovModalBodyEl.innerHTML = ovEmployeeWorkListHtml(employeeName, year, month0);
    ovModalBackdropEl.classList.add("open");
    $("#ov-modal-close-btn").addEventListener("click", closeOvModal);
  }
  function ovDateWorkListHtml(iso) {
    const d = fromISO(iso);
    const tasks = TASKS.filter(t => t.date === iso);
    const byEmployee = {};
    tasks.forEach(t => {
      (t.teamMembers && t.teamMembers.length ? t.teamMembers : ["ยังไม่ระบุผู้ปฏิบัติงาน"]).forEach(m => {
        (byEmployee[m] = byEmployee[m] || []).push(t);
      });
    });
    const names = Object.keys(byEmployee).sort();
    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">พื้นที่ปฏิบัติงานวันนี้</div>
          <h2>${WD_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ. ${beYear(d)}</h2>
        </div>
        <button class="modal-close" id="ov-modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        ${names.length ? names.map(name => `
          <div class="detail-section">
            <div class="detail-section-title">${esc(name)}</div>
            <div class="detail-list">
              ${byEmployee[name].map(t => `<div class="ov-work-item"><b>${esc(t.workArea || "-")}</b><span>${esc(t.title)}</span></div>`).join("")}
            </div>
          </div>`).join("") : `<div class="empty-state">ไม่มีงานในวันนี้</div>`}
      </div>`;
  }
  function openOvDateModal(iso) {
    ovModalBodyEl.innerHTML = ovDateWorkListHtml(iso);
    ovModalBackdropEl.classList.add("open");
    $("#ov-modal-close-btn").addEventListener("click", closeOvModal);
  }
  function closeOvModal() { ovModalBackdropEl.classList.remove("open"); }
  ovModalBackdropEl.addEventListener("click", (ev) => { if (ev.target === ovModalBackdropEl) closeOvModal(); });

  // เวอร์ชันอ่านอย่างเดียวของตาราง Gantt สำหรับหน้าภาพรวม (Visitor) — ไม่มีปุ่มเพิ่ม/แก้ไข/ลบ
  // เพราะผู้เข้าชมโหมดนี้ไม่ได้ล็อกอิน จึงไม่มี CURRENT_USER ให้ตรวจสิทธิ์แบบหน้าแอปหลัก
  function ovGanttRowHtml(group, i, year, month0, monthStart, monthEnd, daysInMonth) {
    const color = GANTT_COLORS[i % GANTT_COLORS.length];
    const dest = group.key;
    const bars = group.plans.map(plan => {
      const bounds = ganttPlanBounds(plan, monthStart, monthEnd);
      if (!bounds) return "";
      const barLabel = ganttBarLabel(plan);
      return `<div class="gantt-bar" style="grid-column: ${bounds.startDay} / ${bounds.endDay + 1}; background:${color}; cursor:default;" title="${esc(dest)} (${esc(barLabel)})"></div>`;
    }).join("");
    return `
      <div class="gantt-row">
        <div class="gantt-row-num">${i + 1}</div>
        <div class="gantt-row-label" style="--gantt-accent:${color}">
          <div class="gantt-row-title">${esc(dest)}</div>
        </div>
        <div class="gantt-row-track" style="${ganttTrackStyle(year, month0, daysInMonth)}">
          ${bars}
        </div>
      </div>`;
  }
  // จอมือถือแคบเกินกว่าจะบีบตารางรายวันทั้งเดือนให้อ่านออก เลยแสดงเป็นการ์ดรายการแทน
  // (สลับด้วย CSS media query เหมือนตารางระเบียบการลาที่ทำไว้ก่อนหน้า ไม่ใช้ JS ตรวจขนาดจอ)
  function ovGanttMobileListHtml(groups) {
    return `<div class="gantt-mobile-list">
      ${groups.map((g, i) => {
        const color = GANTT_COLORS[i % GANTT_COLORS.length];
        const ranges = g.plans.map(plan => `<span class="gantt-mobile-range" style="background:${color}">${esc(ganttBarLabel(plan))}</span>`).join("");
        return `<div class="gantt-mobile-item" style="--gantt-accent:${color}">
          <div class="gantt-mobile-dest">${esc(g.key)}</div>
          <div class="gantt-mobile-ranges">${ranges}</div>
        </div>`;
      }).join("")}
    </div>`;
  }
  function ovGanttPanelHtml(year, month0) {
    const monthStart = new Date(year, month0, 1);
    const monthEnd = new Date(year, month0 + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const plans = TEAM_PLANS.filter(p => ganttPlanBounds(p, monthStart, monthEnd));
    const groups = ganttGroupPlans(plans);
    return `
      <div class="ov-panel">
        <div class="ov-panel-title">🗺️ แผนปฏิบัติการ (คำสั่งเดินทางของทีม)</div>
        ${groups.length ? `
          ${ovGanttMobileListHtml(groups)}
          <div class="gantt-wrap">
            <div class="gantt-header-row">
              <div class="gantt-row-num">ลำดับ</div>
              <div class="gantt-row-label">พื้นที่ปฏิบัติงาน</div>
              <div class="gantt-row-track" style="${ganttTrackStyle(year, month0, daysInMonth)}">
                ${Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dow = new Date(year, month0, day).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return `<div class="gantt-daynum ${isWeekend ? "weekend" : ""}"><div>${day}</div><div class="gantt-daynum-wd">${WD_SHORT[dow]}</div></div>`;
                }).join("")}
              </div>
            </div>
            ${groups.map((g, i) => ovGanttRowHtml(g, i, year, month0, monthStart, monthEnd, daysInMonth)).join("")}
          </div>
        ` : `<div class="gantt-empty">ยังไม่มีแผนงานในเดือนนี้</div>`}
      </div>`;
  }
  function ovTodoPanelHtml(year, month0) {
    const month = month0 + 1;
    const items = MONTHLY_TODOS
      .filter(t => t.target_month === month && t.target_year === year)
      .slice()
      .sort((a, b) => (a.done === b.done ? a.created_at.localeCompare(b.created_at) : a.done ? 1 : -1));
    return `
      <div class="ov-panel">
        <div class="ov-panel-title">📌 งานที่ต้องทำเดือนนี้ (${THAI_MONTHS[month0]} พ.ศ. ${beYear(new Date(year, month0, 1))})</div>
        <div class="todo-list">
          ${items.length ? items.map(todoRowHtml).join("") : `<div class="todo-empty">ยังไม่มีรายการงานที่ต้องทำเดือนนี้</div>`}
        </div>
      </div>`;
  }
  function overviewPageHtml(year, month0) {
    const bizDays = businessDaysProgress(year, month0);
    const monthTasks = tasksInMonth(year, month0);
    const todayStatus = ovTeamStatusForDate(TODAY_ISO);
    const totalStaff = EMPLOYEES.length;
    const availPct = totalStaff ? Math.round(todayStatus.available.length / totalStaff * 100) : 0;
    const travelDays = countUniqueDays(monthTasks, t => t.travelOrder);
    const otDays = countUniqueDays(monthTasks, isOTTask);
    const minStaffing = ovMinStaffing();
    const avail = ovMonthAvailability(year, month0);
    const dist = ovWorkDistribution(monthTasks);

    const startDow = new Date(year, month0, 1).getDay();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    avail.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);

    return `
      <header class="ov-header">
        <div class="ov-header-inner">
          <div class="ov-brand">
            <div class="app-brand-mark">⚡</div>
            <div>
              <h1>HOTLINE PEA BPK — Operations Overview</h1>
              <div class="sub">ภาพรวมกำลังคน แผนปฏิบัติงาน และสถานะความพร้อมทีม Hotline</div>
            </div>
          </div>
          <div class="ov-header-right">
            <div class="ov-header-nav">
              <button type="button" class="nav-btn" id="ov-prev">‹</button>
              <span class="ov-header-month">${THAI_MONTHS[month0]} พ.ศ. ${beYear(new Date(year, month0, 1))}</span>
              <button type="button" class="nav-btn" id="ov-next">›</button>
            </div>
            <span class="ov-mode-badge">👁️ Reviewer Mode · View Only</span>
            <span class="ov-static-select">หน่วยงาน: กฟฟ.บางปะกง</span>
            <span class="ov-static-select">ทีม: Hotline PEA BPK</span>
            <button type="button" class="btn-secondary" id="ov-export-btn">⬆ Export</button>
            <button type="button" class="btn-secondary" id="ov-exit-btn">ออกจากหน้าภาพรวม</button>
          </div>
        </div>
      </header>
      <div class="ov-body">
        <div class="ov-stat-row">
          ${ovStatCardHtml("👥", "staff", "ทีมปฏิบัติงาน", `${totalStaff} คน`)}
          ${ovStatCardHtml("📋", "tasks", "งานเดือนนี้", `${monthTasks.length} งาน`)}
          ${ovStatCardHtml("✅", "avail", "ความพร้อมทีม (วันนี้)", `${availPct}%`)}
          ${ovStatCardHtml("✈️", "travel", "คำสั่งเดินทาง", `${travelDays} วัน`)}
          ${ovStatCardHtml("⚡", "ot", "OT", `${otDays} วัน`)}
        </div>

        ${ovGanttPanelHtml(year, month0)}

        ${ovTodoPanelHtml(year, month0)}

        <div class="ov-panel">
          <div class="ov-panel-title">👥 สถานะทีมวันนี้</div>
          <div class="ov-status-legend ov-status-legend-row">
            <div class="ov-status-item"><span class="dot available"></span>พร้อมปฏิบัติงาน <b>${todayStatus.available.length} คน</b></div>
            <div class="ov-status-item"><span class="dot out"></span>นอกพื้นที่ <b>${todayStatus.out.length} คน</b></div>
            <div class="ov-status-item"><span class="dot travel"></span>คำสั่งเดินทาง <b>${todayStatus.travel.length} คน</b></div>
            <div class="ov-status-item"><span class="dot leave"></span>ลา <b>${todayStatus.leave.length} คน</b></div>
          </div>
          <div class="ov-avail-head"><span>Team Availability</span><b>${availPct}%</b></div>
          ${ovStatusBarHtml({ available: todayStatus.available.length, out: todayStatus.out.length, travel: todayStatus.travel.length, leave: todayStatus.leave.length }, totalStaff)}
          <div class="ov-avail-note">ขั้นต่ำที่กำหนด: ${minStaffing} คน / ปัจจุบันพร้อม ${todayStatus.available.length} คน</div>
        </div>

        <div class="ov-row3">
          <div class="ov-panel ov-cal-panel">
            <div class="ov-panel-title">📅 Schedule</div>
            <div class="weekday-row">${WD_SHORT.map((w, i) => `<div class="wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("")}</div>
            <div class="ov-cal-grid">
              ${cells.map(d => d ? ovCalCellHtml(d) : `<div class="ov-cal-cell empty"></div>`).join("")}
            </div>
            <div class="ov-cal-legend">
              <div class="ov-status-item"><span class="dot available"></span>พร้อมปฏิบัติงาน</div>
              <div class="ov-status-item"><span class="dot out"></span>นอกพื้นที่</div>
              <div class="ov-status-item"><span class="dot travel"></span>คำสั่งเดินทาง</div>
              <div class="ov-status-item"><span class="dot leave"></span>ลา</div>
              <div class="ov-status-item"><span class="dot ot"></span>โอที (วันหยุดราชการ/นักขัตฤกษ์)</div>
            </div>
          </div>
          <div class="ov-side-col">
            <div class="ov-panel">
              <div class="ov-panel-title">📈 Team Capacity</div>
              <div class="ov-capacity-list">
                ${EMPLOYEES.slice().sort((a, b) => (b.role_title ? 1 : 0) - (a.role_title ? 1 : 0)).map(e => ovCapacityRowHtml(e, year, month0, bizDays.total)).join("")}
              </div>
            </div>
            <div class="ov-panel">
              <div class="ov-panel-title">🥧 Work Assignment Breakdown</div>
              ${ovDonutHtml(dist)}
            </div>
          </div>
        </div>

        <div class="ov-panel">
          <div class="ov-panel-title">📄 สรุปผลการปฏิบัติงานรายบุคคล (${THAI_MONTHS[month0]} พ.ศ. ${beYear(new Date(year, month0, 1))})</div>
          ${EMPLOYEES.length ? ovSummaryTableHtml(year, month0) : `<div class="empty-state">ยังไม่มีรายชื่อพนักงานในระบบ</div>`}
        </div>

        <div class="ov-footer-note">ข้อมูลทั้งหมดคำนวณจากฐานข้อมูลจริงของระบบปฏิทินงาน Hotline PEA BPK ณ เวลาที่เข้าชม · โหมด Visitor เป็นการดูข้อมูลอย่างเดียว ไม่สามารถแก้ไขข้อมูลได้</div>
      </div>`;
  }
  function renderOverviewPage() {
    overviewPageBodyEl.innerHTML = overviewPageHtml(ovState.cursor.getFullYear(), ovState.cursor.getMonth());
    bindOverviewEvents();
  }
  function bindOverviewEvents() {
    $("#ov-prev").addEventListener("click", () => { ovState.cursor = addMonths(ovState.cursor, -1); renderOverviewPage(); });
    $("#ov-next").addEventListener("click", () => { ovState.cursor = addMonths(ovState.cursor, 1); renderOverviewPage(); });
    $("#ov-export-btn").addEventListener("click", () => window.print());
    $("#ov-exit-btn").addEventListener("click", closeOverviewPage);
    overviewPageBodyEl.querySelectorAll(".ov-summary-row").forEach(row => {
      row.addEventListener("click", () => openOvEmployeeModal(row.getAttribute("data-employee"), ovState.cursor.getFullYear(), ovState.cursor.getMonth()));
    });
    overviewPageBodyEl.querySelectorAll(".ov-cal-cell[data-iso]").forEach(cell => {
      cell.addEventListener("click", () => openOvDateModal(cell.getAttribute("data-iso")));
    });
  }
  async function openVisitorOverview() {
    loginScreenEl.classList.add("hidden");
    overviewPageEl.classList.remove("hidden");
    overviewPageBodyEl.innerHTML = `<div class="empty-state">กำลังโหลดข้อมูลภาพรวม...</div>`;
    window.scrollTo(0, 0);
    await Promise.all([loadTasks(), loadPeopleData(), loadTeamPlans(), loadMonthlyTodos()]);
    ovState.cursor = new Date(TODAY);
    renderOverviewPage();
  }
  // ผู้ล็อกอินอยู่แล้ว (แอดมิน/ผู้ดูข้อมูล) กดดูมุมมอง Visitor ได้โดยไม่ต้องออกจากระบบ — ใช้ข้อมูลที่โหลดไว้แล้วจาก init()
  function openOverviewFromApp() {
    appRootEl.classList.add("hidden");
    overviewPageEl.classList.remove("hidden");
    window.scrollTo(0, 0);
    ovState.cursor = new Date(TODAY);
    renderOverviewPage();
  }
  function closeOverviewPage() {
    overviewPageEl.classList.add("hidden");
    if (CURRENT_USER) {
      appRootEl.classList.remove("hidden");
    } else {
      loginScreenEl.classList.remove("hidden");
      visitorFormEl.classList.add("hidden");
      visitorFormEl.reset();
    }
  }
  if (viewOverviewBtnEl) viewOverviewBtnEl.addEventListener("click", openOverviewFromApp);
  visitorToggleBtnEl.addEventListener("click", () => { visitorFormEl.classList.toggle("hidden"); });
  visitorFormEl.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(visitorFormEl);
    const visitorEmployeeNo = (fd.get("visitorEmployeeNo") || "").trim();
    const visitorName = (fd.get("visitorName") || "").trim();
    const errEl = $("#visitor-form-error");
    errEl.innerHTML = "";
    if (!visitorEmployeeNo || !visitorName) { errEl.innerHTML = `<div class="form-error">กรุณากรอกรหัสประจำตัวและชื่อ-นามสกุลให้ครบ</div>`; return; }
    const btn = visitorFormEl.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "กำลังเข้าสู่ระบบ...";
    const { error } = await CAL_SB.from("calendar_access_log").insert([{
      employee_no: visitorEmployeeNo, employee_name: visitorName, position: null, department: HOME_UNIT_PEA, role: "visitor", event: "login"
    }]);
    if (error) {
      errEl.innerHTML = `<div class="form-error">บันทึกประวัติการเข้าชมไม่สำเร็จ: ${esc(error.message)}</div>`;
      btn.disabled = false;
      btn.textContent = "เข้าชมภาพรวม";
      return;
    }
    btn.disabled = false;
    btn.textContent = "เข้าชมภาพรวม";
    await openVisitorOverview();
  });

  /* ---------------- Password change (บังคับเปลี่ยนตอนแรกเข้า / เปลี่ยนเองภายหลังได้) ---------------- */
  function buildPasswordChangeHtml(forced) {
    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">${forced ? "ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน"}</div>
          <h2>ตั้งรหัสผ่านใหม่สำหรับ ${esc(CURRENT_USER.name)}</h2>
        </div>
        ${forced ? "" : `<button class="modal-close" id="modal-close-btn">✕</button>`}
      </div>
      <div class="modal-body">
        ${forced ? `<div class="form-hint" style="margin-bottom:12px;">นี่คือการเข้าสู่ระบบครั้งแรกด้วยรหัสผ่านเริ่มต้น (12345) กรุณาตั้งรหัสผ่านใหม่ของตัวเองก่อนใช้งานต่อ</div>` : ""}
        <form id="password-change-form">
          <div class="form-grid full">
            <div class="form-field">
              <label>รหัสผ่านใหม่ <span class="req">*</span></label>
              <input type="password" name="newPassword" required minlength="4" autocomplete="new-password" />
            </div>
            <div class="form-field">
              <label>ยืนยันรหัสผ่านใหม่ <span class="req">*</span></label>
              <input type="password" name="confirmPassword" required minlength="4" autocomplete="new-password" />
            </div>
          </div>
          <div id="password-change-error"></div>
          <div class="form-actions">
            <span class="form-hint">ตั้งรหัสผ่านอย่างน้อย 4 ตัวอักษร</span>
            <div class="form-actions-right">
              ${forced ? "" : `<button type="button" class="btn-secondary" id="password-cancel-btn">ยกเลิก</button>`}
              <button type="submit" class="btn-primary">บันทึกรหัสผ่านใหม่</button>
            </div>
          </div>
        </form>
      </div>`;
  }
  function openPasswordChangeModal(forced) {
    modalBodyEl.innerHTML = buildPasswordChangeHtml(forced);
    modalBackdropEl.classList.add("open");
    modalLocked = !!forced;
    if (!forced) {
      $("#modal-close-btn").addEventListener("click", closeModal);
      $("#password-cancel-btn").addEventListener("click", closeModal);
    }
    $("#password-change-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const p1 = fd.get("newPassword") || "";
      const p2 = fd.get("confirmPassword") || "";
      const errEl = $("#password-change-error");
      errEl.innerHTML = "";
      if (p1.length < 4) { errEl.innerHTML = `<div class="form-error">รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร</div>`; return; }
      if (p1 !== p2) { errEl.innerHTML = `<div class="form-error">รหัสผ่านทั้งสองช่องไม่ตรงกัน</div>`; return; }
      const btn = ev.target.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "กำลังบันทึก...";
      const salt = randomHex(16);
      const hash = await hashPassword(p1, salt);
      const { error } = await CAL_SB.from("calendar_employees")
        .update({ password_salt: salt, password_hash: hash, must_change_password: false }).eq("id", CURRENT_USER.id);
      if (error) {
        errEl.innerHTML = `<div class="form-error">บันทึกไม่สำเร็จ: ${esc(error.message)}</div>`;
        btn.disabled = false;
        btn.textContent = "บันทึกรหัสผ่านใหม่";
        return;
      }
      const wasForced = modalLocked;
      modalLocked = false;
      closeModal();
      if (wasForced) init();
    });
  }
  changePasswordBtnEl.addEventListener("click", () => openPasswordChangeModal(false));

  /* ---------------- Login / logout ---------------- */
  function showLoginError(msg) { loginErrorEl.innerHTML = `<div class="form-error">${esc(msg)}</div>`; }
  function enterApp(mustChangePassword) {
    loginScreenEl.classList.add("hidden");
    appRootEl.classList.remove("hidden");
    document.body.classList.toggle("role-reviewer", !isAdmin());
    userNameLabelEl.textContent = `${CURRENT_USER.name}${CURRENT_USER.position ? " (" + CURRENT_USER.position + ")" : ""} · ${isAdmin() ? "ผู้ดูแลระบบ" : "ผู้ดูข้อมูล"}`;
    if (mustChangePassword) openPasswordChangeModal(true);
    else init();
  }
  loginFormEl.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    loginErrorEl.innerHTML = "";
    const fd = new FormData(loginFormEl);
    const employeeNo = (fd.get("employeeNo") || "").trim();
    const password = fd.get("password") || "";
    if (!employeeNo || !password) { showLoginError("กรุณากรอกรหัสประจำตัวและรหัสผ่าน"); return; }
    const submitBtn = loginFormEl.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังเข้าสู่ระบบ...";
    let data, error;
    try {
      ({ data, error } = await CAL_SB.from("calendar_employees").select("*").eq("employee_no", employeeNo));
    } catch (ex) {
      showLoginError("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " + (ex && ex.message ? ex.message : String(ex)));
      submitBtn.disabled = false; submitBtn.textContent = "เข้าสู่ระบบ";
      return;
    }
    if (error) {
      showLoginError("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " + error.message);
      submitBtn.disabled = false; submitBtn.textContent = "เข้าสู่ระบบ";
      return;
    }
    const row = data && data[0];
    if (!row || !row.password_hash || !row.password_salt) {
      showLoginError("ไม่พบผู้ใช้นี้ในระบบ");
      submitBtn.disabled = false; submitBtn.textContent = "เข้าสู่ระบบ";
      return;
    }
    const hash = await hashPassword(password, row.password_salt);
    if (hash !== row.password_hash) {
      showLoginError("รหัสผ่านไม่ถูกต้อง");
      submitBtn.disabled = false; submitBtn.textContent = "เข้าสู่ระบบ";
      return;
    }
    CURRENT_USER = { id: row.id, name: row.name, position: row.position, employeeNo: row.employee_no, role: row.role };
    saveSession(CURRENT_USER);
    await logAccessEvent("login");
    enterApp(row.must_change_password);
  });
  logoutBtnEl.addEventListener("click", async () => {
    if (!confirm("ยืนยันออกจากระบบ?")) return;
    await logAccessEvent("logout");
    clearSession();
    location.reload();
  });
  function logAccessEvent(event) {
    if (!CURRENT_USER) return Promise.resolve();
    return CAL_SB.from("calendar_access_log").insert([{
      employee_no: CURRENT_USER.employeeNo, employee_name: CURRENT_USER.name, position: CURRENT_USER.position || null,
      department: HOME_UNIT_PEA, role: CURRENT_USER.role, event
    }]);
  }

  /* ---------------- Monthly to-do checklist panel ---------------- */
  function fmtTodoDate(iso) {
    if (!iso) return "";
    const d = fromISO(iso);
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${beYear(d)}`;
  }
  function todoRowHtml(item) {
    const assignees = item.assignees || [];
    return `
      <div class="todo-row ${item.done ? "done" : ""}" data-id="${esc(item.id)}">
        <div class="todo-row-main">
          <span class="todo-status-dot ${item.done ? "done" : "pending"}"></span>
          <span class="todo-row-title">${esc(item.title)}</span>
          ${item.done
            ? `<span class="todo-done-note">✓ ดำเนินการแล้ว${item.done_date ? " · " + fmtTodoDate(item.done_date) : ""}</span>`
            : `<span class="todo-pending-note">รอดำเนินการ</span>`}
          ${assignees.length ? `<span class="todo-assignee-tags">${assignees.map(n => `<span class="todo-assignee-tag">👤 ${esc(n)}</span>`).join("")}</span>` : ""}
        </div>
        <div class="todo-row-actions admin-only">
          ${item.done
            ? `<button type="button" class="btn-secondary todo-undo-btn">ยกเลิกเครื่องหมาย</button>`
            : `<span class="todo-mark-inline">
                 <input type="date" class="todo-done-date-input" value="${TODAY_ISO}" />
                 <button type="button" class="btn-primary todo-mark-btn">ดำเนินการแล้ว</button>
               </span>`}
          <button type="button" class="btn-danger todo-del-btn" title="ลบรายการ">🗑</button>
        </div>
      </div>`;
  }
  function renderTodoPanel() {
    const year = state.cursor.getFullYear(), month = state.cursor.getMonth() + 1;
    todoMonthLabelEl.textContent = `(${THAI_MONTHS[month - 1]} พ.ศ. ${beYear(state.cursor)})`;
    const items = MONTHLY_TODOS
      .filter(t => t.target_month === month && t.target_year === year)
      .slice()
      .sort((a, b) => (a.done === b.done ? a.created_at.localeCompare(b.created_at) : a.done ? 1 : -1));
    todoListEl.innerHTML = items.length ? items.map(todoRowHtml).join("")
      : `<div class="todo-empty">ยังไม่มีรายการงานที่ต้องทำเดือนนี้</div>`;
    bindTodoPanelEvents(year, month);
  }
  function bindTodoPanelEvents(year, month) {
    todoListEl.querySelectorAll(".todo-mark-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!isAdmin()) return;
        const row = btn.closest(".todo-row");
        const id = row.getAttribute("data-id");
        const dateVal = row.querySelector(".todo-done-date-input").value || TODAY_ISO;
        btn.disabled = true;
        const { error } = await CAL_SB.from("calendar_monthly_todos")
          .update({ done: true, done_date: dateVal, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); btn.disabled = false; return; }
        await loadMonthlyTodos();
        renderTodoPanel();
      });
    });
    todoListEl.querySelectorAll(".todo-undo-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!isAdmin()) return;
        const id = btn.closest(".todo-row").getAttribute("data-id");
        btn.disabled = true;
        const { error } = await CAL_SB.from("calendar_monthly_todos")
          .update({ done: false, done_date: null, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); btn.disabled = false; return; }
        await loadMonthlyTodos();
        renderTodoPanel();
      });
    });
    todoListEl.querySelectorAll(".todo-del-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!isAdmin()) return;
        if (!confirm("ลบรายการนี้ออกจากรายการที่ต้องทำ?")) return;
        const id = btn.closest(".todo-row").getAttribute("data-id");
        const { error } = await CAL_SB.from("calendar_monthly_todos").delete().eq("id", id);
        if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        await loadMonthlyTodos();
        renderTodoPanel();
      });
    });
    const todoAssigneePickerEl = $("#todo-add-assignees");
    if (todoAssigneePickerEl) {
      todoAssigneePickerEl.innerHTML = EMPLOYEES.map(e =>
        `<label class="check-option"><input type="checkbox" name="assignee" value="${esc(e.name)}" /> ${esc(e.name)}</label>`
      ).join("") || `<span class="form-hint">ยังไม่มีรายชื่อพนักงานในระบบ</span>`;
    }
    todoAddFormEl.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!isAdmin()) return;
      const fd = new FormData(todoAddFormEl);
      const title = (fd.get("title") || "").trim();
      if (!title) return;
      const assignees = fd.getAll("assignee");
      const btn = todoAddFormEl.querySelector("button[type=submit]");
      btn.disabled = true;
      const { error } = await CAL_SB.from("calendar_monthly_todos")
        .insert([{ title, target_month: month, target_year: year, done: false, assignees }]);
      btn.disabled = false;
      if (error) { alert("เพิ่มไม่สำเร็จ: " + error.message); return; }
      todoAddFormEl.reset();
      await loadMonthlyTodos();
      renderTodoPanel();
    };
  }

  /* ---------------- Main render ---------------- */
  function renderAll() {
    renderToolbar();
    renderStatRow();
    renderTeamPlanGantt();
    renderTodoPanel();
    renderFilterBar();
    if (state.view === "month") renderMonthView();
    else if (state.view === "week") renderWeekView();
    else if (state.view === "day") renderDayView();
    else renderYearView();

    sideColEl.classList.toggle("hidden", state.view === "day");
    if (state.view !== "day") renderSidePanel();
  }

  async function init() {
    await Promise.all([loadOptions(), loadTasks(), loadPeopleData(), loadMonthlyTodos(), loadTeamPlans()]);
    renderAll();
  }

  function boot() {
    const session = loadSession();
    if (session && session.employeeNo && session.role) {
      CURRENT_USER = session;
      enterApp(false);
    }
    // ไม่มีเซสชันที่บันทึกไว้ — คงหน้าล็อกอินไว้เฉยๆ จนกว่าจะกรอกฟอร์มสำเร็จ
  }
  boot();
})();
