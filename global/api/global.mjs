// Yatiri X Global: the same services as the Cochabamba version, but for any point on Earth.
// Every request first gets the elevation of the point and the NASA POWER climate of its cell, then runs the usual
// plot service and outlook with that climate. Cochabamba keeps its municipal (GAMC) layers and bundled dataset.
import { elevationFromGrid } from "../web/js/assess.js";
import { createClimateService } from "../web/js/climate_global.js";
import { createOutlook as createOutlookFor } from "./outlook.mjs";
import { createPlotService as createPlotServiceFor } from "./plot.mjs";

const inBox = (grid, lat, lon) => lat >= grid.min_lat && lat <= grid.max_lat && lon >= grid.min_lon && lon <= grid.max_lon;

export function createGlobal({ climate, grid, store }) {
  const climates = createClimateService({ store, fallback: climate });
  const outlooks = new WeakMap();
  const plots = new WeakMap();
  const forClimate = (map, make, c) => { if (!map.has(c)) map.set(c, make(c)); return map.get(c); };

  /** Elevation: the bundled municipal grid inside Cochabamba, Open Topo Data everywhere else. */
  async function altitudeOf(lat, lon) {
    if (inBox(grid, lat, lon)) {
      const e = elevationFromGrid(grid, lat, lon);
      if (e !== null) return e;
    }
    return climates.elevation(lat, lon);
  }
  const isCochabamba = (lat, lon) => inBox(grid, lat, lon) && elevationFromGrid(grid, lat, lon) !== null;
  const climateFor = (lat, lon, altitude) => climates.climateFor(lat, lon, altitude);

  const outlook = {
    async outlook(lat, lon, altitude) {
      const alt = Number.isFinite(altitude) ? altitude : await altitudeOf(lat, lon);
      const c = await climateFor(lat, lon, alt);
      return forClimate(outlooks, (x) => createOutlookFor({ climate: x }), c).outlook(lat, lon, alt);
    },
  };

  const plotService = {
    async evaluate(lat, lon, opts = {}) {
      const altitude = await altitudeOf(lat, lon).catch(() => null);
      if (altitude === null) return null;
      const c = await climateFor(lat, lon, altitude);
      const service = forClimate(plots, (x) => createPlotServiceFor({ climate: x, grid }), c);
      // municipal layers only answer inside Cochabamba
      const gamcInfo = isCochabamba(lat, lon) ? opts.gamcInfo : null;
      const out = await service.evaluate(lat, lon, { ...opts, gamcInfo, altitude });
      return out && { ...out, climate: c, local: isCochabamba(lat, lon) };
    },
    soil: (lat, lon) => forClimate(plots, (x) => createPlotServiceFor({ climate: x, grid }), climate).soil(lat, lon),
  };

  /** Climate sent by a browser that already computed it (big JSON): checked and kept for the server routes. */
  async function remember(input) {
    const c = input && input.climate;
    if (!c || !c.meta || !c.weekly || !Array.isArray(c.years) || !c.meta.point) throw new Error("Clima no válido");
    const { lat, lon } = c.meta.point;
    if (Math.abs(lat - input.lat) > 0.6 || Math.abs(lon - input.lon) > 0.7) throw new Error("El clima no corresponde a ese punto");
    const ok = (t) => Array.isArray(t) && t.length === c.years.length && t.every((row) => Array.isArray(row) && row.length === 52);
    if (!["tmin_min", "tmax_max", "tmean", "rain", "et0_low", "et0_high"].every((k) => ok(c.weekly[k]))) throw new Error("Clima incompleto");
    return climates.remember(input.lat, input.lon, input.altitude, c);
  }

  return { altitudeOf, climateFor, isCochabamba, outlook, plotService, remember };
}
