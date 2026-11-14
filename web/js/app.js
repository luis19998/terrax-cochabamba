// Terrax: interface of the rotation planner and the Terra assistant. Vanilla JS, no build step.
import { WEEKS, explain, recommend } from "./engine.js";
import { assessPlot, elevationFromGrid } from "./assess.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (x, digits = 0) => Number(x).toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const mm = (x) => `${num(Math.round(x / 5) * 5)} mm`;
const pct = (x) => `${Math.round(x * 100)} %`;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function weekDate(week) {
  let day = week * 7; // day of year, 0-based
  let m = 0;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m += 1; }
  return { day: day + 1, month: m };
}
const weekLabel = (week) => { const d = weekDate(((week % WEEKS) + WEEKS) % WEEKS); return `${d.day} de ${MONTHS[d.month]}`; };
const currentWeek = () => {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 1);
  return Math.min(51, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 864e5 / 7));
};

const CROP_COLORS = {
  papa: "#8a5a2b", maiz: "#e0a100", haba: "#2f7d4a", arveja: "#7fb069", trigo: "#c98b2b", cebada: "#d9b86c",
  quinua: "#b0457a", alfalfa: "#1f6f78", cebolla: "#8e6bbf", tomate: "#c8452f", descanso: "#a89f91",
};
// Points checked against the GAMC layers on 2026-11-14 (district and peri-urban category returned by GetFeatureInfo).
const PRESETS = [
  { label: "Distrito 9, zona oeste", lat: -17.4629, lon: -66.2376 },
  { label: "Distrito 9, zona centro", lat: -17.4629, lon: -66.1867 },
  { label: "Distrito 13, ladera del Tunari", lat: -17.3385, lon: -66.1358 },
];
const PRIORITIES = [
  { id: "risk", label: "Menos riesgo" },
  { id: "water", label: "Ahorrar agua" },
  { id: "soil", label: "Cuidar el suelo" },
  { id: "forage", label: "Forraje para el ganado" },
  { id: "preferred", label: "Mis cultivos preferidos" },
];
const LAYERS = [
  { id: "periurbanos", label: "Zonas periurbanas", on: true, opacity: 0.5 },
  { id: "drenaje", label: "Drenaje", on: false, opacity: 0.9 },
  { id: "distritos", label: "Distritos", on: true, opacity: 0.9 },
];
const SCORE_LABELS = { climate: ["Clima", 45], rotation: ["Rotación", 30], soil: ["Suelo", 10], priorities: ["Lo que te importa", 15] };

const state = {
  site: null, last: null, previous: null, irrigation: false,
  priorities: new Set(["risk"]), preferred: new Set(),
  scenario: { rainPct: 0, tempC: 0 }, selected: "best", result: null, forecast: null,
  plot: null, soil: undefined, chat: [], asking: false,
};
const TERRA_SUGGESTIONS = ["¿Qué siembro?", "¿Cuándo riego?", "¿Va a helar?", "¿Qué abono le pongo?", "¿Qué riesgos tiene mi tierra?"];
let climate;
let crops;
let grid;
let map;
let marker;

// ---------- Data ----------
async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`No se pudo leer ${path}`);
  return r.json();
}

const elevationAt = (lat, lon) => elevationFromGrid(grid, lat, lon);

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
  const dot = (item) => CROP_COLORS[item.id];
  chips($("presets"), PRESETS, {
    pressed: (p) => state.site && state.site.label === p.label,
    onClick: (p) => { if (map) map.setView([p.lat, p.lon], 14); selectSite(p.lat, p.lon, p.label); },
  });
  chips($("last-crop"), cropItems, {
    dot, pressed: (c) => state.last === c.id,
    onClick: (c) => { state.last = c.id; renderForm(); },
  });
  chips($("previous-crop"), [{ id: null, label: "No recuerdo" }, ...cropItems], {
    dot: (c) => (c.id ? CROP_COLORS[c.id] : "transparent"), pressed: (c) => state.previous === c.id,
    onClick: (c) => { state.previous = c.id; renderForm(); },
  });
  chips($("irrigation"), [{ id: false, label: "No, solo lluvia" }, { id: true, label: "Sí, tengo riego" }], {
    pressed: (o) => state.irrigation === o.id,
    onClick: (o) => { state.irrigation = o.id; renderForm(); if (state.result) compute(); },
  });
  chips($("priorities"), PRIORITIES, {
    pressed: (p) => state.priorities.has(p.id),
    onClick: (p) => { state.priorities.has(p.id) ? state.priorities.delete(p.id) : state.priorities.add(p.id); renderForm(); if (state.result) compute(); },
  });
  $("preferred-field").hidden = !state.priorities.has("preferred");
  chips($("preferred"), cropItems, {
    dot, pressed: (c) => state.preferred.has(c.id),
    onClick: (c) => { state.preferred.has(c.id) ? state.preferred.delete(c.id) : state.preferred.add(c.id); renderForm(); if (state.result) compute(); },
  });
  const ready = Boolean(state.site && state.last);
  $("compare").disabled = !ready;
  $("compare-hint").textContent = ready ? "" : !state.site ? "Primero elige tu parcela en el mapa." : "Marca qué sembraste la última campaña.";
}

