// Yatiri X: landing page, step-by-step plot set-up, analysis and the Tiri assistant. Vanilla JS, no build step.
import { WEEKS, explain, recommend } from "./engine.js";
import { assessPlot, elevationFromGrid } from "./assess.js";
import { applyLanguage, t } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (x, digits = 0) => Number(x).toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const mm = (x) => `${num(Math.round(x / 5) * 5)} mm`;
const pct = (x) => `${Math.round(x * 100)} %`;
const tenths = (p) => `${Math.round(p * 10)} de cada 10`;
const list = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function weekDate(week) {
  let day = week * 7;
  let m = 0;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m += 1; }
  return { day: day + 1, month: m };
}
const weekLabel = (week) => { const d = weekDate(((week % WEEKS) + WEEKS) % WEEKS); return `${d.day} de ${MONTHS[d.month]}`; };
const currentWeek = () => {
  const now = new Date();
  return Math.min(51, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 864e5 / 7));
};
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric" });

const CROP_COLORS = {
  papa: "#8a5a2b", maiz: "#e0a100", haba: "#2f7d4a", arveja: "#7fb069", trigo: "#c98b2b", cebada: "#d9b86c",
  quinua: "#b0457a", alfalfa: "#1f6f78", cebolla: "#8e6bbf", tomate: "#c8452f", descanso: "#a89f91",
};
// Points checked against the GAMC layers on 2026-11-14.
const EXAMPLE = { label: "Distrito 9", lat: -17.4629, lon: -66.1867 };
const SOIL_TYPES = [
  { id: null, label: "No sé" }, { id: "arenoso", label: "Arenoso, suelto" }, { id: "franco", label: "Franco, intermedio" },
  { id: "arcilloso", label: "Arcilloso, pesado" }, { id: "pedregoso", label: "Con muchas piedras" },
];
const WATER_SOURCES = [
  { id: "rain", label: "Solo lluvia" }, { id: "canal", label: "Canal o acequia" }, { id: "well", label: "Pozo" },
  { id: "dam", label: "Represa o atajado" }, { id: "river", label: "Río o vertiente" },
];
const IRRIG_SYSTEMS = [
  { id: "none", label: "No riego" }, { id: "furrow", label: "Por surcos o inundación" }, { id: "sprinkler", label: "Aspersión" }, { id: "drip", label: "Goteo" },
];
const WATER_AVAIL = [
  { id: "year", label: "Todo el año" }, { id: "some", label: "Solo algunos meses" }, { id: "scarce", label: "Muy poca" },
];
const PRIORITIES = [
  { id: "risk", label: "Menos riesgo" }, { id: "water", label: "Ahorrar agua" }, { id: "soil", label: "Cuidar el suelo" },
  { id: "forage", label: "Forraje para el ganado" }, { id: "preferred", label: "Mis cultivos preferidos" },
];
// Line icons (24 x 24, stroke = currentColor)
const ICON_PATHS = {
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2.4-5-6-5 0 3 2.4 5 6 5z"/>',
  cloud: '<circle cx="8" cy="7" r="2.5"/><path d="M8 2.5v1M3.5 7h1M4.8 3.8l.7.7M11.2 3.8l-.7.7"/><path d="M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 19z"/>',
  mountain: '<path d="M3 20l6.5-11 4 6.5 2.5-4L21 20z"/>',
  drop: '<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  chart: '<path d="M4 20V14M9 20v-6M14 20v-9M19 20V8"/><path d="M4 10l5-3 5 2 6-5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
// The six modules of the AgroVision layout, in its order; each opens one section of the results.
const MODULES = [
  { id: "ubicacion", tab: "general", icon: "pin", label: "Ubicación del terreno" },
  { id: "suelo", tab: "suelo", icon: "sprout", label: "Análisis del suelo" },
  { id: "clima", tab: "clima", icon: "cloud", label: "Clima y pronóstico" },
  { id: "relieve", tab: "relieve", icon: "mountain", label: "Relieve y topografía" },
  { id: "agua", tab: "agua", icon: "drop", label: "Humedad y agua" },
  { id: "predicciones", tab: "predicciones", icon: "chart", label: "Predicciones" },
];
const TABS = ["general", "predicciones", "clima", "suelo", "relieve", "agua", "riesgos", "cultivos", "plagas", "legal", "ganancias", "fuentes"];
const LAYERS = [
  { id: "satelite", label: "Vista satélite", on: true, kind: "base", opacity: 1 },
  { id: "periurbanos", label: "Zonas periurbanas (GAMC)", on: true, kind: "gamc", opacity: 0.5 },
  { id: "drenaje", label: "Drenaje (GAMC)", on: false, kind: "gamc", opacity: 0.9 },
  { id: "distritos", label: "Distritos (GAMC)", on: true, kind: "gamc", opacity: 0.9 },
  { id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", label: "Humedad del suelo (NASA SMAP)", on: false, kind: "gibs", zoom: 6, opacity: 0.6 },
  { id: "IMERG_Precipitation_Rate", label: "Lluvia reciente (NASA GPM IMERG)", on: false, kind: "gibs", zoom: 6, opacity: 0.6 },
  { id: "MODIS_Terra_NDVI_8Day", label: "Verdor de la vegetación (NASA MODIS)", on: false, kind: "gibs", zoom: 9, opacity: 0.6 },
];
const TIRI_SUGGESTIONS = ["¿Qué siembro?", "¿Va a llover esta semana?", "¿Qué abono le pongo?", "¿Qué plagas debo vigilar?", "¿Qué riesgos tiene mi tierra?", "¿Tiene dueño mi terreno?"];
const TIRI_HELLO = "🌱 ¡Hola! Soy TIRI, tu asistente agrícola inteligente. Puedo ayudarte con cultivos, suelo, humedad, clima, relieve, riesgos y predicciones de tu parcela. Solo te oriento en temas agrícolas de Yatiri X.";
const STORE = "yatirix.v1";

const state = {
  lang: "es", mode: "medio", step: 1, maxStep: 1, tab: "general",
  site: null, polygon: null, areaHa: null, drawing: false, draft: [],
  name: "", last: null, previous: null, soilType: null, labPh: null, labOm: null,
  waterSource: null, irrigSystem: null, waterAvail: null, moisture: null,
  priorities: new Set(["risk"]), preferred: new Set(),
  scenario: { rainPct: 0, tempC: 0 }, selected: "best", period: "7",
  result: null, plot: null, soil: null, outlook: null, assessment: null,
  chat: [{ role: "assistant", content: TIRI_HELLO }], asking: false,
};
let climate;
let crops;
let grid;
let knowledge;
let images = { crops: {}, pests: {}, invasive: {}, places: {} };
let map;
let miniMap;
let terrainView;
let marker;
let shape;

// ---------- Storage (this device only) ----------
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { parcels: [], prefs: {} }; } catch { return { parcels: [], prefs: {} }; }
}
function writeStore(data) { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage off: the app still works */ } }
function savePrefs() { const s = readStore(); s.prefs = { lang: state.lang, mode: state.mode }; writeStore(s); }
function inputsSnapshot() {
  return {
    name: state.name, site: state.site && { lat: state.site.lat, lon: state.site.lon, label: state.site.label },
    polygon: state.polygon, areaHa: state.areaHa, last: state.last, previous: state.previous, soilType: state.soilType,
    labPh: state.labPh, labOm: state.labOm, waterSource: state.waterSource, irrigSystem: state.irrigSystem,
    waterAvail: state.waterAvail, moisture: state.moisture, priorities: [...state.priorities], preferred: [...state.preferred],
  };
}
function saveParcel() {
  if (!state.site) return;
  const s = readStore();
  const id = state.parcelId || `p${Date.now()}`;
  state.parcelId = id;
  const entry = { id, savedAt: new Date().toISOString(), ...inputsSnapshot() };
  s.parcels = [entry, ...s.parcels.filter((p) => p.id !== id)].slice(0, 12);
  writeStore(s);
  renderSaved();
}
function loadParcel(p) {
  Object.assign(state, {
    parcelId: p.id, name: p.name || "", polygon: p.polygon, areaHa: p.areaHa, last: p.last, previous: p.previous,
    soilType: p.soilType, labPh: p.labPh, labOm: p.labOm, waterSource: p.waterSource, irrigSystem: p.irrigSystem,
    waterAvail: p.waterAvail, moisture: p.moisture, priorities: new Set(p.priorities || ["risk"]), preferred: new Set(p.preferred || []),
  });
  $("plot-name").value = state.name;
  $("lab-ph").value = state.labPh ?? "";
  $("lab-om").value = state.labOm ?? "";
  $("moisture").value = state.moisture ?? "";
  drawShape();
  if (p.site) { if (map) map.setView([p.site.lat, p.site.lon], 15); selectSite(p.site.lat, p.site.lon, p.site.label); }
  renderForm();
}

// ---------- Data ----------
async function loadJson(path, ms = 15000) {
  const r = await fetch(path, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`No se pudo leer ${path}`);
  return r.json();
}
const elevationAt = (lat, lon) => elevationFromGrid(grid, lat, lon);
const irrigation = () => Boolean(state.waterSource && state.waterSource !== "rain" && state.irrigSystem && state.irrigSystem !== "none");

// ---------- Views ----------
function show(view) {
  for (const v of ["home", "wizard", "results"]) $(`view-${v}`).hidden = v !== view;
  if (view === "wizard") { initMap(); setTimeout(() => map && map.invalidateSize(), 50); }
  window.scrollTo({ top: 0 });
}

// ---------- Chips ----------
function chips(container, items, { pressed, onClick, dot }) {
  container.replaceChildren(...items.map((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(Boolean(pressed(item))));
    if (dot) {
      const i = document.createElement("span");
      i.className = "chip__dot";
      i.style.background = dot(item);
      b.append(i);
    }
    b.append(item.label);
    b.addEventListener("click", () => onClick(item));
    return b;
  }));
}

