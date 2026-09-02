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

  /* ---------------- Data lookups by task ---------------- */
  const taskById = {};
  TASKS.forEach(t => { taskById[t.id] = t; });

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
  const FILTER_DEFS = [
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

  function renderFilterBar() {
    filterGridEl.innerHTML = FILTER_DEFS.map(f => {
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
              <div class="detail-list">${(TEAMS[t.team] || []).map(m => `<div>${esc(m)}</div>`).join("")}</div>
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
      </div>`;
    modalBackdropEl.classList.add("open");
    $("#modal-close-btn").addEventListener("click", closeModal);
  }
  function detailItem(label, value, mono) {
    return `<div class="detail-item"><div class="di-label">${esc(label)}</div><div class="di-value ${mono ? "mono" : ""}">${esc(value)}</div></div>`;
  }
  function closeModal() { modalBackdropEl.classList.remove("open"); }
  modalBackdropEl.addEventListener("click", (ev) => { if (ev.target === modalBackdropEl) closeModal(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });

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

  renderAll();
})();