// ---------- Map and site ----------
function initMap() {
  const box = $("map");
  if (!window.L) {
    box.innerHTML = '<p class="hint" style="padding:1rem">El mapa no cargó. Elige una de las zonas de arriba.</p>';
    return;
  }
  const bounds = [[grid.min_lat, grid.min_lon], [grid.max_lat, grid.max_lon]];
  map = L.map(box, { minZoom: 11, maxBounds: [[grid.min_lat - 0.1, grid.min_lon - 0.14], [grid.max_lat + 0.1, grid.max_lon + 0.14]] }).fitBounds(bounds);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  for (const layer of LAYERS) {
    layer.leaflet = L.tileLayer.wms(`/api/gamc/wms?layer=${layer.id}`, {
      layers: "", format: "image/png", transparent: true, version: "1.1.1", opacity: layer.opacity, attribution: "GAMC",
    });
    if (layer.on) layer.leaflet.addTo(map);
  }
  map.on("click", (e) => selectSite(e.latlng.lat, e.latlng.lng, null));
  renderLayerToggles();
}

function renderLayerToggles() {
  chips($("layer-toggles"), LAYERS, {
    pressed: (l) => l.on,
    onClick: (l) => { l.on = !l.on; if (map) (l.on ? l.leaflet.addTo(map) : l.leaflet.remove()); renderLayerToggles(); },
  });
}

