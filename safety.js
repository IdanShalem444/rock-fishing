function lerp(x, x0, x1, y0, y1) {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

function computeSafety(c) {
  const factors = [];
  let score = 100;

  const swell = c.swellHeight ?? c.waveHeight ?? 0;
  const swellDed = Math.round(lerp(swell, 1, 4, 0, 60));
  if (swellDed) {
    score -= swellDed;
    factors.push({ label: `Swell ${swell.toFixed(1)} m`, delta: -swellDed });
  } else {
    factors.push({ label: `Swell ${swell.toFixed(1)} m`, delta: 0, ok: true });
  }

  const period = c.swellPeriod ?? c.wavePeriod ?? 0;
  let periodDed = 0;
  if (period > 10) {
    if (period <= 12)      periodDed = Math.round(lerp(period, 10, 12, 0, 5));
    else if (period <= 14) periodDed = Math.round(lerp(period, 12, 14, 5, 15));
    else                   periodDed = Math.round(lerp(period, 14, 18, 15, 30));
  }
  if (periodDed) {
    score -= periodDed;
    factors.push({ label: `Wave period ${period.toFixed(0)} s (long)`, delta: -periodDed });
  } else if (period > 0) {
    factors.push({ label: `Wave period ${period.toFixed(0)} s`, delta: 0, ok: true });
  }

  const wind = c.windSpeed ?? 0;
  let windDed = 0;
  if (wind > 15) windDed = Math.min(30, Math.round(wind - 15));
  if (windDed) {
    score -= windDed;
    factors.push({ label: `Wind ${wind.toFixed(0)} km/h`, delta: -windDed });
  } else {
    factors.push({ label: `Wind ${wind.toFixed(0)} km/h`, delta: 0, ok: true });
  }

  if (c.tideTrend != null && Math.abs(c.tideTrend) > 0.15) {
    score -= 10;
    factors.push({
      label: `Rapid tide ${c.tideTrend > 0 ? 'rise' : 'fall'}`,
      delta: -10
    });
  }

  score = Math.max(0, Math.min(100, score));
  let band, klass;
  if (score >= 75)      { band = 'Safe';        klass = 'safe'; }
  else if (score >= 50) { band = 'Caution';     klass = 'caution'; }
  else if (score >= 25) { band = 'Dangerous';   klass = 'danger'; }
  else                  { band = 'Do Not Fish'; klass = 'bad'; }

  return { score, band, klass, factors };
}
