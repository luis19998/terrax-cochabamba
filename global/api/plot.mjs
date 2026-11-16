// Live data for one plot: soil, slope, recent weather. Each source has its own timeout and cache, and a source
// that fails simply comes back as null: the app shows only what has data behind it.
//
//   Soil:       SoilGrids 2.0 (ISRIC), 250 m, REST API. Not NASA; cited separately.
//   Slope:      NASA SRTM 30 m through Open Topo Data; falls back to the bundled SRTM grid of the municipality.
//   Conditions: NASA POWER daily, last 45 days (near real time), compared with the 1981-2025 weekly climatology.
import { elevationFromGrid, slopeClass, textureClass } from "../web/js/assess.js";

const HOUR = 3600 * 1000;

export function createPlotService({ climate, grid }) {
  const cache = new Map();
  async function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await fn();
    if (value !== null) {
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value });
    }
    return value;
  }
  const getJson = async (url, ms) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const round = (x, d = 4) => Number(x).toFixed(d);

  function soil(lat, lon) {
    return cached(`soil2:${round(lat, 3)},${round(lon, 3)}`, 24 * HOUR, async () => {
      const query = new URLSearchParams([["lon", round(lon)], ["lat", round(lat)], ["value", "mean"],
        ...["phh2o", "clay", "sand", "silt", "soc", "nitrogen", "cfvo", "bdod"].map((p) => ["property", p]),
        ...["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"].map((d) => ["depth", d])]);
      // SoilGrids can take from 5 to more than 40 seconds: give up early so the page never waits for it
      const data = await getJson(`https://rest.isric.org/soilgrids/v2.0/properties/query?${query}`, 8000);
      const thickness = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15 };
      const out = {};
      // every depth down to 2 m, for the 3D soil profile
      const profile = {};
      for (const layer of data.properties.layers) {
        for (const depth of layer.depths) {
          const v = depth.values.mean;
          profile[depth.label] ||= { depth: depth.label };
          profile[depth.label][layer.name] = v === null || v === undefined ? null : v / layer.unit_measure.d_factor;
        }
      }
      for (const layer of data.properties.layers) {
        let sum = 0;
        let weight = 0;
        for (const depth of layer.depths) {
          const v = depth.values.mean;
          if (v === null || v === undefined || !thickness[depth.label]) continue;
          sum += (v / layer.unit_measure.d_factor) * thickness[depth.label];
          weight += thickness[depth.label];
        }
        out[layer.name] = weight ? sum / weight : null;
      }
      if (Object.values(out).every((v) => v === null)) return null; // urban pixels have no soil data
      return {
        depth: "0 a 30 cm", ph: out.phh2o, clay: out.clay, sand: out.sand, silt: out.silt,
        soc_gkg: out.soc, nitrogen_gkg: out.nitrogen, texture: textureClass(out.sand, out.silt, out.clay),
        profile: ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"].map((d) => profile[d]).filter(Boolean),
        source: "SoilGrids 2.0 (ISRIC), 250 m; estimación de un modelo, no un análisis de la parcela",
      };
    });
  }

  function slope(lat, lon) {
    return cached(`slope:${round(lat)},${round(lon)}`, 24 * HOUR, async () => {
      const cell = 90; // metres between sample points
      const dLat = cell / 111320;
      const dLon = cell / (111320 * Math.cos((lat * Math.PI) / 180));
      const horn = (z) => {
        const dzdx = ((z[2] + 2 * z[5] + z[8]) - (z[0] + 2 * z[3] + z[6])) / (8 * cell);
        const dzdy = ((z[6] + 2 * z[7] + z[8]) - (z[0] + 2 * z[1] + z[2])) / (8 * cell);
        return 100 * Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      };
      const points = [];
      for (const r of [1, 0, -1]) for (const c of [-1, 0, 1]) points.push([lat + r * dLat, lon + c * dLon]);
      try {
        const locations = points.map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`).join("|");
        const data = await getJson(`https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locations)}`, 7000);
        const z = data.results.map((x) => x.elevation);
        if (z.every((e) => e !== null)) {
          const percent = horn(z);
          return { percent, class: slopeClass(percent), elevation: Math.round(z[4]), source: "NASA SRTM 30 m (Open Topo Data), ventana de 180 m" };
        }
      } catch { /* fall back to the bundled grid */ }
      const wide = 270;
      const wLat = wide / 111320;
      const wLon = wide / (111320 * Math.cos((lat * Math.PI) / 180));
      const z = [];
      for (const r of [1, 0, -1]) for (const c of [-1, 0, 1]) z.push(elevationFromGrid(grid, lat + r * wLat, lon + c * wLon));
      if (z.some((e) => e === null)) return null;
      const percent = horn(z) * (cell / wide);
      return { percent, class: slopeClass(percent), elevation: z[4], source: "NASA SRTM, malla de 540 m del municipio (pendiente media de la zona)" };
    });
  }

  function conditions(lat, lon, altitude) {
    return cached(`conditions:${round(lat, 2)},${round(lon, 2)}`, 6 * HOUR, async () => {
      const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
      const url = "https://power.larc.nasa.gov/api/temporal/daily/point?" + new URLSearchParams({
        parameters: "T2M_MIN,PRECTOTCORR,GWETROOT", community: "AG", latitude: round(lat), longitude: round(lon),
        start: day(46), end: day(1), format: "JSON",
      });
      const data = await getJson(url, 9000);
      const p = data.properties.parameter;
      const ok = (v) => v !== undefined && v !== null && v > -900;
      const dates = Object.keys(p.PRECTOTCORR).filter((d) => ok(p.PRECTOTCORR[d])).sort();
      if (dates.length < 20) return null;
      const last30 = dates.slice(-30);
      const weekOf = (d) => {
        const date = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
        return Math.min(51, Math.floor((date - Date.UTC(Number(d.slice(0, 4)), 0, 1)) / 864e5 / 7));
      };
      const weekMean = (table, w) => {
        const v = table.map((row) => row[w]).filter((x) => x !== null);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      const rain30 = last30.reduce((a, d) => a + p.PRECTOTCORR[d], 0);
      const normal30 = last30.reduce((a, d) => a + weekMean(climate.weekly.rain, weekOf(d)) / 7, 0);
      const wetDates = Object.keys(p.GWETROOT).filter((d) => ok(p.GWETROOT[d])).sort().slice(-7);
      const tminDates = Object.keys(p.T2M_MIN).filter((d) => ok(p.T2M_MIN[d])).sort().slice(-7);
      const shift = climate.meta.lapse_rate_c_per_m * (data.geometry.coordinates[2] - altitude);
      const lastDate = dates[dates.length - 1];
      return {
        asOf: `${lastDate.slice(0, 4)}-${lastDate.slice(4, 6)}-${lastDate.slice(6, 8)}`,
        rain30, rain30Normal: normal30, rainRatio: normal30 > 0 ? rain30 / normal30 : null,
        soilWetness: wetDates.length ? wetDates.reduce((a, d) => a + p.GWETROOT[d], 0) / wetDates.length : null,
        soilWetnessNormal: weekMean(climate.weekly.gwetroot, weekOf(lastDate)),
        tmin7: tminDates.length ? Math.min(...tminDates.map((d) => p.T2M_MIN[d])) + shift : null,
        source: "NASA POWER diario (casi en tiempo real), comparado con 1981-2025",
      };
    });
  }

  /** Everything known about a point. `fast` skips the slow sources (used by the messaging channel). */
  async function evaluate(lat, lon, { gamcInfo, forecast, fast = false } = {}) {
    const altitude = Number.isFinite(arguments[2] && arguments[2].altitude) ? arguments[2].altitude : elevationFromGrid(grid, lat, lon);
    if (altitude === null) return null;
    // No source may hold the answer for more than a few seconds: a slow one counts as "no data" this time
    const settle = (promise) => Promise.race([
      promise.then((v) => v, () => null),
      new Promise((resolve) => { setTimeout(() => resolve(null), 6500); }),
    ]);
    const soilKey = `soil:${round(lat, 3)},${round(lon, 3)}`;
    const [soilData, slopeData, now, gamc, forecastRaw] = await Promise.all([
      // the soil service is slow: in fast mode only an already cached answer is used
      fast ? (cache.has(soilKey) ? cache.get(soilKey).value : null) : settle(soil(lat, lon)),
      settle(slope(lat, lon)),
      settle(conditions(lat, lon, altitude)),
      gamcInfo ? settle(gamcInfo(lat, lon)) : null,
      forecast ? settle(forecast(lat, lon)) : null,
    ]);
    let summary = null;
    if (forecastRaw && forecastRaw.daily) {
      const d = forecastRaw.daily;
      const sum = (arr, n) => arr.slice(0, n).reduce((a, b) => a + (b || 0), 0);
      const mins = d.temperature_2m_min.slice(0, 7);
      const tmin = Math.min(...mins);
      summary = { rain7: sum(d.precipitation_sum, 7), rain14: sum(d.precipitation_sum, 14), et07: sum(d.et0_fao_evapotranspiration, 7), tmin7: tmin, tminDate: d.time[mins.indexOf(tmin)], source: "Open-Meteo" };
    }
    return { lat, lon, altitude, soil: soilData, slope: slopeData, conditions: now, gamc, forecast: summary };
  }

  return { evaluate, soil, slope, conditions };
}
