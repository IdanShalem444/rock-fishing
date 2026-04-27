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

async function fetchConditions(spot) {
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_level_height_msl` +
    `&timezone=auto`;
  const windUrl = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${spot.lat}&longitude=${spot.lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
    `&timezone=auto&windspeed_unit=kmh`;

  const [marine, wind] = await Promise.all([fetchJSON(marineUrl), fetchJSON(windUrl)]);
  const mi = pickCurrentIndex(marine.hourly.time);
  const wi = pickCurrentIndex(wind.hourly.time);

  const tide = marine.hourly.sea_level_height_msl ?? [];
  const tideNow = tide[mi];
  const tidePrev = tide[Math.max(0, mi - 3)];
  const tideNext = tide[Math.min(tide.length - 1, mi + 3)];
  const tideTrend = (tideNext != null && tidePrev != null) ? (tideNext - tidePrev) / 6 : null;

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
    windSpeed: wind.hourly.wind_speed_10m?.[wi] ?? null,
    windGust: wind.hourly.wind_gusts_10m?.[wi] ?? null,
    windDirection: wind.hourly.wind_direction_10m?.[wi] ?? null,
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