function renderForm() {
  const cropItems = crops.crops.filter((c) => c.group !== "fallow").map((c) => ({ id: c.id, label: c.name }));
  const dot = (item) => CROP_COLORS[item.id] || "transparent";
  chips($("last-crop"), cropItems, { dot, pressed: (c) => state.last === c.id, onClick: (c) => { state.last = c.id; renderForm(); } });
  chips($("previous-crop"), [{ id: null, label: "No recuerdo" }, ...cropItems], { dot, pressed: (c) => state.previous === c.id, onClick: (c) => { state.previous = c.id; renderForm(); } });
  chips($("soil-type"), SOIL_TYPES, { pressed: (o) => state.soilType === o.id, onClick: (o) => { state.soilType = o.id; renderForm(); } });
  chips($("water-source"), WATER_SOURCES, { pressed: (o) => state.waterSource === o.id, onClick: (o) => { state.waterSource = o.id; if (o.id === "rain") state.irrigSystem = "none"; renderForm(); } });
  chips($("irrig-system"), IRRIG_SYSTEMS, { pressed: (o) => state.irrigSystem === o.id, onClick: (o) => { state.irrigSystem = o.id; renderForm(); } });
  chips($("water-avail"), WATER_AVAIL, { pressed: (o) => state.waterAvail === o.id, onClick: (o) => { state.waterAvail = o.id; renderForm(); } });
  chips($("priorities"), PRIORITIES, {
    pressed: (p) => state.priorities.has(p.id),
    onClick: (p) => { state.priorities.has(p.id) ? state.priorities.delete(p.id) : state.priorities.add(p.id); renderForm(); },
  });
  $("preferred-field").hidden = !state.priorities.has("preferred");
  chips($("preferred"), cropItems, { dot, pressed: (c) => state.preferred.has(c.id), onClick: (c) => { state.preferred.has(c.id) ? state.preferred.delete(c.id) : state.preferred.add(c.id); renderForm(); } });
  renderStepper();
}

// ---------- Wizard ----------
function stepValid(step) {
  if (step === 1) return state.site ? "" : "Marca tu terreno en el mapa, usa el GPS o busca tu comunidad.";
  if (step === 2) return state.last ? "" : "Marca qué sembraste la última campaña.";
  return "";
}
function renderStepper() {
  const ol = $("stepper");
  ol.replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${n}. ${t(`st${n}`, state.lang)}`;
    b.disabled = n > state.maxStep;
    if (n === state.step) b.setAttribute("aria-current", "step");
    b.addEventListener("click", () => goStep(n));
    li.append(b);
    return li;
  }));
}
function goStep(n) {
  state.step = Math.max(1, Math.min(5, n));
  state.maxStep = Math.max(state.maxStep, state.step);
  document.querySelectorAll(".step").forEach((s) => { s.hidden = Number(s.dataset.step) !== state.step; });
  $("prev").disabled = state.step === 1;
  $("next").hidden = state.step === 5;
  $("wizard-msg").textContent = "";
  if (state.step === 1 && map) setTimeout(() => map.invalidateSize(), 50);
  if (state.step === 5) renderReview();
  renderStepper();
}
function nextStep() {
  const problem = stepValid(state.step);
  if (problem) { $("wizard-msg").textContent = problem; return; }
  if (state.step === 1) { state.name = $("plot-name").value.trim(); saveParcel(); }
  goStep(state.step + 1);
}
function renderReview() {
  const label = (arr, id) => (arr.find((o) => o.id === id) || {}).label || "Sin dato";
  const cropName = (id) => (id ? crops.crops.find((c) => c.id === id).name : "Sin dato");
  const rows = [
    ["Terreno", `${esc(state.name || "Sin nombre")}${state.areaHa ? `, ${num(state.areaHa, 2)} ha` : ""}`],
    ["Ubicación", state.site ? `${state.site.lat.toFixed(4)}, ${state.site.lon.toFixed(4)} · ${num(state.site.altitude)} m` : "Sin dato"],
    ["Última campaña", cropName(state.last)], ["Campaña anterior", cropName(state.previous)],
    ["Suelo", label(SOIL_TYPES, state.soilType) + (state.labPh ? ` · pH ${state.labPh}` : "")],
    ["Agua", `${label(WATER_SOURCES, state.waterSource)} · ${label(IRRIG_SYSTEMS, state.irrigSystem)} · ${label(WATER_AVAIL, state.waterAvail)}`],
    ["Prioridades", [...state.priorities].map((p) => label(PRIORITIES, p)).join(", ") || "Sin dato"],
  ];
  $("review").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

// ---------- Map ----------
function initMap() {
  if (map || !grid) return;
  const box = $("map");
  if (!window.L) { box.innerHTML = '<p class="hint" style="padding:1rem">El mapa no cargó. Usa el GPS o el buscador.</p>'; return; }
  const bounds = [[grid.min_lat, grid.min_lon], [grid.max_lat, grid.max_lon]];
  map = L.map(box, { minZoom: 11, maxBounds: [[grid.min_lat - 0.1, grid.min_lon - 0.14], [grid.max_lat + 0.1, grid.max_lon + 0.14]] }).fitBounds(bounds);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  for (const layer of LAYERS) {
    if (layer.kind === "base") {
      layer.leaflet = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, zIndex: 1, attribution: "Esri, Maxar, Earthstar Geographics",
      });
      if (layer.on) layer.leaflet.addTo(map);
      continue;
    }
    layer.leaflet = layer.kind === "gamc"
      ? L.tileLayer.wms(`/api/gamc/wms?layer=${layer.id}`, { layers: "", format: "image/png", transparent: true, version: "1.1.1", opacity: layer.opacity, zIndex: 5, attribution: "GAMC" })
      : L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/default/GoogleMapsCompatible_Level${layer.zoom}/{z}/{y}/{x}.png`, {
        maxNativeZoom: layer.zoom, maxZoom: 19, opacity: layer.opacity, zIndex: 4, attribution: "NASA GIBS",
      });
    if (layer.on) layer.leaflet.addTo(map);
  }
  map.on("click", (e) => {
    if (state.drawing) { state.draft.push([e.latlng.lat, e.latlng.lng]); drawShape(); return; }
    selectSite(e.latlng.lat, e.latlng.lng, null);
  });
  renderLayerToggles();
  drawShape();
  if (state.site) selectSite(state.site.lat, state.site.lon, state.site.label);
}
function renderLayerToggles() {
  chips($("layer-toggles"), LAYERS, {
    pressed: (l) => l.on,
    onClick: (l) => { l.on = !l.on; if (map) (l.on ? l.leaflet.addTo(map) : l.leaflet.remove()); renderLayerToggles(); },
  });
}
function drawShape() {
  if (!map) return;
  if (shape) shape.remove();
  const pts = state.drawing ? state.draft : state.polygon;
  if (pts && pts.length) {
    shape = (state.drawing ? L.polyline(pts, { color: "#6b4423", weight: 3, dashArray: "6 6" }) : L.polygon(pts, { color: "#6b4423", weight: 3, fillColor: "#93c572", fillOpacity: 0.35 })).addTo(map);
  }
  $("draw").hidden = state.drawing;
  $("draw-done").hidden = !state.drawing;
  $("draw-clear").hidden = !(state.drawing || state.polygon);
  $("map-hint").textContent = state.drawing ? "Toca cada esquina de tu terreno y luego «Terminar el dibujo»." : "Toca el mapa para marcar tu terreno.";
}
function polygonArea(pts) {
  const lat0 = (pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180);
  const xy = pts.map(([la, lo]) => [6371000 * (lo * Math.PI / 180) * Math.cos(lat0), 6371000 * (la * Math.PI / 180)]);
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i]; const [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2 / 10000;
}
function finishDrawing() {
  if (state.draft.length < 3) { $("wizard-msg").textContent = "Marca al menos tres esquinas."; return; }
  state.polygon = state.draft;
  state.draft = [];
  state.drawing = false;
  state.areaHa = polygonArea(state.polygon);
  const lat = state.polygon.reduce((a, p) => a + p[0], 0) / state.polygon.length;
  const lon = state.polygon.reduce((a, p) => a + p[1], 0) / state.polygon.length;
  drawShape();
  selectSite(lat, lon, state.site && state.site.label);
}