async function selectSite(lat, lon, label) {
  const altitude = elevationAt(lat, lon);
  if (altitude === null) {
    $("site").innerHTML = '<p class="site__empty">Ese punto está fuera del municipio de Cochabamba. Toca dentro del área marcada.</p>';
    return;
  }
  state.site = { lat, lon, altitude, label, gamc: null, gamcState: "loading" };
  state.forecast = null;
  if (map) {
    if (marker) marker.remove();
    marker = L.circleMarker([lat, lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#b8392f", fillOpacity: 1 }).addTo(map);
  }
  renderSite();
  renderForm();
  if (state.result) compute();
  const site = state.site;
  loadPlot(site);
  try {
    const info = await loadJson(`/api/gamc/info?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
    if (state.site !== site) return;
    site.gamc = info;
    site.gamcState = "ok";
  } catch {
    if (state.site !== site) return;
    site.gamcState = "error";
  }
  renderSite();
  loadForecast(site);
}

function renderSite() {
  const s = state.site;
  if (!s) return;
  const shift = climate.meta.lapse_rate_c_per_m * (climate.meta.cell_elevation_m - s.altitude);
  const g = s.gamc;
  let district = "Consultando…";
  let zone = "Consultando…";
  if (s.gamcState === "error") { district = "Sin respuesta del GAMC"; zone = "Sin respuesta del GAMC"; }
  const unavailable = s.gamcState === "ok" && g.distritos && g.distritos.error && g.periurbanos && g.periurbanos.error;
  if (unavailable) { district = "Capas del GAMC no disponibles"; zone = "Capas del GAMC no disponibles"; }
  if (s.gamcState === "ok" && !unavailable) {
    const d = g.distritos && !g.distritos.error ? g.distritos : null;
    const p = g.periurbanos && !g.periurbanos.error ? g.periurbanos : null;
    district = d ? `${esc(d.Distrito)}, comuna ${esc(String(d.Comuna).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}` : "Fuera de los distritos";
    zone = p ? esc(p.Periurbano) : "Fuera de las zonas periurbanas";
  }
  $("site").innerHTML = `
    <dl class="site__grid">
      <div><dt>Distrito</dt><dd>${district}</dd></div>
      <div><dt>Zona según el GAMC</dt><dd>${zone}</dd></div>
      <div><dt>Altitud (NASA SRTM)</dt><dd>${num(s.altitude)} m</dd></div>
      <div><dt>Ajuste de temperatura</dt><dd>${shift >= 0 ? "+" : "−"}${num(Math.abs(shift), 1)} °C</dd></div>
    </dl>
    <p class="site__note">El clima de la NASA llega en una celda de unos 50 km a ${num(climate.meta.cell_elevation_m)} m. Lo ajustamos a la altitud de tu parcela.</p>`;
}

// ---------- Result ----------
function compute() {
  if (!state.site || !state.last) return;
  state.result = recommend(climate, crops, {
    altitude: state.site.altitude,
    history: [state.previous, state.last].filter(Boolean),
    irrigation: state.irrigation,
    priorities: [...state.priorities],
    preferred: [...state.preferred],
    scenario: state.scenario,
  });
  renderResult();
  renderLand();
  renderWater();
  renderCalendar();
  renderForecast();
}

function wheel(strategy) {
  const c = 120;
  const radii = [96, 74, 52];
  const width = 17;
  const angle = (week) => (((week - 26 + WEEKS) % WEEKS) / WEEKS) * 2 * Math.PI; // July at the top, clockwise
  const point = (r, a) => [(c + r * Math.sin(a)).toFixed(1), (c - r * Math.cos(a)).toFixed(1)];
  const names = strategy.years.map((y) => y.name).join(", ");
  let s = `<svg class="wheel" viewBox="0 0 240 240" role="img" aria-label="Rueda de tres años: ${esc(names)}. Puntaje ${strategy.score} de 100.">`;
  radii.forEach((r, i) => {
    const y = strategy.years[i];
    s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--bare)" stroke-width="${width}"/>`;
    if (y.group === "fallow") {
      s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${CROP_COLORS.descanso}" stroke-width="${width - 7}" stroke-dasharray="3 7"/>`;
    } else if (y.weeks >= WEEKS) {
      s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${CROP_COLORS[y.crop]}" stroke-width="${width}"/>`;
    } else {
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
    s += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="var(--soil-soft)">${"JASONDEFMAMJ"[m]}</text>`;
  }
  s += `<text x="${c}" y="${c + 4}" text-anchor="middle" font-size="34" font-weight="800" fill="var(--soil)">${strategy.score}</text>`;
  s += `<text x="${c}" y="${c + 20}" text-anchor="middle" font-size="11" fill="var(--soil-soft)">de 100</text></svg>`;
  return s;
}

const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;

function strategyCard(s) {
  const years = s.years.map((y) => {
    const when = y.group === "fallow"
      ? "El suelo descansa o lleva abono verde."
      : `Siembra hacia el ${weekLabel(y.sowWeek)}. Riego: ${mm(y.irrigationMm)}.`;
    return `<li><span class="swatch" style="background:${CROP_COLORS[y.crop]}"></span><span>Año ${y.year}: <b>${esc(y.name)}</b></span><span class="when">${when}</span></li>`;
  }).join("");
  const bars = Object.entries(SCORE_LABELS).map(([key, [label, max]]) => `
    <div class="bar"><span>${label}</span><span class="bar__track"><span class="bar__fill" style="width:${Math.round((s.parts[key] / max) * 100)}%; display:block"></span></span><span class="bar__value">${num(s.parts[key])}/${max}</span></div>`).join("");
  const evidence = s.evidence.map((e) => `${esc(e.text)}. <span class="source">${esc(e.dataset)}, ${esc(e.parameter)}, ${esc(e.period)}.</span>`);
  return `
    <article class="strategy strategy--${s.kind}" data-kind="${s.kind}" data-selected="${state.selected === s.kind}">
      <p class="strategy__tag">${esc(s.label)}</p>
      <p class="strategy__name">${s.years.map((y) => esc(y.name)).join(", ")}</p>
      ${wheel(s)}
      <ul class="years">${years}</ul>
      <div class="bars">${bars}</div>
      <details>
        <summary>Por qué y qué revisar</summary>
        <h4>Por qué</h4>${list(s.why.map(esc))}
        <h4>Datos que la respaldan</h4>${list(evidence)}
        <h4>Beneficios</h4>${list(s.benefits.map(esc))}
        <h4>Qué falta saber</h4>${list(s.gaps.map(esc))}
        <h4>Riesgos para revisar con un técnico</h4>${list(s.risks.map(esc))}
      </details>
      <button class="pick" type="button" data-pick="${s.kind}">${state.selected === s.kind ? "Viendo el agua de esta rotación" : "Ver el agua de esta rotación"}</button>
    </article>`;
}

function renderResult() {
  const r = state.result;
  $("result").hidden = false;
  $("summary").textContent = explain(r).join(" ");
  $("strategies").innerHTML = r.strategies.map(strategyCard).join("")
    + '<p class="hint" style="grid-column:1/-1">En cada rueda, el anillo de afuera es el primer año y cada vuelta va de julio a junio. El color marca los meses con cultivo; el tono claro, el suelo descubierto.</p>';
  $("strategies").querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    state.selected = b.dataset.pick;
    renderResult();
    renderWater();
    renderMoney();
    $("water").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// ---------- Water ----------
function selectedCrop() {
  const strategy = state.result.strategies.find((s) => s.kind === state.selected) || state.result.strategies[1];
  const year = strategy.years.find((y) => y.group !== "fallow");
  return year ? { strategy, year, data: state.result.crops[year.crop] } : null;
}

function renderWater() {
  const pick = selectedCrop();
  $("water").hidden = false;
  if (!pick) { $("water-body").innerHTML = '<p class="hint">Esta rotación empieza con descanso: no hay cultivo que regar.</p>'; return; }
  const { year, data, strategy } = pick;
  $("h-water").textContent = `Agua para ${year.name.toLowerCase()}`;
  const weeks = data.weekly;
  const max = Math.max(...weeks.map((w) => Math.max(w.etc, w.rain)), 1);
  const col = 16;
  const h = 110;
  const width = weeks.length * col + 4;
  let bars = "";
  let labels = "";
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const x = 2 + i * col;
    const need = (w.etc / max) * h;
    const rain = (w.rain / max) * h;
    bars += `<rect x="${x}" y="${(h - need).toFixed(1)}" width="6" height="${need.toFixed(1)}" fill="var(--canal)"><title>Semana del ${weekLabel(w.week)}: necesita ${num(w.etc)} mm</title></rect>`;
    bars += `<rect x="${x + 7}" y="${(h - rain).toFixed(1)}" width="6" height="${rain.toFixed(1)}" fill="#8cc4d6"><title>Semana del ${weekLabel(w.week)}: llueve ${num(w.rain)} mm</title></rect>`;
    const m = weekDate(w.week).month;
    if (m !== lastMonth) { labels += `<text x="${x}" y="${h + 14}" font-size="11" fill="var(--soil-soft)">${MONTHS[m]}</text>`; lastMonth = m; }
  });
  $("water-body").innerHTML = `
    <p class="hint">Primer cultivo de «${esc(strategy.label.toLowerCase())}», sembrado hacia el ${weekLabel(year.sowWeek)}. Año típico de ${state.result.site.period}.</p>
    <div class="facts">
      <div class="fact"><b>${mm(data.cropWaterMm)}</b><span>necesita el cultivo</span></div>
      <div class="fact"><b>${pct(data.coverage)}</b><span>lo cubre la lluvia</span></div>
      <div class="fact"><b>${mm(data.irrigationMm)}</b><span>hay que poner con riego</span></div>
    </div>
    <div class="scroll"><svg class="chart" width="${width}" height="${h + 20}" viewBox="0 0 ${width} ${h + 20}" role="img" aria-label="Agua que necesita el cultivo y lluvia de cada semana">${bars}${labels}</svg></div>
    <ul class="legend"><li><i style="background:var(--canal)"></i>Agua que necesita el cultivo</li><li><i style="background:#8cc4d6"></i>Lluvia de una semana típica</li></ul>
    <p class="hint">Cuando la barra clara es más corta que la oscura, esa semana pide riego. La necesidad sale de la evapotranspiración (FAO-56) por el coeficiente del cultivo.</p>`;
}

async function loadForecast(site) {
  const direct = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: site.lat.toFixed(4), longitude: site.lon.toFixed(4),
    daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration",
    forecast_days: "16", timezone: "America/La_Paz",
  });
  let data = null;
  // Our own API first (it caches); straight to Open-Meteo if the API is not reachable.
  for (const url of [`/api/forecast?lat=${site.lat.toFixed(4)}&lon=${site.lon.toFixed(4)}`, direct]) {
    try { data = await loadJson(url); break; } catch { data = null; }
  }
  if (state.site !== site) return;
  state.forecast = data || { error: true };
  renderForecast();
}

const notice = (kind, icon, text) => `<div class="notice notice--${kind}"><span class="notice__icon" aria-hidden="true">${icon}</span><p>${text}</p></div>`;

function renderForecast() {
  if (!state.result) return;
  const f = state.forecast;
  if (!f) { $("forecast").innerHTML = '<p class="hint">Consultando el pronóstico…</p>'; return; }
  if (f.error || !f.daily) { $("forecast").innerHTML = '<p class="hint">No hay pronóstico ahora. Los datos históricos de arriba siguen valiendo.</p>'; return; }
  const d = f.daily;
  const sum = (arr, n) => arr.slice(0, n).reduce((a, b) => a + (b || 0), 0);
  const rain7 = sum(d.precipitation_sum, 7);
  const rain14 = sum(d.precipitation_sum, 14);
  const et7 = sum(d.et0_fao_evapotranspiration, 7);
  const mins = d.temperature_2m_min.slice(0, 7);
  const tmin = Math.min(...mins);
  const tminDay = new Date(`${d.time[mins.indexOf(tmin)]}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric" });
  const heavy = state.result.calendar.heavyRainMm;
  const lines = [];
  let message;
  if (rain7 >= heavy) {
    message = `Lluvia fuerte: ${num(rain7)} mm en 7 días. Una semana así pasó solo 1 de cada 10 veces en 45 años. Limpiar canales y revisar desbordes.`;
    lines.push(notice("alert", "!", message));
  } else if (rain7 < 5) {
    message = `Semana seca: ${num(rain7, 1)} mm de lluvia y ${num(et7)} mm de evaporación en 7 días. Si hay cultivo en el campo, toca regar.`;
    lines.push(notice("warn", "!", message));
  } else {
    message = `Lluvia prevista: ${num(rain7)} mm en 7 días.`;
    lines.push(notice("ok", "✓", message));
  }
  lines.push(notice(rain14 >= 2 * heavy ? "alert" : "ok", rain14 >= 2 * heavy ? "!" : "✓", `En 14 días se esperan ${num(rain14)} mm.`));
  let frost = "";
  if (tmin <= 0) { frost = `Puede helar: mínima de ${num(tmin, 1)} °C el ${tminDay}. Proteger los cultivos tiernos.`; lines.push(notice("alert", "!", frost)); }
  else if (tmin <= 3) { frost = `Noches frías: mínima de ${num(tmin, 1)} °C el ${tminDay}.`; lines.push(notice("warn", "!", frost)); }
  const place = state.site.gamc && state.site.gamc.distritos && state.site.gamc.distritos.Distrito ? `distrito ${state.site.gamc.distritos.Distrito}` : "Cochabamba";
  const text = `Aviso para regantes, ${place}: ${message} En 14 días: ${num(rain14)} mm. ${frost} Fuente: Open-Meteo y NASA POWER.`.replace(/\s+/g, " ");
  $("forecast").innerHTML = `${lines.join("")}
    <a class="share" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Enviar aviso por WhatsApp</a>
    <p class="hint">Pronóstico de Open-Meteo, que no es un dato de la NASA. La comparación usa la lluvia semanal de NASA POWER.</p>`;
}

// ---------- Calendar ----------
function renderCalendar() {
  const cal = state.result.calendar.weeks;
  $("calendar").hidden = false;
  const col = 13;
  const left = 4;
  const width = left + WEEKS * col + 4;
  const maxRain = Math.max(...cal.map((w) => w.rainMean), 1);
  let s = "";
  let lastMonth = -1;
  cal.forEach((w, i) => {
    const x = left + i * col;
    const m = weekDate(i).month;
    if (m !== lastMonth) { s += `<text x="${x}" y="11" font-size="11" fill="var(--soil-soft)">${MONTHS[m]}</text>`; lastMonth = m; }
    const hRain = (w.rainMean / maxRain) * 46;
    s += `<rect x="${x}" y="${(64 - hRain).toFixed(1)}" width="${col - 2}" height="${hRain.toFixed(1)}" fill="#8cc4d6"><title>${weekLabel(i)}: lluvia media ${num(w.rainMean)} mm</title></rect>`;
    s += `<rect x="${x}" y="70" width="${col - 2}" height="16" fill="var(--frost)" fill-opacity="${w.pFrost ? (0.15 + 0.85 * w.pFrost).toFixed(2) : 0.05}"><title>${weekLabel(i)}: helada en ${pct(w.pFrost)} de los años</title></rect>`;
    s += `<rect x="${x}" y="90" width="${col - 2}" height="16" fill="var(--maize)" fill-opacity="${(0.08 + 0.92 * w.pDry).toFixed(2)}"><title>${weekLabel(i)}: semana seca en ${pct(w.pDry)} de los años</title></rect>`;
  });
  const now = left + currentWeek() * col + (col - 2) / 2;
  s += `<line x1="${now}" y1="14" x2="${now}" y2="110" stroke="var(--alert)" stroke-width="2"/><text x="${now + 4}" y="24" font-size="11" font-weight="700" fill="var(--alert)">hoy</text>`;
  $("calendar-body").innerHTML = `<svg class="chart" width="${width}" height="114" viewBox="0 0 ${width} 114" role="img" aria-label="Lluvia media, riesgo de helada y semanas secas por semana del año">${s}</svg>`;
  $("calendar-legend").innerHTML = `
    <li><i style="background:#8cc4d6"></i>Lluvia media de la semana</li>
    <li><i style="background:var(--frost)"></i>Helada (0 °C o menos)</li>
    <li><i style="background:var(--maize)"></i>Semana seca (menos de 5 mm)</li>`;
  const frostWeeks = cal.filter((w) => w.pFrost >= 0.2);
  const peak = Math.max(...cal.map((w) => w.pFrost));
  const frostText = frostWeeks.length
    ? `Las heladas se concentran entre el ${weekLabel(frostWeeks[0].week)} y el ${weekLabel(frostWeeks[frostWeeks.length - 1].week + 1)}.`
    : `A esta altitud los datos casi no registran heladas (como mucho ${pct(peak)} de los años en una semana). En el fondo del valle pueden quedar subestimadas.`;
  const valid = state.result.onset.days_after_1_october.filter((x) => x !== null).sort((a, b) => a - b);
  const medianOnset = valid[Math.floor(valid.length / 2)];
  const onsetWeek = Math.floor((273 + medianOnset) / 7) % WEEKS;
  let p = $("calendar-note");
  if (!p) { p = document.createElement("p"); p.id = "calendar-note"; p.className = "hint"; $("calendar").append(p); }
  p.textContent = `${frostText} Las lluvias firmes suelen empezar hacia el ${weekLabel(onsetWeek)}.`;
}

// ---------- Land: hazards, soil, current conditions, money ----------
function loadPlot(site) {
  state.plot = null;
  state.soil = undefined;
  const at = `lat=${site.lat.toFixed(5)}&lon=${site.lon.toFixed(5)}`;
  loadJson(`/api/plot?${at}`).then((p) => { if (state.site === site) { state.plot = p; renderLand(); } }).catch(() => {});
  loadJson(`/api/soil?${at}`).then((r) => { if (state.site === site) { state.soil = r.soil; renderLand(); } })
    .catch(() => { if (state.site === site) { state.soil = null; renderLand(); } });
}

function renderLand() {
  if (!state.result || !state.site) return;
  const remote = state.plot || {};
  const plot = {
    altitude: state.site.altitude, slope: remote.slope || null, soil: state.soil || null,
    gamc: remote.gamc || state.site.gamc, forecast: remote.forecast || null, conditions: remote.conditions || null,
  };
  const a = assessPlot(plot, state.result, crops);
  $("land").hidden = false;
  const icon = { 3: "!", 2: "!", 1: "✓" };
  const kind = { 3: "alert", 2: "warn", 1: "ok" };
  $("land-hazards").innerHTML = a.hazards.map((h) => `
    <div class="notice notice--${kind[h.level]}"><span class="notice__icon" aria-hidden="true">${icon[h.level]}</span>
      <div><p><b>${esc(h.title)}: riesgo ${h.levelLabel}.</b> ${esc(h.text)}</p><p>${esc(h.action)}</p><p class="source">${esc(h.source)}</p></div>
    </div>`).join("") + (plot.slope ? "" : '<p class="hint">Sin dato de pendiente todavía: faltan los riesgos de erosión y anegamiento.</p>');

  $("land-avoid").innerHTML = a.avoid.length
    ? `<h3>Lo que no conviene sembrar aquí</h3>${list(a.avoid.map((x) => `<b>${esc(x.name)}</b>: ${esc(x.reasons.join("; "))}.`))}`
    : "<h3>Lo que no conviene sembrar aquí</h3><p class=\"hint\">Con estos datos, ningún cultivo de la lista queda descartado.</p>";

  if (state.soil === undefined) $("land-soil").innerHTML = '<h3>Suelo y abono</h3><p class="hint">Consultando el suelo…</p>';
  else if (!state.soil) $("land-soil").innerHTML = "";
  else {
    const s = state.soil;
    $("land-soil").innerHTML = `<h3>Suelo y abono</h3>
      <div class="facts">
        <div class="fact"><b>${s.ph === null ? "s/d" : num(s.ph, 1)}</b><span>pH</span></div>
        <div class="fact"><b>${esc(s.texture || "s/d")}</b><span>textura</span></div>
        <div class="fact"><b>${s.soc_gkg === null ? "s/d" : num(s.soc_gkg)}</b><span>g de carbono orgánico por kg</span></div>
      </div>
      ${list(a.soilAdvice.map(esc))}
      <p class="source">${esc(s.source)}, ${esc(s.depth)}. Orientación general: un análisis de laboratorio define el abono y la cantidad.</p>`;
  }

  const c = plot.conditions;
  $("land-now").innerHTML = c ? `<h3>Cómo viene el clima</h3>
    <p>En los últimos 30 días llovieron <b>${num(c.rain30)} mm</b>; lo normal para estas fechas son ${num(c.rain30Normal)} mm.
    ${c.soilWetness === null ? "" : `La humedad del suelo en la zona de raíces está en ${num(c.soilWetness * 100)} % (lo normal: ${num(c.soilWetnessNormal * 100)} %).`}</p>
    <p class="source">${esc(c.source)}, hasta el ${esc(c.asOf)}. Dato preliminar: los últimos días se corrigen después.</p>` : "";
  renderMoney();
}

function renderMoney() {
  const pick = state.result ? selectedCrop() : null;
  if (!pick) { $("land-money").innerHTML = ""; return; }
  if ($("money-form")) { updateMoney(); return; }
  $("land-money").innerHTML = `<h3>¿Cuánto puedo ganar?</h3>
    <p class="hint">Terrax no tiene precios ni costos oficiales. Pon tus números y te muestra cómo pesa el riesgo.</p>
    <form class="calc" id="money-form">
      <label>Cosecha esperada<input type="number" id="m-yield" min="0" step="any" inputmode="decimal" placeholder="por ejemplo 120 quintales"></label>
      <label>Precio por unidad (Bs)<input type="number" id="m-price" min="0" step="any" inputmode="decimal"></label>
      <label>Costos de la campaña (Bs)<input type="number" id="m-cost" min="0" step="any" inputmode="decimal"></label>
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
  if (!(y > 0) || !(p > 0)) { out.innerHTML = `<p class="hint">Cultivo: ${esc(pick.year.name.toLowerCase())}.</p>`; return; }
  const income = y * p;
  const frost = pick.data.frostProb;
  const expected = (1 - frost) * income - cost;
  const bs = (x) => `${x < 0 ? "−" : ""}Bs ${num(Math.abs(Math.round(x)))}`;
  out.innerHTML = `<div class="facts">
      <div class="fact"><b>${bs(income - cost)}</b><span>en una campaña sin helada</span></div>
      <div class="fact"><b>${bs(-cost)}</b><span>si una helada daña todo</span></div>
      <div class="fact"><b>${bs(expected)}</b><span>promedio contando el riesgo</span></div>
    </div>
    <p class="hint">Para ${esc(pick.year.name.toLowerCase())}: helada dañina en ${pct(frost)} de las campañas (NASA POWER, ${state.result.site.period}). El promedio supone que la helada daña toda la cosecha.</p>`;
}

// ---------- Terra ----------
function renderTerra() {
  chips($("terra-suggestions"), TERRA_SUGGESTIONS.map((label) => ({ label })), { pressed: () => false, onClick: (s) => askTerra(s.label) });
  const log = $("terra-log");
  log.innerHTML = state.chat.map((m) => `<div class="bubble bubble--${m.role}"><p>${esc(m.content)}</p>${m.note ? `<p class="source">${esc(m.note)}</p>` : ""}</div>`).join("")
    + (state.asking ? '<div class="bubble bubble--assistant"><p>Terra está revisando tu parcela…</p></div>' : "");
  log.scrollTop = log.scrollHeight;
}

async function askTerra(question) {
  const text = question.trim();
  if (!text || state.asking) return;
  const history = state.chat.map(({ role, content }) => ({ role, content }));
  state.chat.push({ role: "user", content: text });
  state.asking = true;
  renderTerra();
  try {
    const r = await fetch("/api/terra", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text, lat: state.site ? state.site.lat : null, lon: state.site ? state.site.lon : null,
        history: [state.previous, state.last].filter(Boolean), irrigation: state.irrigation,
        priorities: [...state.priorities], messages: history.slice(-6),
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.answer) throw new Error(data.error || "sin respuesta");
    state.chat.push({ role: "assistant", content: data.answer, note: data.engine === "rules" ? "Respuesta automática con los datos de tu parcela." : `Respuesta redactada con IA (${data.model || data.engine}) a partir de tus datos.` });
  } catch {
    state.chat.push({ role: "assistant", content: "No pude responder ahora. Revisa tu conexión e intenta de nuevo.", note: "" });
  }
  state.asking = false;
  renderTerra();
}

// ---------- How it works ----------
function renderHow() {
  const mk = climate.onset.mann_kendall;
  const trend = mk.trend === "no trend"
    ? `no muestra una tendencia clara (Mann-Kendall, p = ${num(mk.p, 2)})`
    : `se mueve ${num(Math.abs(mk.slope_days_per_year) * 10, 1)} días por década (Mann-Kendall, p = ${num(mk.p, 2)})`;
  $("how").innerHTML = `
    <p>Cada rotación recibe hasta 100 puntos. La regla es fija y se puede revisar:</p>
    <table>
      <tr><th>Clima</th><td>45</td><td>Riesgo de helada dañina durante el ciclo y cuánta agua del cultivo cubre la lluvia.</td></tr>
      <tr><th>Rotación</th><td>30</td><td>No repetir familia, leguminosa después de un cultivo exigente y variedad de familias.</td></tr>
      <tr><th>Suelo</th><td>10</td><td>Valor neutro hasta tener el análisis de suelo de la parcela.</td></tr>
      <tr><th>Lo que te importa</th><td>15</td><td>Las prioridades que marcaste.</td></tr>
    </table>
    <p>De dónde salen los datos:</p>
    <ul>
      <li>Clima: NASA POWER, datos diarios de ${esc(climate.meta.period.replace(" to ", " a "))}. Temperatura mínima, lluvia, radiación, humedad y viento, en una celda de 0,5 × 0,625 grados que cubre todo el municipio.</li>
      <li>Altitud: NASA SRTM de 30 m, para ajustar la temperatura a razón de 0,65 °C cada 100 m.</li>
      <li>Agua del cultivo: evapotranspiración de referencia con el método Penman-Monteith de FAO-56, multiplicada por el coeficiente de cada cultivo.</li>
      <li>Zonas periurbanas, drenaje y distritos: geoservicios del Gobierno Autónomo Municipal de Cochabamba.</li>
      <li>Pronóstico de 7 y 14 días: Open-Meteo.</li>
    </ul>
    <p>Límites que conviene saber: una celda tan grande suaviza las heladas del fondo del valle; todavía no entran la humedad de suelo de SMAP ni la lluvia de GPM IMERG; y los umbrales de helada y los coeficientes de cultivo son valores generales que un técnico debe confirmar.</p>
    <p>El inicio de las lluvias firmes ${trend} entre ${climate.onset.seasons[0]} y ${climate.onset.seasons[climate.onset.seasons.length - 1]}.</p>`;
}

// ---------- Scenario ----------
function bindSliders() {
  const rainText = (v) => (v === 0 ? "igual que siempre" : `${Math.abs(v)} % ${v < 0 ? "menos" : "más"}`);
  const tempText = (v) => (v === 0 ? "igual que siempre" : `${num(Math.abs(v), 1)} °C ${v < 0 ? "menos" : "más"}`);
  $("rain").addEventListener("input", (e) => { state.scenario.rainPct = Number(e.target.value); $("rain-out").textContent = rainText(state.scenario.rainPct); compute(); });
  $("temp").addEventListener("input", (e) => { state.scenario.tempC = Number(e.target.value); $("temp-out").textContent = tempText(state.scenario.tempC); compute(); });
}

// ---------- Start ----------
async function start() {
  try {
    [climate, crops, grid] = await Promise.all([loadJson("data/climate_weekly.json"), loadJson("data/crops.json"), loadJson("data/srtm_grid.json")]);
  } catch (error) {
    $("site").innerHTML = `<p class="site__empty">No se pudieron cargar los datos. ${esc(error.message)}. Recarga la página.</p>`;
    return;
  }
  initMap();
  renderForm();
  renderHow();
  bindSliders();
  renderTerra();
  $("terra-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("terra-input");
    askTerra(input.value);
    input.value = "";
  });
  $("compare").addEventListener("click", () => {
    compute();
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

start();
