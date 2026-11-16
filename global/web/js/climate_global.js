// Climate of ANY point on Earth, computed on the fly from NASA POWER (the same method as data/process_power.py,
// ported to JavaScript so it runs in the serverless function):
//   - daily NASA POWER 1981-2025 (community AG): T2M_MIN, T2M_MAX, T2M, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN, GWETROOT
//   - reference evapotranspiration FAO-56 Penman-Monteith (eq. 6), Hargreaves (eq. 52) on days without radiation
//   - per year and week of the year (52 weeks): tmin_min, tmax_max, tmean, rain, et0_low, et0_high, gwetroot
//   - rainy-season onset per season (1 October in the southern hemisphere, 1 April in the northern one) and its
//     Mann-Kendall trend
// Result is the same structure as web/data/climate_weekly.json, so the engine works unchanged anywhere.
// POWER cells are 0.5 x 0.625 degrees: results are cached per cell (memory + an optional store such as Netlify Blobs).

const LAPSE = 0.0065;
const PARAMS = ["T2M_MIN", "T2M_MAX", "T2M", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETROOT"];
const ONSET_MM = 20;
const ONSET_DAYS = 3;
const DRY_DAY_MM = 1;
const DRY_SPELL_DAYS = 10;
const START = "19810101";
const END = "20251231";

export const cellKey = (lat, lon) => `${(Math.round(lat * 2) / 2).toFixed(1)}_${(Math.round(lon / 0.625) * 0.625).toFixed(3)}`;

const satVp = (t) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
const dayOfYear = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;

/** FAO-56 reference evapotranspiration of one day (mm), at site elevation siteElev. */
function et0Day(v, latRad, doy, cellElev, siteElev) {
  const dt = LAPSE * (cellElev - siteElev);
  const tmax = v.T2M_MAX + dt;
  const tmin = v.T2M_MIN + dt;
  const tmean = (tmax + tmin) / 2;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(decl))));
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.sin(ws));
  const hargreaves = Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(Math.max(tmax - tmin, 0)) * ra * 0.408);
  if (v.ALLSKY_SFC_SW_DWN === null || v.RH2M === null || v.WS2M === null) return hargreaves;
  const es = (satVp(tmax) + satVp(tmin)) / 2;
  const esCell = (satVp(v.T2M_MAX) + satVp(v.T2M_MIN)) / 2;
  const ea = Math.min((v.RH2M / 100) * esCell, es);
  const slope = (4098 * satVp(tmean)) / (tmean + 237.3) ** 2;
  const pressure = 101.3 * ((293 - 0.0065 * siteElev) / 293) ** 5.26;
  const gamma = 0.000665 * pressure;
  const rs = v.ALLSKY_SFC_SW_DWN;
  const rso = (0.75 + 2e-5 * siteElev) * ra;
  const rn = 0.77 * rs - 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * Math.min(rso > 0 ? rs / rso : 1, 1) - 0.35);
  const pm = (0.408 * slope * rn + ((gamma * 900) / (tmean + 273)) * v.WS2M * (es - ea)) / (slope + gamma * (1 + 0.34 * v.WS2M));
  return Number.isFinite(pm) ? Math.max(0, pm) : hargreaves;
}

/** Mann-Kendall trend test with Sen's slope (normal approximation, no tie correction beyond the basic one). */
function mannKendall(x) {
  const n = x.length;
  if (n < 8) return { trend: "no trend", p: 1, slope_days_per_year: 0 };
  let s = 0;
  const slopes = [];
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { s += Math.sign(x[j] - x[i]); slopes.push((x[j] - x[i]) / (j - i)); }
  const variance = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  // two-sided p from the standard normal (Abramowitz-Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  const p = 1 - erf;
  slopes.sort((a, b) => a - b);
  const sen = slopes[Math.floor(slopes.length / 2)];
  return { trend: p < 0.05 ? (z > 0 ? "increasing" : "decreasing") : "no trend", p: Math.round(p * 1e4) / 1e4, slope_days_per_year: Math.round(sen * 100) / 100 };
}