async function selectSite(lat, lon, label) {
  const altitude = elevationAt(lat, lon);
  if (altitude === null) { $("site").innerHTML = '<p class="hint">Ese punto está fuera del municipio de Cochabamba. Por ahora Yatiri X cubre solo el municipio.</p>'; return; }
  state.site = { lat, lon, altitude, label, gamc: null };
  if (map) {
    if (marker) marker.remove();
    marker = L.circleMarker([lat, lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#6b4423", fillOpacity: 1 }).addTo(map);
  }
  renderSite();
  renderStepper();
  const site = state.site;
  try { site.gamc = await loadJson(`/api/gamc/info?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, 20000); } catch { site.gamc = null; }
  if (state.site === site) renderSite();
}
function gamcDistrict(g) { return g && g.distritos && !g.distritos.error ? g.distritos : null; }
function gamcZone(g) { return g && g.periurbanos && !g.periurbanos.error ? g.periurbanos : null; }
function renderSite() {
  const s = state.site;
  if (!s) { $("site").innerHTML = ""; return; }
  const d = gamcDistrict(s.gamc);
  const z = gamcZone(s.gamc);
  $("site").innerHTML = `<dl class="site__grid">
      <div><dt>Distrito (GAMC)</dt><dd>${d ? `${esc(d.Distrito)}, ${esc(String(d.Comuna).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}` : s.gamc ? "Sin dato" : "Consultando…"}</dd></div>
      <div><dt>Zona (GAMC)</dt><dd>${z ? esc(z.Periurbano) : s.gamc ? "Fuera de zonas periurbanas" : "Consultando…"}</dd></div>
      <div><dt>Altitud (NASA SRTM)</dt><dd>${num(s.altitude)} m</dd></div>
      <div><dt>Superficie</dt><dd>${state.areaHa ? `${num(state.areaHa, 2)} ha` : "Dibuja los límites para calcularla"}</dd></div>
    </dl>`;
}

async function searchPlaces(q) {
  const box = $("search-results");
  box.innerHTML = '<li class="hint">Buscando…</li>';
  const params = new URLSearchParams({
    format: "jsonv2", q, countrycodes: "bo", limit: "6", bounded: "1",
    viewbox: `${grid.min_lon - 0.05},${grid.max_lat + 0.05},${grid.max_lon + 0.05},${grid.min_lat - 0.05}`,
  });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: AbortSignal.timeout(12000) });
    const items = await r.json();
    if (!items.length) { box.innerHTML = '<li class="hint">No encontré ese lugar dentro del municipio. Prueba con otro nombre o toca el mapa.</li>'; return; }
    box.replaceChildren(...items.map((it) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = it.display_name.split(",").slice(0, 3).join(",");
      b.addEventListener("click", () => {
        const lat = Number(it.lat); const lon = Number(it.lon);
        if (map) map.setView([lat, lon], 15);
        selectSite(lat, lon, it.display_name.split(",")[0]);
        box.innerHTML = "";
      });
      li.append(b);
      return li;
    }));
  } catch { box.innerHTML = '<li class="hint">El buscador no respondió. Toca el mapa o usa el GPS.</li>'; }
}

function useGps() {
  if (!navigator.geolocation) { $("wizard-msg").textContent = "Este dispositivo no tiene GPS disponible."; return; }
  $("wizard-msg").textContent = "Buscando tu ubicación…";
  navigator.geolocation.getCurrentPosition((p) => {
    $("wizard-msg").textContent = "";
    if (map) map.setView([p.coords.latitude, p.coords.longitude], 16);
    selectSite(p.coords.latitude, p.coords.longitude, "Mi ubicación");
  }, () => { $("wizard-msg").textContent = "No pude leer tu ubicación. Revisa el permiso de ubicación o marca el terreno en el mapa."; }, { enableHighAccuracy: true, timeout: 15000 });
}

function renderSaved() {
  const parcels = readStore().parcels;
  const box = $("saved");
  if (!parcels.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<h3>Mis terrenos guardados</h3><ul class="saved__list">${parcels.map((p) => `<li><button type="button" class="link" data-load="${p.id}">${esc(p.name || "Sin nombre")}</button> <span class="hint">${new Date(p.savedAt).toLocaleDateString("es")}</span> <button type="button" class="link link--danger" data-del="${p.id}">Quitar</button></li>`).join("")}</ul>`;
  box.querySelectorAll("[data-load]").forEach((b) => b.addEventListener("click", () => loadParcel(parcels.find((p) => p.id === b.dataset.load))));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const s = readStore(); s.parcels = s.parcels.filter((p) => p.id !== b.dataset.del); writeStore(s); renderSaved(); }));
}

// ---------- Analysis ----------
async function analyze() {
  const btn = $("analyze");
  btn.disabled = true;
  btn.textContent = "Analizando tu terreno…";
  state.name = $("plot-name").value.trim();
  state.labPh = Number($("lab-ph").value) || null;
  state.labOm = Number($("lab-om").value) || null;
  state.moisture = Number($("moisture").value) || null;
  saveParcel();
  const at = `lat=${state.site.lat.toFixed(5)}&lon=${state.site.lon.toFixed(5)}`;
  const settle = (p) => p.then((v) => v, () => null);
  const [plot, soil, outlook] = await Promise.all([
    settle(loadJson(`/api/plot?${at}`, 20000)), settle(loadJson(`/api/soil?${at}`, 12000)), settle(loadJson(`/api/outlook?${at}`, 20000)),
  ]);
  state.plot = plot || {};
  state.soil = soil && soil.soil ? soil.soil : null;
  state.outlook = outlook;
  compute();
  btn.disabled = false;
  btn.textContent = t("analyze", state.lang);
  show("results");
  setTab("general");
}

function userSoil() {
  const s = state.soil ? { ...state.soil } : null;
  if (!s && !state.labPh && !state.soilType && !state.labOm) return null;
  const out = s || { ph: null, clay: null, sand: null, silt: null, soc_gkg: null, texture: null, source: "Datos que ingresaste" };
  if (state.labPh) { out.ph = state.labPh; out.source = `pH de tu laboratorio; ${out.source}`; }
  if (state.labOm) out.soc_gkg = state.labOm * 10 / 1.724; // organic matter % to organic carbon g/kg (van Bemmelen factor)
  if (state.soilType && state.soilType !== "pedregoso") {
    out.texture = state.soilType;
    if (state.soilType === "arcilloso") out.clay = Math.max(out.clay || 0, 40);
  }
  return out;
}

function compute() {
  if (!state.site || !state.last) return;
  state.result = recommend(climate, crops, {
    altitude: state.site.altitude, history: [state.previous, state.last].filter(Boolean), irrigation: irrigation(),
    priorities: [...state.priorities], preferred: [...state.preferred], scenario: state.scenario,
  });
  const p = state.plot || {};
  state.assessment = assessPlot({
    altitude: state.site.altitude, slope: p.slope || null, soil: userSoil(), gamc: p.gamc || state.site.gamc,
    forecast: p.forecast || null, conditions: p.conditions || null,
  }, state.result, crops);
  renderResults();
}

// ---------- Results ----------
const LEVEL = { 3: ["alert", "!", "Alto"], 2: ["warn", "!", "Medio"], 1: ["ok", "✓", "Bajo"] };
const notice = (level, html) => `<div class="notice notice--${LEVEL[level][0]}"><span class="notice__icon" aria-hidden="true">${LEVEL[level][1]}</span><div>${html}</div></div>`;
const source = (text) => `<p class="source">${esc(text)}</p>`;

function domainLevels() {
  const h = Object.fromEntries(state.assessment.hazards.map((x) => [x.id, x.level]));
  const soil = userSoil();
  const slope = state.plot && state.plot.slope ? state.plot.slope.percent : null;
  const w = state.outlook && state.outlook.weekly ? state.outlook.weekly.weeks[0] : null;
  const soilLevel = soil ? ((soil.ph !== null && (soil.ph < 5.5 || soil.ph > 7.8)) || (soil.soc_gkg !== null && soil.soc_gkg < 10) ? 2 : 1) : null;
  return {
    clima: Math.max(h.frost || 1, h.frost_now || 1, h.rain_now || 1, w && (w.pFrost >= 0.3 || w.pWetterThanUsual >= 0.6) ? 2 : 1),
    suelo: soilLevel,
    relieve: slope === null ? null : slope < 5 ? 1 : slope < 15 ? 2 : 3,
    agua: Math.max(h.drought || 1, h.waterlogging || 1),
    riesgos: Math.max(...state.assessment.hazards.map((x) => x.level)),
  };
}

function renderResults() {
  const levels = domainLevels();
  const overall = Math.max(...Object.values(levels).filter((x) => x !== null));
  const word = { 1: "Buen estado", 2: "Necesita cuidados", 3: "En riesgo" }[overall];
  const d = gamcDistrict((state.plot && state.plot.gamc) || state.site.gamc);
  const icons = { clima: "☁", suelo: "▤", relieve: "⛰", agua: "💧", riesgos: "⚠" };
  const names = { clima: "Clima", suelo: "Suelo", relieve: "Relieve", agua: "Agua", riesgos: "Riesgos" };
  $("summary-card").innerHTML = `
    <div class="summary-card__head">
      <div><p class="summary-card__kicker">${esc(state.name || "Tu terreno")}${d ? ` · ${esc(d.Distrito)}` : ""} · ${num(state.site.altitude)} m${state.areaHa ? ` · ${num(state.areaHa, 2)} ha` : ""}</p>
      <h1 class="summary-card__title summary-card__title--${LEVEL[overall][0]}">${word}</h1></div>
    </div>
    <ul class="domains">${Object.entries(levels).map(([k, lv]) => `<li class="domain domain--${lv ? LEVEL[lv][0] : "none"}"><button type="button" data-tab-go="${k === "riesgos" ? "riesgos" : k}"><span aria-hidden="true">${icons[k]}</span><b>${names[k]}</b><span>${lv ? LEVEL[lv][2] : "Sin dato"}</span></button></li>`).join("")}</ul>`;
  $("summary-card").querySelectorAll("[data-tab-go]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tabGo)));
  renderTabs();
  renderGeneral(); renderPredicciones(); renderClima(); renderSuelo(); renderRelieve(); renderAgua(); renderRiesgos(); renderCultivos(); renderPlagas(); renderLegal(); renderGanancias(); renderFuentes();
}

/** A real photo with its credit line, or nothing if there is none. */
function photo(entry, alt, cls = "photo") {
  if (!entry) return "";
  return `<figure class="${cls}"><img src="${esc(entry.thumb)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>Foto: ${esc(entry.author)}, ${esc(entry.licence)}, <a href="${esc(entry.file_page)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption></figure>`;
}

function initMiniMap() {
  const box = $("mini-map");
  if (!box || !window.L) return;
  if (miniMap) { miniMap.remove(); miniMap = null; }
  miniMap = L.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([state.site.lat, state.site.lon], 16);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" }).addTo(miniMap);
  if (state.polygon) {
    const poly = L.polygon(state.polygon, { color: "#ff8a3d", weight: 3, fillOpacity: 0.12 }).addTo(miniMap);
    miniMap.fitBounds(poly.getBounds(), { padding: [20, 20], maxZoom: 17 });
  } else {
    L.circleMarker([state.site.lat, state.site.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#ff8a3d", fillOpacity: 1 }).addTo(miniMap);
  }
}

// --- Predicciones ---
function renderPredicciones() {
  const o = state.outlook;
  const r = state.result;
  const a = state.assessment;
  const w = o && o.weekly ? o.weekly.weeks : null;
  const next7 = o && o.daily ? o.daily.days.slice(0, 7) : null;
  const rainyDays = next7 ? next7.filter((d) => d.pRain >= 0.5).length : null;
  const frostDays = next7 ? next7.filter((d) => d.pFrost >= 0.3).length : null;
  const heavy = next7 ? Math.max(...next7.map((d) => d.pHeavyRain)) : null;
  const best = r.strategies[1];
  panel("predicciones").innerHTML = `
    <h2>Predicciones</h2>
    <p class="hint">Probabilidades a partir de los escenarios del pronóstico y de 45 años de datos de la NASA. Se actualizan cada vez que abres el análisis.</p>
    ${next7 ? `<div class="facts">
      <div class="fact"><b>${rainyDays} de 7</b><span>días con lluvia probable esta semana</span></div>
      <div class="fact"><b>${frostDays} de 7</b><span>días con riesgo de helada</span></div>
      <div class="fact"><b>${pct(heavy)}</b><span>probabilidad máxima de un día con 10 mm o más</span></div>
      ${w ? `<div class="fact"><b>${tenths(w[0].pAboveNormal)}</b><span>escenarios con más lluvia que lo normal esta semana</span></div>` : ""}
    </div>` : '<p class="hint">El pronóstico no respondió ahora; abajo siguen las probabilidades históricas.</p>'}
    <h3>Próximas semanas</h3>
    ${w ? w.map((x, i) => notice(x.pWetterThanUsual >= 0.6 || x.pFrost >= 0.3 ? 2 : 1, `<p><b>${i === 0 ? "Esta semana" : "La próxima semana"}:</b> unos ${num(x.rainMedian)} mm (entre ${num(x.rainP10)} y ${num(x.rainP90)} mm), cuando lo normal son ${num(x.normal)} mm.${x.pWetterThanUsual >= 0.6 ? " Mucho más lluvia que de costumbre: revisar canales y drenes." : ""}${x.pDrierThanUsual >= 0.6 ? " Más seco que de costumbre: planificar el riego." : ""}${x.pFrost > 0 ? ` Helada en ${tenths(x.pFrost)} escenarios.` : ""}</p>`)).join("") : '<p class="hint">Sin dato.</p>'}
    <h3>Próximos meses</h3>
    ${o && o.monthly ? `<div class="weeks">${o.monthly.months.map((m) => `<div class="fact"><b>${esc(m.name[0].toUpperCase() + m.name.slice(1))}</b><span>Unos ${num(m.rainMedian)} mm. Mes muy seco ${tenths(m.pDryMonth)} años; muy lluvioso ${tenths(m.pWetMonth)} años.${m.pFrost > 0 ? ` Heló ${tenths(m.pFrost)} años.` : ""}</span></div>`).join("")}</div>` : ""}
    <h3>Qué puede pasar con tu terreno</h3>
    ${a.hazards.filter((h) => h.level >= 2).map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.text)}</p>`)).join("") || notice(1, "<p>Sin riesgos altos previstos con los datos disponibles.</p>")}
    <h3>Si siembras la rotación recomendada</h3>
    <p>${best.years.filter((y) => y.group !== "fallow").map((y) => `${esc(y.name)}: helada dañina ${pct(y.frostProb)} de las campañas, la lluvia cubre ${pct(y.coverage)} del agua`).join("; ")}. Riego total en 3 años: ${mm(best.irrigationTotalMm)} frente a ${mm(r.strategies[0].irrigationTotalMm)} de tu rotación actual.</p>
    <div class="whatif">
      <h3>Simula otro clima</h3>
      <label class="slider"><span>Lluvia: <output>${state.scenario.rainPct ? `${Math.abs(state.scenario.rainPct)} % ${state.scenario.rainPct < 0 ? "menos" : "más"}` : "igual que siempre"}</output></span><input type="range" id="rain" min="-30" max="30" step="10" value="${state.scenario.rainPct}"></label>
      <label class="slider"><span>Temperatura: <output>${state.scenario.tempC ? `${num(Math.abs(state.scenario.tempC), 1)} °C ${state.scenario.tempC < 0 ? "menos" : "más"}` : "igual que siempre"}</output></span><input type="range" id="temp" min="-1" max="3" step="0.5" value="${state.scenario.tempC}"></label>
      <p class="hint">Recalcula rotaciones, agua y riesgos en todas las secciones.</p>
    </div>
    ${source(`${o && o.daily ? `${o.daily.model}, ${o.daily.members} escenarios; ` : ""}NASA POWER ${climate.meta.period.replace(" to ", " a ")}.`)}`;
  $("rain").addEventListener("change", (e) => { state.scenario.rainPct = Number(e.target.value); compute(); });
  $("temp").addEventListener("change", (e) => { state.scenario.tempC = Number(e.target.value); compute(); });
}

function moduleCards(active) {
  return MODULES.map((m) => `<button type="button" class="module" data-module="${m.tab}" aria-pressed="${active === m.tab}">
      <span class="module__icon">${icon(m.icon)}</span><b>${esc(t(`mod_${m.id}`, state.lang) === `mod_${m.id}` ? m.label : t(`mod_${m.id}`, state.lang))}</b></button>`).join("");
}
function renderTabs() {
  const secondary = TABS.filter((k) => !MODULES.some((m) => m.tab === k));
  $("tabs").innerHTML = `<div class="modules modules--nav">${moduleCards(state.tab)}</div>
    <div class="subtabs">${secondary.map((k) => `<button type="button" class="tab-btn${k === "fuentes" ? " mid-up" : ""}" data-tab-btn="${k}" aria-pressed="${state.tab === k}">${t(`tab_${k}`, state.lang)}</button>`).join("")}</div>`;
  $("tabs").querySelectorAll("[data-module]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.module)));
  $("tabs").querySelectorAll("[data-tab-btn]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tabBtn)));
}
function renderHomeModules() {
  $("home-modules").innerHTML = moduleCards(null);
  $("home-modules").querySelectorAll("[data-module]").forEach((b) => b.addEventListener("click", () => {
    if (state.result) { show("results"); setTab(b.dataset.module); } else show("wizard");
  }));
  document.querySelectorAll('[data-icon="map"]').forEach((el) => { el.innerHTML = icon("map"); });
}
function setTab(k) {
  state.tab = k;
  document.querySelectorAll(".tab").forEach((s) => { s.hidden = s.dataset.tab !== k; });
  renderTabs();
  if (k === "general" && miniMap) setTimeout(() => miniMap.invalidateSize(), 50);
}
const panel = (k) => document.querySelector(`.tab[data-tab="${k}"]`);

function renderGeneral() {
  const r = state.result;
  const a = state.assessment;
  const best = r.strategies[1];
  const actions = a.hazards.filter((h) => h.level >= 2).slice(0, 3);
  panel("general").innerHTML = `
    <h2>Lo más importante</h2>
    <p class="lead">${esc(explain(r).join(" "))}</p>
    ${actions.length ? `<h3>Qué hacer primero</h3>${actions.map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.action)}</p>`)).join("")}` : notice(1, "<p>No hay riesgos altos con los datos disponibles.</p>")}
    <div class="general-grid">
      <div>${wheel(best)}<p class="center"><b>${esc(best.label)}</b><br>${best.years.map((y) => esc(y.name)).join(" → ")}</p></div>
      <div class="mid-up">
        <h3>En números</h3>
        <dl class="kv">
          <div><dt>Puntaje de la rotación recomendada</dt><dd>${best.score} de 100 (la actual: ${r.strategies[0].score})</dd></div>
          <div><dt>Riego en 3 años, rotación recomendada</dt><dd>${mm(best.irrigationTotalMm)}</dd></div>
          <div><dt>Riego en 3 años, rotación actual</dt><dd>${mm(r.strategies[0].irrigationTotalMm)}</dd></div>
          ${state.areaHa ? `<div><dt>Agua que ahorra en tu terreno</dt><dd>${num(Math.max(0, r.strategies[0].irrigationTotalMm - best.irrigationTotalMm) * 10 * state.areaHa)} m³ en 3 años</dd></div>` : ""}
        </dl>
      </div>
    </div>
    <h3>Ubicación del terreno, vista satelital</h3>
    <div id="mini-map" class="mini-map" role="img" aria-label="Imagen satelital del terreno"></div>
    ${source("Imagen satelital: Esri World Imagery (Esri, Maxar, Earthstar Geographics). La fecha de la imagen puede tener uno o más años.")}`;
  initMiniMap();
}

