// Probabilistic outlook for one plot: daily (16 days), weekly (2 weeks) and monthly (3 months).
//
//   days 1-16 and weeks 1-2: share of the 31 members of the GFS ensemble 0.25 deg (NOAA, through the Open-Meteo
//     Ensemble API) that meet each condition. "Normal" is the NASA POWER climatology 1981-2025 of the same weeks.
//   months 1-3: climatological probabilities from 45 years of NASA POWER (how often each outcome happened in that
//     month). The raw seasonal model was tested on 2026-11-14 and gave 3 to 4 times the normal December rain for
//     Cochabamba: without its own climatology to correct the bias it is not shown.
// Temperatures are moved to the plot altitude with the same lapse rate as the engine.
const ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const quantile = (values, q) => {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
};
const share = (values, test) => {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return v.length ? v.filter(test).length / v.length : null;
};
const round = (x, d = 1) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);
const weekOfDate = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Math.min(51, Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 / 7));
};

/** members[variable][m][day] from an Open-Meteo ensemble response */
function members(daily, variable) {
  const keys = Object.keys(daily).filter((k) => k === variable || k.startsWith(`${variable}_member`));
  return keys.map((k) => daily[k]);
}

export function createOutlook({ climate }) {
  const cache = new Map();
  const lapse = climate.meta.lapse_rate_c_per_m;
  const normalWeekRain = (week) => {
    const v = climate.weekly.rain.map((row) => row[week]).filter((x) => x !== null);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const normalWeekRainQuantile = (week, q) => quantile(climate.weekly.rain.map((row) => row[week]), q);

  async function fetchJson(url, ms) {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await fn();
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  async function shortRange(lat, lon, altitude) {
    const url = `${ENSEMBLE}?` + new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lon.toFixed(3), models: "gfs025", forecast_days: "16", timezone: "America/La_Paz",
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum",
    });
    const data = await fetchJson(url, 12000);
    const shift = lapse * (data.elevation - altitude);
    const rain = members(data.daily, "precipitation_sum");
    const tmin = members(data.daily, "temperature_2m_min").map((m) => m.map((x) => (x === null ? null : x + shift)));
    const tmax = members(data.daily, "temperature_2m_max").map((m) => m.map((x) => (x === null ? null : x + shift)));
    const days = data.daily.time.map((date, d) => {
      const r = rain.map((m) => m[d]);
      const t = tmin.map((m) => m[d]);
      return {
        date,
        pRain: round(share(r, (x) => x >= 1), 2), pHeavyRain: round(share(r, (x) => x >= 10), 2),
        rainMedian: round(quantile(r, 0.5)), rainP10: round(quantile(r, 0.1)), rainP90: round(quantile(r, 0.9)),
        pFrost: round(share(t, (x) => x <= 0), 2), tminMedian: round(quantile(t, 0.5)), tminP10: round(quantile(t, 0.1)),
        tmaxMedian: round(quantile(tmax.map((m) => m[d]), 0.5)),
      };
    });
    const weeks = [0, 1].map((w) => {
      const span = data.daily.time.slice(w * 7, w * 7 + 7);
      const totals = rain.map((m) => m.slice(w * 7, w * 7 + 7).reduce((a, b) => a + (b || 0), 0));
      const week = weekOfDate(span[0]);
      const normal = normalWeekRain(week);
      const p80 = normalWeekRainQuantile(week, 0.8);
      const p20 = normalWeekRainQuantile(week, 0.2);
      const frostAny = tmin.map((m) => m.slice(w * 7, w * 7 + 7).some((x) => x !== null && x <= 0));
      return {
        from: span[0], to: span[span.length - 1],
        rainMedian: round(quantile(totals, 0.5)), rainP10: round(quantile(totals, 0.1)), rainP90: round(quantile(totals, 0.9)),
        normal: round(normal),
        pAboveNormal: round(share(totals, (x) => x > normal), 2),
        pWetterThanUsual: round(share(totals, (x) => x > p80), 2),
        pDrierThanUsual: round(share(totals, (x) => x < p20), 2),
        pDry: round(share(totals, (x) => x < 5), 2),
        pFrost: round(frostAny.filter(Boolean).length / frostAny.length, 2),
      };
    });
    return { members: rain.length, model: "GFS Ensemble 0,25° (NOAA) vía Open-Meteo", days, weeks };
  }

  /** Next three calendar months from the 45-year NASA POWER record, at the plot altitude. */
  function monthlyClimatology(altitude) {
    const shift = lapse * (climate.meta.cell_elevation_m - altitude);
    const now = new Date();
    const months = [];
    for (let k = 0; k < 3; k++) {
      const month = (now.getUTCMonth() + k) % 12;
      // weeks whose middle day falls in this month (day of year of the middle of week w is 7w + 3)
      const weeks = [];
      for (let w = 0; w < 52; w++) {
        const mid = new Date(Date.UTC(2025, 0, 1 + w * 7 + 3));
        if (mid.getUTCMonth() === month) weeks.push(w);
      }
      const scale = 30.4 / (weeks.length * 7);
      const totals = climate.weekly.rain.map((row) => (weeks.some((w) => row[w] === null) ? null : weeks.reduce((a, w) => a + row[w], 0) * scale));
      const frostYears = climate.weekly.tmin_min.map((row) => weeks.some((w) => row[w] !== null && row[w] + shift <= 0));
      const median = quantile(totals, 0.5);
      months.push({
        month: month + 1, name: MONTHS[month], years: totals.filter((x) => x !== null).length,
        rainMedian: round(median, 0), rainP20: round(quantile(totals, 0.2), 0), rainP80: round(quantile(totals, 0.8), 0),
        pDryMonth: round(share(totals, (x) => x < 0.5 * median), 2),
        pWetMonth: round(share(totals, (x) => x > 1.5 * median), 2),
        pFrost: round(frostYears.filter(Boolean).length / frostYears.length, 2),
      });
    }
    return { model: `Probabilidad histórica, NASA POWER ${climate.meta.period.replace(" to ", " a ")}`, months };
  }

  /** Everything at once. A source that fails comes back as null. */
  async function outlook(lat, lon, altitude) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(altitude / 50)}`;
    const short = await cached(`s:${key}`, 60 * 60 * 1000, () => shortRange(lat, lon, altitude)).catch(() => null);
    const season = monthlyClimatology(altitude);
    return {
      generated: new Date().toISOString(),
      altitude,
      daily: short ? { model: short.model, members: short.members, days: short.days } : null,
      weekly: short ? { model: short.model, members: short.members, weeks: short.weeks } : null,
      monthly: season,
      normal_source: `NASA POWER ${climate.meta.period.replace(" to ", " a ")}, semanas equivalentes`,
      note: "Días y semanas: probabilidad = parte de los 31 escenarios del pronóstico que cumplen la condición. Meses: cuántas veces pasó en 45 años de datos de NASA.",
    };
  }

  return { outlook };
}
