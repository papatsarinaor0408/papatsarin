/**
 * เครื่องมือวาดกราฟ SVG แบบ hand-rolled (ไม่พึ่งไลบรารีภายนอก)
 * ยึดตาม mark spec: เส้นบาง ปลายมนสำหรับแท่ง, ช่องไฟ 2px ระหว่างส่วนซ้อน,
 * legend + tooltip เสมอเมื่อมีมากกว่า 1 ชุดข้อมูล
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
  if (children) children.forEach((c) => c && node.appendChild(c));
  return node;
}

function ensureTooltip() {
  let tt = document.getElementById('chart-tooltip');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'chart-tooltip';
    tt.className = 'chart-tooltip';
    document.body.appendChild(tt);
  }
  return tt;
}

function showTooltip(evt, html) {
  const tt = ensureTooltip();
  tt.innerHTML = html;
  tt.style.left = evt.clientX + 'px';
  tt.style.top = (evt.clientY - 12) + 'px';
  tt.classList.add('show');
}
function moveTooltip(evt) {
  const tt = ensureTooltip();
  tt.style.left = evt.clientX + 'px';
  tt.style.top = (evt.clientY - 12) + 'px';
}
function hideTooltip() {
  const tt = ensureTooltip();
  tt.classList.remove('show');
}

function fmtNum(n) { return Number(n || 0).toLocaleString('th-TH'); }
function fmtBaht(n) { return '฿' + Number(n || 0).toLocaleString('th-TH'); }

function renderLegend(container, items) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-legend';
  items.forEach((it) => {
    const row = document.createElement('span');
    row.className = 'legend-item';
    row.innerHTML = `<span class="legend-swatch" style="background:${it.color}"></span>${it.label} <b>${fmtNum(it.value)}</b>`;
    wrap.appendChild(row);
  });
  container.appendChild(wrap);
}

/* ---------------- Donut chart ---------------- */
function renderDonut(container, data, opts) {
  container.innerHTML = '';
  opts = opts || {};
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = opts.size || 200;
  const stroke = opts.stroke || 30;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gapDeg = total > 0 ? 2 : 0; // 2px-equivalent visual gap between segments

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: '100%', height: size, class: 'viz-root donut-svg' });
  const g = el('g', { transform: `rotate(-90 ${cx} ${cy})` });

  if (total === 0) {
    g.appendChild(el('circle', { cx, cy, r, fill: 'none', stroke: 'var(--grid)', 'stroke-width': stroke }));
  } else {
    let offsetDeg = 0;
    data.forEach((d) => {
      if (d.value <= 0) return;
      const frac = d.value / total;
      const segDeg = frac * 360;
      const dash = (segDeg / 360) * circumference - gapDeg;
      const dashArr = `${Math.max(dash, 0)} ${circumference}`;
      const dashOffset = -((offsetDeg / 360) * circumference);
      const circle = el('circle', {
        cx, cy, r, fill: 'none', stroke: d.color, 'stroke-width': stroke,
        'stroke-dasharray': dashArr, 'stroke-dashoffset': dashOffset, 'stroke-linecap': 'butt',
        class: 'chart-arc', style: 'cursor:pointer;',
      });
      circle.addEventListener('mousemove', (evt) => {
        showTooltip(evt, `<div class="tt-row"><span class="tt-dot" style="background:${d.color}"></span>${d.label}: <b>${fmtNum(d.value)}</b> (${(frac * 100).toFixed(1)}%)</div>`);
      });
      circle.addEventListener('mouseleave', hideTooltip);
      g.appendChild(circle);
      offsetDeg += segDeg;
    });
  }
  svg.appendChild(g);
  const centerVal = el('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'donut-center-value' });
  centerVal.textContent = fmtNum(total);
  const centerLbl = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'donut-center-label' });
  centerLbl.textContent = opts.centerLabel || 'รวม';
  svg.appendChild(centerVal);
  svg.appendChild(centerLbl);

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.appendChild(svg);
  container.appendChild(wrap);
  if (opts.legend !== false) {
    renderLegend(container, data.map((d) => ({ label: d.label, value: d.value, color: d.color })));
  }
}

