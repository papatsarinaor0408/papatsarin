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

function renderLegend(container, items, formatValue, onClick) {
  const fmt = formatValue || fmtNum;
  const wrap = document.createElement('div');
  wrap.className = 'chart-legend';
  items.forEach((it) => {
    const row = document.createElement('span');
    row.className = 'legend-item' + (onClick ? ' legend-item-clickable' : '');
    row.innerHTML = `<span class="legend-swatch" style="background:${it.color}"></span>${it.label} <b>${fmt(it.value)}</b>`;
    if (onClick) row.addEventListener('click', () => onClick(it));
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
      if (opts.onClick) circle.addEventListener('click', () => opts.onClick(d));
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
    renderLegend(container, data, undefined, opts.onClick);
  }
}

/* ---------------- Horizontal stacked bar ---------------- */
// opts.formatTotal(total, group) — custom end-of-bar label (default: plain count)
// opts.tooltipHtml(group, series, value, total) — full tooltip override per hovered segment
function renderStackedBar(container, groups, series, opts) {
  container.innerHTML = '';
  opts = opts || {};
  const maxTotal = Math.max(1, ...groups.map((g) => series.reduce((s, sr) => s + (g.values[sr.key] || 0), 0)));
  const rowH = 30, gap = 12, labelW = opts.labelW || 168, trackPad = opts.trackPad || 54;
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
      const rx = 4;
      const rect = el('rect', {
        x, y, width: Math.max(segW, 1), height: rowH, fill: sr.color,
        rx: rx, ry: rx, class: 'chart-bar-status', style: 'cursor:pointer;',
      });
      rect.addEventListener('mousemove', (evt) => {
        const html = opts.tooltipHtml
          ? opts.tooltipHtml(g, sr, v, total)
          : (() => {
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
              return `<div><b>${g.label}</b></div><div class="tt-row"><span class="tt-dot" style="background:${sr.color}"></span>${sr.label}: <b>${fmtNum(v)}</b> (${pct}%)</div>`;
            })();
        showTooltip(evt, html);
      });
      rect.addEventListener('mousemove', moveTooltip);
      rect.addEventListener('mouseleave', hideTooltip);
      if (opts.onClick) rect.addEventListener('click', () => opts.onClick(g, sr, v));
      svg.appendChild(rect);
      x += segW + 2;
    });
    const totalLabel = el('text', { x: labelW + barW + 8, y: y + rowH / 2 + 4, class: 'bar-total-label', 'font-size': 12.5 });
    totalLabel.textContent = opts.formatTotal ? opts.formatTotal(total, g) : fmtNum(total);
    svg.appendChild(totalLabel);
  });

  container.appendChild(svg);
  if (opts.legend !== false) {
    renderLegend(container, series.map((sr) => ({
      label: sr.label, color: sr.color,
      value: groups.reduce((s, g) => s + (g.values[sr.key] || 0), 0),
    })), opts.formatLegendValue);
  }
}

/* ---------------- Horizontal single-series bar (sequential magnitude) ---------------- */
function renderHBar(container, items, opts) {
  container.innerHTML = '';
  opts = opts || {};
  const max = Math.max(1, ...items.map((d) => d.value));
  const rowH = opts.rowH || 26, gap = opts.gap || 12, radius = opts.radius != null ? opts.radius : 4;
  // Auto-size the label column from the longest label so full names never
  // get clipped against the SVG's left edge (no ellipsis truncation).
  const longestLabel = items.reduce((m, d) => Math.max(m, String(d.label).length), 0);
  const labelW = opts.labelW || Math.min(260, Math.max(90, longestLabel * 7.2 + 16));
  const width = opts.width || 640;
  const trackW = width - labelW - 80;
  const height = items.length * (rowH + gap);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'viz-root' });

  items.forEach((d, i) => {
    const y = i * (rowH + gap);
    const label = el('text', { x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12.5, class: 'hbar-label' });
    label.textContent = d.label;
    svg.appendChild(label);
    const w = Math.max((d.value / max) * trackW, d.value > 0 ? 3 : 0);
    const rect = el('rect', { x: labelW, y, width: w, height: rowH, rx: radius, ry: radius, fill: d.color || 'var(--seq-450)', class: 'chart-bar-magnitude', style: 'cursor:pointer;' });
    rect.addEventListener('mousemove', (evt) => showTooltip(evt, `<b>${d.label}</b><br>${opts.formatValue ? opts.formatValue(d.value) : fmtNum(d.value)}`));
    rect.addEventListener('mousemove', moveTooltip);
    rect.addEventListener('mouseleave', hideTooltip);
    if (opts.onClick) rect.addEventListener('click', () => opts.onClick(d));
    svg.appendChild(rect);
    const valLabel = el('text', { x: labelW + w + 8, y: y + rowH / 2 + 4, class: 'bar-total-label', 'font-size': 13, 'font-weight': 600 });
    valLabel.textContent = opts.formatValue ? opts.formatValue(d.value) : fmtNum(d.value);
    svg.appendChild(valLabel);
  });
  container.appendChild(svg);
}

