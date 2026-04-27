// ============================================================
// Charts: Tide area chart + horizontal hourly strip renderer.
// ============================================================
const CHART_W = 600;
const CHART_H = 130;
const PAD_X = 10;
const PAD_TOP = 18;
const PAD_BOT = 22;

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
}
function fmtHourLabel(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function buildSmoothPath(points) {
  if (!points.length) return '';
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C${cx.toFixed(1)},${p0.y.toFixed(1)} ${cx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

// ---- Tide chart ---------------------------------------------------------
function renderTideChart(svgEl, series, extrema) {
  if (!series || !series.length) {
    svgEl.innerHTML = '<text x="10" y="60" fill="rgba(255,255,255,0.4)" font-size="13">No tide data yet — pick a spot.</text>';
    return;
  }
  const values = series.map(s => s.v).filter(v => v != null);
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(0.1, max - min);
  const innerH = CHART_H - PAD_TOP - PAD_BOT;
  const innerW = CHART_W - PAD_X * 2;
  const baseY = PAD_TOP + innerH;

  const pts = series.map((s, i) => ({
    x: PAD_X + (i / (series.length - 1)) * innerW,
    y: PAD_TOP + (1 - (s.v - min) / range) * innerH,
    t: s.t, v: s.v,
  }));
  const linePath = buildSmoothPath(pts);
  const areaPath = linePath
    + ` L${pts[pts.length - 1].x.toFixed(1)},${baseY}`
    + ` L${pts[0].x.toFixed(1)},${baseY} Z`;

  // Hour grid lines + labels every 6h
  let grid = '';
  for (let i = 0; i < series.length; i += 6) {
    const x = PAD_X + (i / (series.length - 1)) * innerW;
    grid += `<line x1="${x.toFixed(1)}" y1="${PAD_TOP}" x2="${x.toFixed(1)}" y2="${baseY}"
              stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
    grid += `<text x="${x.toFixed(1)}" y="${(baseY + 14).toFixed(1)}"
              text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="10">${fmtHourLabel(series[i].t)}</text>`;
  }

  // High / low markers
  const extr = (extrema || []).map(e => {
    const idx = series.findIndex(s => s.t === e.t);
    if (idx < 0) return '';
    const x = PAD_X + (idx / (series.length - 1)) * innerW;
    const y = PAD_TOP + (1 - (e.value - min) / range) * innerH;
    const labelY = e.type === 'high' ? y - 10 : y + 18;
    const color = e.type === 'high' ? '#4cc2ff' : '#6ee7b7';
    return `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}" stroke="#0a1a30" stroke-width="2"/>
      <text x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            fill="#ffffff" font-size="10" font-weight="600">
        ${e.type === 'high' ? 'H' : 'L'} ${fmtTime(e.t)}
      </text>`;
  }).join('');

  // Now indicator
  const nowX = pts[0].x.toFixed(1);
  const nowY = pts[0].y.toFixed(1);

  svgEl.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4cc2ff" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#4cc2ff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${areaPath}" fill="url(#tideFill)"/>
    <path d="${linePath}" fill="none" stroke="#4cc2ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${nowX}" y1="${PAD_TOP}" x2="${nowX}" y2="${baseY}"
          stroke="rgba(255,255,255,0.6)" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="${nowX}" cy="${nowY}" r="5" fill="#ffffff"/>
    <text x="${nowX}" y="${(PAD_TOP - 4).toFixed(1)}" text-anchor="middle"
          fill="#ffffff" font-size="10" font-weight="600">NOW</text>
    ${extr}
  `;
}

// ---- Hourly horizontal strip ------------------------------------------
function renderHourlyStrip(container, series, accessor, fmt, glyphForValue) {
  if (!series || !series.length) {
    container.innerHTML = '<div class="empty" style="padding:14px 4px;">No data yet</div>';
    return;
  }
  container.innerHTML = series.map((s, i) => {
    const v = accessor(s);
    const time = i === 0 ? 'Now' : fmtHourLabel(s.t);
    const glyph = glyphForValue ? glyphForValue(s, v) : '';
    return `<div class="hour ${i === 0 ? 'now' : ''}">
      <div class="h-time">${time}</div>
      <div class="h-glyph">${glyph}</div>
      <div class="h-val">${fmt(v)}</div>
    </div>`;
  }).join('');
}