// --- Clima ---
function renderClima() {
  const o = state.outlook;
  const periods = [["7", "7 días"], ["14", "14 días"], ["meses", "3 meses"], ["historico", "45 años"]];
  let body = "";
  if (state.period === "7" || state.period === "14") {
    if (!o || !o.daily) body = '<p class="hint">El pronóstico no respondió ahora. Vuelve a intentar en unos minutos.</p>';
    else {
      const days = o.daily.days.slice(0, Number(state.period));
      body = `<div class="scroll"><div class="days">${days.map((d) => `
        <div class="day">
          <p class="day__date">${esc(dayLabel(d.date))}</p>
          <p class="day__icon" aria-hidden="true">${d.pRain >= 0.6 ? "🌧" : d.pRain >= 0.3 ? "🌦" : "☀"}</p>
          <p class="day__prob" title="Probabilidad de lluvia de 1 mm o más"><b>${pct(d.pRain)}</b><span>lluvia</span></p>
          <p class="mid-up">${num(d.rainMedian, 1)} mm</p>
          <p class="adv-only small">${num(d.rainP10, 1)} a ${num(d.rainP90, 1)} mm</p>
          <p class="${d.pFrost > 0 ? "day__frost" : ""}">${num(d.tminMedian, 0)}° / ${num(d.tmaxMedian, 0)}°</p>
          ${d.pFrost > 0 ? `<p class="day__frost small">helada ${pct(d.pFrost)}</p>` : ""}
        </div>`).join("")}</div></div>
        <div class="weeks mid-up">${o.weekly.weeks.map((w, i) => `
          <div class="fact"><b>${i === 0 ? "Esta semana" : "La próxima"}</b>
          <span>Unos ${num(w.rainMedian)} mm de lluvia (lo normal: ${num(w.normal)} mm). Más lluvia que lo normal en ${tenths(w.pAboveNormal)} escenarios.${w.pFrost > 0 ? ` Helada en ${tenths(w.pFrost)} escenarios.` : ""}</span></div>`).join("")}</div>
        ${source(`${o.daily.model}, ${o.daily.members} escenarios. Normal: ${o.normal_source}. Actualizado: ${new Date(o.generated).toLocaleString("es")}.`)}`;
    }
  } else if (state.period === "meses") {
    if (!o || !o.monthly) body = '<p class="hint">Sin dato.</p>';
    else body = `<div class="weeks">${o.monthly.months.map((m) => `
        <div class="fact"><b>${esc(m.name[0].toUpperCase() + m.name.slice(1))}</b>
        <span>Suelen caer unos ${num(m.rainMedian)} mm. Mes muy seco ${tenths(m.pDryMonth)} años; muy lluvioso ${tenths(m.pWetMonth)} años.${m.pFrost > 0 ? ` Heló ${tenths(m.pFrost)} años.` : " No suele helar."}</span>
        <span class="adv-only small">8 de cada 10 años entre ${num(m.rainP20)} y ${num(m.rainP80)} mm</span></div>`).join("")}</div>
        ${source(`${o.monthly.model}. Es lo que suele pasar en ese mes, no un pronóstico de días concretos.`)}`;
  } else body = calendarHtml();
  const c = state.plot && state.plot.conditions;
  panel("clima").innerHTML = `
    <h2>Clima y pronóstico</h2>
    <div class="chips" role="group" aria-label="Periodo">${periods.map(([k, l]) => `<button type="button" class="chip" data-period="${k}" aria-pressed="${state.period === k}">${l}</button>`).join("")}</div>
    <div class="period">${body}</div>
    ${c ? `<h3>Cómo vino el último mes</h3><p>En los últimos 30 días llovieron <b>${num(c.rain30)} mm</b>; lo normal para estas fechas son ${num(c.rain30Normal)} mm.${c.soilWetness === null ? "" : ` La humedad del suelo en la zona de raíces está en ${num(c.soilWetness * 100)} % (lo normal: ${num(c.soilWetnessNormal * 100)} %).`}</p>${source(`${c.source}, hasta el ${c.asOf}. Dato preliminar.`)}` : ""}`;
  panel("clima").querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => { state.period = b.dataset.period; renderClima(); }));
}

