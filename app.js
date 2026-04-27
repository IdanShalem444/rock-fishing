// ============================================================
// App orchestration — state, tab routing, render pipeline.
// ============================================================
const STATE_KEY = 'rfa.state';

const state = {
  selectedSpotId: null,
  ...loadState(),
};

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); }
  catch { return {}; }
}
function persistState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ selectedSpotId: state.selectedSpotId }));
}

// ---- Tab switching ------------------------------------------------------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'spots') setTimeout(() => _map?.invalidateSize(), 50);
  if (tab === 'catches') {
    populateCatchSpotOptions();
    renderCatchList(document.getElementById('catchFilter').value);
  }
}

// ---- Spot selection -----------------------------------------------------
function selectSpot(id, opts = {}) {
  const spot = findSpot(id);
  if (!spot) return;
  state.selectedSpotId = id;
  persistState();
  document.getElementById('condSpotName').textContent = spot.name;
  focusSpot(id);
  renderSpotList();

  const cached = loadCachedConditions(id);
  if (cached) renderConditions(cached);

  if (!opts.skipFetch) refreshConditions();
  if (opts.switchTo) switchTab(opts.switchTo);
}

async function refreshConditions() {
  if (!state.selectedSpotId) return;
  const spot = findSpot(state.selectedSpotId);
  const updated = document.getElementById('condUpdated');
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spin');
  updated.textContent = 'Loading…';
  try {
    const c = await fetchConditions(spot);
    renderConditions(c);
    renderSpotList();
  } catch (e) {
    updated.textContent = "Couldn't fetch — showing last known data.";
  } finally {
    refreshBtn.classList.remove('spin');
  }
}

function fmtSunTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---- Render conditions --------------------------------------------------
function renderConditions(c) {
  // Stat tiles
  document.getElementById('statSwell').textContent =
    c.swellHeight == null ? '—' : `${c.swellHeight.toFixed(1)} m`;
  document.getElementById('statSwellSub').textContent =
    c.swellDirection == null ? '' : `From ${compass(c.swellDirection)} (${Math.round(c.swellDirection)}°)`;

  const period = c.swellPeriod ?? c.wavePeriod;
  document.getElementById('statPeriod').textContent =
    period == null ? '—' : `${period.toFixed(0)} s`;

  document.getElementById('statWind').textContent =
    c.windSpeed == null ? '—' : `${c.windSpeed.toFixed(0)} km/h`;
  document.getElementById('statWindSub').textContent =
    c.windGust == null ? '' : `Gusts ${c.windGust.toFixed(0)} km/h`;

  const arrow = document.getElementById('windArrow');
  if (c.windDirection != null) {
    // Wind direction is "from" — arrow points where wind is going (180° offset).
    arrow.style.transform = `translate(-50%, -100%) rotate(${(c.windDirection + 180) % 360}deg)`;
  }
  document.getElementById('statWindDirSub').textContent =
    c.windDirection == null ? '—' : `From ${compass(c.windDirection)}`;

  document.getElementById('statWave').textContent =
    c.waveHeight == null ? '—' : `${c.waveHeight.toFixed(1)} m`;

  document.getElementById('statTide').textContent =
    c.tide == null ? '—' : `${c.tide >= 0 ? '+' : ''}${c.tide.toFixed(2)} m`;
  document.getElementById('statTideSub').textContent =
    c.tideTrend == null ? 'Relative to MSL'
      : `${c.tideTrend > 0 ? '↑ Rising' : '↓ Falling'} ${Math.abs(c.tideTrend).toFixed(2)} m/h`;

  // Sun chips
  const sunrise = c.sunrise ? new Date(c.sunrise) : null;
  const sunset = c.sunset ? new Date(c.sunset) : null;
  document.getElementById('sunriseChip').innerHTML = '🌅 <b>' + fmtSunTime(c.sunrise) + '</b>';
  document.getElementById('sunsetChip').innerHTML = '🌇 <b>' + fmtSunTime(c.sunset) + '</b>';
  if (sunrise && sunset) {
    const mins = Math.round((sunset - sunrise) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    document.getElementById('dayLengthChip').innerHTML = `⏱ <b>${h}h ${m}m</b> daylight`;
  } else {
    document.getElementById('dayLengthChip').textContent = '⏱ —';
  }

  // Hourly strips
  renderHourlyStrip(
    document.getElementById('swellHourly'),
    c.swellSeries || [],
    s => s.v,
    v => v == null ? '—' : `${v.toFixed(1)}m`,
    (s, v) => v == null ? '' : (v >= 2.5 ? '🌊' : v >= 1.5 ? '🌀' : '〰️')
  );
  const swellMax = Math.max(0, ...(c.swellSeries || []).map(s => s.v ?? 0));
  document.getElementById('swellLegend').textContent =
    c.swellSeries?.length ? `peak ${swellMax.toFixed(1)} m` : '—';

  renderHourlyStrip(
    document.getElementById('windHourly'),
    c.windSeries || [],
    s => s.v,
    v => v == null ? '—' : `${v.toFixed(0)}`,
    (s) => s.d == null ? '' : compassArrow(s.d)
  );
  const windMax = Math.max(0, ...(c.windSeries || []).map(s => s.v ?? 0));
  document.getElementById('windLegend').textContent =
    c.windSeries?.length ? `peak ${windMax.toFixed(0)} km/h` : '—';

  // Tide chart
  renderTideChart(document.getElementById('tideChart'), c.tideSeries, c.tideExtrema);
  const hi = (c.tideExtrema || []).filter(e => e.type === 'high').length;
  const lo = (c.tideExtrema || []).filter(e => e.type === 'low').length;
  document.getElementById('tideLegend').textContent = `${hi} high · ${lo} low`;
  document.getElementById('tideSummary').innerHTML = (c.tideExtrema || [])
    .slice(0, 4)
    .map(e =>
      `<span><span class="lbl ${e.type === 'high' ? '' : 'lo'}">${e.type === 'high' ? 'H' : 'L'}</span>`
      + `${new Date(e.t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })} · ${e.value.toFixed(2)} m</span>`)
    .join('') || '<span class="dim">No high/low in window</span>';

  // Safety score
  const s = computeSafety(c);
  document.body.classList.remove('band-safe', 'band-caution', 'band-danger', 'band-bad');
  document.body.classList.add('band-' + s.klass);

  document.getElementById('scoreValue').innerHTML = `${s.score}<span class="of">/100</span>`;
  const band = document.getElementById('scoreBand');
  band.textContent = s.band;
  band.className = 'band-name ' + s.klass;
  document.getElementById('scoreHeadline').textContent = s.headline;

  document.getElementById('scoreFactors').innerHTML = s.factors.map(f =>
    `<li><span>${f.label}</span><span class="${f.delta < 0 ? 'neg' : 'ok'}">${f.delta < 0 ? f.delta : '✓'}</span></li>`
  ).join('');

  document.getElementById('condUpdated').textContent =
    'Updated ' + new Date(c.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function compassArrow(deg) {
  // Direction wind blows TO (deg + 180). 0deg = ↓ (south)
  const arrows = ['↓','↙','←','↖','↑','↗','→','↘'];
  const i = Math.round(((deg + 180) % 360) / 45) % 8;
  return arrows[i];
}

// ---- Spots list rendering ----------------------------------------------
function renderSpotList() {
  const list = document.getElementById('spotList');
  if (!list) return;
  list.innerHTML = allSpots().map(s => {
    const cached = loadCachedConditions(s.id);
    const safety = cached ? computeSafety(cached) : null;
    const dotKlass = safety ? safety.klass : 'dim';
    const scoreText = safety ? safety.score : '—';
    const scoreKlass = safety ? safety.klass : 'dim';
    const sub = cached
      ? `Swell ${(cached.swellHeight ?? 0).toFixed(1)}m · Wind ${(cached.windSpeed ?? 0).toFixed(0)}km/h`
      : 'Tap to load conditions';
    const isSel = s.id === state.selectedSpotId ? 'selected' : '';
    return `<div class="spot-row ${isSel}" data-spot="${s.id}">
      <div class="spot-dot ${dotKlass}"></div>
      <div>
        <div class="spot-name">${escHtml(s.name)}</div>
        <div class="spot-meta">${sub}</div>
      </div>
      <div class="spot-score ${scoreKlass}">${scoreText}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.spot-row').forEach(row => {
    row.onclick = () => selectSpot(row.dataset.spot, { switchTo: 'conditions' });
  });
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---- Catch options ------------------------------------------------------
function populateCatchSpotOptions() {
  const sel = document.getElementById('catchSpot');
  const current = sel.value || state.selectedSpotId;
  sel.innerHTML = allSpots().map(s =>
    `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');
}

// ---- Wire up events -----------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(b => {
  b.onclick = () => switchTab(b.dataset.tab);
});

document.getElementById('refreshBtn').onclick = refreshConditions;

document.getElementById('toggleMapBtn').onclick = () => {
  const w = document.getElementById('mapWrap');
  w.classList.toggle('open');
  if (w.classList.contains('open')) setTimeout(() => _map?.invalidateSize(), 380);
};

document.getElementById('addSpotBtn').onclick = () => {
  document.getElementById('addSpotDialog').showModal();
};
window.addEventListener('map:longpress', (e) => {
  document.getElementById('newSpotLat').value = e.detail.lat.toFixed(4);
  document.getElementById('newSpotLon').value = e.detail.lon.toFixed(4);
  document.getElementById('addSpotDialog').showModal();
});
document.getElementById('addSpotForm').addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const name = document.getElementById('newSpotName').value.trim();
  const lat = parseFloat(document.getElementById('newSpotLat').value);
  const lon = parseFloat(document.getElementById('newSpotLon').value);
  if (!name || isNaN(lat) || isNaN(lon)) return;
  const spot = { id: 'custom-' + Date.now(), name, lat, lon, custom: true };
  saveCustomSpot(spot);
  renderMarkers(id => selectSpot(id, { switchTo: 'conditions' }));
  renderSpotList();
  populateCatchSpotOptions();
  document.getElementById('addSpotForm').reset();
});

document.getElementById('catchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const spotId = document.getElementById('catchSpot').value;
  const spot = findSpot(spotId);
  const photoFile = document.getElementById('catchPhoto').files[0];
  const photo = await readFileAsDataURL(photoFile);
  const cached = loadCachedConditions(spotId);
  const safety = cached ? computeSafety(cached) : null;
  const conditions = cached ? {
    score: safety.score,
    band: safety.band,
    swellHeight: cached.swellHeight,
    swellPeriod: cached.swellPeriod,
    waveHeight: cached.waveHeight,
    wavePeriod: cached.wavePeriod,
    windSpeed: cached.windSpeed,
    windDirection: cached.windDirection,
    tide: cached.tide,
  } : null;

  addCatch({
    id: 'c-' + Date.now(),
    at: Date.now(),
    spotId, spotName: spot?.name || '',
    species: document.getElementById('catchSpecies').value.trim(),
    length: parseFloat(document.getElementById('catchLength').value) || null,
    weight: parseFloat(document.getElementById('catchWeight').value) || null,
    bait: document.getElementById('catchBait').value.trim(),
    notes: document.getElementById('catchNotes').value.trim(),
    photo,
    conditions,
  });
  document.getElementById('catchForm').reset();
  populateCatchSpotOptions();
  renderCatchList();
});

document.getElementById('catchFilter').addEventListener('input', (e) => {
  renderCatchList(e.target.value);
});

// ---- Boot ---------------------------------------------------------------
initMap(id => selectSpot(id, { switchTo: 'conditions' }));
renderSpotList();
populateCatchSpotOptions();
renderCatchList();
if (state.selectedSpotId && findSpot(state.selectedSpotId)) {
  selectSpot(state.selectedSpotId);
}
