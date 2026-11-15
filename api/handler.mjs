// API of the planner as one function: (Request) => Response. Used by the local server (server.mjs) and by the
// hosted function (netlify/functions/api.mjs), so both behave the same.
//
//   GET  /api/config                public browser settings (Supabase URL and publishable key, if set)
//   GET  /api/health
//   GET  /api/n8n/alerts|digest     messages to send now (header x-alerts-secret); POST /api/n8n/sent marks them
//   POST /api/translate             { texts: [...] } -> { translations: { text: quechua } } (Gemini, cached)
//   POST /api/recommend             body: { altitude, history, irrigation, priorities, preferred, scenario }
//   GET  /api/gamc/wms?layer=       WMS proxy for the GAMC layers (the API key is added here, never in the browser)
//   GET  /api/gamc/info?lat=&lon=   district and peri-urban zone of a point (GAMC GetFeatureInfo)
//   GET  /api/forecast?lat=&lon=    16-day forecast from Open-Meteo (not NASA; cited separately)
//   GET  /api/plot?lat=&lon=        everything known about a point: altitude, slope, soil, recent weather, forecast
//   GET  /api/outlook?lat=&lon=     probabilistic outlook: 16 days, 2 weeks and 3 months (see outlook.mjs)
//   POST /api/tiri                  assistant: { question, lat, lon, history, irrigation, messages } (/api/terra too)
//   GET/POST /api/whatsapp          WhatsApp Cloud API webhook (see whatsapp.mjs)
import { explain, recommend } from "../web/js/engine.js";
import { elevationFromGrid } from "../web/js/assess.js";
import { createOutlook } from "./outlook.mjs";
import { markSent, pendingMessages, runAlerts } from "./alerts.mjs";
import { createPlotService } from "./plot.mjs";
import { createTerra, usableKey } from "./terra.mjs";
import { createTranslator } from "./translate.mjs";
import { createWhatsApp } from "./whatsapp.mjs";