/** Builds the weekly climate of the plot from the POWER daily JSON. */
export function buildClimate(raw, siteElevation) {
  const [lon, lat, cellElevation] = raw.geometry.coordinates;
  const par = raw.properties.parameter;
  const dates = Object.keys(par.T2M).sort();
  const latRad = (lat * Math.PI) / 180;
  const site = Number.isFinite(siteElevation) ? Math.max(0, siteElevation) : Math.max(0, cellElevation);
  const altitudes = [Math.max(0, Math.round(site - 300)), Math.round(site + 500)];
  const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  const empty = () => years.map(() => new Array(52).fill(null));
  const acc = { tmin_min: empty(), tmax_max: empty(), tsum: empty(), tn: empty(), rain: empty(), et0_low: empty(), et0_high: empty(), gsum: empty(), gn: empty() };
  const dailyRain = [];
  for (const d of dates) {
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    const doy = dayOfYear(y, m, day);
    const yi = years.indexOf(y);
    const w = Math.min(Math.floor((doy - 1) / 7), 51);
    const v = {};
    for (const k of PARAMS) { const x = par[k] && par[k][d]; v[k] = x === undefined || x === null || x <= -998 ? null : x; }
    dailyRain.push({ y, doy, rain: v.PRECTOTCORR });
    if (v.T2M_MIN !== null) acc.tmin_min[yi][w] = acc.tmin_min[yi][w] === null ? v.T2M_MIN : Math.min(acc.tmin_min[yi][w], v.T2M_MIN);
    if (v.T2M_MAX !== null) acc.tmax_max[yi][w] = acc.tmax_max[yi][w] === null ? v.T2M_MAX : Math.max(acc.tmax_max[yi][w], v.T2M_MAX);
    if (v.T2M !== null) { acc.tsum[yi][w] = (acc.tsum[yi][w] || 0) + v.T2M; acc.tn[yi][w] = (acc.tn[yi][w] || 0) + 1; }
    if (v.PRECTOTCORR !== null) acc.rain[yi][w] = (acc.rain[yi][w] || 0) + v.PRECTOTCORR;
    if (v.GWETROOT !== null) { acc.gsum[yi][w] = (acc.gsum[yi][w] || 0) + v.GWETROOT; acc.gn[yi][w] = (acc.gn[yi][w] || 0) + 1; }
    if (v.T2M_MIN !== null && v.T2M_MAX !== null) {
      acc.et0_low[yi][w] = (acc.et0_low[yi][w] || 0) + et0Day(v, latRad, doy, cellElevation, altitudes[0]);
      acc.et0_high[yi][w] = (acc.et0_high[yi][w] || 0) + et0Day(v, latRad, doy, cellElevation, altitudes[1]);
    }
  }
  const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
  const weekly = {
    tmin_min: acc.tmin_min.map((row) => row.map(r1)),
    tmax_max: acc.tmax_max.map((row) => row.map(r1)),
    tmean: acc.tsum.map((row, yi) => row.map((s, w) => (s === null ? null : r1(s / acc.tn[yi][w])))),
    rain: acc.rain.map((row) => row.map(r1)),
    et0_low: acc.et0_low.map((row) => row.map(r1)),
    et0_high: acc.et0_high.map((row) => row.map(r1)),
    gwetroot: acc.gsum.map((row, yi) => row.map((s, w) => (s === null ? null : Math.round((s / acc.gn[yi][w]) * 100) / 100))),
  };
  // rainy-season onset: southern hemisphere from 1 October, northern from 1 April
  const southern = lat < 0;
  const startDoy = southern ? 274 : 91;
  const seasons = [];
  const offsets = [];
  for (const y of years.slice(0, -1)) {
    const season = dailyRain.filter((x) => (x.y === y && x.doy >= startDoy) || (x.y === y + 1 && x.doy < startDoy - 60)).map((x) => x.rain ?? 0);
    let found = null;
    for (let d = 0; d < season.length - 33; d++) {
      if (season[d] + season[d + 1] + season[d + 2] < ONSET_MM) continue;
      let run = 0;
      let longest = 0;
      for (const r of season.slice(d + ONSET_DAYS, d + ONSET_DAYS + 30)) { run = r < DRY_DAY_MM ? run + 1 : 0; longest = Math.max(longest, run); }
      if (longest < DRY_SPELL_DAYS) { found = d; break; }
    }
    seasons.push(y);
    offsets.push(found);
  }
  const valid = offsets.filter((x) => x !== null);
  return {
    meta: {
      dataset: "NASA POWER, community AG, daily point API (meteorology from MERRA-2, radiation from CERES SYN1deg)",
      source_url: "https://power.larc.nasa.gov/api/temporal/daily/point",
      parameters: PARAMS,
      period: `${dates[0].slice(0, 4)}-${dates[0].slice(4, 6)}-${dates[0].slice(6, 8)} to ${dates.at(-1).slice(0, 4)}-${dates.at(-1).slice(4, 6)}-${dates.at(-1).slice(6, 8)}`,
      grid: "0.5 x 0.625 degrees: computed for the cell of this point",
      point: { lat, lon },
      cell_elevation_m: cellElevation,
      lapse_rate_c_per_m: LAPSE,
      week_definition: "week = (day_of_year - 1) // 7, 52 weeks, the last one absorbs the remaining days",
      et0_method: "FAO-56 Penman-Monteith; Hargreaves (FAO-56 eq. 52) on days without radiation data",
      et0_altitudes_m: altitudes,
      hemisphere: southern ? "south" : "north",
      generated: new Date().toISOString().slice(0, 10),
    },
    years,
    weekly,
    onset: {
      definition: `first day from 1 ${southern ? "October" : "April"} with >= 20 mm in 3 days, not followed within 30 days by a dry spell of 10 or more days (< 1 mm/day)`,
      start_doy: startDoy,
      seasons,
      days_after_1_october: offsets,
      days_after_start: offsets,
      found_in: valid.length,
      mann_kendall: mannKendall(valid),
    },
  };
}

