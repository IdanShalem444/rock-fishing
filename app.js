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

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'map') setTimeout(() => _map?.invalidateSize(), 50);
  if (tab === 'catches') {
    populateCatchSpotOptions();
    renderCatchList(document.getElementById('catchFilter').value);
  }
}

function selectSpot(id, opts = {}) {
  const spot = findSpot(id);
  if (!spot) return;
  state.selectedSpotId = id;
  persistState();
  document.getElementById('selectedSpotLabel').textContent = spot.name;
  document.getElementById('condSpotName').textContent = spot.name;
  focusSpot(id);

  const cached = loadCachedConditions(id);
  if (cached) renderConditions(cached);

  if (!opts.skipFetch) refreshConditions();
  if (opts.switchTo) switchTab(opts.switchTo);
}

async function refreshConditions() {
  if (!state.selectedSpotId) return;
  const spot = findSpot(state.selectedSpotId);
  const updated = document.getElementById('condUpdated');
  updated.textContent = 'Loading…';
  try {
    const c = await fetchConditions(spot);
    renderConditions(c);
  } catch (e) {
    updated.textContent = "Couldn't fetch — showing last known data.";
  }
}

function fmtSunTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

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
    c.windDirection == null ? '' :
    `From ${compass(c.windDirection)}` + (c.windGust ? ` · gust ${c.windGust.toFixed(0)}` : '');

  document.getElementById('statWave').textContent =
    c.waveHeight == null ? '—' : `${c.waveHeight.toFixed(1)} m`;
  document.getElementById('statWaveSub').textContent = 'Combined sea state';

  document.getElementById('statTide').textContent =
    c.tide == null ? '—' : `${c.tide >= 0 ? '+' : ''}${c.tide.toFixed(2)} m`;
  document.getElementById('statTideSub').textContent = 'Relative to mean sea level';

  document.getElementById('statTideTrend').textContent =
    c.tideTrend == null ? '—'
      : `${c.tideTrend > 0 ? '↑ Rising' : '↓ Falling'} ${Math.abs(c.tideTrend).toFixed(2)} m/h`;

  // Sun chips
  const sunrise = c.sunrise ? new Date(c.sunrise) : null;
  const sunset = c.sunset ? new Date(c.sunset) : null;
  document.getElementById('sunriseChip').textContent = '🌅 ' + fmtSunTime(c.sunrise);
  document.getElementById('sunsetChip').textContent = '🌇 ' + fmtSunTime(c.sunset);
  if (sunrise && sunset) {
    const mins = Math.round((sunset - sunrise) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    document.getElementById('dayLengthChip').textContent = `⏱ ${h}h ${m}m daylight`;
  } else {
    document.getElementById('dayLengthChip').textContent = '⏱ —';
  }

  // Charts
  renderTideChart(document.getElementById('tideChart'), c.tideSeries, c.tideExtrema);
  const tideHi = (c.tideExtrema || []).filter(e => e.type === 'high');
  const tideLo = (c.tideExtrema || []).filter(e => e.type === 'low');
  document.getElementById('tideLegend').textContent =
    `${tideHi.length} high · ${tideLo.length} low`;
  document.getElementById('tideSummary').innerHTML = (c.tideExtrema || [])
    .slice(0, 4)
    .map(e => `<span>${e.type === 'high' ? '⬆ High' : '⬇ Low'} <b>${new Date(e.t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</b> · ${e.value.toFixed(2)} m</span>`)
    .join('');

  renderBarChart(document.getElementById('swellChart'), c.swellSeries, s => s.v, '#4cc2ff', 'm');
  const swellMax = Math.max(...(c.swellSeries || []).map(s => s.v ?? 0));
  document.getElementById('swellLegend').textContent =
    c.swellSeries?.length ? `peak ${swellMax.toFixed(1)} m` : '—';

  renderBarChart(document.getElementById('windChart'), c.windSeries, s => s.v, '#6ee7b7', 'km/h');
  const windMax = Math.max(...(c.windSeries || []).map(s => s.v ?? 0));
  document.getElementById('windLegend').textContent =
    c.windSeries?.length ? `peak ${windMax.toFixed(0)} km/h` : '—';

  // Safety score + ring
  const s = computeSafety(c);
  const ringEl = document.getElementById('scoreBar');
  const circumference = 2 * Math.PI * 52;
  ringEl.setAttribute('stroke-dasharray', circumference.toFixed(2));
  ringEl.setAttribute('stroke-dashoffset', (circumference * (1 - s.score / 100)).toFixed(2));
  const ringColor = {
    safe: 'var(--safe)', caution: 'var(--caution)',
    danger: 'var(--danger)', bad: 'var(--bad)'
  }[s.klass];
  ringEl.setAttribute('stroke', ringColor);

  document.getElementById('scoreValue').textContent = s.score;
  const band = document.getElementById('scoreBand');
  band.textContent = s.band;
  band.className = 'band ' + s.klass;
  document.getElementById('scoreHeadline').textContent = s.headline;

  document.getElementById('scoreFactors').innerHTML = s.factors.map(f =>
    `<li><span>${f.label}</span><span class="${f.delta < 0 ? 'neg' : 'ok'}">${f.delta < 0 ? f.delta : '✓'}</span></li>`
  ).join('');

  document.getElementById('condUpdated').textContent =
    'Updated ' + new Date(c.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function populateCatchSpotOptions() {
  const sel = document.getElementById('catchSpot');
  const current = sel.value || state.selectedSpotId;
  sel.innerHTML = allSpots().map(s =>
    `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${s.name}</option>`
  ).join('');
}

document.querySelectorAll('.tab-btn').forEach(b => {
  b.onclick = () => switchTab(b.dataset.tab);
});

document.getElementById('refreshBtn').onclick = refreshConditions;

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

initMap(id => selectSpot(id, { switchTo: 'conditions' }));
populateCatchSpotOptions();
renderCatchList();
if (state.selectedSpotId && findSpot(state.selectedSpotId)) {
  selectSpot(state.selectedSpotId);
}