function calendarHtml() {
  const cal = state.result.calendar.weeks;
  const col = 13;
  const width = 4 + WEEKS * col + 4;
  const maxRain = Math.max(...cal.map((w) => w.rainMean), 1);
  let s = "";
  let lastMonth = -1;
  cal.forEach((w, i) => {
    const x = 4 + i * col;
    const m = weekDate(i).month;
    if (m !== lastMonth) { s += `<text x="${x}" y="11" font-size="11" fill="#6b5a48">${MONTHS[m]}</text>`; lastMonth = m; }
    const h = (w.rainMean / maxRain) * 46;
    s += `<rect x="${x}" y="${(64 - h).toFixed(1)}" width="${col - 2}" height="${h.toFixed(1)}" fill="#8cc4d6"><title>${weekLabel(i)}: lluvia media ${num(w.rainMean)} mm</title></rect>`;
    s += `<rect x="${x}" y="70" width="${col - 2}" height="16" fill="#3d6fb6" fill-opacity="${w.pFrost ? (0.15 + 0.85 * w.pFrost).toFixed(2) : 0.05}"><title>${weekLabel(i)}: helada en ${pct(w.pFrost)} de los años</title></rect>`;
    s += `<rect x="${x}" y="90" width="${col - 2}" height="16" fill="#c98b00" fill-opacity="${(0.08 + 0.92 * w.pDry).toFixed(2)}"><title>${weekLabel(i)}: semana seca en ${pct(w.pDry)} de los años</title></rect>`;
  });
  const now = 4 + currentWeek() * col + (col - 2) / 2;
  s += `<line x1="${now}" y1="14" x2="${now}" y2="110" stroke="#b8392f" stroke-width="2"/><text x="${now + 4}" y="24" font-size="11" font-weight="700" fill="#b8392f">hoy</text>`;
  const valid = state.result.onset.days_after_1_october.filter((x) => x !== null).sort((a, b) => a - b);
  const onsetWeek = Math.floor((273 + valid[Math.floor(valid.length / 2)]) / 7) % WEEKS;
  const mk = climate.onset.mann_kendall;
  return `<p class="hint">Cada columna es una semana. Cuanto más oscuro, más veces pasó en 45 años.</p>
    <div class="scroll"><svg class="chart" width="${width}" height="114" viewBox="0 0 ${width} 114" role="img" aria-label="Lluvia, heladas y semanas secas por semana del año">${s}</svg></div>
    <ul class="legend"><li><i style="background:#8cc4d6"></i>Lluvia media</li><li><i style="background:#3d6fb6"></i>Helada (0 °C o menos)</li><li><i style="background:#c98b00"></i>Semana seca (menos de 5 mm)</li></ul>
    <p>Las lluvias firmes suelen empezar hacia el ${weekLabel(onsetWeek)}. ${mk.trend === "no trend" ? `Esa fecha no muestra una tendencia clara en 45 años (Mann-Kendall, p = ${num(mk.p, 2)}).` : `Esa fecha se mueve ${num(Math.abs(mk.slope_days_per_year) * 10, 1)} días por década (Mann-Kendall, p = ${num(mk.p, 2)}).`}</p>
    ${source(`NASA POWER ${climate.meta.period.replace(" to ", " a ")}, ajustado a ${num(state.site.altitude)} m`)}`;
}