/** Elevation of any point (metres): Open Topo Data, Mapzen dataset (SRTM, ETOPO1 and others merged). */
export async function elevationOf(lat, lon) {
  const r = await fetch(`https://api.opentopodata.org/v1/mapzen?locations=${lat.toFixed(5)},${lon.toFixed(5)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open Topo Data HTTP ${r.status}`);
  const data = await r.json();
  const e = data.results && data.results[0] && data.results[0].elevation;
  if (!Number.isFinite(e)) throw new Error("sin elevación");
  return Math.round(e);
}

/** createClimateService({ store }) -> { climateFor(lat, lon, elevation), elevation(lat, lon) } with caching. */
export function createClimateService({ store, fallback } = {}) {
  const memory = new Map();
  const elevations = new Map();
  async function elevation(lat, lon) {
    const key = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
    if (elevations.has(key)) return elevations.get(key);
    const e = await elevationOf(lat, lon);
    elevations.set(key, e);
    return e;
  }
  async function climateFor(lat, lon, siteElevation) {
    const key = `${cellKey(lat, lon)}_${Math.round((siteElevation ?? 0) / 100)}`;
    if (memory.has(key)) return memory.get(key);
    if (store) {
      try { const hit = await store.get(`climate:${key}`); if (hit && hit.weekly) { memory.set(key, hit); return hit; } } catch { /* fetch again */ }
    }
    // the bundled Cochabamba dataset answers at once for that cell
    if (fallback && cellKey(lat, lon) === cellKey(fallback.meta.point.lat, fallback.meta.point.lon)) { memory.set(key, fallback); return fallback; }
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?${new URLSearchParams({ parameters: PARAMS.join(","), community: "AG", latitude: lat.toFixed(4), longitude: lon.toFixed(4), start: START, end: END, format: "JSON" })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`NASA POWER HTTP ${r.status}`);
    const climate = buildClimate(await r.json(), siteElevation);
    memory.set(key, climate);
    if (memory.size > 60) memory.delete(memory.keys().next().value);
    if (store) store.set(`climate:${key}`, climate).catch(() => {});
    return climate;
  }
  async function remember(lat, lon, siteElevation, climate) {
    const key = `${cellKey(lat, lon)}_${Math.round((siteElevation ?? 0) / 100)}`;
    memory.set(key, climate);
    if (store) await store.set(`climate:${key}`, climate).catch(() => {});
    return { key };
  }
  return { climateFor, elevation, remember };
}
