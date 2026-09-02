/* ============================================================
   PEA BPK Team Calendar - Application logic (vanilla JS, no build step)
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- Constants ---------------- */
  const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const WD_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const WD_FULL = ["วันอาทิตย์","วันจันทร์","วันอังคาร","วันพุธ","วันพฤหัสบดี","วันศุกร์","วันเสาร์"];

  const STAT_DEFS = [
    { key: "all", cls: "stat-all", label: "งานทั้งหมด", icon: "📋" },
    { key: "planned", cls: "stat-planned", label: "งานตามแผน", icon: "🗓️" },
    { key: "urgent", cls: "stat-urgent", label: "งานด่วน", icon: "⚡" },
    { key: "in", cls: "stat-in", label: "งานในพื้นที่", icon: "🟢" },
    { key: "out", cls: "stat-out", label: "งานนอกพื้นที่", icon: "🟠" }
  ];

  // "PEA อำเภอบางปะกง" คือหน่วยงานต้นสังกัด — เลือกการไฟฟ้าปลายทางนี้แล้วฟอร์มจะช่วยติ๊ก "ในพื้นที่" ให้อัตโนมัติ
  const HOME_UNIT_PEA = "PEA อำเภอบางปะกง";
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
    statFilter: null,
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
    if (!empRes.error && empRes.data) EMPLOYEES = empRes.data.slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
    if (!leaveRes.error && leaveRes.data) LEAVES = leaveRes.data;
  }

  function leaveOnDate(employeeName, iso) {
    return LEAVES.find(l => l.employee_name === employeeName && iso >= l.date_from && iso <= l.date_to) || null;
  }
  function tasksForEmployeeOnDate(employeeName, iso) {
    return TASKS.filter(t => t.date === iso && (t.teamMembers || []).some(m => m.includes(employeeName)));
  }
  function getPersonMonthData(employeeName, year, month0) {
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const out = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = new Date(year, month0, day).getDay();
      const holiday = HOLIDAYS[iso];
      const isWeekend = dow === 0 || dow === 6;
      const leave = leaveOnDate(employeeName, iso);
      const tasksForDay = tasksForEmployeeOnDate(employeeName, iso);
      const worked = tasksForDay.length > 0;
      // นับเป็นวันโอที ถ้าเป็นวันเสาร์/อาทิตย์/วันหยุดนักขัตฤกษ์ หรือมีงานที่เวลานัดหมายหน้างานหลัง 16:30 น. (งานด่วนนอกเวลาราชการ)
      const isOT = worked && (isWeekend || !!holiday || tasksForDay.some(t => t.appointTime && t.appointTime >= OT_AFTER_HOURS_TIME));
      out.push({ iso, day, dow, holiday, isWeekend, leave, tasksForDay, worked, isOT });
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
      vehicle: r.vehicle || "",
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
      if (f.vehicle && t.vehicle !== f.vehicle) return false;
      if (f.travelOrderStatus && t.travelOrderStatus !== f.travelOrderStatus) return false;
      if (f.status && t.status !== f.status) return false;
      return true;
    });
  }
  function matchStat(t, key) {
    if (key === "planned") return t.priority === "ตามแผน";
    if (key === "urgent") return t.priority === "ด่วน";
    if (key === "in") return t.areaStatus === "in";
    if (key === "out") return t.areaStatus === "out";
    return true;
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
    const fieldFiltered = applyFieldFilters(TASKS);
    return state.statFilter ? fieldFiltered.filter(t => matchStat(t, state.statFilter)) : fieldFiltered;
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
  const settingsBtnEl = $("#settings-btn");
  const personBtnEl = $("#person-btn");
  const equipmentBtnEl = $("#equipment-btn");
  const accessLogBtnEl = $("#access-log-btn");
  const appShellEl = $("#app-shell");
  const equipmentPageEl = $("#equipment-page");
  const equipmentPageBodyEl = $("#equipment-page-body");
  const equipmentBackBtnEl = $("#equipment-back-btn");
  const equipmentPageCountEl = $("#equipment-page-count");
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

  /* ---------------- Header today badge ---------------- */
  todayBadgeEl.textContent = `วันนี้ ${WD_FULL[TODAY.getDay()]} ${TODAY.getDate()} ${THAI_MONTHS[TODAY.getMonth()]} พ.ศ. ${beYear(TODAY)}`;

  /* ---------------- Stat row ---------------- */
  function renderStatRow() {
    const periodTasks = getPeriodTasks();
    const counts = {
      all: periodTasks.length,
      planned: periodTasks.filter(t => t.priority === "ตามแผน").length,
      urgent: periodTasks.filter(t => t.priority === "ด่วน").length,
      in: periodTasks.filter(t => t.areaStatus === "in").length,
      out: periodTasks.filter(t => t.areaStatus === "out").length
    };
    statRowEl.innerHTML = STAT_DEFS.map(s => {
      const active = (state.statFilter === s.key) || (s.key === "all" && !state.statFilter);
      return `<button class="stat-card ${s.cls} ${active ? "active" : ""}" data-stat="${s.key}">
        <div class="stat-label">${s.icon} ${s.label}</div>
        <div class="stat-value">${counts[s.key]}</div>
      </button>`;
    }).join("");
    statRowEl.querySelectorAll("[data-stat]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-stat");
        state.statFilter = (key === "all") ? null : (state.statFilter === key ? null : key);
        renderAll();
      });
    });
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

    const activeCount = Object.values(state.filters).filter(v => v).length + (state.statFilter ? 1 : 0);
    if (activeCount > 0) {
      filterNoteEl.classList.remove("hidden");
      filterNoteEl.textContent = `กำลังใช้ตัวกรอง ${activeCount} รายการ · พบ ${getRenderTasks().length} งาน`;
    } else {
      filterNoteEl.classList.add("hidden");
    }
  }
  $("#filter-clear-btn").addEventListener("click", () => {
    Object.keys(state.filters).forEach(k => state.filters[k] = "");
    state.statFilter = null;
    renderAll();
  });

  /* ---------------- Card renderers ---------------- */
  function areaClass(t) { return t.areaStatus === "in" ? "" : "out"; }
  function areaLabel(t) { return t.areaStatus === "in" ? "ในพื้นที่" : "นอกพื้นที่"; }

  function miniCardHtml(t) {
    return `<div class="mini-card ${areaClass(t)}" data-task="${t.id}" title="${esc(t.title)}">
      <b>${esc(t.departTime)}</b> ${esc(t.title)}
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
      html += `<div class="${classes.join(" ")}" data-date="${iso}">
        <div class="day-cell-head">
          <span class="day-num">${d.getDate()}</span>
          <span class="day-count-badge ${dayTasks.length === 0 ? "zero" : ""}">${dayTasks.length} งาน</span>
        </div>
        ${holiday ? `<div class="holiday-name">${esc(holiday)}</div>` : ""}
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
            ${detailItem("รถที่ใช้", t.vehicle)}
            ${detailItem("ผู้รับผิดชอบเตรียมอุปกรณ์", t.equipmentOwner)}
            <div class="detail-item" style="grid-column:1/-1">
              <div class="di-label">อุปกรณ์ที่ต้องใช้</div>
              <div class="detail-list">${t.equipment.map(e => `<div>${esc(e)}</div>`).join("")}</div>
            </div>
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
        <button class="btn-secondary" id="edit-task-btn">✎ แก้ไขงาน</button>
        <button class="btn-danger" id="delete-task-btn">🗑 ลบงาน</button>
      </div>`;
    modalLocked = false;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    $("#edit-task-btn").addEventListener("click", () => openFormModal(t));
    $("#delete-task-btn").addEventListener("click", () => deleteTask(t));
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
      travelOrderNo: "", travelOrderStatus: "ไม่ต้องขอคำสั่ง", team: "", teamMembers: [], vehicle: "",
      circuits: [], equipment: [], equipmentOwner: "", coordinator: "", coordinatorPhone: "", status: "วางแผน", note: ""
    };
    const workAreaOpts = combinedOptions(WORK_AREAS, x => x.workArea);
    const targetPEAOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
    const vehicleOpts = combinedOptions(VEHICLES, x => x.vehicle);
    const teamOpts = combinedOptions(Object.keys(TEAMS), x => x.team);
    const extraEquipment = t.equipment.filter(e => !EQUIPMENT_POOL.includes(e));
    const extraMembers = (t.teamMembers || []).filter(m => !EMPLOYEES.some(e => m.includes(e.name)));
    const circuitOpts = Array.from(new Set([...CIRCUITS, ...TASKS.flatMap(x => x.circuits || [])]));
    const extraCircuits = (t.circuits || []).filter(c => !circuitOpts.includes(c));

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
              <input type="text" name="workArea" list="dl-workarea" required value="${esc(t.workArea)}" placeholder="เช่น ชลบุรี, ฉะเชิงเทรา" />
            </div>
            <div class="form-field">
              <label>การไฟฟ้าปลายทาง <span class="req">*</span></label>
              <input type="text" name="targetPEA" list="dl-targetpea" required value="${esc(t.targetPEA)}" placeholder="เช่น กฟฟ.บางปะกง" />
              <div class="form-hint">พิมพ์/เลือกพื้นที่ปฏิบัติงานเป็นจังหวัดก่อน รายการตรงนี้จะกรองเหลือเฉพาะการไฟฟ้าในจังหวัดนั้นให้อัตโนมัติ</div>
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
              <div class="form-hint">พิมพ์ชื่อทีมที่เคยมี แล้วออกจากช่อง ระบบจะช่วยติ๊กรายชื่อทีมนั้นให้ หรือจะตั้งชื่อเองก็ได้</div>
            </div>
            <div class="form-field">
              <label>รถที่ใช้</label>
              <input type="text" name="vehicle" list="dl-vehicle" value="${esc(t.vehicle)}" placeholder="เช่น รถกระเช้า ทะเบียน..." />
            </div>
            <div class="form-field span2">
              <label>ชื่อวงจรที่ปฏิบัติงาน (ติ๊กได้มากกว่า 1 วงจร) <span class="circuit-sum-badge" id="circuit-sum-badge">รวม ${t.circuits.length} วงจร</span></label>
              <div id="circuit-check-grid">
                ${circuitOpts.length ? circuitPickerHtml(circuitOpts, t.circuits) : `<span class="form-hint">ยังไม่มีรายชื่อวงจรในระบบ — เพิ่มได้ที่ "⚙ จัดการตัวเลือก"</span>`}
              </div>
              <input type="text" name="circuitOther" style="margin-top:6px" placeholder="ชื่อวงจรอื่นๆ นอกเหนือรายการ (คั่นด้วยจุลภาค)" value="${esc(extraCircuits.join(", "))}" />
            </div>
            <div class="form-field span2">
              <label>คนที่ไปงานนี้ (ติ๊กชื่อ — จัดทีมตามความเหมาะสมของแต่ละงานได้อิสระ)</label>
              <div class="check-grid">
                ${EMPLOYEES.map(e => `<label class="check-option"><input type="checkbox" name="teamMemberEmp" value="${esc(e.name)}" ${t.teamMembers.some(m => m.includes(e.name)) ? "checked" : ""}/> ${esc(e.name)}${e.position ? ` (${esc(e.position)})` : ""}</label>`).join("") || `<span class="form-hint">ยังไม่มีรายชื่อพนักงานในระบบ — เพิ่มได้ที่ปฏิทินรายบุคคล</span>`}
              </div>
              <input type="text" name="teamMembersOther" style="margin-top:6px" placeholder="ชื่อเพิ่มเติมนอกทะเบียนพนักงาน (คั่นด้วยจุลภาค)" value="${esc(extraMembers.join(", "))}" />
            </div>
            <div class="form-field span2">
              <label>อุปกรณ์ที่ต้องใช้ (ติ๊กได้มากกว่า 1 รายการ)</label>
              <div class="check-grid">
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
              <label class="urgent-toggle"><input type="checkbox" name="urgent" ${t.priority === "ด่วน" ? "checked" : ""}/> ⚡ ติ๊กถ้าเป็นงานด่วน (ไม่ติ๊ก = งานตามแผน)</label>
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
      ${datalistHtml("dl-workarea", workAreaOpts)}
      ${datalistHtml("dl-targetpea", targetPeaOptionsForWorkArea(targetPEAOpts, t.workArea))}
      ${datalistHtml("dl-vehicle", vehicleOpts)}
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

    // เลือก/พิมพ์ "พื้นที่ปฏิบัติงาน" เป็นจังหวัดที่รู้จัก แล้วกรองรายการ "การไฟฟ้าปลายทาง" ให้เหลือเฉพาะจังหวัดนั้น
    const workAreaInputForFilter = document.querySelector('input[name=workArea]');
    const targetPeaDatalistEl = $("#dl-targetpea");
    workAreaInputForFilter.addEventListener("input", () => {
      if (!targetPeaDatalistEl) return;
      const allOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
      targetPeaDatalistEl.innerHTML = datalistOptionsHtml(targetPeaOptionsForWorkArea(allOpts, workAreaInputForFilter.value));
    });

    // "PEA อำเภอบางปะกง" คือหน่วยงานต้นสังกัด — เลือกแล้วช่วยติ๊ก "ในพื้นที่" ให้ (แก้เองได้ทีหลัง)
    const targetPEAInput = document.querySelector('input[name=targetPEA]');
    targetPEAInput.addEventListener("change", () => {
      if (targetPEAInput.value.trim() === HOME_UNIT_PEA) {
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
      vehicle: (fd.get("vehicle") || "").trim() || null,
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
    state.selectedDate = fromISO(date);
    closeModal();
    renderAll();
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

  /* ---------------- Settings modal: manage work areas / target PEA / vehicles / teams ---------------- */
  function renderOptSectionHtml(category, label) {
    const rows = OPTION_ROWS.filter(o => o.category === category).sort((a, b) => a.value.localeCompare(b.value, "th"));
    return `
      <div class="detail-section opt-section" data-category="${esc(category)}">
        <div class="detail-section-title">${esc(label)} (${rows.length} รายการ)</div>
        <div class="opt-list">
          ${rows.length ? rows.map(r => `<span class="opt-chip">${esc(r.value)}<button type="button" class="opt-del-btn" data-id="${r.id}" title="ลบ">✕</button></span>`).join("") : `<span class="form-hint">ยังไม่มีรายการ</span>`}
        </div>
        <div class="opt-add-row">
          <input type="text" class="opt-add-input" placeholder="เพิ่ม${esc(label)}ใหม่..." />
          <button type="button" class="btn-secondary opt-add-btn">+ เพิ่ม</button>
        </div>
        <details class="opt-import">
          <summary>นำเข้าหลายรายการพร้อมกัน</summary>
          <div class="form-hint" style="margin:6px 0;">พิมพ์ทีละบรรทัด รายการที่มีอยู่แล้วจะถูกข้าม ของเดิมจะไม่ถูกลบหรือถูกแทนที่</div>
          <textarea class="opt-import-text" placeholder="เช่น&#10;บางปะกง&#10;ฉะเชิงเทรา"></textarea>
          <div class="opt-import-actions">
            <span class="opt-import-note form-hint"></span>
            <button type="button" class="btn-primary opt-import-btn">นำเข้ารายการ</button>
          </div>
        </details>
      </div>`;
  }

  function renderTeamSectionHtml() {
    return `
      <div class="detail-section">
        <div class="detail-section-title">ทีมปฏิบัติงาน (${TEAM_ROWS.length} ทีม)</div>
        ${TEAM_ROWS.map(t => `
          <div class="team-card">
            <div class="team-card-head">
              <input type="text" class="team-name-input" value="${esc(t.name)}" />
              <button type="button" class="btn-danger team-del-btn" data-id="${t.id}">🗑 ลบทีม</button>
            </div>
            <textarea class="team-members-input" placeholder="1 ชื่อต่อบรรทัด">${esc((t.members || []).join("\n"))}</textarea>
            <div class="form-actions" style="margin-top:8px;">
              <span class="form-hint">แก้ชื่อ/รายชื่อแล้วกดบันทึก</span>
              <div class="form-actions-right"><button type="button" class="btn-secondary team-save-btn" data-id="${t.id}">บันทึกทีมนี้</button></div>
            </div>
          </div>`).join("")}
        <div class="team-card">
          <div class="team-card-head"><input type="text" class="team-name-input" id="new-team-name" placeholder="ชื่อทีมใหม่ เช่น ทีม D" /></div>
          <textarea class="team-members-input" id="new-team-members" placeholder="รายชื่อสมาชิก 1 ชื่อต่อบรรทัด"></textarea>
          <div class="form-actions" style="margin-top:8px;">
            <span class="form-hint">เพิ่มทีมใหม่พร้อมรายชื่อ</span>
            <div class="form-actions-right"><button type="button" class="btn-primary" id="new-team-save-btn">+ เพิ่มทีมใหม่</button></div>
          </div>
        </div>
      </div>`;
  }

  function buildSettingsHtml() {
    return `
      <div class="modal-head">
        <div>
          <div class="modal-id">การตั้งค่า</div>
          <h2>จัดการตัวเลือก: พื้นที่ปฏิบัติงาน / การไฟฟ้าปลายทาง / รถ / ทีม</h2>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-hint" style="margin-bottom:14px;">รายการเหล่านี้ใช้เติมตัวเลือกในฟอร์มเพิ่ม/แก้ไขงานและตัวกรอง — แก้ไขที่นี่ที่เดียว มีผลทั้งระบบ และงานที่กรอกไว้เดิมจะไม่เปลี่ยนแปลง</div>
        ${renderOptSectionHtml("work_area", "พื้นที่ปฏิบัติงาน")}
        ${renderOptSectionHtml("target_pea", "การไฟฟ้าปลายทาง")}
        ${renderOptSectionHtml("vehicle", "รถ")}
        ${renderOptSectionHtml("circuit", "ชื่อวงจร")}
        ${renderTeamSectionHtml()}
      </div>`;
  }

  function openSettingsModal() {
    if (!isAdmin()) return;
    modalLocked = false;
    modalBodyEl.innerHTML = buildSettingsHtml();
    modalBackdropEl.classList.add("open");
    bindSettingsEvents();
  }

  async function refreshSettingsModal() {
    await loadOptions();
    modalBodyEl.innerHTML = buildSettingsHtml();
    bindSettingsEvents();
    renderFilterBar();
  }

  function bindSettingsEvents() {
    $("#modal-close-btn").addEventListener("click", closeModal);

    modalBodyEl.querySelectorAll(".opt-section").forEach(section => {
      const category = section.getAttribute("data-category");
      const addInput = section.querySelector(".opt-add-input");
      const addBtn = section.querySelector(".opt-add-btn");
      addBtn.addEventListener("click", async () => {
        const val = addInput.value.trim();
        if (!val) return;
        addBtn.disabled = true;
        const { error } = await CAL_SB.from("calendar_options").insert([{ category, value: val }]);
        if (error) { alert("เพิ่มไม่สำเร็จ: " + error.message); addBtn.disabled = false; return; }
        await refreshSettingsModal();
      });
      addInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addBtn.click(); } });

      section.querySelectorAll(".opt-del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("ลบรายการนี้ออกจากตัวเลือก? งานที่เคยกรอกไว้เดิมจะไม่ถูกลบหรือเปลี่ยนแปลง")) return;
          const { error } = await CAL_SB.from("calendar_options").delete().eq("id", btn.getAttribute("data-id"));
          if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
          await refreshSettingsModal();
        });
      });

      const importBtn = section.querySelector(".opt-import-btn");
      const importText = section.querySelector(".opt-import-text");
      const importNote = section.querySelector(".opt-import-note");
      importBtn.addEventListener("click", async () => {
        const values = Array.from(new Set(importText.value.split("\n").map(s => s.trim()).filter(Boolean)));
        const existing = new Set(OPTION_ROWS.filter(o => o.category === category).map(o => o.value));
        const rows = values.filter(v => !existing.has(v)).map(v => ({ category, value: v }));
        if (!rows.length) { importNote.textContent = values.length ? "ทุกรายการมีอยู่แล้ว ไม่มีรายการใหม่" : "กรุณาพิมพ์รายการก่อนนำเข้า"; return; }
        importBtn.disabled = true;
        importBtn.textContent = "กำลังนำเข้า...";
        const { error } = await CAL_SB.from("calendar_options").insert(rows);
        if (error) {
          alert("นำเข้าไม่สำเร็จ: " + error.message);
          importBtn.disabled = false;
          importBtn.textContent = "นำเข้ารายการ";
          return;
        }
        await refreshSettingsModal();
      });
    });

    modalBodyEl.querySelectorAll(".team-save-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".team-card");
        const name = card.querySelector(".team-name-input").value.trim();
        const members = card.querySelector(".team-members-input").value.split("\n").map(s => s.trim()).filter(Boolean);
        if (!name) { alert("กรุณากรอกชื่อทีม"); return; }
        const { error } = await CAL_SB.from("calendar_teams").update({ name, members }).eq("id", btn.getAttribute("data-id"));
        if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); return; }
        await refreshSettingsModal();
      });
    });
    modalBodyEl.querySelectorAll(".team-del-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("ลบทีมนี้ออกจากตัวเลือก? งานที่เคยกรอกไว้เดิมจะไม่ถูกลบหรือเปลี่ยนแปลง")) return;
        const { error } = await CAL_SB.from("calendar_teams").delete().eq("id", btn.getAttribute("data-id"));
        if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        await refreshSettingsModal();
      });
    });
    const newTeamBtn = $("#new-team-save-btn");
    if (newTeamBtn) newTeamBtn.addEventListener("click", async () => {
      const name = $("#new-team-name").value.trim();
      const members = $("#new-team-members").value.split("\n").map(s => s.trim()).filter(Boolean);
      if (!name) { alert("กรุณากรอกชื่อทีม"); return; }
      newTeamBtn.disabled = true;
      const { error } = await CAL_SB.from("calendar_teams").insert([{ name, members }]);
      if (error) { alert("เพิ่มไม่สำเร็จ: " + error.message); newTeamBtn.disabled = false; return; }
      await refreshSettingsModal();
    });
  }

  settingsBtnEl.addEventListener("click", openSettingsModal);

  /* ---------------- Person modal: individual calendar / leave / OT ---------------- */
  const personState = { employeeName: "", cursor: new Date(TODAY) };

  function showLeaveFormError(msg) {
    const el = $("#leave-form-error");
    if (el) el.innerHTML = `<div class="form-error">${esc(msg)}</div>`;
  }

  function buildPersonModalHtml() {
    if (!personState.employeeName && EMPLOYEES.length) personState.employeeName = EMPLOYEES[0].name;
    const employee = personState.employeeName;
    const empObj = EMPLOYEES.find(e => e.name === employee) || null;
    const cursor = personState.cursor;
    const year = cursor.getFullYear(), month0 = cursor.getMonth();
    const monthData = employee ? getPersonMonthData(employee, year, month0) : [];
    const workDays = monthData.filter(d => d.worked).length;
    const leaveDays = monthData.filter(d => d.leave);
    const otDays = monthData.filter(d => d.isOT).length;

    const leaveByType = {};
    leaveDays.forEach(d => { leaveByType[d.leave.leave_type] = (leaveByType[d.leave.leave_type] || 0) + 1; });

    const startDow = new Date(year, month0, 1).getDay();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    monthData.forEach(d => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);

    const employeeLeaves = LEAVES.filter(l => l.employee_name === employee).sort((a, b) => b.date_from.localeCompare(a.date_from));

    return `
        ${EMPLOYEES.length ? `
        <div class="person-toolbar">
          <select id="person-select">${EMPLOYEES.map(e => `<option value="${esc(e.name)}" ${e.name === employee ? "selected" : ""}>${esc(e.name)}${e.position ? " (" + esc(e.position) + ")" : ""}</option>`).join("")}</select>
          <div class="person-nav">
            <button type="button" class="nav-btn" id="person-prev">‹</button>
            <span class="person-month-label">${THAI_MONTHS[month0]} พ.ศ. ${beYear(cursor)}</span>
            <button type="button" class="nav-btn" id="person-next">›</button>
          </div>
        </div>
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
          <div class="person-stat"><div class="person-stat-label">วันที่มีงาน (เดือนนี้)</div><div class="person-stat-value">${workDays}</div></div>
          <div class="person-stat ot"><div class="person-stat-label">วันโอที (เสาร์-อาทิตย์-นักขัตฤกษ์)</div><div class="person-stat-value">${otDays}</div></div>
          <div class="person-stat leave"><div class="person-stat-label">วันลา</div><div class="person-stat-value">${leaveDays.length}</div></div>
        </div>
        ${Object.keys(leaveByType).length ? `<div class="person-leave-breakdown">${Object.entries(leaveByType).map(([t, c]) => `<span class="leave-type-chip">${esc(t)} ${c} วัน</span>`).join("")}</div>` : ""}
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
              ${d.leave ? `<div class="pd-leave-tag">${esc(d.leave.leave_type)}</div>` : ""}
              ${d.worked ? `<div class="pd-work-tag ${d.isOT ? "ot" : ""}">${d.isOT ? "⚡" : ""} ${d.tasksForDay.length} งาน</div>` : ""}
            </div>`;
          }).join("")}
        </div>

        <div class="detail-section admin-only" style="margin-top:18px;">
          <div class="detail-section-title">บันทึกวันลาใหม่ (คลิกวันที่ในปฏิทินด้านบนเพื่อเติมวันที่ให้อัตโนมัติ)</div>
          <form id="leave-form">
            <div class="form-grid">
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
              <span class="form-hint">บันทึกให้ ${esc(employee)}</span>
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

    $("#person-select").addEventListener("change", (ev) => {
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

    $("#leave-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!isAdmin()) return;
      const fd = new FormData(ev.target);
      const dateFrom = fd.get("dateFrom");
      const dateTo = fd.get("dateTo") || dateFrom;
      if (!dateFrom || !dateTo) { showLeaveFormError("กรุณาเลือกวันที่ให้ครบ"); return; }
      if (dateTo < dateFrom) { showLeaveFormError("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"); return; }
      const row = {
        employee_name: personState.employeeName,
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
  function equipRowHtml(label, value, warn) {
    if (!value) return "";
    return `<div class="equip-detail-row ${warn ? "warn" : ""}"><div class="edr-label">${esc(label)}</div><div class="edr-value">${esc(value)}</div></div>`;
  }
  function equipmentManualGroupsHtml() {
    const groups = {};
    EQUIPMENT_MANUAL.forEach(e => { (groups[e.group] = groups[e.group] || []).push(e); });
    const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return groupNames.map(g => `
      <div class="equip-group">
        <div class="equip-group-title">${esc(g)} (${groups[g].length} รายการ)</div>
        <div class="equip-card-list">
          ${groups[g].map(e => `
            <div class="equip-card" data-equip="${esc(e.id)}">
              <button type="button" class="equip-card-head">
                <div>
                  <div class="equip-card-name"><span class="equip-id">${esc(e.id)}</span>${esc(e.name_th)}</div>
                  <div class="equip-card-name-en">${esc(e.name_en)}</div>
                </div>
                <span class="equip-card-chevron">›</span>
              </button>
              <div class="equip-card-body">
                <div class="equip-detail-grid">
                  ${equipRowHtml("ใช้กับงาน/สถานการณ์", e.use_case)}
                  ${equipRowHtml("หน้าที่/การใช้งาน", e.function)}
                  ${equipRowHtml("ตรวจสอบก่อนใช้", e.pre_check)}
                  ${equipRowHtml("ห้ามใช้ / เงื่อนไขหยุดงาน", e.stop_conditions, true)}
                  ${equipRowHtml("การดูแลหลังใช้งาน", e.care_after)}
                  ${equipRowHtml("ข้อกำหนดความปลอดภัย", e.safety_requirement, true)}
                  ${equipRowHtml("หมายเหตุ", e.online_note)}
                </div>
              </div>
            </div>`).join("")}
        </div>
      </div>`).join("");
  }
  function openEquipmentPage() {
    equipmentPageCountEl.textContent = `คู่มืออุปกรณ์ (${EQUIPMENT_MANUAL.length} รายการ)`;
    equipmentPageBodyEl.innerHTML = equipmentManualGroupsHtml();
    equipmentPageBodyEl.querySelectorAll(".equip-card-head").forEach(btn => {
      btn.addEventListener("click", () => btn.closest(".equip-card").classList.toggle("open"));
    });
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
              <td><span class="access-log-role-text ${r.role === "admin" ? "admin" : "reviewer"}">${r.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ดูข้อมูล"}</span></td>
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
    const { data, error } = await CAL_SB.from("calendar_employees").select("*").eq("employee_no", employeeNo);
    const row = !error && data && data[0];
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

  /* ---------------- Main render ---------------- */
  function renderAll() {
    renderToolbar();
    renderStatRow();
    renderFilterBar();
    if (state.view === "month") renderMonthView();
    else if (state.view === "week") renderWeekView();
    else if (state.view === "day") renderDayView();
    else renderYearView();

    sideColEl.classList.toggle("hidden", state.view === "day");
    if (state.view !== "day") renderSidePanel();
  }

  async function init() {
    await Promise.all([loadOptions(), loadTasks(), loadPeopleData()]);
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
