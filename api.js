const CACHE_KEY_PREFIX = 'rfa.cond.';

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function pickCurrentIndex(times) {
  const now = Date.now();
  let best = 0, bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - now);
    if (d < bestDelta) { bestDelta = d; best = i; }
  }
  return best;
}

// Find local minima/maxima in a numeric array — returns [{idx, value, type}]
function findExtrema(arr, minSpacing = 3) {
  const out = [];
  for (let i = 1; i < arr.length - 1; i++) {
    const v = arr[i];
    if (v == null) continue;
    let isMax = true, isMin = true;
    for (let k = Math.max(0, i - minSpacing); k <= Math.min(arr.length - 1, i + minSpacing); k++) {
      if (k === i) continue;
      if (arr[k] == null) continue;
      if (arr[k] > v) isMax = false;
      if (arr[k] < v) isMin = false;
    }
    if (isMax) out.push({ idx: i, value: v, type: 'high' });
    else if (isMin) out.push({ idx: i, value: v, type: 'low' });
  }
  return out;
}

async function fetchConditions(spot) {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine`
    + `?latitude=${spot.lat}&longitude=${spot.lon}`
    + `&hourly=wave_height,wave_period,wave_direction,`
    + `swell_wave_height,swell_wave_period,swell_wave_direction,sea_level_height_msl`
    + `&timezone=auto&forecast_days=2`;

  const windUrl = `https://api.open-meteo.com/v1/forecast`
    + `?latitude=${spot.lat}&longitude=${spot.lon}`
    + `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m`
    + `&daily=sunrise,sunset`
    + `&timezone=auto&windspeed_unit=kmh&forecast_days=2`;

  const [marine, wind] = await Promise.all([fetchJSON(marineUrl), fetchJSON(windUrl)]);
  const mi = pickCurrentIndex(marine.hourly.time);
  const wi = pickCurrentIndex(wind.hourly.time);

  const tide = marine.hourly.sea_level_height_msl ?? [];
  const tideNow = tide[mi];
  const tidePrev = tide[Math.max(0, mi - 3)];
  const tideNext = tide[Math.min(tide.length - 1, mi + 3)];
  const tideTrend = (tideNext != null && tidePrev != null) ? (tideNext - tidePrev) / 6 : null;

  // 24h tide series starting at now
  const tideSeries = [];
  for (let i = 0; i < 24 && mi + i < tide.length; i++) {
    tideSeries.push({ t: marine.hourly.time[mi + i], v: tide[mi + i] });
  }
  const tideExtrema = findExtrema(tide, 2)
    .filter(e => e.idx >= mi && e.idx <= mi + 24)
    .map(e => ({ ...e, t: marine.hourly.time[e.idx] }));

  // 12h swell + wind series
  const swellSeries = [];
  for (let i = 0; i < 12 && mi + i < tide.length; i++) {
    swellSeries.push({
      t: marine.hourly.time[mi + i],
      v: marine.hourly.swell_wave_height?.[mi + i],
      p: marine.hourly.swell_wave_period?.[mi + i],
    });
  }
  const windSeries = [];
  for (let i = 0; i < 12 && wi + i < wind.hourly.time.length; i++) {
    windSeries.push({
      t: wind.hourly.time[wi + i],
      v: wind.hourly.wind_speed_10m?.[wi + i],
      g: wind.hourly.wind_gusts_10m?.[wi + i],
      d: wind.hourly.wind_direction_10m?.[wi + i],
    });
  }

  // pick today's sunrise/sunset (first entry after now or just first)
  const dayIdx = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const idx = wind.daily?.time?.findIndex(t => t === today);
    return idx >= 0 ? idx : 0;
  })();

  const conditions = {
    fetchedAt: Date.now(),
    spotId: spot.id,
    swellHeight: marine.hourly.swell_wave_height?.[mi] ?? null,
    swellPeriod: marine.hourly.swell_wave_period?.[mi] ?? null,
    swellDirection: marine.hourly.swell_wave_direction?.[mi] ?? null,
    waveHeight: marine.hourly.wave_height?.[mi] ?? null,
    wavePeriod: marine.hourly.wave_period?.[mi] ?? null,
    waveDirection: marine.hourly.wave_direction?.[mi] ?? null,
    tide: tideNow ?? null,
    tideTrend,
    tideSeries,
    tideExtrema,
    swellSeries,
    windSeries,
    windSpeed: wind.hourly.wind_speed_10m?.[wi] ?? null,
    windGust: wind.hourly.wind_gusts_10m?.[wi] ?? null,
    windDirection: wind.hourly.wind_direction_10m?.[wi] ?? null,
    sunrise: wind.daily?.sunrise?.[dayIdx] ?? null,
    sunset: wind.daily?.sunset?.[dayIdx] ?? null,
  };

  localStorage.setItem(CACHE_KEY_PREFIX + spot.id, JSON.stringify(conditions));
  return conditions;
}

function loadCachedConditions(spotId) {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + spotId) || 'null'); }
  catch { return null; }
}

function compass(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