/* ---------------- Horizontal stacked bar ---------------- */
function renderStackedBar(container, groups, series, opts) {
  container.innerHTML = '';
  opts = opts || {};
  const maxTotal = Math.max(1, ...groups.map((g) => series.reduce((s, sr) => s + (g.values[sr.key] || 0), 0)));
  const rowH = 30, gap = 12, labelW = opts.labelW || 168, trackPad = 54;
  const width = opts.width || 640;
  const trackW = width - labelW - trackPad;
  const height = groups.length * (rowH + gap);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'viz-root' });

  groups.forEach((g, i) => {
    const y = i * (rowH + gap);
    const total = series.reduce((s, sr) => s + (g.values[sr.key] || 0), 0);
    const label = el('text', { x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12.5 });
    label.textContent = g.label;
    svg.appendChild(label);

    let x = labelW;
    const barW = total > 0 ? (total / maxTotal) * trackW : 0;
    series.forEach((sr) => {
      const v = g.values[sr.key] || 0;
      if (v <= 0) return;
      const segW = Math.max((v / maxTotal) * trackW - 2, 0); // 2px surface gap between segments
      const isFirst = x === labelW;
      const isLast = (x + segW + 2) >= labelW + barW - 1;
      const rx = 4;
      const rect = el('rect', {
        x, y, width: Math.max(segW, 1), height: rowH, fill: sr.color,
        rx: rx, ry: rx, class: 'chart-bar-status', style: 'cursor:pointer;',
      });
      // square off inner edge so only true ends are rounded (rounded data-ends anchored to baseline)
      rect.addEventListener('mousemove', (evt) => {
        const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
        showTooltip(evt, `<div><b>${g.label}</b></div><div class="tt-row"><span class="tt-dot" style="background:${sr.color}"></span>${sr.label}: <b>${fmtNum(v)}</b> (${pct}%)</div>`);
      });
      rect.addEventListener('mousemove', moveTooltip);
      rect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(rect);
      x += segW + 2;
    });
    const totalLabel = el('text', { x: labelW + barW + 8, y: y + rowH / 2 + 4, class: 'bar-total-label', 'font-size': 12.5 });
    totalLabel.textContent = fmtNum(total);
    svg.appendChild(totalLabel);
  });

  container.appendChild(svg);
  if (opts.legend !== false) {
    renderLegend(container, series.map((sr) => ({
      label: sr.label, color: sr.color,
      value: groups.reduce((s, g) => s + (g.values[sr.key] || 0), 0),
    })));
  }
}

/* ---------------- Horizontal single-series bar (sequential magnitude) ---------------- */
function renderHBar(container, items, opts) {
  container.innerHTML = '';
  opts = opts || {};
  const max = Math.max(1, ...items.map((d) => d.value));
  const rowH = 26, gap = 12, labelW = opts.labelW || 168;
  const width = opts.width || 640;
  const trackW = width - labelW - 80;
  const height = items.length * (rowH + gap);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'viz-root' });

  items.forEach((d, i) => {
    const y = i * (rowH + gap);
    const label = el('text', { x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12.5 });
    label.textContent = d.label;
    svg.appendChild(label);
    const w = Math.max((d.value / max) * trackW, d.value > 0 ? 3 : 0);
    const rect = el('rect', { x: labelW, y, width: w, height: rowH, rx: 4, ry: 4, fill: d.color || 'var(--seq-450)', class: 'chart-bar-magnitude', style: 'cursor:pointer;' });
    rect.addEventListener('mousemove', (evt) => showTooltip(evt, `<b>${d.label}</b><br>${opts.formatValue ? opts.formatValue(d.value) : fmtNum(d.value)}`));
    rect.addEventListener('mousemove', moveTooltip);
    rect.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(rect);
    const valLabel = el('text', { x: labelW + w + 8, y: y + rowH / 2 + 4, class: 'bar-total-label', 'font-size': 12.5 });
    valLabel.textContent = opts.formatValue ? opts.formatValue(d.value) : fmtNum(d.value);
    svg.appendChild(valLabel);
  });
  container.appendChild(svg);
}
