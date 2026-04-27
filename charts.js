// SVG sparkline / area chart rendering. All charts render into a fixed
// 600 x 110 viewBox and stretch via preserveAspectRatio="none".
const CHART_W = 600;
const CHART_H = 110;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOT = 18;

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
}
function fmtHourLabel(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function buildPath(points, smooth = true) {
  if (!points.length) return '';
  if (!smooth) {
    return points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  }
  // monotone-ish cubic
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C${cx.toFixed(1)},${p0.y.toFixed(1)} ${cx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

function renderTideChart(svgEl, series, extrema) {
  if (!series || !series.length) {
    svgEl.innerHTML = '<text class="label" x="10" y="60">No tide data</text>';
    return;
  }
  const values = series.map(s => s.v).filter(v => v != null);
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(0.1, max - min);
  const innerH = CHART_H - PAD_TOP - PAD_BOT;
  const innerW = CHART_W - PAD_X * 2;

  const pts = series.map((s, i) => ({
    x: PAD_X + (i / (series.length - 1)) * innerW,
    y: PAD_TOP + (1 - (s.v - min) / range) * innerH,
    t: s.t, v: s.v,
  }));

  const baseY = PAD_TOP + innerH;
  const areaPath = buildPath(pts) + ` L${pts[pts.length - 1].x.toFixed(1)},${baseY} L${pts[0].x.toFixed(1)},${baseY} Z`;
  const linePath = buildPath(pts);

  // Gridlines + hour labels every 6h
  const grid = [];
  for (let i = 0; i < series.length; i += 6) {
    const x = PAD_X + (i / (series.length - 1)) * innerW;
    grid.push(`<line class="gridline" x1="${x.toFixed(1)}" y1="${PAD_TOP}" x2="${x.toFixed(1)}" y2="${baseY}"/>`);
    grid.push(`<text class="label" x="${x.toFixed(1)}" y="${(baseY + 12).toFixed(1)}" text-anchor="middle">${fmtHourLabel(series[i].t)}</text>`);
  }

  // High/Low markers
  const extrSvg = (extrema || []).map(e => {
    const seriesIdx = series.findIndex(s => s.t === e.t);
    if (seriesIdx < 0) return '';
    const x = PAD_X + (seriesIdx / (series.length - 1)) * innerW;
    const y = PAD_TOP + (1 - (e.value - min) / range) * innerH;
    const labelY = e.type === 'high' ? y - 8 : y + 14;
    const label = `${e.type === 'high' ? 'H' : 'L'} ${fmtTime(e.t)}`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>
            <text x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle">${label}</text>`;
  }).join('');

  svgEl.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4cc2ff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#4cc2ff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid.join('')}
    <path class="area" d="${areaPath}"/>
    <path class="line" d="${linePath}"/>
    <line class="now-line" x1="${pts[0].x.toFixed(1)}" y1="${PAD_TOP}" x2="${pts[0].x.toFixed(1)}" y2="${baseY}"/>
    <circle class="now-dot" cx="${pts[0].x.toFixed(1)}" cy="${pts[0].y.toFixed(1)}" r="4"/>
    <g class="extrema">${extrSvg}</g>
  `;
}

function renderBarChart(svgEl, series, accessor, color, unit) {
  if (!series || !series.length) {
    svgEl.innerHTML = '<text class="label" x="10" y="60">No data</text>';
    return;
  }
  const values = series.map(accessor).filter(v => v != null);
  const max = Math.max(0.1, ...values);
  const innerH = CHART_H - PAD_TOP - PAD_BOT;
  const innerW = CHART_W - PAD_X * 2;
  const baseY = PAD_TOP + innerH;
  const barW = (innerW / series.length) * 0.7;
  const gap = (innerW / series.length) * 0.3;

  const bars = series.map((s, i) => {
    const v = accessor(s) ?? 0;
    const h = (v / max) * innerH;
    const x = PAD_X + i * (barW + gap) + gap / 2;
    const y = baseY - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              rx="3" fill="${color}" opacity="${i === 0 ? 1 : 0.55 + 0.4 * (1 - i / series.length)}"/>`;
  }).join('');

  const labels = series.map((s, i) => {
    if (i % 3 !== 0 && i !== series.length - 1) return '';
    const x = PAD_X + i * (barW + gap) + gap / 2 + barW / 2;
    return `<text class="label" x="${x.toFixed(1)}" y="${(baseY + 12).toFixed(1)}" text-anchor="middle">${fmtHourLabel(s.t)}</text>`;
  }).join('');

  // value label on the first (current) bar
  const firstV = accessor(series[0]);
  const firstX = PAD_X + barW / 2 + gap / 2;
  const firstH = (firstV / max) * innerH;
  const firstY = baseY - firstH - 4;
  const valLabel = firstV != null
    ? `<text class="label" x="${firstX.toFixed(1)}" y="${firstY.toFixed(1)}" text-anchor="middle" style="fill: var(--ink); font-weight: 600;">${firstV.toFixed(1)}${unit}</text>`
    : '';

  svgEl.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);
  svgEl.innerHTML = bars + labels + valLabel;
}