// --- Suelo ---
function renderSuelo() {
  const s = userSoil();
  const a = state.assessment;
  const r = state.result;
  const deficiencies = [];
  if (s) {
    if (s.ph !== null && s.ph < 5.5) deficiencies.push("Con suelo ácido, el fósforo, el calcio y el magnesio quedan menos disponibles.");
    if (s.ph !== null && s.ph > 7.5) deficiencies.push("Con suelo alcalino, el hierro, el zinc y el fósforo quedan menos disponibles.");
    if (s.soc_gkg !== null && s.soc_gkg < 10) deficiencies.push("Con poca materia orgánica, suele faltar nitrógeno y el suelo guarda menos agua.");
  }
  const aptitude = crops.crops.filter((c) => c.group !== "fallow").map((c) => {
    const e = r.crops[c.id];
    const avoid = a.avoid.find((x) => x.crop === c.id);
    const phOk = !s || s.ph === null || !c.ph ? null : s.ph >= c.ph[0] - 0.3 && s.ph <= c.ph[1] + 0.3;
    const status = avoid ? 3 : (phOk === false || e.frostProb >= 0.2 || (!irrigation() && e.coverage < 0.5)) ? 2 : 1;
    return { c, e, phOk, status, reason: avoid ? avoid.reasons[0] : "" };
  });
  const label = { 1: "Apto", 2: "Con cuidados", 3: "No conviene" };
  const bestCrops = [...new Set(r.strategies[1].years.filter((y) => y.group !== "fallow").map((y) => y.crop))];
  panel("suelo").innerHTML = `
    <h2>Suelo</h2>
    ${s ? `<div class="facts">
        <div class="fact"><b>${s.ph === null ? "Sin dato" : num(s.ph, 1)}</b><span>pH</span></div>
        <div class="fact"><b>${esc(s.texture || "Sin dato")}</b><span>textura</span></div>
        <div class="fact"><b>${s.soc_gkg === null ? "Sin dato" : num(s.soc_gkg)}</b><span>g de carbono orgánico por kg</span></div>
      </div>
      ${source(`${s.source}${s.depth ? `, ${s.depth}` : ""}. Un análisis de laboratorio es lo más seguro para decidir el abono.`)}
      <h3>Fertilidad y posibles deficiencias</h3>${list([...a.soilAdvice, ...deficiencies].map(esc))}`
    : '<p class="hint">No hay dato de suelo para este punto: el servicio mundial de suelos no respondió o el punto es urbano. Si tienes un análisis de laboratorio, ponlo en el paso 2. Las recomendaciones de abono de abajo siguen valiendo.</p>'}
    <h3>Abono para tu rotación recomendada</h3>
    ${list(bestCrops.map((id) => `<b>${esc(crops.crops.find((c) => c.id === id).name)}:</b> ${esc(knowledge.fertility[id] || "")}`))}
    <p class="hint">Orientación general, sin dosis: la cantidad la define un análisis de suelo y un técnico.</p>
    <h3>Aptitud de cada cultivo</h3>
    <div class="scroll"><table class="table"><thead><tr><th>Cultivo</th><th>Aptitud</th><th class="mid-up">Helada dañina</th><th class="mid-up">Lluvia cubre</th><th class="adv-only">pH</th><th class="mid-up">Motivo</th></tr></thead><tbody>
      ${aptitude.map((x) => `<tr><td>${esc(x.c.name)}</td><td><span class="badge badge--${LEVEL[x.status][0]}">${label[x.status]}</span></td><td class="mid-up">${pct(x.e.frostProb)}</td><td class="mid-up">${pct(x.e.coverage)}</td><td class="adv-only">${x.c.ph ? `${x.c.ph[0]}–${x.c.ph[1]}${x.phOk === false ? " ✗" : ""}` : ""}</td><td class="mid-up">${esc(x.reason)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

// --- Relieve ---
function renderRelieve() {
  const slope = state.plot && state.plot.slope;
  const lat = state.site.lat;
  const lon = state.site.lon;
  const around = [];
  for (const dy of [-0.01, -0.005, 0, 0.005, 0.01]) for (const dx of [-0.01, -0.005, 0, 0.005, 0.01]) {
    const e = elevationAt(lat + dy, lon + dx);
    if (e !== null) around.push(e);
  }
  const mean = around.reduce((a, b) => a + b, 0) / around.length;
  const diff = state.site.altitude - mean;
  const position = diff < -15 ? "parte baja: el agua de lluvia tiende a llegar y acumularse aquí" : diff > 15 ? "parte alta: el agua escurre hacia abajo y el suelo se seca antes" : "terreno intermedio respecto a su entorno";
  const hz = state.assessment.hazards.filter((h) => ["erosion", "waterlogging"].includes(h.id));
  panel("relieve").innerHTML = `
    <h2>Relieve y topografía</h2>
    <div class="facts">
      <div class="fact"><b>${num(state.site.altitude)} m</b><span>altitud</span></div>
      <div class="fact"><b>${slope ? `${num(slope.percent, 1)} %` : "Sin dato"}</b><span>pendiente${slope ? `: ${esc(slope.class)}` : ""}</span></div>
      <div class="fact"><b>${num(Math.max(...around) - Math.min(...around))} m</b><span>desnivel en 2 km a la redonda</span></div>
    </div>
    <p>Tu terreno está en la <b>${position}</b> (${diff >= 0 ? "+" : "−"}${num(Math.abs(diff))} m frente al promedio de alrededor).</p>
    ${hz.length ? hz.map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.text)}</p><p>${esc(h.action)}</p>`)).join("") : notice(1, "<p>Sin señales de erosión ni de acumulación de agua con estos datos.</p>")}
    ${source(`NASA SRTM 30 m${slope ? `; ${slope.source}` : ""}. Pendiente en un tramo de 180 m: no ve cárcavas pequeñas dentro de la parcela.`)}
    <h3>Tu terreno en 3D</h3>
    <p class="hint">Relieve real con la imagen satelital encima, en unos 2,3 km alrededor de tu terreno (marcado en naranja). Arrastra para girar y usa la rueda o dos dedos para acercar.</p>
    <div class="terrain-tools no-print">
      <button class="btn" type="button" id="terrain-open">Ver el relieve en 3D</button>
      <label class="slider terrain-ex" hidden><span>Exagerar la altura: <output id="terrain-ex-out">2×</output></span><input type="range" id="terrain-ex" min="1" max="5" step="0.5" value="2"></label>
    </div>
    <div id="terrain3d" class="terrain3d"></div>
    <p class="source" id="terrain-stats"></p>`;
  if (terrainView) { terrainView.dispose(); terrainView = null; }
  $("terrain-open").addEventListener("click", openTerrain);
}

async function openTerrain() {
  const btn = $("terrain-open");
  btn.disabled = true;
  try {
    const { renderTerrain3D } = await import("./terrain3d.js");
    if (terrainView) terrainView.dispose();
    terrainView = await renderTerrain3D($("terrain3d"), {
      lat: state.site.lat, lon: state.site.lon, polygon: state.polygon, exaggeration: 2,
      onStats: (s) => {
        $("terrain-stats").textContent = `Altura entre ${num(s.min)} y ${num(s.max)} m en ${num(s.sizeKm, 1)} km; tu terreno a ${num(s.plotElev)} m. Elevación: SRTM en teselas Terrarium (AWS Open Data), píxel de ${num(s.metresPerPixel)} m. Imagen: Esri World Imagery.`;
      },
    });
    btn.hidden = true;
    document.querySelector(".terrain-ex").hidden = false;
    $("terrain-ex").addEventListener("input", (e) => {
      $("terrain-ex-out").textContent = `${e.target.value}×`;
      if (terrainView) terrainView.setExaggeration(Number(e.target.value));
    });
  } catch (error) {
    $("terrain3d").innerHTML = `<p class="hint" style="padding:1rem">No se pudo cargar el 3D: ${esc(error.message)}. Revisa la conexión.</p>`;
    btn.disabled = false;
  }
}

// --- Agua ---
function selectedCrop() {
  const strategy = state.result.strategies.find((s) => s.kind === state.selected) || state.result.strategies[1];
  const year = strategy.years.find((y) => y.group !== "fallow");
  return year ? { strategy, year, data: state.result.crops[year.crop] } : null;
}
function renderAgua() {
  const pick = selectedCrop();
  const cal = state.result.calendar.weeks;
  const scarceMonths = [...new Set(cal.filter((w) => w.pDry >= 0.8).map((w) => MONTHS_LONG[weekDate(w.week).month]))];
  const c = state.plot && state.plot.conditions;
  let chart = "";
  if (pick) {
    const weeks = pick.data.weekly;
    const max = Math.max(...weeks.map((w) => Math.max(w.etc, w.rain)), 1);
    const col = 16;
    const h = 110;
    const width = weeks.length * col + 4;
    let bars = "";
    let labels = "";
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const x = 2 + i * col;
      bars += `<rect x="${x}" y="${(h - (w.etc / max) * h).toFixed(1)}" width="6" height="${((w.etc / max) * h).toFixed(1)}" fill="#6b4423"><title>Semana del ${weekLabel(w.week)}: necesita ${num(w.etc)} mm</title></rect>`;
      bars += `<rect x="${x + 7}" y="${(h - (w.rain / max) * h).toFixed(1)}" width="6" height="${((w.rain / max) * h).toFixed(1)}" fill="#8cc4d6"><title>Semana del ${weekLabel(w.week)}: llueve ${num(w.rain)} mm</title></rect>`;
      const m = weekDate(w.week).month;
      if (m !== lastMonth) { labels += `<text x="${x}" y="${h + 14}" font-size="11" fill="#6b5a48">${MONTHS[m]}</text>`; lastMonth = m; }
    });
    chart = `<h3>Agua para ${esc(pick.year.name.toLowerCase())}, sembrada hacia el ${weekLabel(pick.year.sowWeek)}</h3>
      <div class="facts">
        <div class="fact"><b>${mm(pick.data.cropWaterMm)}</b><span>necesita el cultivo</span></div>
        <div class="fact"><b>${pct(pick.data.coverage)}</b><span>lo cubre la lluvia</span></div>
        <div class="fact"><b>${mm(pick.data.irrigationMm)}</b><span>hay que poner con riego${state.areaHa ? ` (${num(pick.data.irrigationMm * 10 * state.areaHa)} m³ en tu terreno)` : ""}</span></div>
      </div>
      <div class="scroll mid-up"><svg class="chart" width="${width}" height="${h + 20}" viewBox="0 0 ${width} ${h + 20}" role="img" aria-label="Agua que necesita el cultivo y lluvia de cada semana">${bars}${labels}</svg></div>
      <ul class="legend mid-up"><li><i style="background:#6b4423"></i>Agua que necesita el cultivo</li><li><i style="background:#8cc4d6"></i>Lluvia de una semana típica</li></ul>`;
  }
  const userWater = [WATER_SOURCES, IRRIG_SYSTEMS, WATER_AVAIL].map((arr, i) => (arr.find((o) => o.id === [state.waterSource, state.irrigSystem, state.waterAvail][i]) || {}).label).filter(Boolean);
  panel("agua").innerHTML = `
    <h2>Humedad y agua</h2>
    ${userWater.length ? `<p>Tu agua: ${esc(userWater.join(", "))}.${state.moisture ? ` Humedad que mediste: ${num(state.moisture)} %.` : ""}</p>` : ""}
    ${c && c.soilWetness !== null ? `<p>Humedad estimada del suelo en la zona de raíces: <b>${num(c.soilWetness * 100)} %</b> (lo normal en estas fechas: ${num(c.soilWetnessNormal * 100)} %).</p>${source(`${c.source}, hasta el ${c.asOf}. En el mapa puedes ver la humedad de NASA SMAP.`)}` : ""}
    ${chart}
    <h3>Meses de escasez</h3>
    <p>${scarceMonths.length ? `Casi siempre hay semanas secas en ${esc(scarceMonths.join(", "))}: guarda agua o siembra con riego en esos meses.` : "No hay meses con semanas secas casi seguras."}</p>
    ${state.waterAvail === "scarce" ? notice(2, "<p>Dijiste que tienes muy poca agua: prioriza la rotación que ahorra agua y riega por goteo o por surcos cortos.</p>") : ""}
    ${source(`NASA POWER ${climate.meta.period.replace(" to ", " a ")}; necesidad del cultivo con evapotranspiración FAO-56 por coeficiente Kc.`)}`;
}

// --- Riesgos ---
function renderRiesgos() {
  const a = state.assessment;
  panel("riesgos").innerHTML = `
    <h2>Riesgos y precauciones</h2>
    <p class="hint">Climáticos, hidrológicos y del relieve, con lo que conviene hacer.</p>
    ${a.hazards.map((h) => notice(h.level, `<p><b>${esc(h.title)}: riesgo ${h.levelLabel}.</b> ${esc(h.text)}</p><p>${esc(h.action)}</p>${source(h.source)}`)).join("")}
    <h3>Lo que no conviene sembrar aquí</h3>
    ${a.avoid.length ? list(a.avoid.map((x) => `<b>${esc(x.name)}</b>: ${esc(x.reasons.join("; "))}.`)) : '<p class="hint">Con estos datos, ningún cultivo de la lista queda descartado.</p>'}`;
}

// --- Cultivos ---
function wheel(strategy) {
  const c = 120;
  const radii = [96, 74, 52];
  const width = 17;
  const angle = (week) => (((week - 26 + WEEKS) % WEEKS) / WEEKS) * 2 * Math.PI;
  const point = (r, a) => [(c + r * Math.sin(a)).toFixed(1), (c - r * Math.cos(a)).toFixed(1)];
  let s = `<svg class="wheel" viewBox="0 0 240 240" role="img" aria-label="Rueda de tres años: ${esc(strategy.years.map((y) => y.name).join(", "))}. Puntaje ${strategy.score} de 100.">`;
  radii.forEach((r, i) => {
    const y = strategy.years[i];
    s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e7dcc8" stroke-width="${width}"/>`;
    if (y.group === "fallow") s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${CROP_COLORS.descanso}" stroke-width="${width - 7}" stroke-dasharray="3 7"/>`;
    else if (y.weeks >= WEEKS) s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${CROP_COLORS[y.crop]}" stroke-width="${width}"/>`;
    else {
      const a0 = angle(y.sowWeek);
      const sweep = (y.weeks / WEEKS) * 2 * Math.PI;
      const [x0, y0] = point(r, a0);
      const [x1, y1] = point(r, a0 + sweep);
      s += `<path d="M${x0} ${y0} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${CROP_COLORS[y.crop]}" stroke-width="${width}"/>`;
    }
  });
  for (let m = 0; m < 12; m++) {
    const a = (m / 12) * 2 * Math.PI;
    const [x0, y0] = point(42, a);
    const [x1, y1] = point(106, a);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#fff" stroke-width="1.5"/>`;
    const [tx, ty] = point(114, a + Math.PI / 12);
    s += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#6b5a48">${"JASONDEFMAMJ"[m]}</text>`;
  }
  s += `<text x="${c}" y="${c + 4}" text-anchor="middle" font-size="34" font-weight="800" fill="#2b1d12">${strategy.score}</text>`;
  return `${s}<text x="${c}" y="${c + 20}" text-anchor="middle" font-size="11" fill="#6b5a48">de 100</text></svg>`;
}
const SCORE_LABELS = { climate: ["Clima", 45], rotation: ["Rotación", 30], soil: ["Suelo", 10], priorities: ["Lo que te importa", 15] };
function renderCultivos() {
  const r = state.result;
  panel("cultivos").innerHTML = `
    <h2>Qué sembrar: tres rotaciones para tu terreno</h2>
    <p class="hint mid-up">Cada rueda muestra tres años: el anillo de afuera es el primero y cada vuelta va de julio a junio. El color marca los meses con cultivo.</p>
    <div class="strategies">${r.strategies.map((s) => `
      <article class="strategy strategy--${s.kind}" data-selected="${state.selected === s.kind}">
        <p class="strategy__tag">${esc(s.label)}</p>
        <p class="strategy__name">${s.years.map((y) => esc(y.name)).join(", ")}</p>
        <div class="strategy__photos mid-up">${[...new Set(s.years.map((y) => y.crop))].map((id) => (images.crops[id] ? `<img src="${esc(images.crops[id].thumb)}" alt="${esc(crops.crops.find((c) => c.id === id).name)}" title="Foto: ${esc(images.crops[id].author)}, ${esc(images.crops[id].licence)} (Wikimedia Commons)" loading="lazy" referrerpolicy="no-referrer">` : "")).join("")}</div>
        ${wheel(s)}
        <ul class="years">${s.years.map((y) => `<li><span class="swatch" style="background:${CROP_COLORS[y.crop]}"></span><span>Año ${y.year}: <b>${esc(y.name)}</b></span><span class="when">${y.group === "fallow" ? "El suelo descansa o lleva abono verde." : `Siembra hacia el ${weekLabel(y.sowWeek)}. Riego: ${mm(y.irrigationMm)}.`}</span></li>`).join("")}</ul>
        <div class="bars mid-up">${Object.entries(SCORE_LABELS).map(([k, [l, max]]) => `<div class="bar"><span>${l}</span><span class="bar__track"><span class="bar__fill" style="width:${Math.round((s.parts[k] / max) * 100)}%"></span></span><span class="bar__value">${num(s.parts[k])}/${max}</span></div>`).join("")}</div>
        <details class="mid-up"><summary>Por qué y qué revisar</summary>
          <h4>Por qué</h4>${list(s.why.map(esc))}
          <h4>Datos que la respaldan</h4>${list(s.evidence.map((e) => `${esc(e.text)}. <span class="source">${esc(e.dataset)}, ${esc(e.parameter)}, ${esc(e.period)}.</span>`))}
          <h4>Beneficios</h4>${list(s.benefits.map(esc))}
          <h4>Qué falta saber</h4>${list(s.gaps.map(esc))}
          <h4>Riesgos para revisar con un técnico</h4>${list(s.risks.map(esc))}
        </details>
        <button class="pick" type="button" data-pick="${s.kind}">${state.selected === s.kind ? "Elegida para agua y ganancias" : "Usar esta rotación"}</button>
      </article>`).join("")}</div>`;
  panel("cultivos").querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    state.selected = b.dataset.pick;
    renderCultivos(); renderAgua(); renderGanancias();
  }));
}