// 1 x 1 transparent PNG, sent when the municipal server does not answer so the map keeps working
const EMPTY_TILE = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const R = 6378137;
const mercator = (lon, lat) => [R * (lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
const fail = (status, message) => Object.assign(new Error(message), { status });

const json = (status, data, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", ...headers },
});

export function createApi({ env, climate, crops, gamc, grid, knowledge, subscribers, sessionStore, translationStore }) {
  const layerById = Object.fromEntries(gamc.layers.map((l) => [l.id, l]));
  const wmsUrl = env.GAMC_WMS_URL || "https://serviciosgamc.cochabamba.bo/api/gs/wms";
  const cache = new Map();
  const remember = (key, value, limit = 600) => {
    if (cache.size >= limit) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  };

  async function gamcFetch(layerId, params) {
    const layer = layerById[layerId];
    if (!layer) throw fail(400, "Capa desconocida");
    if (!env.GAMC_API_KEY) throw fail(503, "Falta configurar GAMC_API_KEY en el servidor");
    const query = new URLSearchParams(params);
    for (const name of ["layer", "styles", "STYLES"]) query.delete(name);
    const cacheKey = `${layerId}?${query}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    query.set("key", env.GAMC_API_KEY);
    query.set("service_id", layer.service_id);
    const r = await fetch(`${wmsUrl}?${query}`, { signal: AbortSignal.timeout(25000) });
    const value = { status: r.status, type: r.headers.get("content-type") || "application/octet-stream", body: new Uint8Array(await r.arrayBuffer()) };
    if (r.ok) remember(cacheKey, value);
    return value;
  }

  async function gamcInfo(lat, lon) {
    const [x, y] = mercator(lon, lat);
    const half = 60;
    const params = {
      SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", LAYERS: "", SRS: "EPSG:3857",
      BBOX: `${x - half},${y - half},${x + half},${y + half}`, WIDTH: "101", HEIGHT: "101", X: "50", Y: "50",
      INFO_FORMAT: "application/json", FEATURE_COUNT: "3",
    };
    const out = { lat, lon, source: "GAMC, capas del proyecto 04 (WMS GetFeatureInfo)" };
    await Promise.all(gamc.layers.map(async (layer) => {
      try {
        const r = await gamcFetch(layer.id, params);
        const features = JSON.parse(new TextDecoder().decode(r.body)).features || [];
        out[layer.id] = features.length ? features[0].properties : null;
      } catch (error) {
        out[layer.id] = { error: error.message };
      }
    }));
    return out;
  }

  async function forecast(lat, lon) {
    const key = `forecast:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.data;
    const url = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4),
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration",
      forecast_days: "16", timezone: "America/La_Paz",
    });
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw fail(502, `Open-Meteo respondió ${r.status}`);
    const data = { ...(await r.json()), source: "Open-Meteo (pronóstico, no es un dato de la NASA)" };
    remember(key, { at: Date.now(), data });
    return data;
  }

  function parseInput(raw) {
    const altitude = Number(raw.altitude);
    if (!Number.isFinite(altitude) || altitude < 2000 || altitude > 4500) throw fail(400, "altitude debe estar entre 2000 y 4500 metros");
    const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []).map((s) => String(s).trim()).filter(Boolean);
    const scenario = raw.scenario || {};
    return {
      altitude,
      history: list(raw.history).slice(-2),
      irrigation: raw.irrigation === true || raw.irrigation === "true" || raw.irrigation === "1",
      priorities: list(raw.priorities),
      preferred: list(raw.preferred),
      scenario: {
        rainPct: Math.max(-50, Math.min(50, Number(scenario.rainPct ?? raw.rainPct ?? 0) || 0)),
        tempC: Math.max(-3, Math.min(4, Number(scenario.tempC ?? raw.tempC ?? 0) || 0)),
      },
    };
  }

  const plotService = createPlotService({ climate, grid });
  const outlook = createOutlook({ climate });
  const terra = createTerra({ env, climate, crops, knowledge, plotService, gamcInfo, forecast, outlook });
  const whatsapp = createWhatsApp({ env, terra, crops, subscribers, sessionStore });
  const translator = createTranslator({ env, cache: translationStore });

  async function body(request, url) {
    if (request.method !== "POST") return Object.fromEntries(url.searchParams);
    const text = await request.text();
    if (text.length > 1e5) throw fail(413, "Cuerpo demasiado grande");
    try { return text ? JSON.parse(text) : {}; } catch { throw fail(400, "JSON no válido"); }
  }

  async function route(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/api/config") {
      // public settings for the browser: the Supabase publishable key is meant to be public (row level security protects the data)
      const cloud = env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY ? { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY } : null;
      return json(200, { cloud });
    }
    if (path === "/api/health") {
      // one cheap call to the municipal service, to tell a wrong key (401/403) from a blocked or slow server
      let gamcCheck = "sin clave";
      if (env.GAMC_API_KEY) {
        try {
          const r = await gamcFetch("distritos", { REQUEST: "GetLegendGraphic", VERSION: "1.0.0", FORMAT: "image/png", check: String(Date.now()) });
          gamcCheck = r.status === 200 ? "ok" : `HTTP ${r.status}${r.status === 401 || r.status === 403 ? ": el GAMC rechazó la clave" : ""}`;
        } catch (error) {
          gamcCheck = `sin respuesta del GAMC (${error.name === "TimeoutError" ? "tiempo agotado" : error.message})`;
        }
      }
      return json(200, {
        gamc_check: gamcCheck,
        ok: true, climate: climate.meta.period, crops: crops.crops.length, gamc: Boolean(env.GAMC_API_KEY),
        tiri: await terra.status(),
        warnings: ["GEMINI_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => env[k] && !usableKey(env[k]))
          .map((k) => `${k} tiene caracteres que no son letras latinas, números o signos: vuelve a copiarla`),
        whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
        whatsapp_number: env.WHATSAPP_PUBLIC_NUMBER ? env.WHATSAPP_PUBLIC_NUMBER.replace(/\D/g, "") : null,
        alerts: {
          store: subscribers ? subscribers.kind : "sin almacenamiento",
          subscribers: subscribers ? await subscribers.list().then((l) => l.length, () => null) : 0,
          template: Boolean(env.WHATSAPP_ALERT_TEMPLATE),
          manual_trigger: Boolean(env.ALERTS_SECRET),
        },
      });
    }
    if (path === "/api/whatsapp") return whatsapp(request);
    if (path === "/api/alerts/run") {
      // manual run for the demo ("simular aviso"); needs the secret in the x-alerts-secret header
      if (request.method !== "POST") throw fail(405, "Usa POST");
      if (!env.ALERTS_SECRET || request.headers.get("x-alerts-secret") !== env.ALERTS_SECRET) throw fail(403, "Clave de avisos incorrecta");
      if (!subscribers) throw fail(503, "Sin almacenamiento de suscriptores");
      const opts = await body(request, url);
      return json(200, await runAlerts({ env, subscribers, outlook, grid, simulate: Boolean(opts.simulate) }));
    }
    if (path.startsWith("/api/n8n/")) {
      // for the n8n workflows that send with the dedicated WhatsApp number (n8n/README.md)
      if (!env.ALERTS_SECRET || request.headers.get("x-alerts-secret") !== env.ALERTS_SECRET) throw fail(403, "Clave de avisos incorrecta");
      if (!subscribers) throw fail(503, "Sin almacenamiento de suscriptores");
      if (path === "/api/n8n/alerts" || path === "/api/n8n/digest") {
        const kind = path.endsWith("digest") ? "digest" : "urgent";
        return json(200, await pendingMessages({ env, subscribers, outlook, grid, kind, test: url.searchParams.get("test") === "1" }));
      }
      if (path === "/api/n8n/sent") {
        if (request.method !== "POST") throw fail(405, "Usa POST");
        return json(200, await markSent({ subscribers, sent: (await body(request, url)).sent }));
      }
      if (path === "/api/n8n/status") {
        return json(200, { ok: true, subscribers: (await subscribers.list()).length, sender: env.ALERTS_SENDER || "netlify", template: env.WHATSAPP_ALERT_TEMPLATE || null });
      }
      throw fail(404, "Ruta de n8n desconocida");
    }
    if (path === "/api/translate") {
      if (request.method !== "POST") throw fail(405, "Usa POST");
      const input = await body(request, url);
      const texts = Array.isArray(input.texts) ? input.texts : [];
      return json(200, { translations: await translator.translate(texts), engine: translator.available() ? "gemini" : "ninguno" });
    }
    if (path === "/api/tiri" || path === "/api/terra") return json(200, await terra.ask(await body(request, url)));
    const terrainTile = path.match(/^\/api\/terrain\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/);
    if (terrainTile) {
      // Elevation tiles (Terrarium encoding, SRTM-based) from the AWS open data registry. They are proxied because
      // the bucket sends no CORS header and the 3D view needs to read their pixels.
      const [, z, x, y] = terrainTile.map(Number);
      if (z > 15) throw fail(400, "Zoom máximo 15");
      const key = `terrain:${z}/${x}/${y}`;
      let tile = cache.get(key);
      if (!tile) {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw fail(502, `Teselas de elevación: HTTP ${r.status}`);
        tile = new Uint8Array(await r.arrayBuffer());
        remember(key, tile, 400);
      }
      return new Response(tile, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }
    if (path === "/api/outlook") {
      const la = Number(url.searchParams.get("lat"));
      const lo = Number(url.searchParams.get("lon"));
      const altitude = Number.isFinite(la) && Number.isFinite(lo) ? elevationFromGrid(grid, la, lo) : null;
      if (altitude === null) throw fail(400, "Faltan lat y lon dentro del municipio de Cochabamba");
      return json(200, await outlook.outlook(la, lo, altitude));
    }
    if (path === "/api/recommend") {
      const result = recommend(climate, crops, parseInput(await body(request, url)));
      return json(200, { ...result, explanation: explain(result) });
    }
    if (path === "/api/gamc/wms") {
      try {
        const r = await gamcFetch(url.searchParams.get("layer"), url.searchParams);
        if (r.status === 200) return new Response(r.body, { status: 200, headers: { "Content-Type": r.type, "Cache-Control": "public, max-age=3600" } });
      } catch (error) {
        if (error.status === 400) throw error;
      }
      return new Response(EMPTY_TILE, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
    }
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (path === "/api/soil") {
      if (!url.searchParams.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) throw fail(400, "Faltan lat y lon");
      return json(200, { soil: await plotService.soil(lat, lon).catch(() => null) });
    }
    if (path === "/api/gamc/info" || path === "/api/forecast" || path === "/api/plot") {
      if (!url.searchParams.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) throw fail(400, "Faltan lat y lon");
      if (path === "/api/plot") {
        // fast sources only; the slow soil service has its own route so it never blocks the rest
        const plot = await plotService.evaluate(lat, lon, { gamcInfo, forecast, fast: true });
        if (!plot) throw fail(404, "Ese punto está fuera del municipio de Cochabamba");
        return json(200, plot);
      }
      return json(200, path === "/api/forecast" ? await forecast(lat, lon) : await gamcInfo(lat, lon));
    }
    return json(404, { error: "Ruta no encontrada" });
  }

  return async function handle(request) {
    try {
      return await route(request);
    } catch (error) {
      return json(error.status || 500, { error: error.message });
    }
  };
}
