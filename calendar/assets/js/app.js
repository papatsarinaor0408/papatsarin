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

  const TODAY = new Date();
  const TODAY_ISO = toISO(TODAY);

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
      out.push({ iso, day, dow, holiday, isWeekend, leave, tasksForDay, worked, isOT: worked && (isWeekend || !!holiday) });
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
      <div class="detail-actions">
        <button class="btn-secondary" id="edit-task-btn">✎ แก้ไขงาน</button>
        <button class="btn-danger" id="delete-task-btn">🗑 ลบงาน</button>
      </div>`;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
    $("#edit-task-btn").addEventListener("click", () => openFormModal(t));
    $("#delete-task-btn").addEventListener("click", () => deleteTask(t));
  }
  function detailItem(label, value, mono) {
    return `<div class="detail-item"><div class="di-label">${esc(label)}</div><div class="di-value ${mono ? "mono" : ""}">${esc(value)}</div></div>`;
  }
  function closeModal() { modalBackdropEl.classList.remove("open"); }
  modalBackdropEl.addEventListener("click", (ev) => { if (ev.target === modalBackdropEl) closeModal(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });

  /* ---------------- Task form (add / edit) ---------------- */
  function combinedOptions(constList, getter) {
    const s = new Set(constList);
    TASKS.forEach(t => { const v = getter(t); if (v) s.add(v); });
    return Array.from(s);
  }
  function datalistHtml(id, values) {
    return `<datalist id="${id}">${values.map(v => `<option value="${esc(v)}"></option>`).join("")}</datalist>`;
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
      equipment: [], equipmentOwner: "", coordinator: "", coordinatorPhone: "", status: "วางแผน", note: ""
    };
    const workAreaOpts = combinedOptions(WORK_AREAS, x => x.workArea);
    const targetPEAOpts = combinedOptions(TARGET_PEA_OFFICES, x => x.targetPEA);
    const vehicleOpts = combinedOptions(VEHICLES, x => x.vehicle);
    const teamOpts = combinedOptions(Object.keys(TEAMS), x => x.team);
    const extraEquipment = t.equipment.filter(e => !EQUIPMENT_POOL.includes(e));

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
              <label>เวลาออกเดินทาง</label>
              <input type="time" name="departTime" value="${esc(t.departTime)}" />
            </div>
            <div class="form-field">
              <label>เวลานัดหมายหน้างาน</label>
              <input type="time" name="appointTime" value="${esc(t.appointTime)}" />
            </div>
            <div class="form-field">
              <label>พื้นที่ปฏิบัติงาน <span class="req">*</span></label>
              <input type="text" name="workArea" list="dl-workarea" required value="${esc(t.workArea)}" placeholder="เช่น บางปะกง" />
            </div>
            <div class="form-field">
              <label>การไฟฟ้าปลายทาง <span class="req">*</span></label>
              <input type="text" name="targetPEA" list="dl-targetpea" required value="${esc(t.targetPEA)}" placeholder="เช่น กฟฟ.บางปะกง" />
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
              <label>ทีมปฏิบัติงาน</label>
              <input type="text" name="team" id="team-input" list="dl-team" value="${esc(t.team)}" placeholder="เช่น ทีม A" />
            </div>
            <div class="form-field">
              <label>รถที่ใช้</label>
              <input type="text" name="vehicle" list="dl-vehicle" value="${esc(t.vehicle)}" placeholder="เช่น รถกระเช้า ทะเบียน..." />
            </div>
            <div class="form-field span2">
              <label>รายชื่อทีมปฏิบัติงาน (1 ชื่อต่อบรรทัด)</label>
              <textarea name="teamMembers" id="team-members-input" placeholder="นายสมชาย ใจดี (หัวหน้าทีม)&#10;นายวิชัย รักงาน">${esc((t.teamMembers || []).join("\n"))}</textarea>
              <div class="form-hint">พิมพ์ชื่อทีม (เช่น ทีม A) แล้วออกจากช่อง ระบบจะช่วยเติมรายชื่อทีมเริ่มต้นให้อัตโนมัติถ้าช่องนี้ว่าง</div>
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
      ${datalistHtml("dl-targetpea", targetPEAOpts)}
      ${datalistHtml("dl-vehicle", vehicleOpts)}
      ${datalistHtml("dl-team", teamOpts)}
    `;
  }

  function openFormModal(task) {
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

    // "PEA อำเภอบางปะกง" คือหน่วยงานต้นสังกัด — เลือกแล้วช่วยติ๊ก "ในพื้นที่" ให้ (แก้เองได้ทีหลัง)
    const targetPEAInput = document.querySelector('input[name=targetPEA]');
    targetPEAInput.addEventListener("change", () => {
      if (targetPEAInput.value.trim() === HOME_UNIT_PEA) {
        const inRadio = document.querySelector('input[name=areaStatus][value=in]');
        if (inRadio && !inRadio.checked) { inRadio.checked = true; syncAreaStatus(true); }
      }
    });

    $("#team-input").addEventListener("change", (ev) => {
      const membersEl = $("#team-members-input");
      if (!membersEl.value.trim() && TEAMS[ev.target.value]) {
        membersEl.value = TEAMS[ev.target.value].join("\n");
      }
    });

    $("#task-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      submitTaskForm(ev.target, task);
    });
  }

  async function submitTaskForm(form, existingTask) {
    const fd = new FormData(form);
    const title = (fd.get("title") || "").trim();
    const date = fd.get("date");
    const workArea = (fd.get("workArea") || "").trim();
    const targetPEA = (fd.get("targetPEA") || "").trim();
    if (!title || !date || !workArea || !targetPEA) {
      showFormError("กรุณากรอกชื่องาน วันที่ พื้นที่ปฏิบัติงาน และการไฟฟ้าปลายทางให้ครบ");
      return;
    }
    const areaStatus = fd.get("areaStatus") || "in";
    const equipment = fd.getAll("equipment");
    const otherEquipment = (fd.get("equipmentOther") || "").split(",").map(s => s.trim()).filter(Boolean);
    const teamMembers = (fd.get("teamMembers") || "").split("\n").map(s => s.trim()).filter(Boolean);

    const row = {
      title,
      task_date: date,
      depart_time: fd.get("departTime") || null,
      appoint_time: fd.get("appointTime") || null,
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
        ${renderTeamSectionHtml()}
      </div>`;
  }

  function openSettingsModal() {
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
      <div class="modal-head">
        <div>
          <div class="modal-id">ปฏิทินรายบุคคล</div>
          <h2>ปฏิทิน / วันลา / สรุปโอทีรายบุคคล</h2>
        </div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">
        ${EMPLOYEES.length ? `
        <div class="person-toolbar">
          <select id="person-select">${EMPLOYEES.map(e => `<option value="${esc(e.name)}" ${e.name === employee ? "selected" : ""}>${esc(e.name)}${e.position ? " (" + esc(e.position) + ")" : ""}</option>`).join("")}</select>
          <div class="person-nav">
            <button type="button" class="nav-btn" id="person-prev">‹</button>
            <span class="person-month-label">${THAI_MONTHS[month0]} พ.ศ. ${beYear(cursor)}</span>
            <button type="button" class="nav-btn" id="person-next">›</button>
          </div>
        </div>
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

        <div class="detail-section" style="margin-top:18px;">
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
              <button type="button" class="btn-danger leave-del-btn" data-id="${l.id}">🗑</button>
            </div>`).join("")}</div>` : `<div class="form-hint">ยังไม่มีประวัติการลา</div>`}
        </div>
        ` : `<div class="empty-state">ยังไม่มีรายชื่อพนักงานในระบบ</div>`}
      </div>`;
  }

  function openPersonModal() {
    modalBodyEl.innerHTML = buildPersonModalHtml();
    modalBackdropEl.classList.add("open");
    bindPersonEvents();
  }

  async function refreshPersonModal() {
    await loadPeopleData();
    modalBodyEl.innerHTML = buildPersonModalHtml();
    bindPersonEvents();
  }

  function bindPersonEvents() {
    $("#modal-close-btn").addEventListener("click", closeModal);
    if (!EMPLOYEES.length) return;

    $("#person-select").addEventListener("change", (ev) => {
      personState.employeeName = ev.target.value;
      modalBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    $("#person-prev").addEventListener("click", () => {
      personState.cursor = addMonths(personState.cursor, -1);
      modalBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    $("#person-next").addEventListener("click", () => {
      personState.cursor = addMonths(personState.cursor, 1);
      modalBodyEl.innerHTML = buildPersonModalHtml();
      bindPersonEvents();
    });
    modalBodyEl.querySelectorAll(".person-day-cell[data-date]").forEach(cell => {
      cell.addEventListener("click", () => {
        const iso = cell.getAttribute("data-date");
        $("#leave-date-from").value = iso;
        $("#leave-date-to").value = iso;
      });
    });

    $("#leave-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
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
      await refreshPersonModal();
    });

    modalBodyEl.querySelectorAll(".leave-del-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("ลบวันลานี้ออกจากประวัติ?")) return;
        const { error } = await CAL_SB.from("calendar_leaves").delete().eq("id", btn.getAttribute("data-id"));
        if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        await refreshPersonModal();
      });
    });
  }

  personBtnEl.addEventListener("click", openPersonModal);

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
  init();
})();