// --- Plagas ---
function renderPlagas() {
  const ids = [...new Set([state.last, ...state.result.strategies[1].years.filter((y) => y.group !== "fallow").map((y) => y.crop)].filter(Boolean))];
  panel("plagas").innerHTML = `
    <h2>Plagas, especies invasoras y cuidados</h2>
    <p class="hint">${esc(knowledge.meta.status)}</p>
    ${ids.map((id) => {
      const pests = knowledge.pests[id] || [];
      if (!pests.length) return "";
      const cropName = crops.crops.find((c) => c.id === id).name;
      return `<div class="crop-head">${photo(images.crops[id], cropName, "photo photo--round")}<h3>${esc(cropName)}</h3></div>
        <div class="cards">${pests.map((p) => `<article class="card">
          ${photo(images.pests[p.scientific], p.name)}
          <p class="card__title">${esc(p.name)} <span class="adv-only small"><i>${esc(p.scientific)}</i></span></p>
          <p class="small">${esc(p.type)} · ${esc(p.season)}</p>
          <p><b>Señales:</b> ${esc(p.signs)}</p>
          <p class="mid-up"><b>Prevención:</b> ${esc(p.prevention)}</p>
          <p><b>Casero:</b> ${esc(p.homemade)}</p></article>`).join("")}</div>`;
    }).join("")}
    <h3>Repelentes y remedios caseros</h3>
    <div class="cards">${knowledge.repellents.map((r) => `<article class="card"><p class="card__title">${esc(r.name)}</p><p class="small">Para ${esc(r.for)}</p><p class="mid-up">${esc(r.how)}</p><p class="small">${esc(r.care)}</p></article>`).join("")}</div>
    ${notice(2, `<p>${esc(knowledge.meta.safety)}</p>`)}
    <h3>Especies invasoras a vigilar</h3>
    <div class="cards">${knowledge.invasive.map((x) => `<article class="card">${photo(images.invasive[x.scientific], x.name)}<p class="card__title">${esc(x.name)} <span class="adv-only small"><i>${esc(x.scientific)}</i></span></p><p class="small">Origen: ${esc(x.origin)}</p><p>${esc(x.risk)}</p><p><b>Qué hacer:</b> ${esc(x.action)}</p></article>`).join("")}</div>
    <p class="source adv-only">Fuentes de referencia: ${esc(knowledge.meta.sources.join("; "))}.</p>`;
}

// --- Legal ---
function renderLegal() {
  const g = (state.plot && state.plot.gamc) || state.site.gamc;
  const zone = gamcZone(g);
  const drainage = g && g.drenaje && !g.drenaje.error;
  const notes = [zone && knowledge.legal.zone_notes[zone.Periurbano], drainage && knowledge.legal.zone_notes.drainage].filter(Boolean);
  panel("legal").innerHTML = `
    <h2>Legal y propiedad</h2>
    <p>${esc(knowledge.legal.summary)}</p>
    <h3>Lo que se sabe de este lugar</h3>
    <dl class="kv">
      <div><dt>Distrito y comuna (GAMC)</dt><dd>${gamcDistrict(g) ? `${esc(gamcDistrict(g).Distrito)}, ${esc(gamcDistrict(g).Comuna)}` : "Sin dato"}</dd></div>
      <div><dt>Zona periurbana (GAMC)</dt><dd>${zone ? esc(zone.Periurbano) : "Fuera de las zonas periurbanas o sin dato"}</dd></div>
      <div><dt>Área de drenaje e influencia (GAMC)</dt><dd>${drainage ? "Sí" : "No, o sin dato"}</dd></div>
      <div><dt>Propietario registrado</dt><dd>Sin acceso a registros oficiales</dd></div>
    </dl>
    ${notes.map((n) => notice(2, `<p>${esc(n)}</p>`)).join("")}
    <h3>Dónde verificar</h3>
    ${list(knowledge.legal.checks.map((c) => `<b>${esc(c.topic)}:</b> ${esc(c.where)}`))}
    <p class="hint">Orientación general, no es asesoría legal.</p>`;
}