/* ---------------- Dual-line chart (category axis, one line per series) ---------------- */
// categories: [{ label, v1, v2, ... }] — one x-position per entry, in given order.
// series: [{ key: 'v1'|'v2'|..., label, color }] — one polyline per entry.
// opts.tooltipHtml(category) for a full tooltip override, opts.onClick(category).
function renderDualLineChart(container, categories, series, opts) {
  container.innerHTML = '';
  opts = opts || {};
  if (!categories.length) { container.innerHTML = '<div class="empty-state">ไม่มีข้อมูลตรงตัวกรอง</div>'; return; }

  // Taller than a typical chart so each gridline step (0-10-20-...) gets
  // more vertical room — otherwise small/zero values all bunch up flat
  // near the bottom instead of reading as a chart with real depth.
  const height = opts.height || 440;
  const n = categories.length;
  // Always compress to the card's actual width — never wider — so there's
  // no horizontal overflow/scroll to manage regardless of category count.
  // Label font size shrinks a bit once categories get crowded, so labels
  // stay separated instead of colliding.
  const width = opts.width || container.clientWidth || 640;
  // Cap the requested 10cm margin proportionally on narrower cards so the
  // plot area can never shrink to nothing/negative — full margin applies
  // whenever there's room, smaller cards just get a scaled-down version.
  const sidePad = Math.min(378, width * 0.3);
  const padLeft = sidePad, padRight = sidePad, padTop = 24, padBottom = 68;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const labelFontSize = n > 10 ? 15 : n > 6 ? 16 : 17;

  const maxRaw = Math.max(1, ...categories.flatMap((c) => series.map((s) => c[s.key] || 0)));
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(maxRaw, 1))));
  const stepMult = maxRaw / step <= 2 ? 2 : maxRaw / step <= 5 ? 5 : 10;
  const yMax = stepMult * step;
  const yTicks = 5;
  const yOf = (v) => padTop + plotH - (v / yMax) * plotH;
  // Inset the first/last point off the axis lines a bit, so the leftmost
  // category doesn't sit flush against the y-axis (and the rightmost stays
  // symmetric) instead of the points spanning the full plot edge-to-edge.
  const xInset = Math.min(36, plotW * 0.08);
  const xOf = (i) => padLeft + xInset + (n === 1 ? (plotW - 2 * xInset) / 2 : (i / (n - 1)) * (plotW - 2 * xInset));

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'viz-root' });

  // Small caption in the wide left margin, near the start of the plotted
  // lines, marking that this chart begins with reference (2569) data.
  const startCaption = el('text', { x: padLeft / 2, y: padTop + 14, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--text-muted)' });
  startCaption.textContent = 'ข้อมูลอ้างอิง';
  svg.appendChild(startCaption);

  for (let t = 0; t <= yTicks; t++) {
    const v = (yMax / yTicks) * t;
    const y = yOf(v);
    svg.appendChild(el('line', { x1: padLeft, y1: y, x2: width - padRight, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }));
    const label = el('text', { x: padLeft - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = fmtNum(Math.round(v));
    svg.appendChild(label);
  }

  categories.forEach((c, i) => {
    const lx = xOf(i), ly = height - padBottom + 16;
    const label = el('text', {
      x: lx, y: ly, 'text-anchor': 'end', 'font-size': labelFontSize, class: 'hbar-label',
      transform: `rotate(-30 ${lx} ${ly})`,
    });
    label.textContent = c.label;
    svg.appendChild(label);
  });

  series.forEach((s) => {
    const points = categories.map((c, i) => `${xOf(i)},${yOf(c[s.key] || 0)}`).join(' ');
    svg.appendChild(el('polyline', { points, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  });

  categories.forEach((c, i) => {
    series.forEach((s, si) => {
      const v = c[s.key] || 0;
      const y = yOf(v);
      svg.appendChild(el('circle', { cx: xOf(i), cy: y, r: n > 10 ? 3.5 : 4.5, fill: s.color }));
      const valLabel = el('text', { x: xOf(i), y: si === 0 ? y - 10 : y + 18, 'text-anchor': 'middle', 'font-size': labelFontSize, 'font-weight': 700, fill: s.color });
      valLabel.textContent = fmtNum(v);
      svg.appendChild(valLabel);
    });
  });

  // Hit areas drawn last (topmost) so hovering/clicking a column works even
  // where a line/point from an earlier draw pass would otherwise intercept it.
  const colW = n > 1 ? plotW / (n - 1) : plotW;
  categories.forEach((c, i) => {
    const hit = el('rect', { x: xOf(i) - colW / 2, y: padTop, width: colW, height: plotH, fill: 'transparent', style: 'cursor:pointer;' });
    const tt = () => (opts.tooltipHtml ? opts.tooltipHtml(c) : `<b>${escapeHtmlChart(c.label)}</b>`);
    hit.addEventListener('mousemove', (evt) => showTooltip(evt, tt()));
    hit.addEventListener('mousemove', moveTooltip);
    hit.addEventListener('mouseleave', hideTooltip);
    if (opts.onClick) hit.addEventListener('click', () => opts.onClick(c));
    svg.appendChild(hit);
  });

  container.appendChild(svg);
}
function escapeHtmlChart(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