// --- Ganancias ---
function renderGanancias() {
  const pick = selectedCrop();
  if (!pick) { panel("ganancias").innerHTML = "<h2>Ganancias o pérdidas</h2><p class=\"hint\">La rotación elegida empieza con descanso.</p>"; return; }
  const keep = (id) => (document.getElementById(id) ? document.getElementById(id).value : "");
  const values = { y: keep("m-yield"), p: keep("m-price"), c: keep("m-cost") };
  panel("ganancias").innerHTML = `
    <h2>Ganancias o pérdidas: ${esc(pick.year.name.toLowerCase())}</h2>
    <p class="hint">Yatiri X no tiene precios ni costos oficiales. Pon tus números y te muestra cuánto pesa el riesgo del clima.</p>
    <form class="calc" id="money-form">
      <label>Cosecha esperada${state.areaHa ? ` en tus ${num(state.areaHa, 2)} ha` : ""}<input type="number" id="m-yield" min="0" step="any" inputmode="decimal" placeholder="por ejemplo 120 quintales" value="${esc(values.y)}"></label>
      <label>Precio por unidad (Bs)<input type="number" id="m-price" min="0" step="any" inputmode="decimal" value="${esc(values.p)}"></label>
      <label>Costos de la campaña (Bs)<input type="number" id="m-cost" min="0" step="any" inputmode="decimal" value="${esc(values.c)}"></label>
    </form>
    <div id="money-out" aria-live="polite"></div>`;
  $("money-form").addEventListener("input", updateMoney);
  updateMoney();
}
function updateMoney() {
  const pick = selectedCrop();
  const out = $("money-out");
  if (!pick || !out) return;
  const y = Number($("m-yield").value);
  const p = Number($("m-price").value);
  const cost = Number($("m-cost").value) || 0;
  if (!(y > 0) || !(p > 0)) { out.innerHTML = ""; return; }
  const income = y * p;
  const frost = pick.data.frostProb;
  const waterShort = !irrigation() ? Math.max(0, 1 - pick.data.coverage) : 0;
  const expected = (1 - frost) * income - cost;
  const bs = (x) => `${x < 0 ? "−" : ""}Bs ${num(Math.abs(Math.round(x)))}`;
  out.innerHTML = `<div class="facts">
      <div class="fact"><b>${bs(income - cost)}</b><span>en una campaña sin helada</span></div>
      <div class="fact"><b>${bs(-cost)}</b><span>si una helada daña todo</span></div>
      <div class="fact"><b>${bs(expected)}</b><span>promedio contando el riesgo de helada</span></div>
    </div>
    <p class="hint">Helada dañina en ${pct(frost)} de las campañas (NASA POWER, ${state.result.site.period}). ${waterShort > 0.3 ? `Sin riego, la lluvia cubre solo ${pct(pick.data.coverage)} del agua: la cosecha real puede ser menor que la esperada.` : ""}</p>`;
}

// --- Fuentes ---
function renderFuentes() {
  const o = state.outlook;
  panel("fuentes").innerHTML = `
    <h2>De dónde salen los datos</h2>
    <table class="table"><tbody>
      <tr><th>Clima histórico</th><td>NASA POWER, diario, ${esc(climate.meta.period.replace(" to ", " a "))}; celda de 0,5 × 0,625 grados ajustada por altitud.</td></tr>
      <tr><th>Altitud y pendiente</th><td>NASA SRTM 30 m.</td></tr>
      <tr><th>Clima reciente</th><td>NASA POWER casi en tiempo real (últimos 45 días).</td></tr>
      <tr><th>Imágenes del mapa</th><td>NASA SMAP (humedad del suelo), GPM IMERG (lluvia) y MODIS (verdor), vía NASA GIBS.</td></tr>
      <tr><th>Pronóstico de días y semanas</th><td>${esc(o && o.daily ? `${o.daily.model}, ${o.daily.members} escenarios` : "GFS Ensemble (NOAA) vía Open-Meteo")}.</td></tr>
      <tr><th>Probabilidad de los próximos meses</th><td>Frecuencias de 45 años de NASA POWER.</td></tr>
      <tr><th>Municipio</th><td>Geoservicios del GAMC: zonas periurbanas, drenaje y distritos.</td></tr>
      <tr><th>Suelo</th><td>SoilGrids 2.0 (ISRIC), 250 m, o tu laboratorio.</td></tr>
      <tr><th>Agua del cultivo</th><td>Evapotranspiración FAO-56 (Penman-Monteith) por coeficiente Kc.</td></tr>
      <tr><th>Plagas y cuidados</th><td>Base de conocimiento general, por validar con SENASAG e INIAF.</td></tr>
    </tbody></table>
    <h3>Cómo se puntúa una rotación</h3>
    <p>Clima 45 puntos, rotación 30, suelo 10 y tus prioridades 15. La regla es fija y se puede revisar en el código.</p>
    <h3>Límites</h3>
    ${list(["La celda de clima de unos 50 km suaviza las heladas del fondo del valle.", "Los umbrales de helada y los coeficientes de cultivo son valores generales que un técnico debe confirmar.", "Sin precios ni registros de propiedad oficiales."])}`;
}

// ---------- Tiri ----------
function renderTiri() {
  chips($("tiri-suggestions"), TIRI_SUGGESTIONS.map((label) => ({ label })), { pressed: () => false, onClick: (s) => askTiri(s.label) });
  const log = $("tiri-log");
  log.innerHTML = state.chat.map((m) => `<div class="bubble bubble--${m.role}"><p>${esc(m.content)}</p>${m.note ? `<p class="source">${esc(m.note)}</p>` : ""}</div>`).join("")
    + (state.asking ? '<div class="bubble bubble--assistant"><p>Tiri está revisando tu terreno…</p></div>' : "");
  log.scrollTop = log.scrollHeight;
}
async function askTiri(question) {
  const text = question.trim();
  if (!text || state.asking) return;
  const history = state.chat.slice(1).map(({ role, content }) => ({ role, content }));
  state.chat.push({ role: "user", content: text });
  state.asking = true;
  renderTiri();
  try {
    const r = await fetch("/api/tiri", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text, lat: state.site ? state.site.lat : null, lon: state.site ? state.site.lon : null,
        history: [state.previous, state.last].filter(Boolean), irrigation: irrigation(), priorities: [...state.priorities], messages: history.slice(-6),
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.answer) throw new Error();
    state.chat.push({ role: "assistant", content: data.answer, note: data.engine === "rules" ? "Respuesta automática con los datos de tu terreno." : `Redactada con IA (${data.model || data.engine}) a partir de tus datos.` });
  } catch {
    state.chat.push({ role: "assistant", content: "No pude responder ahora. Revisa tu conexión e intenta de nuevo." });
  }
  state.asking = false;
  renderTiri();
}

// ---------- Landing fact (computed live) ----------
function renderHeroFact() {
  const alt = elevationAt(EXAMPLE.lat, EXAMPLE.lon);
  const r = recommend(climate, crops, { altitude: alt, history: ["papa", "papa"], irrigation: false, priorities: ["water"] });
  const [current, best, water] = r.strategies;
  const saved = Math.max(0, current.irrigationTotalMm - water.irrigationTotalMm);
  document.querySelector("#hero-fact .hero__fact-body").innerHTML = `
    <span class="big">${current.score} → ${best.score}</span>
    <span>puntos sobre 100 al dejar de repetir papa y rotar con ${esc(best.years.map((y) => y.name.toLowerCase()).join(", "))}.</span>
    <span class="big">${num(saved * 10)} m³</span>
    <span>de agua de riego por hectárea que ahorra en tres años la rotación que cuida el agua.</span>
    <span class="source">Calculado ahora con NASA POWER ${esc(climate.meta.period.slice(0, 4))}–${esc(climate.meta.period.slice(14, 18))} y NASA SRTM, ${num(alt)} m de altitud.</span>`;
}

// ---------- Start ----------
function setMode(mode) { state.mode = mode; document.body.dataset.mode = mode; $("mode").value = mode; savePrefs(); }
function setLang(lang) {
  state.lang = lang;
  applyLanguage(lang);
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  renderStepper();
  if ($("home-modules").children.length) renderHomeModules();
  if (state.result) renderTabs();
  savePrefs();
}

async function start() {
  try {
    [climate, crops, grid, knowledge] = await Promise.all(["climate_weekly", "crops", "srtm_grid", "knowledge"].map((f) => loadJson(`data/${f}.json`)));
  } catch (error) {
    document.querySelector("#hero-fact .hero__fact-body").textContent = `No se pudieron cargar los datos. ${error.message}. Recarga la página.`;
    return;
  }
  try { images = await loadJson("data/images.json", 8000); } catch { /* photos are optional */ }
  const prefs = readStore().prefs || {};
  setMode(prefs.mode || "medio");
  setLang(prefs.lang || "es");
  renderHomeModules();
  renderHeroFact();
  renderForm();
  renderSaved();
  renderTiri();
  goStep(1);
  document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); show(el.dataset.go); }));
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  $("mode").addEventListener("change", (e) => setMode(e.target.value));
  $("next").addEventListener("click", nextStep);
  $("prev").addEventListener("click", () => goStep(state.step - 1));
  $("analyze").addEventListener("click", analyze);
  $("gps").addEventListener("click", useGps);
  $("search-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("search-input").value.trim(); if (q) searchPlaces(q); });
  $("draw").addEventListener("click", () => { state.drawing = true; state.draft = []; drawShape(); });
  $("draw-done").addEventListener("click", finishDrawing);
  $("draw-clear").addEventListener("click", () => { state.drawing = false; state.draft = []; state.polygon = null; state.areaHa = null; drawShape(); renderSite(); });
  $("pdf").addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((s) => { s.hidden = false; });
    document.querySelectorAll(".tab details").forEach((d) => { d.open = true; });
    window.print();
    setTab(state.tab);
  });
  $("edit").addEventListener("click", () => { show("wizard"); goStep(1); });
  $("json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ inputs: inputsSnapshot(), result: state.result, assessment: state.assessment, plot: state.plot, soil: state.soil, outlook: state.outlook }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yatirix-${(state.name || "terreno").replace(/\W+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("tiri-toggle").addEventListener("click", () => {
    const body = $("tiri-body");
    body.hidden = !body.hidden;
    $("tiri-toggle").setAttribute("aria-expanded", String(!body.hidden));
    if (!body.hidden) $("tiri-input").focus();
  });
  $("tiri-form").addEventListener("submit", (e) => { e.preventDefault(); askTiri($("tiri-input").value); $("tiri-input").value = ""; });
}

start();
