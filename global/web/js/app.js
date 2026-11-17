// Yatiri X: landing page, step-by-step plot set-up, analysis and the Tiri assistant. Vanilla JS, no build step.
import { WEEKS, explain, recommend } from "./engine.js";
import { assessPlot, elevationFromGrid } from "./assess.js";
import { applyLanguage, t, QU_CROPS, QU_VALUES } from "./i18n.js";
import { setLanguage, setTerms } from "./translate.js";
import { initMotion, replay, splitWords, transition } from "./motion.js";
import { createClimateService } from "./climate_global.js";
import { avatarSVG, microphone, say, setFace, setVoice, speak, voiceEnabled } from "./tiri.js";
import * as cloud from "./cloud.js";
import { growthTimeline, radialYear, weatherScene } from "./viz.js";
import { LUNAR_FARMING, lunarSite } from "./moon.js";
import { GEOLOGY_CBBA, cochabambaZone, inBolivia, inCochabambaDept, legalBoliviaHtml, psiFromRas, renderBoliviaTab } from "./cochabamba.js";

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
// ---------- Simple view: plainer words, not only fewer ----------
const isSimple = () => state.mode === "simple";
const monthPart = (week) => {
  const d = weekDate(((week % WEEKS) + WEEKS) % WEEKS);
  return `${d.day <= 10 ? "a inicios de" : d.day <= 20 ? "a mediados de" : "a fines de"} ${MONTHS_LONG[d.month]}`;
};
const chance = (p) => (p >= 0.8 ? "Casi seguro" : p >= 0.5 ? "Probable" : p >= 0.2 ? "Puede pasar" : "Poco probable");
const rainWord = (p) => (p >= 0.7 ? "Llueve" : p >= 0.4 ? "Puede llover" : "Seco");
const LEVEL_SIMPLE = { 3: "Peligro", 2: "Cuidado", 1: "Bien" };
const SIMPLE_HAZARD = {
  frost: ["Heladas", "En tu zona hiela en las noches frías.", "Siembra cuando ya pasaron las heladas. En noches frías, tapa las plantas chicas."],
  drought: ["Falta de agua", "Hay meses en que casi no llueve.", "Guarda agua y, en esos meses, siembra lo que pide poca agua."],
  waterlogging: ["Agua estancada", "El agua de lluvia se puede juntar en tu terreno.", "Haz zanjas para que el agua salga. No siembres en la parte más baja."],
  erosion: ["La lluvia se lleva la tierra", "Tu terreno está en pendiente: la lluvia puede llevarse la tierra buena.", "Siembra en surcos a lo ancho de la pendiente y no dejes la tierra pelada."],
  frost_now: ["Helada en estos días", "En los próximos días puede helar.", "Tapa los almácigos y las plantas tiernas en la noche. Riega la tarde anterior."],
  rain_now: ["Lluvia fuerte esta semana", "Esta semana puede llover mucho.", "Limpia los canales y desagües antes de la lluvia."],
};
/** a hazard with plain words in the simple view */
function hz(h) {
  if (!isSimple() || !SIMPLE_HAZARD[h.id]) return h;
  const [title, text, action] = SIMPLE_HAZARD[h.id];
  return { ...h, title, text: h.level === 1 ? "Con los datos de hoy, no es un problema grande aquí." : text, action, levelLabel: LEVEL_SIMPLE[h.level].toLowerCase() };
}
/** a technical reason ("helada dañina en 40 % de las campañas") said simply */
function simpleReason(reason) {
  if (/helada/.test(reason)) return "aquí le cae helada";
  if (/lluvia/.test(reason)) return "la lluvia no le alcanza";
  if (/ácido|alcalino|pH/.test(reason)) return "tu tierra no le sirve";
  if (/riego/.test(reason)) return "necesita mucha agua";
  if (/calor/.test(reason)) return "aquí le falta calor";
  return reason;
}
const yearName = (y) => (y.group === "fallow" ? "dejar descansar la tierra" : y.name.toLowerCase());
function simpleLead(r) {
  const best = r.strategies[1];
  const first = best.years.find((y) => y.group !== "fallow");
  const order = ["Primer año", "Segundo año", "Tercer año"];
  return `Te conviene: ${best.years.map((y, i) => `${order[i].toLowerCase()}, ${yearName(y)}`).join("; ")}. ${first ? `Siembra ${first.name.toLowerCase()} ${monthPart(first.sowWeek)}.` : ""} Antes de decidir, conversa con un técnico de tu zona.`;
}
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric" });

const CROP_COLORS = {
  papa: "#8a5a2b", maiz: "#e0a100", haba: "#2f7d4a", arveja: "#7fb069", trigo: "#c98b2b", cebada: "#d9b86c",
  quinua: "#b0457a", alfalfa: "#1f6f78", cebolla: "#8e6bbf", tomate: "#c8452f", descanso: "#a89f91",
  oca: "#d9634c", papalisa: "#e3b23c", avena: "#bfa36a", amaranto: "#9e2a5e", frijol: "#6b3e26", tarwi: "#5b7fb5",
  vicia: "#4c8f6b", ajo: "#c9c2d6", locoto: "#d1352b", aji: "#e8772e", zanahoria: "#f08c2c", apio: "#8db55a",
  repollo: "#6fae7a", coliflor: "#e8dfc6", brocoli: "#2f6b3a", zapallo: "#e59a2f", pepino: "#3f8f4f", remolacha: "#8b1e3f",
  frutilla: "#e0394f", lechuga: "#9cc95e", espinaca: "#2e7d4f", acelga: "#5aa469", rabano: "#d64570", nabo: "#c7b8e0",
  cilantro: "#6dbb63",
};
const cropColor = (id) => CROP_COLORS[id] || "#8a8a8a";
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
// Shaded icons from img/icons.svg (inlined at start so their gradients and shadows work everywhere)
const icon = (name, size = 32) => `<svg class="ico" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
// The six modules of the AgroVision layout, in its order; each opens one section of the results.
const MODULES = [
  { id: "ubicacion", tab: "general", icon: "pin", label: "Ubicación del terreno" },
  { id: "suelo", tab: "suelo", icon: "soil", label: "Análisis del suelo" },
  { id: "clima", tab: "clima", icon: "suncloud", label: "Clima y pronóstico" },
  { id: "relieve", tab: "relieve", icon: "mountain", label: "Relieve y topografía" },
  { id: "agua", tab: "agua", icon: "drop", label: "Humedad y agua" },
  { id: "predicciones", tab: "predicciones", icon: "chart", label: "Predicciones" },
];
const TABS = ["general", "bolivia", "predicciones", "clima", "suelo", "relieve", "agua", "riesgos", "comparar", "cultivos", "catalogo", "plagas", "legal", "ganancias", "fuentes"];
// one colour per plot, so several plots can be told apart on the map and in the comparison table
const PLOT_COLORS = ["#ff8a3d", "#3d7bff", "#e8457f", "#1fb58f", "#f2b21b", "#8e5cd9", "#18a2b8", "#d64545", "#7cb342", "#8d6e63"];
// the crops most sown in the Cochabamba valleys are shown first; the rest are one tap away with a search box
const COMMON_CROPS = ["papa", "maiz", "haba", "trigo", "cebada", "quinua", "arveja", "frijol", "cebolla", "tomate", "zanahoria", "lechuga", "alfalfa", "avena", "oca", "durazno"];
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const cropById = (id) => crops.crops.find((c) => c.id === id);
const cropName = (id) => (cropById(id) || { name: id }).name;
const plainText = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const LOADING_STEPS = ["Descargando 45 años de clima de la NASA para tu punto del planeta", "Leyendo 45 años de clima de la NASA", "Midiendo el relieve de tu terreno", "Consultando las capas del municipio", "Revisando el pronóstico por escenarios", "Comparando todos los cultivos y miles de rotaciones"];
const LAYERS = [
  { id: "periurbanos", label: "Zonas periurbanas (GAMC)", on: true, kind: "gamc", opacity: 0.5 },
  { id: "drenaje", label: "Drenaje (GAMC)", on: false, kind: "gamc", opacity: 0.9 },
  { id: "distritos", label: "Distritos (GAMC)", on: true, kind: "gamc", opacity: 0.9 },
  { id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", label: "Humedad del suelo (NASA SMAP)", on: false, kind: "gibs", zoom: 6, opacity: 0.6 },
  { id: "IMERG_Precipitation_Rate", label: "Lluvia reciente (NASA GPM IMERG)", on: false, kind: "gibs", zoom: 6, opacity: 0.6 },
  { id: "MODIS_Terra_NDVI_8Day", label: "Verdor de la vegetación (NASA MODIS)", on: false, kind: "gibs", zoom: 9, opacity: 0.6 },
];
const TIRI_SUGGESTIONS = ["¿Qué siembro y cuándo?", "¿Qué hago esta semana?"];
const TIRI_HELLO = "¡Hola! Soy TIRI, tu asistente agrícola inteligente. Puedo ayudarte con cultivos, suelo, humedad, clima, relieve, riesgos y predicciones de tu parcela. Solo te oriento en temas agrícolas de Yatiri X.";
const STORE = "yatirix.v1";
// Small growing plant used while Tiri thinks (the full-screen loader has its own copy in index.html)
const PLANT_SVG = `<svg class="grow grow--small" viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="102" rx="34" ry="7" fill="#8a5a2b" opacity=".85"/><path class="grow__stem" pathLength="1" d="M60 100C60 86 58 72 60 52" fill="none" stroke="#4f7d2c" stroke-width="5" stroke-linecap="round"/><path class="grow__leaf grow__leaf--l" d="M60 80C47 79 39 70 37 61c11 0 20 7 23 19z" fill="url(#g-leaf)"/><path class="grow__leaf grow__leaf--r" d="M60 66c13-1 21-10 23-19-11 0-20 7-23 19z" fill="url(#g-leaf)"/><circle class="grow__bud" cx="60" cy="50" r="6" fill="#c06840"/></svg>`;

const state = {
  lang: "es", mode: "medio", step: 1, maxStep: 1, tab: "general",
  site: null, polygon: null, areaHa: null, drawMode: "point", basemap: "hibrido", draft: [], color: null,
  name: "", last: [], previous: [], customCrops: [], pickers: {}, soilType: null, labPh: null, labOm: null,
  waterSource: null, irrigSystem: null, waterAvail: null, moisture: null,
  priorities: new Set(["risk"]), preferred: new Set(),
  scenario: { rainPct: 0, tempC: 0 }, selected: "best", period: "7", catType: "Todos", catOnlyApt: false, catSort: "aptitud",
  result: null, plot: null, soil: null, outlook: null, assessment: null,
  pestView: "mis", pestKind: "todos", pestCrop: "", pestQuery: "", invKind: "todos",
  chat: [{ role: "assistant", content: TIRI_HELLO }], asking: false,
};
let climate;
// the bundled Cochabamba climate (live example) and the NASA POWER climate of any other point, computed here
let baseClimate;
const clientClimates = createClimateService({});
let crops;
let grid;
let knowledge;
let images = { crops: {}, pests: {}, invasive: {}, places: {} };
let cbbaPhotos = []; // real photos of Cochabamba for the loading screens
let map;
let miniMap;
let terrainView;
let soilView = null;
let marker;
let shape;
// cloud copy of the plots: config from /api/config, user once signed in
const account = { config: null, user: null, email: "", sent: false, busy: false, msg: "" };

// ---------- Storage (this device only) ----------
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { parcels: [], prefs: {} }; } catch { return { parcels: [], prefs: {} }; }
}
function writeStore(data) { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage off: the app still works */ } }
function savePrefs() { const s = readStore(); s.prefs = { lang: state.lang, mode: state.mode, basemap: state.basemap }; writeStore(s); }
function inputsSnapshot() {
  return {
    name: state.name, site: state.site && { lat: state.site.lat, lon: state.site.lon, label: state.site.label },
    polygon: state.polygon, areaHa: state.areaHa, last: state.last, previous: state.previous, soilType: state.soilType, color: state.color,
    customCrops: state.customCrops.filter((c) => [...state.last, ...state.previous, ...state.preferred].includes(c.id)),
    labPh: state.labPh, labOm: state.labOm, waterSource: state.waterSource, irrigSystem: state.irrigSystem,
    waterAvail: state.waterAvail, moisture: state.moisture, priorities: [...state.priorities], preferred: [...state.preferred],
  };
}
function saveParcel() {
  if (!state.site) return;
  const s = readStore();
  const id = state.parcelId || `p${Date.now()}`;
  if (!state.color) state.color = nextColor(id);
  state.parcelId = id;
  const entry = { id, savedAt: new Date().toISOString(), ...inputsSnapshot() };
  s.parcels = [entry, ...s.parcels.filter((p) => p.id !== id)].slice(0, 30);
  writeStore(s);
  renderSaved();
  if (account.user) cloud.push([entry]).catch(() => { account.msg = "No se pudo guardar en la nube; quedó en este equipo."; renderSaved(); });
}
function deleteParcel(id) {
  const s = readStore();
  s.parcels = s.parcels.filter((p) => p.id !== id);
  writeStore(s);
  if (state.parcelId === id) state.parcelId = null;
  renderSaved();
  if (account.user) cloud.remove(id).catch(() => { account.msg = "No se pudo quitar de la nube. Inténtalo de nuevo."; renderSaved(); });
}

// ---------- Account (optional): the same plots on any phone or computer ----------
async function syncFromCloud() {
  try {
    const remote = await cloud.pull();
    const s = readStore();
    const remoteById = new Map(remote.map((p) => [p.id, p]));
    // plots that are only here, or newer here than in the cloud, go up
    const toPush = s.parcels.filter((p) => !remoteById.has(p.id) || new Date(p.savedAt || 0) > new Date(remoteById.get(p.id).savedAt || 0));
    s.parcels = cloud.merge(s.parcels, remote).slice(0, 30);
    writeStore(s);
    await cloud.push(toPush);
    account.msg = `Sincronizado: ${s.parcels.length} terreno${s.parcels.length === 1 ? "" : "s"} en tu cuenta.`;
  } catch {
    account.msg = "No se pudo leer tu cuenta ahora. Tus terrenos siguen en este equipo.";
  }
  renderSaved();
}
async function startAccount() {
  if (!account.config) return;
  try {
    await cloud.connect(account.config);
  } catch (error) {
    account.msg = error.message;
    renderSaved();
    return;
  }
  if (!account.listening) {
    account.listening = true;
    cloud.onAuthChange((user, event) => {
      const was = account.user && account.user.id;
      account.user = user;
      if (user && user.id !== was) { account.sent = false; account.msg = "Sincronizando…"; syncFromCloud(); }
      if (!user && event === "SIGNED_OUT") account.msg = "Sesión cerrada. Los terrenos siguen en este equipo.";
      renderSaved();
    });
  }
  if (/access_token=|error_description=/.test(location.hash)) {
    if (/error_description=/.test(location.hash)) account.msg = "El enlace venció o ya se usó. Pide uno nuevo.";
    history.replaceState(null, "", location.pathname + location.search);
  }
  renderSaved();
}
function accountHtml() {
  if (!account.config) return "";
  const msg = account.msg ? `<p class="hint small" role="status">${esc(account.msg)}</p>` : "";
  if (account.user) {
    return `<div class="account account--in">
      <p class="account__who">${icon("check", 18)} Cuenta: <strong>${esc(account.user.email)}</strong>. Tus terrenos también se guardan en la nube y los ves en cualquier equipo.</p>
      <div class="saved__tools"><button type="button" class="btn btn--small btn--ghost" id="acc-sync">Sincronizar</button><button type="button" class="btn btn--small btn--ghost" id="acc-out">Cerrar sesión</button></div>
      ${msg}
    </div>`;
  }
  const form = account.sent
    ? `<form id="acc-code" class="account__row">
        <p class="small">Te enviamos un enlace a <strong>${esc(account.email)}</strong>. Ábrelo en este equipo. Si el correo trae un código de 6 dígitos, escríbelo aquí:</p>
        <input id="acc-token" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" aria-label="Código del correo">
        <button class="btn btn--small" type="submit"${account.busy ? " disabled" : ""}>Entrar</button>
        <button class="link" type="button" id="acc-again">Usar otro correo</button>
      </form>`
    : `<form id="acc-form" class="account__row">
        <input id="acc-email" type="email" autocomplete="email" required placeholder="tu@correo.com" aria-label="Correo electrónico" value="${esc(account.email)}">
        <button class="btn btn--small" type="submit"${account.busy ? " disabled" : ""}>${account.busy ? "Enviando…" : "Enviarme el enlace"}</button>
      </form>`;
  return `<details class="account"${account.sent || account.msg ? " open" : ""}>
    <summary>Guardar mis terrenos en una cuenta (opcional)</summary>
    <p class="hint small">Con tu correo ves tus terrenos en cualquier teléfono o computadora. Solo tú puedes verlos. No hay contraseña: te llega un enlace.</p>
    ${form}
    ${msg}
  </details>`;
}
function bindAccount(box) {
  const form = box.querySelector("#acc-form");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    account.email = $("acc-email").value.trim();
    account.busy = true; account.msg = ""; renderSaved();
    try {
      await startAccount();
      await cloud.sendLink(account.email);
      account.sent = true;
    } catch (error) {
      account.msg = /rate|limit|seconds/i.test((error && error.message) || "")
        ? "Se enviaron muchos correos seguidos. Espera un rato y vuelve a intentar."
        : "No se pudo enviar el correo. Revisa la dirección e inténtalo de nuevo.";
    }
    account.busy = false; renderSaved();
  });
  const code = box.querySelector("#acc-code");
  if (code) code.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("acc-token").value.replace(/\D/g, "");
    if (!token) return;
    account.busy = true; renderSaved();
    try { await cloud.verifyCode(account.email, token); account.msg = ""; } catch { account.msg = "Ese código no sirve o ya venció. Usa el enlace del correo o pide otro."; }
    account.busy = false; renderSaved();
  });
  const again = box.querySelector("#acc-again");
  if (again) again.addEventListener("click", () => { account.sent = false; account.msg = ""; renderSaved(); });
  const out = box.querySelector("#acc-out");
  if (out) out.addEventListener("click", () => cloud.signOut());
  const sync = box.querySelector("#acc-sync");
  if (sync) sync.addEventListener("click", () => { account.msg = "Sincronizando…"; renderSaved(); syncFromCloud(); });
}
/** First colour not used by another saved plot. */
function nextColor(exceptId) {
  const used = new Set(readStore().parcels.filter((x) => x.id !== exceptId).map((x) => x.color));
  return PLOT_COLORS.find((c) => !used.has(c)) || PLOT_COLORS[readStore().parcels.length % PLOT_COLORS.length];
}
/** Crops typed as "Otro" join the catalogue for this visit (and travel with the plot that uses them). */
function addCustomCrops(list) {
  for (const c of list || []) {
    if (!c || !c.id || cropById(c.id)) continue;
    const at = crops.crops.findIndex((x) => x.group === "fallow");
    crops.crops.splice(at < 0 ? crops.crops.length : at, 0, c);
    if (!state.customCrops.some((x) => x.id === c.id)) state.customCrops.push(c);
  }
  refreshTerms();
}
/** Start a new plot: everything empty and the next free colour. */
function newParcel() {
  Object.assign(state, {
    parcelId: null, name: "", site: null, polygon: null, areaHa: null, draft: [], last: [], previous: [], soilType: null, labPh: null, labOm: null,
    waterSource: null, irrigSystem: null, waterAvail: null, moisture: null, priorities: new Set(["risk"]), preferred: new Set(),
    result: null, plot: null, soil: null, outlook: null, assessment: null,
  });
  state.color = nextColor(null);
  for (const id of ["plot-name", "lab-ph", "lab-om", "moisture"]) $(id).value = "";
  if (marker) { marker.remove(); marker = null; }
  setDrawMode("point");
  renderSite();
  renderForm();
  drawSavedOnMap();
  goStep(1);
  $("wizard-msg").textContent = "Nuevo terreno: márcalo en el mapa. Tendrá otro color.";
}
function loadParcel(p) {
  addCustomCrops(p.customCrops);
  Object.assign(state, {
    parcelId: p.id, name: p.name || "", polygon: p.polygon, areaHa: p.areaHa, last: asList(p.last), previous: asList(p.previous), color: p.color || null,
    soilType: p.soilType, labPh: p.labPh, labOm: p.labOm, waterSource: p.waterSource, irrigSystem: p.irrigSystem,
    waterAvail: p.waterAvail, moisture: p.moisture, priorities: new Set(p.priorities || ["risk"]), preferred: new Set(p.preferred || []),
  });
  $("plot-name").value = state.name;
  $("lab-ph").value = state.labPh ?? "";
  $("lab-om").value = state.labOm ?? "";
  $("moisture").value = state.moisture ?? "";
  drawShape();
  drawSavedOnMap();
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
/** Elevation anywhere: the municipal grid inside Cochabamba, the server (Open Topo Data) elsewhere. */
async function altitudeAt(lat, lon) {
  const local = elevationAt(lat, lon);
  if (local !== null) return { altitude: local, local: true };
  const r = await loadJson(`/api/elevation?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, 15000);
  return { altitude: r.altitude, local: false };
}
/** NASA POWER climate of the plot's cell: computed in the browser (45 years, about 2 MB) and shared with the server. */
async function climateForSite(site) {
  if (site.local) return baseClimate;
  const c = await clientClimates.climateFor(site.lat, site.lon, site.altitude);
  fetch("/api/climate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: site.lat, lon: site.lon, altitude: site.altitude, climate: c }) }).catch(() => {});
  return c;
}
const irrigation = () => Boolean(state.waterSource && state.waterSource !== "rain" && state.irrigSystem && state.irrigSystem !== "none");

// ---------- Views ----------
function show(view) {
  transition(() => {
    for (const v of ["home", "wizard", "results"]) $(`view-${v}`).hidden = v !== view;
    window.scrollTo({ top: 0 });
  });
  if (view === "wizard") { initMap(); setTimeout(() => map && map.invalidateSize(), 50); }
  replay($(`view-${view}`));
}

// ---------- Chips ----------
let justPicked = "";
function chips(container, items, { pressed, onClick, dot }) {
  container.replaceChildren(...items.map((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("aria-pressed", String(Boolean(pressed(item))));
    if (justPicked === `${container.id}:${item.label}`) b.classList.add("chip--just");
    if (dot) {
      const i = document.createElement("span");
      i.className = "chip__dot";
      i.style.background = dot(item);
      b.append(i);
    }
    b.append(item.label);
    b.addEventListener("click", () => { justPicked = `${container.id}:${item.label}`; onClick(item); });
    return b;
  }));
}

/** Several crops can be marked; "+ Otro" asks Gemini for the values of a crop that is not in the list. */
function cropPicker(boxId, key, { allowNone = false } = {}) {
  const box = $(boxId);
  const selected = new Set(key === "preferred" ? [...state.preferred] : state[key]);
  const ui = state.pickers[boxId] || (state.pickers[boxId] = { open: false, query: "", other: false, busy: false, msg: "", name: "" });
  const all = crops.crops.filter((c) => c.group !== "fallow");
  const chip = (c) => `<button type="button" class="chip${justPicked === `${boxId}:${c.id}` ? " chip--just" : ""}" data-crop="${esc(c.id)}" aria-pressed="${selected.has(c.id)}"><span class="chip__dot" style="background:${cropColor(c.id) || "transparent"}"></span>${esc(c.name)}${c.custom ? ' <span class="chip__ai">IA</span>' : ""}</button>`;
  const first = [...COMMON_CROPS.map(cropById).filter(Boolean), ...all.filter((c) => selected.has(c.id) && !COMMON_CROPS.includes(c.id))];
  const q = plainText(ui.query);
  const rest = all.filter((c) => !first.includes(c) && (!q || plainText(c.name).includes(q) || plainText(c.type).includes(q)));
  box.innerHTML = `
    <div class="chips">${allowNone ? `<button type="button" class="chip" data-none aria-pressed="${selected.size === 0}">No recuerdo</button>` : ""}${first.map(chip).join("")}
      <button type="button" class="chip chip--other" data-other aria-expanded="${ui.other}">+ Otro</button></div>
    ${ui.other ? `<div class="other-crop">
        <input type="text" maxlength="40" value="${esc(ui.name)}" placeholder="Escribe qué sembraste" aria-label="Nombre del cultivo">
        <button type="button" class="btn btn--small btn--primary" data-other-go${ui.busy ? " disabled" : ""}>${ui.busy ? "Analizando…" : "Analizar con IA"}</button>
        <p class="hint small">Tiri estima con IA el ciclo, el agua, la helada y el suelo que pide, para analizarlo como los demás. Verifícalo con un técnico.</p>
        ${ui.msg ? `<p class="hint small" role="status">${esc(ui.msg)}</p>` : ""}
      </div>` : ""}
    <details class="more-crops"${ui.open ? " open" : ""}><summary>Ver todos los cultivos (${all.length})</summary>
      <input type="search" class="crop-search" value="${esc(ui.query)}" placeholder="Buscar un cultivo" aria-label="Buscar un cultivo">
      <div class="chips chips--small">${rest.map(chip).join("") || '<p class="hint small">Ningún cultivo con ese nombre. Usa «+ Otro».</p>'}</div>
    </details>`;
  const set = (ids) => { if (key === "preferred") state.preferred = new Set(ids); else state[key] = ids; renderForm(); };
  box.querySelectorAll("[data-crop]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.crop;
    justPicked = `${boxId}:${id}`;
    set(selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id]);
  }));
  const none = box.querySelector("[data-none]");
  if (none) none.addEventListener("click", () => set([]));
  box.querySelector("[data-other]").addEventListener("click", () => { ui.other = !ui.other; ui.msg = ""; renderForm(); const i = box.querySelector(".other-crop input"); if (i) i.focus(); });
  const details = box.querySelector("details");
  details.addEventListener("toggle", () => { ui.open = details.open; });
  const search = box.querySelector(".crop-search");
  search.addEventListener("input", () => {
    ui.query = search.value;
    const pos = search.selectionStart;
    renderForm();
    const again = $(boxId).querySelector(".crop-search");
    again.focus();
    again.setSelectionRange(pos, pos);
  });
  const go = box.querySelector("[data-other-go]");
  if (go) {
    const input = box.querySelector(".other-crop input");
    input.addEventListener("input", () => { ui.name = input.value; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
    go.addEventListener("click", async () => {
      ui.name = input.value.trim();
      if (!ui.name) return;
      ui.busy = true; ui.msg = ""; renderForm();
      try {
        const r = await fetch("/api/crop-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ui.name }) });
        const data = await r.json();
        if (!r.ok || !data.crop) throw new Error(data.error || "No pude analizar ese cultivo ahora.");
        addCustomCrops([data.crop]);
        ui.other = false; ui.name = "";
        ui.busy = false;
        set([...new Set([...(key === "preferred" ? [...state.preferred] : state[key]), data.crop.id])]);
        return;
      } catch (error) {
        ui.msg = error.message;
      }
      ui.busy = false;
      renderForm();
    });
  }
}
function renderForm() {
  cropPicker("last-crop", "last");
  cropPicker("previous-crop", "previous", { allowNone: true });
  chips($("soil-type"), SOIL_TYPES, { pressed: (o) => state.soilType === o.id, onClick: (o) => { state.soilType = o.id; renderForm(); } });
  chips($("water-source"), WATER_SOURCES, { pressed: (o) => state.waterSource === o.id, onClick: (o) => { state.waterSource = o.id; if (o.id === "rain") state.irrigSystem = "none"; renderForm(); } });
  chips($("irrig-system"), IRRIG_SYSTEMS, { pressed: (o) => state.irrigSystem === o.id, onClick: (o) => { state.irrigSystem = o.id; renderForm(); } });
  chips($("water-avail"), WATER_AVAIL, { pressed: (o) => state.waterAvail === o.id, onClick: (o) => { state.waterAvail = o.id; renderForm(); } });
  chips($("priorities"), PRIORITIES, {
    pressed: (p) => state.priorities.has(p.id),
    onClick: (p) => { state.priorities.has(p.id) ? state.priorities.delete(p.id) : state.priorities.add(p.id); renderForm(); },
  });
  $("preferred-field").hidden = !state.priorities.has("preferred");
  cropPicker("preferred", "preferred");
  renderStepper();
}

// ---------- Wizard ----------
function stepValid(step) {
  if (step === 1) return state.site ? "" : "Marca tu terreno en el mapa, usa el GPS o busca tu comunidad.";
  if (step === 2) return state.last.length ? "" : "Marca al menos un cultivo de la última campaña.";
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
  const dir = n < state.step ? "prev" : "next";
  state.step = Math.max(1, Math.min(5, n));
  state.maxStep = Math.max(state.maxStep, state.step);
  document.querySelectorAll(".step").forEach((s) => { s.hidden = Number(s.dataset.step) !== state.step; });
  $("prev").disabled = state.step === 1;
  $("next").hidden = state.step === 5;
  $("wizard-msg").textContent = "";
  if (state.step === 1 && map) setTimeout(() => map.invalidateSize(), 50);
  if (state.step === 5) renderReview();
  renderStepper();
  const current = document.querySelector(`.step[data-step="${state.step}"]`);
  if (current) { current.dataset.dir = dir; replay(current); }
}
function nextStep() {
  const problem = stepValid(state.step);
  if (problem) { $("wizard-msg").textContent = problem; return; }
  if (state.step === 1) { state.name = $("plot-name").value.trim(); saveParcel(); }
  goStep(state.step + 1);
}
function renderReview() {
  const label = (arr, id) => (arr.find((o) => o.id === id) || {}).label || "Sin dato";
  const names = (ids) => (ids.length ? ids.map((id) => esc(cropName(id))).join(", ") : "Sin dato");
  const rows = [
    ["Terreno", `${esc(state.name || "Sin nombre")}${state.areaHa ? `, ${num(state.areaHa, 2)} ha` : ""}`],
    ["Ubicación", state.site ? `${state.site.lat.toFixed(4)}, ${state.site.lon.toFixed(4)} · ${num(state.site.altitude)} m` : "Sin dato"],
    ["Última campaña", names(state.last)], ["Campaña anterior", names(state.previous)],
    ["Suelo", label(SOIL_TYPES, state.soilType) + (state.labPh ? ` · pH ${state.labPh}` : "")],
    ["Agua", `${label(WATER_SOURCES, state.waterSource)} · ${label(IRRIG_SYSTEMS, state.irrigSystem)} · ${label(WATER_AVAIL, state.waterAvail)}`],
    ["Prioridades", [...state.priorities].map((p) => label(PRIORITIES, p)).join(", ") || "Sin dato"],
  ];
  $("review").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

// ---------- Map ----------
const BASEMAPS = [
  { id: "hibrido", label: "Satélite con nombres" },
  { id: "satelite", label: "Satélite" },
  { id: "normal", label: "Mapa normal" },
  { id: "relieve", label: "Relieve" },
];
const DRAW_MODES = [
  { id: "point", label: "Un punto", icon: "pin", hint: "Toca el mapa en el centro de tu terreno." },
  { id: "corners", label: "Por esquinas", icon: "map", hint: "Toca cada esquina de tu terreno, una por una. Al final pulsa «Listo»." },
  { id: "free", label: "Con el dedo o el mouse", icon: "leaf", hint: "Mantén presionado y recorre el borde de tu terreno sin soltar. Al soltar, se cierra solo." },
];
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
function basemapLayers(id) {
  const imagery = () => L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" });
  if (id === "satelite") return [imagery()];
  if (id === "hibrido") {
    return [imagery(),
      L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, opacity: 0.8 }),
      L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 })];
  }
  if (id === "relieve") return [L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, subdomains: "abc", attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap" })];
  return [L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" })];
}
let baseLayers = [];
function setBasemap(id) {
  state.basemap = id;
  if (map) {
    baseLayers.forEach((l) => l.remove());
    baseLayers = basemapLayers(id).map((l) => l.addTo(map));
    baseLayers.slice().reverse().forEach((l) => l.bringToBack());
  }
  renderMapTools();
  savePrefs();
}

function initMap() {
  if (map || !grid) return;
  const box = $("map");
  if (!window.L) { box.innerHTML = '<p class="hint" style="padding:1rem">El mapa no cargó. Usa el GPS o el buscador.</p>'; return; }
  const bounds = [[grid.min_lat, grid.min_lon], [grid.max_lat, grid.max_lon]];
  map = L.map(box, { minZoom: 2, worldCopyJump: true }).fitBounds(bounds);
  setBasemap(state.basemap || "hibrido");
  for (const layer of LAYERS) {
    layer.leaflet = layer.kind === "gamc"
      ? L.tileLayer.wms(`/api/gamc/wms?layer=${layer.id}`, { layers: "", format: "image/png", transparent: true, version: "1.1.1", opacity: layer.opacity, zIndex: 5, attribution: "GAMC" })
      : L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/default/GoogleMapsCompatible_Level${layer.zoom}/{z}/{y}/{x}.png`, {
        maxNativeZoom: layer.zoom, maxZoom: 19, opacity: layer.opacity, zIndex: 4, attribution: "NASA GIBS",
      });
    if (layer.on) layer.leaflet.addTo(map);
  }
  map.on("click", (e) => {
    if (state.drawMode === "free") return;
    if (state.drawMode === "corners") { state.draft.push([e.latlng.lat, e.latlng.lng]); drawShape(); return; }
    selectSite(e.latlng.lat, e.latlng.lng, null);
  });
  initFreehand(box);
  renderLayerToggles();
  drawSavedOnMap();
  setDrawMode(state.drawMode || "point");
  if (state.site) selectSite(state.site.lat, state.site.lon, state.site.label);
}

// Freehand: press and trace the border with a finger or the mouse; the map stops panning meanwhile.
function initFreehand(box) {
  let path = null;
  let px = null;
  let line = null;
  box.addEventListener("pointerdown", (ev) => {
    if (state.drawMode !== "free" || ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    try { box.setPointerCapture(ev.pointerId); } catch { /* the trace still works without capture */ }
    const ll = map.mouseEventToLatLng(ev);
    path = [[ll.lat, ll.lng]];
    px = [[ev.clientX, ev.clientY]];
    if (line) line.remove();
    line = L.polyline(path, { color: "#ff8a3d", weight: 4 }).addTo(map);
  }, true);
  box.addEventListener("pointermove", (ev) => {
    if (!path) return;
    const [x0, y0] = px[px.length - 1];
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    const ll = map.mouseEventToLatLng(ev);
    path.push([ll.lat, ll.lng]);
    px.push([ev.clientX, ev.clientY]);
    line.setLatLngs(path);
  });
  const end = () => {
    if (!path) return;
    const pts = simplifyPath(path, px, 5);
    path = null;
    if (line) { line.remove(); line = null; }
    if (pts.length < 3) { $("wizard-msg").textContent = "El trazo fue muy corto. Recorre todo el borde de tu terreno sin soltar."; return; }
    $("wizard-msg").textContent = "";
    state.draft = pts;
    finishDrawing();
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
}
/** Douglas-Peucker on screen pixels: the shape keeps its corners and loses the jitter of the hand. */
function simplifyPath(pts, px, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let dist = tol;
    const [ax, ay] = px[a];
    const [bx, by] = px[b];
    const len = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const d = len < 1 ? Math.hypot(px[i][0] - ax, px[i][1] - ay) : Math.abs((by - ay) * px[i][0] - (bx - ax) * px[i][1] + bx * ay - by * ax) / len;
      if (d > dist) { dist = d; best = i; }
    }
    if (best > 0) { keep[best] = true; stack.push([a, best], [best, b]); }
  }
  const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  // the hand usually closes the loop on top of the first point: drop that duplicate
  const last = idx[idx.length - 1];
  if (idx.length > 3 && Math.hypot(px[last][0] - px[0][0], px[last][1] - px[0][1]) < 20) idx.pop();
  return idx.map((i) => pts[i]).slice(0, 80);
}
function setDrawMode(id) {
  state.drawMode = id;
  state.draft = [];
  if (map) {
    const free = id === "free";
    if (free) { map.dragging.disable(); map.doubleClickZoom.disable(); } else { map.dragging.enable(); map.doubleClickZoom.enable(); }
    $("map").classList.toggle("map--freehand", free);
  }
  drawShape();
}
function renderLayerToggles() {
  chips($("layer-toggles"), LAYERS, {
    pressed: (l) => l.on,
    onClick: (l) => { l.on = !l.on; if (map) (l.on ? l.leaflet.addTo(map) : l.leaflet.remove()); renderLayerToggles(); },
  });
}
function renderMapTools() {
  const bm = $("basemaps");
  if (bm) {
    bm.innerHTML = BASEMAPS.map((b) => `<button type="button" data-basemap="${b.id}" aria-pressed="${(state.basemap || "hibrido") === b.id}">${esc(b.label)}</button>`).join("");
    bm.querySelectorAll("[data-basemap]").forEach((b) => b.addEventListener("click", () => setBasemap(b.dataset.basemap)));
  }
  const dm = $("draw-modes");
  if (dm) {
    dm.innerHTML = DRAW_MODES.map((m) => `<button type="button" class="draw-mode" data-draw-mode="${m.id}" aria-pressed="${state.drawMode === m.id}">${icon(m.icon, 26)}<span>${esc(m.label)}</span></button>`).join("");
    dm.querySelectorAll("[data-draw-mode]").forEach((b) => b.addEventListener("click", () => setDrawMode(b.dataset.drawMode)));
  }
  const tools = $("map-tools");
  if (!tools) return;
  const corners = state.drawMode === "corners";
  const live = corners && state.draft.length >= 3 ? polygonArea(state.draft) : null;
  tools.innerHTML = `
    ${corners ? `<span class="map-tools__count">${state.draft.length === 1 ? "1 esquina" : `${state.draft.length} esquinas`}${live ? ` · ${num(live, 2)} ha` : ""}</span>
      <button class="btn btn--small" type="button" id="draw-undo" ${state.draft.length ? "" : "disabled"}>Quitar la última esquina</button>
      <button class="btn btn--small btn--primary" type="button" id="draw-done" ${state.draft.length >= 3 ? "" : "disabled"}>Listo</button>` : ""}
    ${state.polygon && !corners ? `<span class="map-tools__count">Terreno marcado: ${num(state.areaHa, 2)} ha. Mueve los puntos blancos para corregirlo.</span>
      <button class="btn btn--small btn--ghost" type="button" id="draw-clear">Borrar el dibujo</button>` : ""}`;
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  on("draw-undo", () => { state.draft.pop(); drawShape(); });
  on("draw-done", finishDrawing);
  on("draw-clear", () => { state.draft = []; state.polygon = null; state.areaHa = null; drawShape(); renderSite(); });
}
let savedLayer = null;
/** Every saved plot on the map at the same time, each with its colour; tap one to open it. */
function drawSavedOnMap() {
  if (!map) return;
  if (savedLayer) savedLayer.remove();
  savedLayer = L.layerGroup().addTo(map);
  for (const p of readStore().parcels) {
    if (p.id === state.parcelId) continue;
    const color = p.color || "#9e9e9e";
    const opts = { color, weight: 2, fillColor: color, fillOpacity: 0.28, bubblingMouseEvents: false };
    const layer = p.polygon && p.polygon.length >= 3 ? L.polygon(p.polygon, opts)
      : p.site ? L.circleMarker([p.site.lat, p.site.lon], { ...opts, radius: 8, color: "#fff", fillOpacity: 1 }) : null;
    if (!layer) continue;
    layer.bindTooltip(esc(p.name || "Sin nombre"), { sticky: true });
    layer.on("click", () => { if (state.drawMode === "point") loadParcel(p); });
    layer.addTo(savedLayer);
  }
}
function fitAllParcels() {
  if (!map) return;
  const pts = readStore().parcels.flatMap((p) => (p.polygon && p.polygon.length ? p.polygon : p.site ? [[p.site.lat, p.site.lon]] : []));
  if (state.polygon) pts.push(...state.polygon);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
}
let handles = [];
function drawShape() {
  const hint = $("map-hint");
  if (hint) hint.textContent = (DRAW_MODES.find((m) => m.id === state.drawMode) || DRAW_MODES[0]).hint;
  if (!map) { renderMapTools(); return; }
  if (shape) shape.remove();
  handles.forEach((h) => h.remove());
  handles = [];
  shape = null;
  const drafting = state.drawMode === "corners" && state.draft.length > 0;
  const pts = drafting ? state.draft : state.polygon;
  if (pts && pts.length) {
    shape = (drafting
      ? L.polyline(pts, { color: "#ff8a3d", weight: 3, dashArray: "6 6" })
      : L.polygon(pts, { color: state.color || "#ff8a3d", weight: 3, fillColor: state.color || "#93c572", fillOpacity: 0.3 })).addTo(map);
    // corner handles: numbered while marking, draggable afterwards to fix the shape
    pts.forEach((p, i) => {
      const h = L.marker(p, {
        draggable: !drafting,
        keyboard: false,
        icon: L.divIcon({ className: "vertex", html: drafting ? `<span>${i + 1}</span>` : "", iconSize: drafting ? [22, 22] : [18, 18] }),
      }).addTo(map);
      if (!drafting) {
        h.on("drag", (e) => { state.polygon[i] = [e.latlng.lat, e.latlng.lng]; shape.setLatLngs(state.polygon); });
        h.on("dragend", () => { state.areaHa = polygonArea(state.polygon); centerOnPolygon(); renderMapTools(); });
      }
      handles.push(h);
    });
  }
  renderMapTools();
}
function polygonArea(pts) {
  const lat0 = (pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180);
  const xy = pts.map(([la, lo]) => [6371000 * (lo * Math.PI / 180) * Math.cos(lat0), 6371000 * (la * Math.PI / 180)]);
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i]; const [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2 / 10000;
}
function centerOnPolygon() {
  const lat = state.polygon.reduce((a, p) => a + p[0], 0) / state.polygon.length;
  const lon = state.polygon.reduce((a, p) => a + p[1], 0) / state.polygon.length;
  selectSite(lat, lon, state.site && state.site.label);
}
function finishDrawing() {
  if (state.draft.length < 3) { $("wizard-msg").textContent = "Marca al menos tres esquinas."; return; }
  state.polygon = state.draft;
  state.areaHa = polygonArea(state.polygon);
  setDrawMode("point");
  centerOnPolygon();
}

async function selectSite(lat, lon, label) {
  lon = ((lon + 540) % 360) - 180;
  $("site").innerHTML = '<p class="hint">Leyendo la altura de ese punto del planeta…</p>';
  let where;
  try { where = await altitudeAt(lat, lon); } catch { $("site").innerHTML = '<p class="hint">No pude leer la altura de ese punto. Intenta de nuevo o elige otro.</p>'; return; }
  if (where.altitude < -5) { $("site").innerHTML = '<p class="hint">Ese punto está en el mar. Elige un terreno en tierra firme.</p>'; return; }
  state.site = { lat, lon, altitude: where.altitude, label, gamc: null, local: where.local, place: label || null };
  if (map) {
    if (marker) marker.remove();
    marker = L.circleMarker([lat, lon], { radius: 8, color: "#fff", weight: 3, fillColor: state.color || "#6b4423", fillOpacity: 1 }).addTo(map);
  }
  renderSite();
  renderStepper();
  const site = state.site;
  if (site.local) {
    try { site.gamc = await loadJson(`/api/gamc/info?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, 20000); } catch { site.gamc = null; }
  } else {
    site.place = site.place || await placeName(lat, lon);
  }
  if (state.site === site) renderSite();
}
/** Name of a place (town, region, country) from OpenStreetMap. */
async function placeName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: "jsonv2", lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: "10", "accept-language": ["qu", "ay", "gn"].includes(state.lang) ? "es" : state.lang })}`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const a = d.address || {};
    return [a.village || a.town || a.city || a.county || a.state_district, a.state, a.country].filter(Boolean).join(", ") || null;
  } catch { return null; }
}
function gamcDistrict(g) { return g && g.distritos && !g.distritos.error ? g.distritos : null; }
function gamcZone(g) { return g && g.periurbanos && !g.periurbanos.error ? g.periurbanos : null; }
function renderSite() {
  const s = state.site;
  if (!s) { $("site").innerHTML = ""; return; }
  const d = gamcDistrict(s.gamc);
  const z = gamcZone(s.gamc);
  // municipal (GAMC) layers only exist inside Cochabamba
  $("layer-toggles").querySelectorAll("button").forEach((btn) => { if (btn.textContent.includes("GAMC")) btn.hidden = !s.local; });
  if (!s.local) {
    $("site").innerHTML = `<dl class="site__grid">
      <div><dt>Lugar</dt><dd translate="no">${s.place ? esc(s.place) : "Consultando…"}</dd></div>
      <div><dt>Coordenadas</dt><dd>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</dd></div>
      <div><dt>Altitud</dt><dd>${num(s.altitude)} m</dd></div>
      <div><dt>Superficie</dt><dd>${state.areaHa ? `${num(state.areaHa, 2)} ha` : "Dibuja los límites para calcularla"}</dd></div>
    </dl>`;
    return;
  }
  $("site").innerHTML = `<dl class="site__grid">
      <div><dt>Distrito (GAMC)</dt><dd>${d ? `<span translate="no">${esc(d.Distrito)}, ${esc(String(d.Comuna).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</span>` : s.gamc ? "Sin dato" : "Consultando…"}</dd></div>
      <div><dt>Zona (GAMC)</dt><dd>${z ? esc(z.Periurbano) : s.gamc ? "Fuera de zonas periurbanas" : "Consultando…"}</dd></div>
      <div><dt>Altitud (NASA SRTM)</dt><dd>${num(s.altitude)} m</dd></div>
      <div><dt>Superficie</dt><dd>${state.areaHa ? `${num(state.areaHa, 2)} ha` : "Dibuja los límites para calcularla"}</dd></div>
    </dl>`;
}

async function searchPlaces(q) {
  const box = $("search-results");
  box.innerHTML = '<li class="hint">Buscando…</li>';
  const params = new URLSearchParams({
    format: "jsonv2", q, limit: "8",
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
  box.innerHTML = `${parcels.length ? `<h3>Mis terrenos guardados</h3><ul class="saved__list">${parcels.map((p) => `<li${p.id === state.parcelId ? ' class="is-current"' : ""}><span class="plot-dot" style="background:${esc(p.color || "#9e9e9e")}"></span><button type="button" class="link" data-load="${p.id}">${esc(p.name || "Sin nombre")}</button> <span class="hint">${new Date(p.savedAt).toLocaleDateString("es")}</span> <button type="button" class="link link--danger" data-del="${p.id}">Quitar</button></li>`).join("")}</ul>` : ""}
    <div class="saved__tools">
      ${parcels.length ? '<button type="button" class="btn btn--small" id="new-parcel">+ Nuevo terreno</button>' : ""}
      ${parcels.length > 1 ? '<button type="button" class="btn btn--small btn--ghost" id="fit-all">Ver todos en el mapa</button>' : ""}
      ${parcels.length ? '<button type="button" class="btn btn--small btn--ghost" id="export">Guardar copia en un archivo</button>' : ""}
      <label class="btn btn--small btn--ghost">Abrir una copia<input type="file" id="import" accept="application/json,.json" hidden></label>
    </div>
    <p class="hint small">${account.user ? "También queda una copia en este equipo. Si el equipo es compartido, quita los terrenos antes de cerrar sesión." : "Tus terrenos se guardan en este teléfono o computadora. Con «Guardar copia» los pasas a otro equipo."}</p>
    ${accountHtml()}`;
  box.querySelectorAll("[data-load]").forEach((b) => b.addEventListener("click", () => loadParcel(parcels.find((p) => p.id === b.dataset.load))));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteParcel(b.dataset.del)));
  bindAccount(box);
  const np = $("new-parcel");
  if (np) np.addEventListener("click", newParcel);
  const fa = $("fit-all");
  if (fa) fa.addEventListener("click", fitAllParcels);
  drawSavedOnMap();
  const exp = $("export");
  if (exp) exp.addEventListener("click", () => download(`yatirix-mis-terrenos-${new Date().toISOString().slice(0, 10)}.json`, { app: "Yatiri X", version: 1, parcels: readStore().parcels }));
  $("import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = (Array.isArray(data.parcels) ? data.parcels : []).filter((p) => p && p.id && p.site && Number.isFinite(p.site.lat) && Number.isFinite(p.site.lon));
      if (!incoming.length) throw new Error();
      const s = readStore();
      const ids = new Set(incoming.map((p) => p.id));
      s.parcels = [...incoming, ...s.parcels.filter((p) => !ids.has(p.id))].slice(0, 30);
      writeStore(s);
      renderSaved();
      if (account.user) cloud.push(incoming).catch(() => {});
      $("wizard-msg").textContent = `Se abrieron ${incoming.length} terrenos.`;
    } catch {
      $("wizard-msg").textContent = "Ese archivo no es una copia de Yatiri X.";
    }
  });
}
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function openTiri() {
  $("tiri-body").hidden = false;
  $("tiri-toggle").setAttribute("aria-expanded", "true");
  $("tiri-say").hidden = true;
}

// ---------- Tiri, the proactive agent ----------
/** Carries out what the agent decided to do in the page. */
async function runAction(a) {
  const x = a.args || {};
  if (a.name === "ui_open_tab" && state.result) { show("results"); setTab(x.tab); }
  else if (a.name === "ui_set_language" && x.code) setLang(x.code);
  else if (a.name === "ui_set_view" && x.mode) setMode(x.mode);
  else if (a.name === "ui_fly_to" && Number.isFinite(x.lat)) {
    show("home");
    if (world) { world.flyTo(x.lat, x.lon); world.mark(x.lat, x.lon); }
    pickPlace(x.lat, x.lon, x.label || null);
  } else if (a.name === "ui_analyze_place" && Number.isFinite(x.lat)) {
    newParcel();
    show("wizard");
    if (map) map.setView([x.lat, x.lon], 15);
    await selectSite(x.lat, x.lon, x.label || null);
    goStep(2);
  }
}
const daysUntilWeek = (week) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1 + week * 7));
  let d = Math.round((start - now) / 864e5);
  if (d < -7) d += 365;
  return d;
};
/** After every analysis Tiri speaks first: the main risk, the week ahead and the countdown to sowing. */
function tiriBriefing() {
  if (!state.result || !state.assessment) return;
  const top = state.assessment.hazards.filter((h) => h.level >= 2).map(hz)[0];
  const next7 = state.outlook && state.outlook.daily ? state.outlook.daily.days.slice(0, 7) : [];
  const frost = next7.filter((d) => d.pFrost >= 0.3).length;
  const heavy = next7.filter((d) => d.pHeavyRain >= 0.5).length;
  const first = state.result.strategies[1].years.find((y) => y.group !== "fallow");
  const days = first ? daysUntilWeek(first.sowWeek) : null;
  const parts = [`Listo, revisé ${state.site.place || state.name || "tu terreno"}.`];
  if (frost) parts.push(`Esta semana puede helar ${frost === 1 ? "una noche" : `${frost} noches`}: tapa las plantas chicas.`);
  if (heavy) parts.push(`Viene lluvia fuerte ${heavy === 1 ? "un día" : `${heavy} días`}: limpia canales y desagües.`);
  if (top && !frost && !heavy) parts.push(`${top.title}: ${top.action}`);
  if (first && days !== null) parts.push(days <= 0 ? `Ya es buen momento para sembrar ${first.name.toLowerCase()}.` : `Faltan ${days} días para sembrar ${first.name.toLowerCase()}.`);
  parts.push("¿Quieres que te diga qué hacer esta semana?");
  const text = parts.join(" ");
  state.chat.push({ role: "assistant", content: text, note: "Mensaje automático de Tiri con los datos de tu terreno." });
  renderTiri();
  say(text, { state: frost || heavy ? "alert" : "talk", ms: 14000, onClick: openTiri });
  // read aloud what the bubble shows, once the page translator has put it in the reader's language
  if (voiceEnabled()) setTimeout(() => speak($("tiri-say").innerText || text, state.lang), state.lang === "es" ? 0 : 2500);
}
/** Saved plots are checked when the page opens: frost or heavy rain in the next two days makes Tiri warn. */
async function tiriWatch() {
  const plots = readStore().parcels.filter((p) => p.site).slice(0, 3);
  for (const p of plots) {
    try {
      const o = await loadJson(`/api/outlook?lat=${p.site.lat.toFixed(4)}&lon=${p.site.lon.toFixed(4)}`, 30000);
      const days = o.daily ? o.daily.days.slice(0, 2) : [];
      const frost = days.find((d) => d.pFrost >= 0.3);
      const rain = days.find((d) => d.pHeavyRain >= 0.5);
      if (!frost && !rain) continue;
      const when = (d) => (d === days[0] ? "hoy" : "mañana");
      const text = frost ? `Aviso para ${p.name || "tu terreno"}: puede helar ${when(frost)} (${Math.round(frost.pFrost * 10)} de cada 10 escenarios). Tapa los almácigos.`
        : `Aviso para ${p.name || "tu terreno"}: lluvia fuerte ${when(rain)} (${Math.round(rain.pHeavyRain * 10)} de cada 10 escenarios). Revisa canales.`;
      state.chat.push({ role: "assistant", content: text, note: "Vigilancia automática de tus terrenos guardados." });
      renderTiri();
      say(text, { state: "alert", ms: 16000, onClick: openTiri });
      if ("Notification" in window && Notification.permission === "granted") new Notification("Yatiri X · Tiri", { body: text, icon: "img/favicon.png" });
      return;
    } catch { /* next plot */ }
  }
}
const TAB_TIPS = {
  predicciones: "Aquí ves la lluvia y las heladas de los próximos días y meses. Pregúntame «¿qué hago esta semana?».",
  clima: "El calendario muestra 45 años de lluvia y heladas de la NASA para tu terreno.",
  relieve: "Pulsa «Ver el relieve en 3D» para girar tu terreno con la imagen satelital.",
  agua: "Te muestro cuánta agua pone la lluvia y cuánta debes regar.",
  plagas: "Filtra por tu cultivo para ver qué plaga vigilar y su remedio casero.",
  catalogo: "Aquí están los 146 cultivos: busca el tuyo o usa «Otro».",
  comparar: "Compara tus terrenos lado a lado y toca «Ver» para abrir uno.",
  bolivia: "Aquí está tu zona de Cochabamba, los cultivos nativos, el calendario andino y las leyes de Bolivia.",
};
const tipsShown = new Set();
function tiriTip(tab) {
  if (!TAB_TIPS[tab] || tipsShown.has(tab) || !$("tiri-body").hidden) return;
  tipsShown.add(tab);
  setTimeout(() => say(TAB_TIPS[tab], { state: "happy", ms: 7000, onClick: openTiri }), 900);
}

// ---------- Analysis ----------
// data already fetched for each plot in this visit, so switching between plots is instant
const analysisCache = new Map();
async function analyze(keepTab = null) {
  // the stepper lets people jump ahead: what is missing sends them back to that step
  for (const n of [1, 2]) { const problem = stepValid(n); if (problem) { goStep(n); $("wizard-msg").textContent = problem; return; } }
  const btn = $("analyze");
  btn.disabled = true;
  btn.textContent = "Analizando tu terreno…";
  const stopLoader = showLoader();
  state.name = $("plot-name").value.trim();
  state.labPh = Number($("lab-ph").value) || null;
  state.labOm = Number($("lab-om").value) || null;
  state.moisture = Number($("moisture").value) || null;
  saveParcel();
  const at = `lat=${state.site.lat.toFixed(5)}&lon=${state.site.lon.toFixed(5)}`;
  const settle = (p) => p.then((v) => v, () => null);
  // 45 years of NASA POWER for this point of the planet (Cochabamba uses the bundled dataset)
  try { climate = await climateForSite(state.site); } catch { climate = baseClimate; state.climateFallback = true; }
  const [plot, soil, outlook] = await Promise.all([
    settle(loadJson(`/api/plot?${at}`, 20000)), settle(loadJson(`/api/soil?${at}`, 12000)), settle(loadJson(`/api/outlook?${at}`, 20000)),
  ]);
  analysisCache.set(state.parcelId, { plot, soil, outlook, climate, at: Date.now() });
  state.plot = plot || {};
  state.soil = soil && soil.soil ? soil.soil : null;
  state.outlook = outlook;
  compute();
  await stopLoader();
  setTimeout(tiriBriefing, 1400);
  btn.disabled = false;
  btn.textContent = t("analyze", state.lang);
  show("results");
  setTab(keepTab && TABS.includes(keepTab) ? keepTab : "general");
  document.body.classList.remove("revealed");
  requestAnimationFrame(() => document.body.classList.add("revealed"));
}

/** Growing-plant screen while the analysis runs. Returns a function that hides it (after one full growth). */
function showLoader() {
  const box = $("loader");
  const msg = $("loader-msg");
  const started = Date.now();
  let k = 0;
  msg.textContent = LOADING_STEPS[0];
  box.hidden = false;
  $("loader-reel").innerHTML = "";
  const stopReel = photoReel($("loader-reel"));
  const timer = setInterval(() => { k = (k + 1) % LOADING_STEPS.length; msg.textContent = LOADING_STEPS[k]; }, 1400);
  return async () => {
    const wait = Math.max(0, 1600 - (Date.now() - started)); // let the plant finish growing at least once
    await new Promise((r) => { setTimeout(r, wait); });
    clearInterval(timer);
    stopReel();
    box.hidden = true;
  };
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

/** "Rare in the valleys" is a Cochabamba fact: anywhere else every crop may enter a rotation. */
function cropsFor(site) {
  if (site && site.local) return crops;
  return { ...crops, crops: crops.crops.map((c) => (c.local === false ? { ...c, local: true } : c)) };
}
function compute() {
  if (!state.site || !state.last.length) return;
  state.result = recommend(climate, cropsFor(state.site), {
    altitude: state.site.altitude, history: [state.previous, state.last].filter((l) => l.length), irrigation: irrigation(),
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
const LEVEL = { 3: ["alert", "alert", "Alto"], 2: ["warn", "alert", "Medio"], 1: ["ok", "check", "Bajo"] };
const notice = (level, html) => `<div class="notice notice--${LEVEL[level][0]}">${icon(LEVEL[level][1], 28)}<div>${html}</div></div>`;
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

/** Several plots: buttons to switch the whole analysis from one plot to another. */
function renderPlotSwitch() {
  const box = $("plot-switch");
  const parcels = readStore().parcels;
  if (parcels.length < 2) { box.innerHTML = ""; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span class="plot-switch__label">Tus terrenos:</span>${parcels.map((p) => `<button type="button" class="plot-chip" data-switch="${p.id}" aria-pressed="${p.id === state.parcelId}"><span class="plot-dot" style="background:${esc(p.color || "#9e9e9e")}"></span>${esc(p.name || "Sin nombre")}</button>`).join("")}`;
  box.querySelectorAll("[data-switch]").forEach((b) => b.addEventListener("click", () => switchParcel(b.dataset.switch)));
}
async function switchParcel(id) {
  if (id === state.parcelId) return;
  const p = readStore().parcels.find((x) => x.id === id);
  if (!p || !p.site) return;
  const tab = state.tab;
  loadParcel(p);
  const cached = analysisCache.get(id);
  if (cached) {
    state.plot = cached.plot || {};
    climate = cached.climate || baseClimate;
    state.soil = cached.soil && cached.soil.soil ? cached.soil.soil : null;
    state.outlook = cached.outlook;
    compute();
    setTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    await analyze(tab);
  }
}
function renderResults() {
  renderPlotSwitch();
  const levels = domainLevels();
  const overall = Math.max(...Object.values(levels).filter((x) => x !== null));
  const word = (isSimple() ? { 1: "Tu terreno está bien", 2: "Tu terreno necesita cuidados", 3: "Tu terreno tiene peligro" } : { 1: "Buen estado", 2: "Necesita cuidados", 3: "En riesgo" })[overall];
  const d = gamcDistrict((state.plot && state.plot.gamc) || state.site.gamc);
  const icons = { clima: icon("suncloud", 34), suelo: icon("soil", 34), relieve: icon("mountain", 34), agua: icon("drop", 34), riesgos: icon("alert", 34) };
  const names = { clima: "Clima", suelo: "Suelo", relieve: "Relieve", agua: "Agua", riesgos: "Riesgos" };
  $("summary-card").innerHTML = `
    <div class="summary-card__head">
      <div><p class="summary-card__kicker">${esc(state.name || "Tu terreno")}${d ? ` · ${esc(d.Distrito)}` : ""} · ${num(state.site.altitude)} m${state.areaHa ? ` · ${num(state.areaHa, 2)} ha` : ""}</p>
      <h1 class="summary-card__title summary-card__title--${LEVEL[overall][0]}">${word}</h1></div>
    </div>
    <ul class="domains">${Object.entries(levels).map(([k, lv]) => `<li class="domain domain--${lv ? LEVEL[lv][0] : "none"}"><button type="button" data-tab-go="${k === "riesgos" ? "riesgos" : k}"><span aria-hidden="true">${icons[k]}</span><b>${names[k]}</b><span>${lv ? (isSimple() ? LEVEL_SIMPLE[lv] : LEVEL[lv][2]) : "Sin dato"}</span></button></li>`).join("")}</ul>`;
  $("summary-card").querySelectorAll("[data-tab-go]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tabGo)));
  renderTabs();
  renderGeneral(); renderBolivia(); renderPredicciones(); renderClima(); renderSuelo(); renderRelieve(); renderAgua(); renderRiesgos(); renderComparar(); renderCultivos(); renderCatalogo(); renderPlagas(); renderLegal(); renderGanancias(); renderFuentes();
}

// --- Do / don't ---
function doDont() {
  const r = state.result;
  const a = state.assessment;
  const best = r.strategies[1];
  const first = best.years.find((y) => y.group !== "fallow");
  const g = (state.plot && state.plot.gamc) || state.site.gamc;
  const yes = [];
  const no = [];
  const sm = isSimple();
  if (first) yes.push(sm ? `Siembra ${first.name.toLowerCase()} ${monthPart(first.sowWeek)}.` : `Sembrar ${first.name.toLowerCase()} hacia el ${weekLabel(first.sowWeek)}, que es la fecha con menos riesgo para tu terreno.`);
  a.hazards.filter((h) => h.level >= 2).forEach((h) => yes.push(hz(h).action));
  if (best.years.some((y) => y.group === "legume")) yes.push(sm ? "Siembra haba, arveja u otra legumbre: le da fuerza a la tierra." : "Incluir una leguminosa en la rotación: devuelve nitrógeno al suelo.");
  if (!userSoil()) yes.push(sm ? "Antes de comprar abono, haz analizar tu tierra." : "Hacer un análisis de suelo en laboratorio antes de comprar abono.");
  yes.push(sm ? "Mira tus plantas cada semana para ver si hay plagas." : "Revisar el cultivo cada semana para detectar plagas a tiempo.");
  a.avoid.forEach((x) => no.push(sm ? `No siembres ${x.name.toLowerCase()}: ${simpleReason(x.reasons[0])}.` : `No sembrar ${x.name.toLowerCase()}: ${x.reasons[0]}.`));
  const prevFamilies = new Set(state.previous.map(cropById).filter(Boolean).map((c) => c.family));
  const repeated = state.last.map(cropById).filter((c) => c && prevFamilies.has(c.family));
  const hist = repeated.length ? [repeated[0], repeated[0]] : [];
  if (hist.length === 2) no.push(sm ? `No siembres otra vez ${hist[1].name.toLowerCase()} ni plantas parecidas el próximo año: la tierra se cansa y vienen plagas.` : `No volver a sembrar ${hist[1].family.toLowerCase()} la próxima campaña: ya repetiste esa familia.`);
  if (a.hazards.some((h) => h.id === "erosion")) no.push(sm ? "No dejes la tierra pelada en época de lluvias ni ares de arriba hacia abajo." : "No dejar el suelo desnudo en la época de lluvias ni arar a favor de la pendiente.");
  if (g && g.drenaje && !g.drenaje.error) no.push(sm ? "No construyas ni siembres junto a torrenteras y canales." : "No construir, rellenar ni sembrar dentro de las franjas de torrenteras y canales.");
  no.push(sm ? "No uses venenos sin preguntar a un técnico." : "No aplicar agroquímicos sin la recomendación de un técnico.");
  no.push(sm ? "No quemes los rastrojos: la tierra pierde fuerza y humedad." : "No quemar los rastrojos: se pierde materia orgánica y humedad del suelo.");
  const n = sm ? 4 : 6;
  return { yes: [...new Set(yes)].slice(0, n), no: [...new Set(no)].slice(0, n) };
}

// --- Catalogue of every crop ---
const CATALOG_TYPES = ["Todos", "Hortaliza", "Hortaliza de ciclo corto", "Grano", "Tubérculo", "Leguminosa", "Forraje", "Fruta", "Frutal", "Aromática", "Flor"];
function cropAptitude(c) {
  const r = state.result;
  const a = state.assessment;
  const s = userSoil();
  const e = r.crops[c.id];
  const avoid = a.avoid.find((x) => x.crop === c.id);
  const phOk = !s || s.ph === null || !c.ph ? null : s.ph >= c.ph[0] - 0.3 && s.ph <= c.ph[1] + 0.3;
  // with irrigation but limited water (some months or very little), a thirsty crop needs care
  const thirsty = irrigation() && state.waterAvail && state.waterAvail !== "year" && e.irrigationMm > (state.waterAvail === "scarce" ? 150 : 300);
  const cold = e.warmth !== undefined && e.warmth < 0.85;
  const status = avoid || (e.warmth !== undefined && e.warmth < 0.35) ? 3 : (phOk === false || e.frostProb >= 0.2 || (!irrigation() && e.coverage < 0.5) || thirsty || cold) ? 2 : 1;
  const reasons = avoid ? avoid.reasons : [
    cold ? `le falta calor: el ciclo promedia ${num(e.meanTempC, 1)} °C y pide al menos ${num(c.min_mean_temp_c)} °C` : null,
    e.frostProb >= 0.2 ? `helada dañina en ${pct(e.frostProb)} de las campañas` : null,
    !irrigation() && e.coverage < 0.5 ? `la lluvia cubre solo ${pct(e.coverage)} del agua` : null,
    thirsty ? `necesita unos ${mm(e.irrigationMm)} de riego y tu agua es limitada` : null,
    phOk === false ? "el pH del suelo está fuera de su rango" : null,
  ].filter(Boolean);
  return { c, e, status, reasons };
}
function seasonStrip(e) {
  const cal = state.result.calendar.weeks;
  const inCycle = new Set();
  for (let k = 0; k < e.weeks; k++) inCycle.add((e.sowWeek + k) % WEEKS);
  let s = "";
  for (let w = 0; w < WEEKS; w++) {
    const x = w * 5;
    s += `<rect x="${x}" y="2" width="4" height="12" rx="1" fill="${w === e.sowWeek ? "#c06840" : inCycle.has(w) ? "#5e8c3a" : "#e7dcc8"}"/>`;
    if (cal[w].pFrost >= 0.2) s += `<rect x="${x}" y="16" width="4" height="3" fill="#3d6fb6"/>`;
  }
  return `<svg class="strip" viewBox="0 0 260 20" role="img" aria-label="Ciclo del cultivo en el año: siembra hacia el ${weekLabel(e.sowWeek)}">${s}</svg>`;
}
function renderCatalogo() {
  const list = crops.crops.filter((c) => c.group !== "fallow").map(cropAptitude)
    .filter((x) => state.catType === "Todos" || x.c.type === state.catType)
    .filter((x) => !state.catOnlyApt || x.status === 1);
  const sorters = {
    aptitud: (a, b) => a.status - b.status || b.e.climateScore - a.e.climateScore,
    agua: (a, b) => a.e.irrigationMm - b.e.irrigationMm,
    helada: (a, b) => a.e.frostProb - b.e.frostProb,
    nombre: (a, b) => a.c.name.localeCompare(b.c.name, "es"),
  };
  list.sort(sorters[state.catSort]);
  const label = { 1: "Apto", 2: "Con cuidados", 3: "No conviene" };
  const counts = [1, 2, 3].map((lv) => crops.crops.filter((c) => c.group !== "fallow").map(cropAptitude).filter((x) => x.status === lv).length);
  panel("catalogo").innerHTML = `
    <h2>Todas las siembras posibles</h2>
    <p class="lead">${crops.crops.length - 1} cultivos evaluados para tu terreno: <b>${counts[0]} aptos</b>, ${counts[1]} con cuidados y ${counts[2]} que no convienen.</p>
    <div class="catalog-tools">
      <div class="chips chips--small" role="group" aria-label="Tipo de cultivo">${CATALOG_TYPES.map((tp) => `<button type="button" class="chip" data-cat-type="${esc(tp)}" aria-pressed="${state.catType === tp}">${esc(tp)}</button>`).join("")}</div>
      <div class="catalog-row">
        <label class="toggle"><input type="checkbox" id="cat-apt" ${state.catOnlyApt ? "checked" : ""}> Solo los aptos</label>
        <label class="sort">Ordenar por
          <select id="cat-sort">${[["aptitud", "Mejor para mi terreno"], ["agua", "Menos agua de riego"], ["helada", "Menos riesgo de helada"], ["nombre", "Nombre"]].map(([v, l]) => `<option value="${v}" ${state.catSort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        </label>
      </div>
    </div>
    <div class="catalog">${list.map((x, i) => `
      <details class="crop-card crop-card--${LEVEL[x.status][0]}" style="--i:${i}">
        <summary>
          ${images.crops[x.c.id] ? `<img src="${esc(images.crops[x.c.id].thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="crop-card__ph">${icon("leaf", 40)}</span>`}
          <span class="crop-card__body">
            <b>${esc(x.c.name)}</b>
            <span class="small">${esc(x.c.type)} · ${esc(x.c.family)}</span>
            <span class="badge badge--${LEVEL[x.status][0]}">${label[x.status]}</span>
          </span>
        </summary>
        <div class="crop-card__more">
          ${seasonStrip(x.e)}
          <p class="small">Siembra hacia el <b>${weekLabel(x.e.sowWeek)}</b> · ${x.c.perennial ? "cultivo de varios años" : `${x.c.cycle_days} días`}. Azul: semanas con helada frecuente.</p>
          <div class="mini-facts">
            <span><b>${mm(x.e.cropWaterMm)}</b> de agua</span>
            <span><b>${pct(x.e.coverage)}</b> la cubre la lluvia</span>
            <span><b>${pct(x.e.frostProb)}</b> helada dañina</span>
          </div>
          ${x.reasons.length ? `<p class="small"><b>Ojo:</b> ${esc(x.reasons.join("; "))}.</p>` : ""}
          ${knowledge.fertility[x.c.id] ? `<p class="small"><b>Abono:</b> ${esc(knowledge.fertility[x.c.id])}</p>` : ""}
          ${(knowledge.pests[x.c.id] || []).length ? `<p class="small"><b>Vigilar:</b> ${esc(knowledge.pests[x.c.id].map((p) => p.name.toLowerCase()).join(", "))}.</p>` : ""}
          ${x.c.type === "Hortaliza de ciclo corto" ? '<p class="small">Ciclo corto: se puede sembrar entre dos cultivos principales.</p>' : ""}
          <button type="button" class="link" data-ask="${esc(x.c.name)}">Preguntarle a Tiri por ${esc(x.c.name.toLowerCase())}</button>
          ${images.crops[x.c.id] ? `<p class="source" translate="no">Foto: ${esc(images.crops[x.c.id].author)}, ${esc(images.crops[x.c.id].licence)}, Wikimedia Commons</p>` : ""}
        </div>
      </details>`).join("") || '<p class="hint">Ningún cultivo cumple ese filtro.</p>'}</div>
    ${source(`Cada cultivo con su mejor fecha de siembra para tu terreno, NASA POWER ${climate.meta.period.replace(" to ", " a ")}; datos de cultivo FAO-56, por validar con INIAF.`)}`;
  const p = panel("catalogo");
  p.querySelectorAll("[data-cat-type]").forEach((b) => b.addEventListener("click", () => { state.catType = b.dataset.catType; renderCatalogo(); }));
  $("cat-apt").addEventListener("change", (e) => { state.catOnlyApt = e.target.checked; renderCatalogo(); });
  $("cat-sort").addEventListener("change", (e) => { state.catSort = e.target.value; renderCatalogo(); });
  p.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => {
    openTiri();
    askTiri(`¿Me conviene sembrar ${b.dataset.ask.toLowerCase()} en mi terreno? ¿Cuándo y qué cuidados necesita?`);
  }));
}

/** A real photo with its credit line, or nothing if there is none. */
function photo(entry, alt, cls = "photo") {
  if (!entry) return "";
  return `<figure class="${cls}"><img src="${esc(entry.thumb)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"><figcaption translate="no">Foto: ${esc(entry.author)}, ${esc(entry.licence)}, <a href="${esc(entry.file_page)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption></figure>`;
}

function initMiniMap() {
  const box = $("mini-map");
  if (!box || !window.L) return;
  if (miniMap) { miniMap.remove(); miniMap = null; }
  miniMap = L.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([state.site.lat, state.site.lon], 16);
  const bases = Object.fromEntries(BASEMAPS.map((b) => [b.label, L.layerGroup(basemapLayers(b.id))]));
  const current = BASEMAPS.find((b) => b.id === (state.basemap || "hibrido")) || BASEMAPS[0];
  bases[current.label].addTo(miniMap);
  L.control.layers(bases, null, { collapsed: false, position: "topright" }).addTo(miniMap);
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
  // "QU" at the end: the alerts for this person go in Quechua
  const waText = `ALERTAS ${state.site.lat.toFixed(5)},${state.site.lon.toFixed(5)}${state.lang === "qu" ? " QU" : ""}`;
  panel("predicciones").innerHTML = `
    <h2>Predicciones</h2>
    <p class="hint">${isSimple() ? "Lo que puede pasar en tu terreno en los próximos días y meses." : "Probabilidades a partir de los escenarios del pronóstico y de 45 años de datos de la NASA. Se actualizan cada vez que abres el análisis."}</p>
    ${state.waNumber ? `<div class="wa-box">
      ${icon("chat", 44)}
      <div><b>Recibe avisos de helada y lluvia fuerte en tu WhatsApp</b>
      <p class="small">Cada tarde revisamos el pronóstico de este terreno y te escribimos solo si hay riesgo. Guardamos tu número y la ubicación aproximada del terreno solo para esos avisos; escribe BAJA para borrarlos.</p>
      <a class="btn btn--primary btn--small" href="https://wa.me/${esc(state.waNumber)}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">Activar avisos por WhatsApp</a></div>
    </div>` : ""}
    ${next7 ? `<div class="wx-strip">${next7.map((d) => `<div class="wx-day"><span>${esc(dayLabel(d.date))}</span>${weatherScene(d)}<b>${num(d.tminMedian, 0)}° / ${num(d.tmaxMedian, 0)}°</b></div>`).join("")}</div>` : ""}
    ${next7 && isSimple() ? `<div class="facts">
      <div class="fact"><b>${rainyDays} de 7</b><span>días puede llover esta semana</span></div>
      <div class="fact"><b>${frostDays ? `${frostDays} ${frostDays === 1 ? "noche" : "noches"}` : "Ninguna noche"}</b><span>con helada esta semana</span></div>
      <div class="fact"><b>${chance(heavy)}</b><span>que caiga una lluvia fuerte</span></div>
    </div>` : next7 ? `<div class="facts">
      <div class="fact"><b>${rainyDays} de 7</b><span>días con lluvia probable esta semana</span></div>
      <div class="fact"><b>${frostDays} de 7</b><span>días con riesgo de helada</span></div>
      <div class="fact"><b>${pct(heavy)}</b><span>probabilidad máxima de un día con 10 mm o más</span></div>
      ${w ? `<div class="fact"><b>${tenths(w[0].pAboveNormal)}</b><span>escenarios con más lluvia que lo normal esta semana</span></div>` : ""}
    </div>` : '<p class="hint">El pronóstico no respondió ahora; abajo siguen las probabilidades históricas.</p>'}
    <h3>Próximas semanas</h3>
    ${w && isSimple() ? w.map((x, i) => notice(x.pWetterThanUsual >= 0.6 || x.pFrost >= 0.3 ? 2 : 1, `<p><b>${i === 0 ? "Esta semana" : "La próxima semana"}:</b> ${x.pWetterThanUsual >= 0.6 ? "va a llover más de lo normal. Limpia los canales." : x.pDrierThanUsual >= 0.6 ? "va a llover menos de lo normal. Planifica el riego." : "lluvia normal para la época."}${x.pFrost >= 0.3 ? " Puede helar: tapa las plantas chicas." : ""}</p>`)).join("")
    : w ? w.map((x, i) => notice(x.pWetterThanUsual >= 0.6 || x.pFrost >= 0.3 ? 2 : 1, `<p><b>${i === 0 ? "Esta semana" : "La próxima semana"}:</b> unos ${num(x.rainMedian)} mm (entre ${num(x.rainP10)} y ${num(x.rainP90)} mm), cuando lo normal son ${num(x.normal)} mm.${x.pWetterThanUsual >= 0.6 ? " Mucho más lluvia que de costumbre: revisar canales y drenes." : ""}${x.pDrierThanUsual >= 0.6 ? " Más seco que de costumbre: planificar el riego." : ""}${x.pFrost > 0 ? ` Helada en ${tenths(x.pFrost)} escenarios.` : ""}</p>`)).join("") : '<p class="hint">Sin dato.</p>'}
    <h3>Próximos meses</h3>
    ${o && o.monthly && isSimple() ? `<div class="weeks">${o.monthly.months.map((m) => `<div class="fact"><b>${esc(m.name[0].toUpperCase() + m.name.slice(1))}</b><span>${simpleMonth(m)}</span></div>`).join("")}</div>`
    : o && o.monthly ? `<div class="weeks">${o.monthly.months.map((m) => `<div class="fact"><b>${esc(m.name[0].toUpperCase() + m.name.slice(1))}</b><span>Unos ${num(m.rainMedian)} mm. Mes muy seco ${tenths(m.pDryMonth)} años; muy lluvioso ${tenths(m.pWetMonth)} años.${m.pFrost > 0 ? ` Heló ${tenths(m.pFrost)} años.` : ""}</span></div>`).join("")}</div>` : ""}
    <h3>Qué puede pasar con tu terreno</h3>
    ${a.hazards.filter((h) => h.level >= 2).map(hz).map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.text)}</p>`)).join("") || notice(1, isSimple() ? "<p>Con los datos de hoy, no se ven peligros grandes.</p>" : "<p>Sin riesgos altos previstos con los datos disponibles.</p>")}
    <h3 class="mid-up">Si siembras la rotación recomendada</h3>
    <p class="mid-up">${best.years.filter((y) => y.group !== "fallow").map((y) => `${esc(y.name)}: helada dañina ${pct(y.frostProb)} de las campañas, la lluvia cubre ${pct(y.coverage)} del agua`).join("; ")}. Riego total en 3 años: ${mm(best.irrigationTotalMm)} frente a ${mm(r.strategies[0].irrigationTotalMm)} de tu rotación actual.</p>
    <div class="whatif mid-up">
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
  return MODULES.map((m, i) => `<button type="button" class="module" data-module="${m.tab}" aria-pressed="${active === m.tab}" data-tilt style="--i:${i}">
      <span class="module__icon">${icon(m.icon, 46)}</span><b>${esc(t(`mod_${m.id}`, state.lang) === `mod_${m.id}` ? m.label : t(`mod_${m.id}`, state.lang))}</b></button>`).join("");
}
function renderTabs() {
  const secondary = TABS.filter((k) => !MODULES.some((m) => m.tab === k));
  $("tabs").innerHTML = `<div class="modules modules--nav">${moduleCards(state.tab)}</div>
    <div class="subtabs">${secondary.filter((k) => k !== "comparar" || readStore().parcels.length > 1).map((k) => `<button type="button" class="tab-btn${k === "fuentes" ? " mid-up" : ""}" data-tab-btn="${k}" aria-pressed="${state.tab === k}">${t(`tab_${k}`, state.lang)}</button>`).join("")}</div>`;
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
  if (k === "comparar" && compareMap) setTimeout(() => compareMap.invalidateSize(), 50);
  replay(panel(k));
  tiriTip(k);
  if (window.innerWidth >= 900) {
    if (k === "relieve" && !terrainView) openTerrain();
    if (k === "suelo" && !soilView) openSoil3D();
  }
}
const panel = (k) => document.querySelector(`.tab[data-tab="${k}"]`);

function renderGeneral() {
  const r = state.result;
  const a = state.assessment;
  const best = r.strategies[1];
  const actions = a.hazards.filter((h) => h.level >= 2).slice(0, 3);
  const dd = doDont();
  const nextCrop = best.years.find((y) => y.group !== "fallow" && y.sowWeek !== null);
  panel("general").innerHTML = `
    <h2>Lo más importante</h2>
    <p class="lead">${esc(isSimple() ? simpleLead(r) : explain(r).join(" "))}</p>
    ${actions.length ? `<h3>Qué hacer primero</h3>${actions.map(hz).map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.action)}</p>`)).join("")}` : notice(1, isSimple() ? "<p>Con los datos de hoy, tu terreno no tiene peligros grandes.</p>" : "<p>No hay riesgos altos con los datos disponibles.</p>")}
    ${nextCrop ? `<h3>${isSimple() ? "Tu próximo cultivo, paso a paso" : "Próximo cultivo: ciclo semana a semana"}</h3>
    ${growthTimeline({ name: nextCrop.name, color: cropColor(nextCrop.crop), sowWeek: nextCrop.sowWeek, weeks: nextCrop.weeks || 16, today: currentWeek(), label: weekLabel, photo: images.crops && images.crops[nextCrop.crop] ? images.crops[nextCrop.crop].thumb : null })}` : ""}
    <div class="dodont">
      <section class="dodont__col dodont__col--yes"><h3>${icon("check", 26)} ${isSimple() ? "Haz esto" : "Sí hacer"}</h3><ul>${dd.yes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section class="dodont__col dodont__col--no"><h3>${icon("cross", 26)} ${isSimple() ? "No hagas esto" : "No hacer"}</h3><ul>${dd.no.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
    </div>
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
          <p class="day__icon">${weatherScene(d)}</p>
          ${isSimple() ? `<p class="day__prob"><b>${rainWord(d.pRain)}</b></p>` : `<p class="day__prob" title="Probabilidad de lluvia de 1 mm o más"><b>${pct(d.pRain)}</b><span>lluvia</span></p>`}
          <p class="mid-up">${num(d.rainMedian, 1)} mm</p>
          <p class="adv-only small">${num(d.rainP10, 1)} a ${num(d.rainP90, 1)} mm</p>
          <p class="${d.pFrost > 0 ? "day__frost" : ""}">${num(d.tminMedian, 0)}° / ${num(d.tmaxMedian, 0)}°</p>
          ${d.pFrost > 0 ? `<p class="day__frost small">${isSimple() ? (d.pFrost >= 0.3 ? "Puede helar" : "") : `helada ${pct(d.pFrost)}`}</p>` : ""}
        </div>`).join("")}</div></div>
        <div class="weeks mid-up">${o.weekly.weeks.map((w, i) => `
          <div class="fact"><b>${i === 0 ? "Esta semana" : "La próxima"}</b>
          <span>Unos ${num(w.rainMedian)} mm de lluvia (lo normal: ${num(w.normal)} mm). Más lluvia que lo normal en ${tenths(w.pAboveNormal)} escenarios.${w.pFrost > 0 ? ` Helada en ${tenths(w.pFrost)} escenarios.` : ""}</span></div>`).join("")}</div>
        ${source(`${o.daily.model}, ${o.daily.members} escenarios. Normal: ${o.normal_source}. Actualizado: ${new Date(o.generated).toLocaleString("es")}.`)}`;
    }
  } else if (state.period === "meses") {
    if (!o || !o.monthly) body = '<p class="hint">Sin dato.</p>';
    else if (isSimple()) body = `<div class="weeks">${o.monthly.months.map((m) => `<div class="fact"><b>${esc(m.name[0].toUpperCase() + m.name.slice(1))}</b><span>${simpleMonth(m)}</span></div>`).join("")}</div>`;
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

function simpleMonth(m) {
  const rain = m.rainMedian >= 100 ? "llueve mucho" : m.rainMedian >= 40 ? "llueve regular" : m.rainMedian >= 10 ? "llueve poco" : "casi no llueve";
  return `Suele ser un mes en que ${rain}.${m.pFrost >= 0.3 ? " Suele helar." : ""}`;
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
  const onsetWeek = Math.floor(((state.result.onset.start_doy || 274) - 1 + valid[Math.floor(valid.length / 2)]) / 7) % WEEKS;
  const mk = climate.onset.mann_kendall;
  const months = [];
  for (let i = 0, last = -1; i < WEEKS; i++) { const m = weekDate(i).month; if (m !== last) { months.push({ week: i, label: MONTHS[m] }); last = m; } }
  const cycles = state.result.strategies[1].years.filter((y) => y.group !== "fallow" && y.sowWeek !== null).slice(0, 2)
    .map((y) => ({ start: y.sowWeek, len: y.weeks || 16, color: cropColor(y.crop), label: y.name }));
  const yearRain = cal.reduce((t, w) => t + w.rainMean, 0);
  return `<div class="radial">
      ${radialYear({ weeks: cal, months, today: currentWeek(), cycles, label: weekLabel, centre: { big: `${num(yearRain)} mm`, small: "de lluvia al año" } })}
      <div class="radial__legend">
        <p class="hint">${isSimple() ? "Tu año como un reloj. La aguja roja es hoy." : "El año como un reloj: cada rebanada es una semana, de enero arriba en sentido horario. La aguja roja marca hoy."}</p>
        <ul class="legend legend--radial">
          <li><i style="background:#48c6ff"></i>${isSimple() ? "Cuánto llueve (barras de afuera)" : "Lluvia media semanal (barras exteriores)"}</li>
          <li><i style="background:#7fd8ff"></i>${isSimple() ? "Cuándo hiela (más fuerte, más veces)" : "Helada: semanas con 0 °C o menos"}</li>
          <li><i style="background:#ffb23f"></i>${isSimple() ? "Semanas secas" : "Semana seca (menos de 5 mm)"}</li>
          ${cycles.map((c) => `<li><i style="background:${c.color}"></i>${esc(c.label)}: ${isSimple() ? "cuando está en el campo" : `${weekLabel(c.start)} a ${weekLabel(c.start + c.len)}`}</li>`).join("")}
        </ul>
      </div>
    </div>
    <p class="hint adv-only">Cada columna es una semana. Cuanto más oscuro, más veces pasó en 45 años.</p>
    <div class="scroll adv-only"><svg class="chart" width="${width}" height="114" viewBox="0 0 ${width} 114" role="img" aria-label="Lluvia, heladas y semanas secas por semana del año">${s}</svg></div>
    <ul class="legend adv-only"><li><i style="background:#8cc4d6"></i>Lluvia media</li><li><i style="background:#3d6fb6"></i>Helada (0 °C o menos)</li><li><i style="background:#c98b00"></i>Semana seca (menos de 5 mm)</li></ul>
    <p>Las lluvias firmes suelen empezar hacia el ${weekLabel(onsetWeek)}. ${mk.trend === "no trend" ? `Esa fecha no muestra una tendencia clara en 45 años (Mann-Kendall, p = ${num(mk.p, 2)}).` : `Esa fecha se mueve ${num(Math.abs(mk.slope_days_per_year) * 10, 1)} días por década (Mann-Kendall, p = ${num(mk.p, 2)}).`}</p>
    ${source(`NASA POWER ${climate.meta.period.replace(" to ", " a ")}, ajustado a ${num(state.site.altitude)} m`)}`;
}

// --- Suelo ---
async function openSoil3D() {
  const btn = $("soil-open");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const s = userSoil();
  const best = state.result.strategies[1].years.find((y) => y.group !== "fallow");
  const crop = best ? crops.crops.find((c) => c.id === best.crop) : null;
  const wetBottom = state.assessment.hazards.some((h) => h.id === "waterlogging" && h.level >= 2);
  try {
    const { renderSoil3D } = await import("./soil3d.js");
    if (soilView) soilView.dispose();
    const pick = selectedCrop();
    const coverage = pick && pick.data ? pick.data.coverage : 1;
    const czone = cochabambaZone(state.site.lat, state.site.lon, state.site.altitude);
    const place = {
      arid: coverage < 0.4,
      saline: Boolean(czone && (czone.id === "valleAlto" || (coverage < 0.4 && czone.id !== "tropico" && czone.id !== "andina"))),
      andean: inBolivia(state.site.lat, state.site.lon) && state.site.altitude > 1800,
    };
    soilView = await renderSoil3D($("soil3d"), {
      profile: s && s.profile, summary: s, crop, wetBottom, place,
      onPick: (text) => say(text, { state: "talk", ms: 8000, onClick: openTiri }),
    });
    if (!soilView) return;
    btn.hidden = true;
    $("soil-panel").hidden = false;
    panel("suelo").querySelectorAll("[data-stoggle]").forEach((c) => c.addEventListener("change", () => soilView.toggle(c.dataset.stoggle, c.checked)));
    $("soil-gap").addEventListener("input", (e) => soilView.explode(Number(e.target.value)));
    const top = soilView.rows[0];
    $("soil3d-notes").innerHTML = `
      <div class="facts">
        <div class="fact"><b>${num(soilView.rootDepth * 100)} cm</b><span>${crop ? `hasta donde llegan las raíces de ${esc(crop.name.toLowerCase())}` : "profundidad de raíces"}</span></div>
        <div class="fact"><b>${num(soilView.tableDepth * 100)} cm</b><span>agua subterránea (esquema: ${wetBottom ? "zona baja, suele estar más cerca" : "estimación general"})</span></div>
        <div class="fact"><b>${soilView.minerals.length ? esc(soilView.minerals.map((m) => m.name.split(" (")[0]).join(", ")) : "Sin señales"}</b><span>minerales posibles</span></div>
      </div>
      ${soilView.minerals.length ? `<h3>Minerales probables en tu suelo</h3>
      <div class="scroll"><table class="table minerals"><thead><tr><th>Mineral</th><th class="mid-up">Fórmula</th><th>Por qué aparece</th><th>Qué significa para tu cultivo</th></tr></thead><tbody>
        ${soilView.minerals.map((m) => `<tr><td><i class="mineral-dot" style="background:#${m.color.toString(16).padStart(6, "0")}"></i><b>${esc(m.name)}</b><br><small>${esc(m.depth.replace("-", " a ").replace("cm", " cm"))}</small></td><td class="mid-up formula">${esc(m.formula)}</td><td>${esc(m.why)}</td><td>${esc(m.use)}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      ${source(`${soilView.generic ? "SoilGrids no respondió ahora: se muestra un perfil típico de suelo franco solo como ejemplo. Vuelve a abrir el análisis más tarde o usa tu análisis de laboratorio en el paso 2." : soilView.estimated ? "Capas profundas estimadas a partir de los primeros 30 cm (SoilGrids no dio el perfil completo)." : "SoilGrids 2.0 (ISRIC), 6 profundidades hasta 2 m, 250 m."} Raíces: FAO-56, tabla 22. El nivel del agua subterránea y los minerales son orientativos: confirmar con un pozo, una calicata o un análisis de laboratorio.`)}`;
    say(top && (top.clay ?? 0) >= 35 ? "Tu suelo tiene mucha arcilla arriba: el agua entra despacio. Mira cómo bajan las gotas." : "Mira cómo baja el agua de lluvia por las capas y hasta dónde llegan las raíces. Toca una capa o un cristal para saber más.", { state: "talk", ms: 9000, onClick: openTiri });
  } catch (error) {
    $("soil3d").innerHTML = `<p class="hint" style="padding:1rem">No se pudo cargar el 3D del suelo: ${esc(error.message)}.</p>`;
    btn.disabled = false;
  }
}

function renderSuelo() {
  if (soilView) { soilView.dispose(); soilView = null; }
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
        <div class="fact"><b>${s.ph === null ? "Sin dato" : isSimple() ? (s.ph < 5.5 ? "Ácida" : s.ph > 7.8 ? "Salitrosa" : "Buena") : num(s.ph, 1)}</b><span>${isSimple() && s.ph !== null ? `tu tierra (pH ${num(s.ph, 1)})` : "pH"}</span></div>
        <div class="fact"><b>${esc(s.texture || "Sin dato")}</b><span>textura</span></div>
        <div class="fact"><b>${s.soc_gkg === null ? "Sin dato" : isSimple() ? (s.soc_gkg < 10 ? "Poca" : "Buena") : num(s.soc_gkg)}</b><span>${isSimple() ? "materia orgánica (abono natural de la tierra)" : "g de carbono orgánico por kg"}</span></div>
      </div>
      ${source(`${s.source}${s.depth ? `, ${s.depth}` : ""}. Un análisis de laboratorio es lo más seguro para decidir el abono.`)}
      <h3>Fertilidad y posibles deficiencias</h3>${list([...a.soilAdvice, ...deficiencies].map(esc))}`
    : '<p class="hint">No hay dato de suelo para este punto: el servicio mundial de suelos no respondió o el punto es urbano. Si tienes un análisis de laboratorio, ponlo en el paso 2. Las recomendaciones de abono de abajo siguen valiendo.</p>'}
    <h3>${isSimple() ? "Tu suelo por dentro, en 3D" : "Perfil del suelo en 3D, hasta 2 m"}</h3>
    <p class="hint">${isSimple() ? "Mira las capas de tu tierra, cómo entra el agua de lluvia, hasta dónde llegan las raíces y qué minerales puede haber." : "Cada capa es una profundidad de SoilGrids (color por textura y carbono orgánico; puntos claros, piedras). Se ven las raíces del próximo cultivo hasta su profundidad típica (FAO-56), la lluvia infiltrándose a la velocidad que permite la textura, un nivel freático ilustrativo con el agua subterránea en movimiento y los minerales probables según pH y textura. Pasa el dedo o el mouse por una capa o un cristal."}</p>
    <div class="terrain-tools no-print"><button class="btn btn--primary btn--shine" type="button" id="soil-open">Ver mi suelo en 3D</button></div>
    <div class="terrain-panel no-print" id="soil-panel" hidden>
      <div class="terrain-toggles">
        <label><input type="checkbox" data-stoggle="water" checked> Agua: lluvia y agua subterránea</label>
        <label><input type="checkbox" data-stoggle="roots" checked> Raíces</label>
        <label><input type="checkbox" data-stoggle="minerals" checked> Minerales posibles</label>
        <label><input type="checkbox" data-stoggle="spin" checked> Girar solo</label>
      </div>
      <label class="slider"><span>Separar las capas</span><input type="range" id="soil-gap" min="0" max="0.25" step="0.01" value="0"></label>
    </div>
    <div id="soil3d" class="terrain3d"></div>
    <div id="soil3d-notes"></div>
    ${inCochabambaDept(state.site.lat, state.site.lon) ? `<h3>${esc(GEOLOGY_CBBA.title)}</h3>
      ${list(GEOLOGY_CBBA.items.map(esc))}
      <p>${esc(GEOLOGY_CBBA.mining)}</p>
      ${source(GEOLOGY_CBBA.sources)}` : inBolivia(state.site.lat, state.site.lon) ? `<h3>Minería y agua</h3><p>${esc(GEOLOGY_CBBA.mining)}</p>` : ""}
    <h3>Abono para tu rotación recomendada</h3>
    ${list(bestCrops.map((id) => `<b>${esc(crops.crops.find((c) => c.id === id).name)}:</b> ${esc(knowledge.fertility[id] || "")}`))}
    <p class="hint">Orientación general, sin dosis: la cantidad la define un análisis de suelo y un técnico.</p>
    <h3>Aptitud de cada cultivo</h3>
    <div class="scroll"><table class="table"><thead><tr><th>Cultivo</th><th>Aptitud</th><th class="mid-up">Helada dañina</th><th class="mid-up">Lluvia cubre</th><th class="adv-only">pH</th><th class="mid-up">Motivo</th></tr></thead><tbody>
      ${aptitude.map((x) => `<tr><td>${esc(x.c.name)}</td><td><span class="badge badge--${LEVEL[x.status][0]}">${label[x.status]}</span></td><td class="mid-up">${pct(x.e.frostProb)}</td><td class="mid-up">${pct(x.e.coverage)}</td><td class="adv-only">${x.c.ph ? `${x.c.ph[0]}–${x.c.ph[1]}${x.phOk === false ? " ✗" : ""}` : ""}</td><td class="mid-up">${esc(x.reason)}</td></tr>`).join("")}
    </tbody></table></div>`;
  $("soil-open").addEventListener("click", openSoil3D);
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
  const mean = around.length ? around.reduce((a, b) => a + b, 0) / around.length : state.site.altitude;
  const diff = state.site.altitude - mean;
  const position = isSimple()
    ? (diff < -15 ? "parte baja: el agua de lluvia baja y se junta aquí" : diff > 15 ? "parte alta: el agua se va hacia abajo y la tierra se seca rápido" : "parte media: ni muy alta ni muy baja")
    : diff < -15 ? "parte baja: el agua de lluvia tiende a llegar y acumularse aquí" : diff > 15 ? "parte alta: el agua escurre hacia abajo y el suelo se seca antes" : "parte intermedia respecto a su entorno";
  const hzs = state.assessment.hazards.filter((h) => ["erosion", "waterlogging"].includes(h.id));
  panel("relieve").innerHTML = `
    <h2>Relieve y topografía</h2>
    <div class="facts">
      <div class="fact"><b>${num(state.site.altitude)} m</b><span>altitud</span></div>
      <div class="fact"><b>${slope ? (isSimple() ? (slope.percent < 5 ? "Plano" : slope.percent < 15 ? "Poco inclinado" : slope.percent < 30 ? "Inclinado" : "Muy inclinado") : `${num(slope.percent, 1)} %`) : "Sin dato"}</b><span>${isSimple() ? "tu terreno es" : `pendiente${slope ? `: ${esc(slope.class)}` : ""}`}</span></div>
      <div class="fact"><b>${num(Math.max(...around) - Math.min(...around))} m</b><span>desnivel en 2 km a la redonda</span></div>
    </div>
    <p>Tu terreno está en la <b>${position}</b><span class="mid-up"> (${diff >= 0 ? "+" : "−"}${num(Math.abs(diff))} m frente al promedio de alrededor)</span>.</p>
    ${hzs.length ? hzs.map(hz).map((h) => notice(h.level, `<p><b>${esc(h.title)}.</b> ${esc(h.text)}</p><p>${esc(h.action)}</p>`)).join("") : notice(1, "<p>Sin señales de erosión ni de acumulación de agua con estos datos.</p>")}
    ${source(`NASA SRTM 30 m${slope ? `; ${slope.source}` : ""}. Pendiente en un tramo de 180 m: no ve cárcavas pequeñas dentro de la parcela.`)}
    <h3>Tu terreno en 3D: relieve, agua y subsuelo</h3>
    <p class="hint">${isSimple() ? "Tu terreno y lo que lo rodea, como una maqueta. Las líneas celestes muestran por dónde corre el agua de lluvia." : "Bloque de unos 2,3 km alrededor de tu terreno (punto rosado): relieve real, por dónde escurre el agua de lluvia, la cuenca que drena hacia tu terreno, ríos y canales de OpenStreetMap y, en los costados, un esquema de las capas del suelo y del agua subterránea. Arrastra para girar; rueda o dos dedos para acercar; pasa el dedo o el mouse para ver cada punto."}</p>
    <div class="terrain-tools no-print">
      <button class="btn btn--primary btn--shine" type="button" id="terrain-open">Ver mi terreno en 3D</button>
    </div>
    <div class="terrain-panel no-print" id="terrain-panel" hidden>
      <div class="chips" role="group" aria-label="Vista del relieve">
        <button type="button" class="chip" data-tmode="sat" aria-pressed="true">Satélite</button>
        <button type="button" class="chip" data-tmode="hyps" aria-pressed="false">Altura y curvas de nivel</button>
        <button type="button" class="chip" data-tmode="slope" aria-pressed="false">Pendiente</button>
        <button type="button" class="chip" data-tmode="water" aria-pressed="false">Agua</button>
      </div>
      <div class="terrain-toggles">
        <label><input type="checkbox" data-ttoggle="streams" checked> Por dónde corre la lluvia</label>
        <label><input type="checkbox" data-ttoggle="basin" checked> Cuenca de tu terreno</label>
        <label><input type="checkbox" data-ttoggle="rivers" checked> Ríos y canales reales</label>
        <label><input type="checkbox" data-ttoggle="flow" checked> Agua en movimiento</label>
        <label><input type="checkbox" id="terrain-spin" checked> Girar solo</label>
      </div>
      <label class="slider"><span>Exagerar la altura: <output id="terrain-ex-out">2×</output></span><input type="range" id="terrain-ex" min="1" max="6" step="0.5" value="2"></label>
      <label class="slider"><span>Simular agua estancada: <output id="terrain-lvl-out">sin agua</output></span><input type="range" id="terrain-lvl" min="0" max="40" step="1" value="0"></label>
      <p class="hint small" id="terrain-lvl-note"></p>
      <ul class="legend terrain-legend" id="terrain-legend"></ul>
    </div>
    <div id="terrain3d" class="terrain3d"></div>
    <div class="facts terrain-facts" id="terrain-facts" hidden></div>
    <p class="source" id="terrain-stats"></p>`;
  if (terrainView) { terrainView.dispose(); terrainView = null; }
  $("terrain-open").addEventListener("click", openTerrain);
}

const TERRAIN_LEGENDS = {
  sat: [["#38c7ff", "Por dónde corre el agua de lluvia (calculado con el relieve)"], ["#00e5c8", "Cuenca: el agua de esta zona baja hacia tu terreno"], ["#1565ff", "Río"], ["#00e5ff", "Canal"], ["#7cf3c4", "Acequia o desagüe"], ["#ff3d6e", "Tu terreno"]],
  hyps: [["#2e7d32", "Lo más bajo"], ["#e5d66a", "Medio"], ["#8e5e3c", "Alto"], ["#f5f5f5", "Lo más alto"], ["#333", "Curvas de nivel"]],
  slope: [["#43a047", "Plano (menos de 5 %)"], ["#fdd835", "Suave (5 a 15 %)"], ["#fb8c00", "Inclinado (15 a 30 %)"], ["#e53935", "Muy inclinado (más de 30 %)"]],
  water: [["#38c7ff", "Cauces de lluvia"], ["#00e5c8", "Cuenca de tu terreno"], ["#1565ff", "Ríos, canales y lagunas"]],
  sides: [["#3b2a1a", "Suelo con materia orgánica"], ["#7a5230", "Subsuelo"], ["#2f7fd1", "Agua subterránea (esquema)"], ["#5d5f66", "Roca"]],
};
function terrainLegend(mode) {
  $("terrain-legend").innerHTML = [...TERRAIN_LEGENDS[mode], ...TERRAIN_LEGENDS.sides].map(([c, l]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join("");
}
async function openTerrain() {
  const btn = $("terrain-open");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try {
    const { renderTerrain3D } = await import("./terrain3d.js");
    if (terrainView) terrainView.dispose();
    terrainView = await renderTerrain3D($("terrain3d"), {
      lat: state.site.lat, lon: state.site.lon, polygon: state.polygon, exaggeration: 2,
      onStats: (s) => {
        $("terrain-stats").textContent = `Altura entre ${num(s.min)} y ${num(s.max)} m en ${num(s.sizeKm, 1)} km; tu terreno a ${num(s.plotElev)} m. Cauces y cuenca calculados con el relieve (relleno de depresiones y dirección de máxima pendiente). Elevación: SRTM en teselas Terrarium (AWS Open Data), píxel de ${num(s.metresPerPixel)} m. Imagen: Esri World Imagery. Ríos y canales: OpenStreetMap. Los costados del bloque son un esquema, no un sondeo.`;
      },
      onPoint: (p) => say(p.stream ? `Ahí corre el agua cuando llueve: junta la lluvia de ${num(p.drainsHa)} ha. Mejor no sembrar justo en el cauce.` : `Ese punto está a ${num(p.elev)} m, con ${num(p.slope)} % de pendiente.${p.slope > 15 ? " Si siembras ahí, haz surcos a lo ancho de la pendiente." : ""}`, { state: "talk", ms: 7000, onClick: openTiri }),
    });
    if (!terrainView) return;
    btn.hidden = true;
    $("terrain-panel").hidden = false;
    terrainLegend("sat");
    const st = terrainView.stats;
    const facts = $("terrain-facts");
    facts.hidden = false;
    const paint = (osm) => {
      facts.innerHTML = `
        <div class="fact"><b>${st.basinHa < 1 ? "menos de 1" : num(st.basinHa)} ha</b><span>${isSimple() ? "de tierra mandan su lluvia a tu terreno" : "de cuenca drenan hacia tu terreno"}</span></div>
        <div class="fact"><b>${st.streamM === null ? "—" : st.streamM < 30 ? "Muy cerca" : `${num(st.streamM)} m`}</b><span>${isSimple() ? "hasta donde corre el agua de lluvia" : "al cauce de lluvia más cercano"}</span></div>
        <div class="fact"><b>${osm ? (osm.failed ? "Sin respuesta" : osm.total ? osm.total : "Ninguno") : "…"}</b><span>${osm && osm.named.length ? `ríos, canales o lagunas cerca: ${esc(osm.named.slice(0, 3).join(", "))}` : "ríos, canales o lagunas registrados cerca (OpenStreetMap)"}</span></div>`;
    };
    paint(null);
    terrainView.waterways.then((osm) => paint(osm || { total: null, named: [], failed: true }));
    say(st.basinHa > 20
      ? `Mira: el agua de lluvia de unas ${num(st.basinHa)} ha baja hacia tu terreno (zona turquesa). Cuando llueve fuerte, ten listas zanjas para sacarla.`
      : "Las líneas celestes son por donde corre la lluvia y los puntos que se mueven son el agua bajando. En los costados ves las capas del suelo y el agua subterránea.", { state: "talk", ms: 11000, onClick: openTiri });
    panel("relieve").querySelectorAll("[data-tmode]").forEach((b) => b.addEventListener("click", () => {
      panel("relieve").querySelectorAll("[data-tmode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      terrainView.setMode(b.dataset.tmode);
      terrainLegend(b.dataset.tmode);
    }));
    panel("relieve").querySelectorAll("[data-ttoggle]").forEach((c) => c.addEventListener("change", () => terrainView.toggle(c.dataset.ttoggle, c.checked)));
    $("terrain-spin").addEventListener("change", (e) => terrainView.spin(e.target.checked));
    $("terrain-ex").addEventListener("input", (e) => {
      $("terrain-ex-out").textContent = `${e.target.value}×`;
      terrainView.setExaggeration(Number(e.target.value));
    });
    $("terrain-lvl").addEventListener("input", (e) => {
      const m = Number(e.target.value);
      const r = terrainView.setLevel(m);
      $("terrain-lvl-out").textContent = m ? `${m} m sobre el punto más bajo` : "sin agua";
      $("terrain-lvl-note").textContent = m ? `Quedaría bajo el agua el ${num(r.flooded * 100)} % de la zona.${r.plot ? " Tu terreno también se mojaría." : " Tu terreno quedaría seco."} Simulación sencilla de «bañera»: no considera canales ni suelo.` : "";
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
        <div class="fact"><b>${mm(pick.data.cropWaterMm)}</b><span>${isSimple() ? "agua que necesita la planta" : "necesita el cultivo"}</span></div>
        <div class="fact"><b>${pct(pick.data.coverage)}</b><span>${isSimple() ? "de esa agua la pone la lluvia" : "lo cubre la lluvia"}</span></div>
        <div class="fact"><b>${mm(pick.data.irrigationMm)}</b><span>${isSimple() ? "debes poner tú con riego" : "hay que poner con riego"}${state.areaHa ? ` (${num(pick.data.irrigationMm * 10 * state.areaHa)} m³ en tu terreno)` : ""}</span></div>
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
    <p>${scarceMonths.length && isSimple() ? `En ${esc(scarceMonths.join(", "))} casi no llueve: guarda agua para esos meses.` : scarceMonths.length ? `Casi siempre hay semanas secas en ${esc(scarceMonths.join(", "))}: guarda agua o siembra con riego en esos meses.` : "No hay meses con semanas secas casi seguras."}</p>
    ${state.waterAvail === "scarce" ? notice(2, "<p>Dijiste que tienes muy poca agua: prioriza la rotación que ahorra agua y riega por goteo o por surcos cortos.</p>") : ""}
    ${source(`NASA POWER ${climate.meta.period.replace(" to ", " a ")}; necesidad del cultivo con evapotranspiración FAO-56 por coeficiente Kc.`)}`;
}

// --- Comparar (all plots at the same time) ---
/** Engine and hazard rules for a saved plot, from its own answers and the data fetched for it. */
function analyzeSnapshot(p, data) {
  const altitude = Number.isFinite(p.site.altitude) ? p.site.altitude : elevationAt(p.site.lat, p.site.lon);
  const siteClimate = (data && data.climate) || climate;
  const irr = Boolean(p.waterSource && p.waterSource !== "rain" && p.irrigSystem && p.irrigSystem !== "none");
  const result = recommend(siteClimate, cropsFor(p.site), {
    altitude, history: [asList(p.previous), asList(p.last)].filter((l) => l.length), irrigation: irr,
    priorities: p.priorities && p.priorities.length ? p.priorities : ["risk"], preferred: p.preferred || [],
  });
  const plot = (data && data.plot) || {};
  const soil = data && data.soil && data.soil.soil ? { ...data.soil.soil } : null;
  if (soil && p.labPh) soil.ph = p.labPh;
  const assessment = assessPlot({ altitude, slope: plot.slope || null, soil, gamc: plot.gamc || null, forecast: plot.forecast || null, conditions: plot.conditions || null }, result, crops);
  return { altitude, result, assessment, plot };
}
let compareToken = 0;
async function renderComparar() {
  const box = panel("comparar");
  const parcels = readStore().parcels.filter((p) => p.site && asList(p.last).length);
  if (parcels.length < 2) { box.innerHTML = '<h2>Comparar mis terrenos</h2><p class="hint">Guarda al menos dos terrenos (con su ubicación y lo que sembraste) para compararlos aquí.</p>'; return; }
  const token = ++compareToken;
  box.innerHTML = '<h2>Comparar mis terrenos</h2><p class="hint">Calculando cada terreno…</p>';
  await Promise.all(parcels.map(async (p) => {
    if (analysisCache.has(p.id)) return;
    const at = `lat=${p.site.lat.toFixed(5)}&lon=${p.site.lon.toFixed(5)}`;
    const plot = await loadJson(`/api/plot?${at}`, 20000).catch(() => null);
    analysisCache.set(p.id, { plot, soil: null, outlook: null, at: Date.now() });
  }));
  if (token !== compareToken) return;
  const sm = isSimple();
  const word = (lv) => (lv ? (sm ? LEVEL_SIMPLE[lv] : LEVEL[lv][2]) : "Sin dato");
  const cell = (lv) => `<span class="badge badge--${lv ? LEVEL[lv][0] : "none"}">${word(lv)}</span>`;
  const rows = parcels.map((p) => {
    const a = analyzeSnapshot(p, analysisCache.get(p.id));
    const hz = Object.fromEntries(a.assessment.hazards.map((h) => [h.id, h.level]));
    const best = a.result.strategies[1];
    const current = a.result.strategies[0];
    const first = best.years.find((y) => y.group !== "fallow");
    const worst = a.assessment.hazards.slice().sort((x, y) => y.level - x.level)[0];
    const slope = a.plot.slope ? a.plot.slope.percent : null;
    const overall = Math.max(...a.assessment.hazards.map((h) => h.level));
    return `<tr${p.id === state.parcelId ? ' class="is-current"' : ""}>
      <th scope="row"><span class="plot-dot" style="background:${esc(p.color || "#9e9e9e")}"></span>${esc(p.name || "Sin nombre")}</th>
      <td>${cell(overall)}</td>
      <td>${first ? `${esc(first.name)}<span class="small"> · ${sm ? monthPart(first.sowWeek) : weekLabel(first.sowWeek)}</span>` : "Descanso"}</td>
      <td>${worst && worst.level >= 2 ? esc(hz2(worst).title) : (sm ? "Nada grave" : "Sin riesgos altos")}</td>
      <td class="mid-up">${p.areaHa ? `${num(p.areaHa, 2)} ha` : "—"}</td>
      <td class="mid-up">${num(a.altitude)} m</td>
      <td class="mid-up">${cell(Math.max(hz.frost || 1, hz.frost_now || 1))}</td>
      <td class="mid-up">${cell(Math.max(hz.drought || 1, hz.waterlogging || 1))}</td>
      <td class="mid-up">${slope === null ? "—" : sm ? "" : `${num(slope, 1)} %`}</td>
      <td class="mid-up">${best.years.map((y) => esc(y.name)).join(" → ")}</td>
      <td class="adv-only">${current.score} → ${best.score}</td>
      <td class="adv-only">${mm(best.irrigationTotalMm)}</td>
      <td><button type="button" class="link" data-switch="${p.id}">${p.id === state.parcelId ? "Viendo" : "Ver"}</button></td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <h2>Comparar mis terrenos</h2>
    <p class="hint">${sm ? "Tus terrenos lado a lado. Toca «Ver» para abrir uno." : "Lo único que se ve de todos tus terrenos a la vez. Para ver el detalle de uno, elígelo arriba o toca «Ver»."}</p>
    <div id="compare-map" class="mini-map compare-map" role="img" aria-label="Tus terrenos en el mapa"></div>
    <div class="scroll"><table class="table compare">
      <thead><tr><th>Terreno</th><th>Estado</th><th>${sm ? "Qué sembrar primero" : "Primera siembra recomendada"}</th><th>${sm ? "Qué cuidar" : "Riesgo principal"}</th>
        <th class="mid-up">Superficie</th><th class="mid-up">Altitud</th><th class="mid-up">Helada</th><th class="mid-up">Agua</th><th class="mid-up">Pendiente</th>
        <th class="mid-up">Rotación recomendada</th><th class="adv-only">Puntaje (actual → recomendado)</th><th class="adv-only">Riego en 3 años</th><th><span class="sr-only">Abrir</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${source(`Cada terreno con sus propias respuestas. Clima: NASA POWER ${climate.meta.period.replace(" to ", " a ")}; relieve: NASA SRTM.`)}`;
  box.querySelectorAll("[data-switch]").forEach((b) => b.addEventListener("click", () => switchParcel(b.dataset.switch)));
  if (window.L) {
    const m = L.map($("compare-map"), { scrollWheelZoom: false });
    L.layerGroup(basemapLayers(state.basemap || "hibrido")).addTo(m);
    const pts = [];
    for (const p of parcels) {
      const color = p.color || "#9e9e9e";
      const layer = p.polygon && p.polygon.length >= 3 ? L.polygon(p.polygon, { color, weight: 3, fillColor: color, fillOpacity: 0.3 })
        : L.circleMarker([p.site.lat, p.site.lon], { radius: 9, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 });
      layer.bindTooltip(esc(p.name || "Sin nombre"), { permanent: parcels.length <= 6, direction: "top" }).addTo(m);
      layer.on("click", () => switchParcel(p.id));
      pts.push(...(p.polygon && p.polygon.length ? p.polygon : [[p.site.lat, p.site.lon]]));
    }
    m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
    if (state.tab !== "comparar") setTimeout(() => m.invalidateSize(), 0);
    compareMap = m;
  }
}
let compareMap = null;
const hz2 = (h) => hz(h);

// --- Riesgos ---
function renderRiesgos() {
  const a = state.assessment;
  panel("riesgos").innerHTML = `
    <h2>Riesgos y precauciones</h2>
    <p class="hint">${isSimple() ? "Lo que puede dañar tu cosecha y qué hacer." : "Climáticos, hidrológicos y del relieve, con lo que conviene hacer."}</p>
    ${a.hazards.map(hz).map((h) => notice(h.level, `<p><b>${esc(h.title)}: ${isSimple() ? h.levelLabel : `riesgo ${h.levelLabel}`}.</b> ${esc(h.text)}</p><p>${esc(h.action)}</p>${source(h.source)}`)).join("")}
    <h3>Lo que no conviene sembrar aquí</h3>
    ${a.avoid.length ? list(a.avoid.map((x) => `<b>${esc(x.name)}</b>: ${esc(isSimple() ? simpleReason(x.reasons[0]) : x.reasons.join("; "))}.`)) : '<p class="hint">Con estos datos, ningún cultivo de la lista queda descartado.</p>'}`;
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
    else if (y.weeks >= WEEKS) s += `<circle class="wheel__arc" style="--d:${i}" pathLength="1" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${cropColor(y.crop)}" stroke-width="${width}"/>`;
    else {
      const a0 = angle(y.sowWeek);
      const sweep = (y.weeks / WEEKS) * 2 * Math.PI;
      const [x0, y0] = point(r, a0);
      const [x1, y1] = point(r, a0 + sweep);
      s += `<path class="wheel__arc" style="--d:${i}" pathLength="1" d="M${x0} ${y0} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${cropColor(y.crop)}" stroke-width="${width}"/>`;
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
        <div class="strategy__photos mid-up">${[...new Set(s.years.map((y) => y.crop))].map((id) => (images.crops[id] ? `<img src="${esc(images.crops[id].thumb)}" alt="${esc(crops.crops.find((c) => c.id === id).name)}" title="Foto: ${esc(images.crops[id].author)}, ${esc(images.crops[id].licence)} (Wikimedia Commons)" translate="no" loading="lazy" referrerpolicy="no-referrer">` : "")).join("")}</div>
        ${wheel(s)}
        <ul class="years">${s.years.map((y) => `<li><span class="swatch" style="background:${cropColor(y.crop)}"></span><span>Año ${y.year}: <b>${esc(y.name)}</b></span><span class="when">${y.group === "fallow" ? "El suelo descansa o lleva abono verde." : `Siembra hacia el ${weekLabel(y.sowWeek)}. Riego: ${mm(y.irrigationMm)}.`}</span></li>`).join("")}</ul>
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

// --- Plagas, cuidados, especies invasoras y remedios ---
const PEST_KINDS = [
  ["todos", "Todos"], ["insecto", "Insectos y ácaros"], ["hongo", "Hongos y bacterias"], ["virus", "Virus"],
  ["nematodo", "Nematodos"], ["molusco", "Caracoles y babosas"], ["fauna", "Aves y roedores"],
];
const kindOf = (type) => {
  const t = plainText(type);
  if (/insecto|acaro/.test(t)) return "insecto";
  if (/hongo|oomiceto|bacteria/.test(t)) return "hongo";
  if (/virus/.test(t)) return "virus";
  if (/nematodo/.test(t)) return "nematodo";
  if (/molusco/.test(t)) return "molusco";
  if (/ave|roedor/.test(t)) return "fauna";
  return "insecto";
};
/** One entry per species, with every crop it attacks. */
function pestCatalog() {
  const byName = new Map();
  for (const [cropId, list] of Object.entries(knowledge.pests)) {
    for (const p of list) {
      const key = p.scientific || p.name;
      if (!byName.has(key)) byName.set(key, { ...p, kind: kindOf(p.type), hosts: [] });
      if (cropById(cropId)) byName.get(key).hosts.push(cropId);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
function pestCard(p, i = 0) {
  return `<article class="card pest-card" style="--i:${i}">
    ${photo(images.pests[p.scientific], p.name)}
    <p class="card__title">${esc(p.name)}</p>
    <p class="adv-only small"><i>${esc(p.scientific)}</i> · ${esc(p.type)}</p>
    <p class="mid-up small">${esc(p.season)}</p>
    <p><b>Señales:</b> ${esc(p.signs)}</p>
    <p class="mid-up"><b>Prevención:</b> ${esc(p.prevention)}</p>
    <p><b>Casero:</b> ${esc(p.homemade)}</p>
    ${p.hosts && p.hosts.length ? `<p class="adv-only small"><b>Ataca a:</b> ${esc(p.hosts.map(cropName).join(", "))}</p>` : ""}
  </article>`;
}
function renderPlagas() {
  const views = [["mis", "Mis cultivos"], ["todo", "Catálogo completo"], ["invasoras", "Especies invasoras"], ["remedios", "Remedios caseros"]];
  const mine = [...new Set([...state.last, ...state.result.strategies[1].years.filter((y) => y.group !== "fallow").map((y) => y.crop)])].filter((id) => cropById(id));
  const all = pestCatalog();
  let body = "";
  if (state.pestView === "mis") {
    body = mine.map((id) => {
      const c = cropById(id);
      const pests = knowledge.pests[id] || [];
      return `<section class="crop-care">
        <div class="crop-head">${photo(images.crops[id], c.name, "photo photo--round")}<div><h3>${esc(c.name)}</h3>
          <p class="adv-only small"><i>${esc(c.scientific || "")}</i> · ${esc(c.family)}</p></div></div>
        ${knowledge.fertility[id] ? `<p><b>Abono:</b> ${esc(knowledge.fertility[id])}</p>` : ""}
        ${c.custom ? '<p class="hint small">Cultivo agregado con «Otro»: no tiene fichas de plagas propias. Pregúntale a Tiri.</p>' : ""}
        ${pests.length ? `<div class="cards">${pests.map((p, i) => pestCard({ ...p, hosts: [] }, i)).join("")}</div>` : ""}
      </section>`;
    }).join("") || '<p class="hint">Marca qué siembras en el paso 2 para ver sus plagas y cuidados.</p>';
  } else if (state.pestView === "todo") {
    const q = plainText(state.pestQuery);
    const list = all.filter((p) => (state.pestKind === "todos" || p.kind === state.pestKind)
      && (!state.pestCrop || p.hosts.includes(state.pestCrop))
      && (!q || plainText(`${p.name} ${p.scientific} ${p.signs}`).includes(q)));
    const hostIds = [...new Set(all.flatMap((p) => p.hosts))].sort((a, b) => cropName(a).localeCompare(cropName(b), "es"));
    body = `<div class="catalog-tools">
        <div class="chips chips--small" role="group" aria-label="Tipo">${PEST_KINDS.map(([k, l]) => `<button type="button" class="chip" data-pest-kind="${k}" aria-pressed="${state.pestKind === k}">${esc(l)}</button>`).join("")}</div>
        <div class="catalog-row">
          <label class="sort">Cultivo <select id="pest-crop"><option value="">Todos</option>${hostIds.map((id) => `<option value="${esc(id)}"${state.pestCrop === id ? " selected" : ""}>${esc(cropName(id))}</option>`).join("")}</select></label>
          <input type="search" id="pest-q" class="crop-search" value="${esc(state.pestQuery)}" placeholder="Buscar plaga o señal" aria-label="Buscar plaga o señal">
        </div>
      </div>
      <p class="hint small">${list.length} de ${all.length} plagas y enfermedades.</p>
      <div class="cards">${list.map((p, i) => pestCard(p, i)).join("") || '<p class="hint">Nada coincide con ese filtro.</p>'}</div>`;
  } else if (state.pestView === "invasoras") {
    const list = knowledge.invasive.filter((x) => state.invKind === "todos" || x.kind === state.invKind);
    body = `<div class="chips chips--small" role="group" aria-label="Tipo">${[["todos", "Todas"], ["planta", "Plantas"], ["animal", "Animales"]].map(([k, l]) => `<button type="button" class="chip" data-inv-kind="${k}" aria-pressed="${state.invKind === k}">${esc(l)}</button>`).join("")}</div>
      <div class="cards">${list.map((x, i) => `<article class="card" style="--i:${i}">${photo(images.invasive[x.scientific], x.name)}
        <p class="card__title">${esc(x.name)}</p><p class="adv-only small"><i>${esc(x.scientific)}</i></p>
        <p class="mid-up small">Origen: ${esc(x.origin)}</p><p>${esc(x.risk)}</p><p><b>Qué hacer:</b> ${esc(x.action)}</p></article>`).join("")}</div>`;
  } else {
    body = `<div class="cards">${knowledge.repellents.map((r, i) => `<article class="card" style="--i:${i}"><p class="card__title">${esc(r.name)}</p><p class="small">Para ${esc(r.for)}</p><p>${esc(r.how)}</p><p class="small"><b>Cuidado:</b> ${esc(r.care)}</p></article>`).join("")}</div>
      ${notice(2, `<p>${esc(knowledge.meta.safety)}</p>`)}`;
  }
  panel("plagas").innerHTML = `
    <h2>Plagas, cuidados y especies invasoras</h2>
    <p class="hint mid-up">${esc(knowledge.meta.status)}</p>
    <div class="segmented" role="group" aria-label="Sección">${views.map(([k, l]) => `<button type="button" data-pest-view="${k}" aria-pressed="${state.pestView === k}">${esc(l)}</button>`).join("")}</div>
    ${body}
    <p class="source adv-only">Fuentes de referencia: ${esc(knowledge.meta.sources.join("; "))}.</p>`;
  const p = panel("plagas");
  p.querySelectorAll("[data-pest-view]").forEach((b) => b.addEventListener("click", () => { state.pestView = b.dataset.pestView; renderPlagas(); }));
  p.querySelectorAll("[data-pest-kind]").forEach((b) => b.addEventListener("click", () => { state.pestKind = b.dataset.pestKind; renderPlagas(); }));
  p.querySelectorAll("[data-inv-kind]").forEach((b) => b.addEventListener("click", () => { state.invKind = b.dataset.invKind; renderPlagas(); }));
  const sel = $("pest-crop");
  if (sel) sel.addEventListener("change", () => { state.pestCrop = sel.value; renderPlagas(); });
  const q = $("pest-q");
  if (q) q.addEventListener("input", () => { state.pestQuery = q.value; const pos = q.selectionStart; renderPlagas(); const again = $("pest-q"); again.focus(); again.setSelectionRange(pos, pos); });
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
    <dl class="kv">${state.site && !state.site.local ? `
      <div><dt>Datos municipales</dt><dd>Los mapas de distritos, zonas y drenaje solo existen para Cochabamba (GAMC). Consulta el catastro o la alcaldía de tu lugar.</dd></div>` : `
      <div><dt>Distrito y comuna (GAMC)</dt><dd>${gamcDistrict(g) ? `<span translate="no">${esc(gamcDistrict(g).Distrito)}, ${esc(gamcDistrict(g).Comuna)}</span>` : "Sin dato"}</dd></div>
      <div><dt>Zona periurbana (GAMC)</dt><dd>${zone ? esc(zone.Periurbano) : "Fuera de las zonas periurbanas o sin dato"}</dd></div>
      <div><dt>Área de drenaje e influencia (GAMC)</dt><dd>${drainage ? "Sí" : "No, o sin dato"}</dd></div>`}
      <div><dt>Propietario registrado</dt><dd>Sin acceso a registros oficiales</dd></div>
    </dl>
    ${notes.map((n) => notice(2, `<p>${esc(n)}</p>`)).join("")}
    <h3>Dónde verificar</h3>
    ${list(knowledge.legal.checks.map((c) => `<b>${esc(c.topic)}:</b> ${esc(c.where)}`))}
    ${inBolivia(state.site.lat, state.site.lon) ? legalBoliviaHtml(isSimple()) : ""}
    <p class="hint">Orientación general, no es asesoría legal.</p>`;
}

// --- Cochabamba y Bolivia ---
const GAMC_ZONE_TEXT = {
  "Periurbanos consolidados": "La ciudad ya se instaló aquí. Producir sigue siendo posible en huertos y parcelas, pero el plan municipal puede limitar usos: consulta Catastro antes de invertir en riego o construcciones.",
  "Periurbanos en crecimiento": "Zona de transición entre campo y ciudad, la más presionada por loteamientos. Producir aquí también protege áreas verdes y de recarga de agua.",
};
function renderBolivia() {
  const g = (state.plot && state.plot.gamc) || state.site.gamc;
  const zone = gamcZone(g);
  const district = gamcDistrict(g);
  const drainage = g && g.drenaje && !g.drenaje.error;
  const pick = selectedCrop();
  const gamcHtml = state.site.local && !district && !zone ? `
    <h3>Municipio</h3>
    <p>Tu terreno está fuera del municipio de Cochabamba (Cercado), así que las capas oficiales del GAMC no lo cubren. Para uso de suelo, catastro y riego, consulta a la alcaldía de tu municipio${state.site.place ? ` (<span translate="no">${esc(String(state.site.place).split(",")[0])}</span>)` : ""}.</p>` : state.site.local ? `
    <h3>Tu terreno en el municipio de Cochabamba (GAMC)</h3>
    <div class="facts">
      <div class="fact"><b translate="no">${district ? esc(district.Distrito) : "Sin dato"}</b><span>${district ? `distrito · comuna <span translate="no">${esc(String(district.Comuna).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</span>` : "distrito municipal"}</span></div>
      <div class="fact"><b>${zone ? esc(zone.Periurbano) : "Fuera de zona periurbana"}</b><span>zona del plan municipal</span></div>
      <div class="fact"><b>${drainage ? "Sí" : "No"}</b><span>${drainage ? "dentro del área de drenaje e influencia: franja de seguridad de torrenteras y canales" : "fuera del área de drenaje e influencia"}</span></div>
    </div>
    ${zone && GAMC_ZONE_TEXT[zone.Periurbano] ? `<p>${esc(GAMC_ZONE_TEXT[zone.Periurbano])}</p>` : ""}
    ${drainage ? notice(2, "<p><b>Cerca de una torrentera o canal.</b> Las crecidas del Tunari bajan rápido: no rellenes ni construyas en la franja de seguridad, deja libre el paso del agua y no siembres en el cauce.</p>") : ""}
    <p class="source">Capas oficiales del Gobierno Autónomo Municipal de Cochabamba (geoservicios del GAMC): distritos, zonas periurbanas y área de drenaje e influencia.</p>` : "";
  panel("bolivia").innerHTML = renderBoliviaTab({ site: state.site, images, simple: isSimple(), coverage: pick && pick.data ? pick.data.coverage : 1, gamcHtml });
  buildFlags();
  const ras = $("ras-in");
  if (ras) ras.addEventListener("input", () => {
    const v = Number(ras.value);
    if (!ras.value || !Number.isFinite(v)) { $("ras-out").textContent = "Escribe la RAS para estimar el sodio intercambiable."; return; }
    const r = psiFromRas(v);
    $("ras-out").innerHTML = `PSI estimado: <b>${num(r.psi, 1)} %</b>. ${esc(r.text)} <span class="source">Modelo del Valle Alto (84 muestras, R² = 0,85).</span>`;
  });
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
  // answers already written in Quechua by the model, and the person's own words, are not translated again
  log.innerHTML = state.chat.map((m) => `<div class="bubble bubble--${m.role}"><p${m.role === "user" || (m.lang && m.lang !== "es") ? ' translate="no"' : ""}>${esc(m.content)}</p>${m.note ? `<p class="source">${esc(m.note)}</p>` : ""}</div>`).join("")
    + (state.asking ? `<div class="bubble bubble--assistant bubble--thinking">${PLANT_SVG}<p>Tiri está revisando tu terreno…</p></div>` : "");
  log.scrollTop = log.scrollHeight;
}
async function askTiri(question) {
  const text = question.trim();
  if (!text || state.asking) return;
  const history = state.chat.slice(1).map(({ role, content }) => ({ role, content }));
  state.chat.push({ role: "user", content: text });
  // the Moon is a secret: Tiri only answers with a riddle until it is found
  if (/\b(luna|moon|killa|phaxsi|lune|mond|lua)\b/i.test(text) && !moonUnlocked()) {
    state.chat.push({ role: "assistant", content: "La Luna guarda un secreto. Cuando el cielo esté limpio y las montañas toquen las estrellas, llámala tres veces desde el planeta.", note: "Pista de Tiri." });
    renderTiri();
    setFace("happy");
    return;
  }
  state.asking = true;
  renderTiri();
  try {
    setFace("think");
    const r = await fetch("/api/agent", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: $("view-results").hidden ? "inicio" : state.tab,
        question: text, lat: state.site ? state.site.lat : null, lon: state.site ? state.site.lon : null,
        history: [state.previous, state.last].filter((l) => l.length), irrigation: irrigation(), priorities: [...state.priorities], messages: history.slice(-6),
        customCrops: state.customCrops,
        lang: state.lang, mode: state.mode,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.answer) throw new Error();
    for (const a of data.actions || []) runAction(a).catch(() => {});
    setFace("happy");
    if (voiceEnabled()) speak(data.answer, state.lang);
    state.chat.push({ role: "assistant", content: data.answer, lang: data.lang, note: data.engine === "rules" ? "Respuesta automática con los datos de tu terreno." : `Redactada con IA (${data.model || data.engine}) a partir de tus datos.` });
  } catch {
    setFace("idle");
    state.chat.push({ role: "assistant", content: "No pude responder ahora. Revisa tu conexión e intenta de nuevo." });
  }
  state.asking = false;
  renderTiri();
}

// ---------- Landing fact (computed live) ----------
function renderHeroFact() {
  const alt = elevationAt(EXAMPLE.lat, EXAMPLE.lon);
  const r = recommend(baseClimate, crops, { altitude: alt, history: ["papa", "papa"], irrigation: false, priorities: ["water"] });
  const [current, best, water] = r.strategies;
  const saved = Math.max(0, current.irrigationTotalMm - water.irrigationTotalMm);
  document.querySelector("#hero-fact .hero__fact-body").innerHTML = `
    <span class="big" translate="no"><span data-count-to="${current.score}">${current.score}</span> → <span class="big__to" data-count-to="${best.score}">${best.score}</span></span>
    <span>puntos sobre 100 al dejar de repetir papa y rotar con ${esc(best.years.map((y) => y.name.toLowerCase()).join(", "))}.</span>
    <span class="big" translate="no"><span data-count-to="${Math.round(saved * 10)}">${num(saved * 10)}</span> m³</span>
    <span>de agua de riego por hectárea que ahorra en tres años la rotación que cuida el agua.</span>
    <span class="source">Calculado ahora con NASA POWER ${esc(baseClimate.meta.period.slice(0, 4))}–${esc(baseClimate.meta.period.slice(14, 18))} y NASA SRTM, ${num(alt)} m de altitud.</span>`;
}

// ---------- The whole planet ----------
let world = null;
let worldBands = null;
/** The flags of Cochabamba and Bolivia, cut in thin slices that wave one after another. */
function buildFlags() {
  const names = { "flag--cbba": "Cochabamba", "flag--bolivia": "Bolivia" };
  document.querySelectorAll("[data-flag]").forEach((f) => {
    if (f.children.length) return;
    const cls = [...f.classList].find((c) => names[c]);
    f.dataset.name = names[cls] || "";
    const N = 14;
    f.innerHTML = Array.from({ length: N }, (_, k) => `<i style="--i:${k};--amp:${((k / N) * 6).toFixed(1)};--shade:${(0.5 + 0.5 * Math.sin((k / N) * Math.PI * 2)).toFixed(2)};background-position:-${k * 5}px 0"></i>`).join("");
  });
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** Photos for the loading screens: Cochabamba first (two of every three), then crops, pests and invasive species. */
function photoPool() {
  const pick = (group, label) => Object.values(images[group] || {}).filter(Boolean).map((x) => ({ src: x.thumb, title: x.title, credit: `${x.author}, ${x.licence}`, label }));
  const local = shuffle(cbbaPhotos.map((x) => ({ src: x.src, title: x.title, credit: `${x.author}, ${x.licence}`, label: /Bolivia/.test(x.title) && !/Cochabamba/.test(x.title) ? "Bolivia" : "Cochabamba" })));
  const rest = shuffle([...pick("crops", "Cultivo"), ...pick("pests", "Plaga o enfermedad"), ...pick("invasive", "Especie invasora")]);
  const pool = [];
  while (local.length || rest.length) {
    if (local.length) pool.push(local.shift());
    if (local.length) pool.push(local.shift());
    if (rest.length) pool.push(rest.shift());
  }
  return pool;
}
/** While the planet loads: real photos of crops, pests and invasive species, one after another. */
function photoReel(box) {
  const pool = photoPool().slice(0, 30);
  if (!pool.length || !box) return () => {};
  let k = 0;
  const show = () => {
    const x = pool[k++ % pool.length];
    const fig = document.createElement("figure");
    fig.className = "reel__item";
    fig.innerHTML = `<img src="${esc(x.src)}" alt="" referrerpolicy="no-referrer"><figcaption><b>${esc(x.label)}</b> ${esc(x.title || "")}<span translate="no">${esc(x.credit)}</span></figcaption>`;
    box.append(fig);
    requestAnimationFrame(() => fig.classList.add("is-in"));
    const old = box.querySelectorAll(".reel__item");
    if (old.length > 2) old[0].remove();
  };
  show();
  const id = setInterval(show, 1600);
  return () => clearInterval(id);
}
async function initWorld() {
  const box = $("globe");
  if (!box) return;
  const loader = $("globe-loader");
  const stopReel = photoReel($("globe-reel"));
  const bar = $("globe-progress");
  const done = () => { stopReel(); loader.classList.add("is-done"); setTimeout(() => { loader.hidden = true; }, 900); };
  try {
    const mod = await import("./globe.js");
    worldBands = mod.CLIMATE_BANDS;
    world = await mod.createGlobe(box, {
      onPick: (p) => pickPlace(p.lat, p.lon),
      onSatellite: showSatellite,
      onMoonClick: moonKnock,
      onMoonPick: (p) => showLunarSite(p.lat, p.lon),
      onProgress: (p) => { bar.style.transform = `scaleX(${p.toFixed(3)})`; $("globe-pct").textContent = `${Math.round(p * 100)} %`; if (p >= 1) setTimeout(done, 600); },
    });
    renderWorldControls(mod.GLOBE_LAYERS);
    setTimeout(done, 15000);
  } catch {
    stopReel();
    loader.innerHTML = '<p class="world__fail">El planeta en 3D no pudo cargar en este equipo. Usa «Analizar mi terreno» para elegir tu lugar en el mapa.</p>';
  }
}
function renderWorldControls(layers) {
  const box = $("world-layers");
  box.innerHTML = layers.map((l, i) => `<button type="button" class="layer-chip" data-layer="${esc(l.id)}" aria-pressed="${i === 0}">${esc(l.label)}</button>`).join("");
  const legend = $("world-legend");
  const setLegend = (l) => {
    legend.innerHTML = `<p>${esc(l.legend)}</p>${l.colors ? `<span class="legend-bar" style="background:linear-gradient(90deg,${l.colors.join(",")})"></span>` : ""}`;
  };
  setLegend(layers[0]);
  box.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", async () => {
    box.querySelectorAll("[data-layer]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const l = layers.find((x) => x.id === b.dataset.layer);
    legend.innerHTML = '<p class="hint">Descargando la capa de NASA GIBS…</p>';
    try { await world.setLayer(l.id); setLegend(l); } catch { legend.innerHTML = '<p class="hint">NASA GIBS no respondió con esa capa ahora. Prueba otra.</p>'; }
  }));
  $("world-bands").addEventListener("change", (e) => {
    world.setBands(e.target.checked);
    $("world-bands-legend").hidden = !e.target.checked;
  });
  $("world-bands-legend").innerHTML = worldBands.map((b) => `<span><i style="background:${b.color}"></i>${esc(b.name)}</span>`).join("");
  $("world-relief").addEventListener("input", (e) => world.setRelief(Number(e.target.value)));
  $("world-clouds").addEventListener("change", (e) => world.setClouds(e.target.checked));
  if (moonUnlocked()) $("world-moon").hidden = false;
  $("world-moon").addEventListener("click", () => (world.inMoon() ? leaveMoon() : goToMoon()));
  // what each layer shows, in Tiri's words
  box.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => {
    const l = layers.find((x) => x.id === b.dataset.layer);
    if (l) say(l.legend, { state: "talk", ms: 6000, onClick: openTiri });
  }));
  $("world-locate").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => { world.flyTo(p.coords.latitude, p.coords.longitude); world.mark(p.coords.latitude, p.coords.longitude); pickPlace(p.coords.latitude, p.coords.longitude); });
  });
  $("world-search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("world-q").value.trim();
    if (!q) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "jsonv2", q, limit: "1" })}`, { signal: AbortSignal.timeout(10000) });
      const [hit] = await r.json();
      if (!hit) { $("world-pick").hidden = false; $("world-pick").innerHTML = `<p>No encontré «${esc(q)}». Prueba con otro nombre.</p>`; return; }
      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      world.flyTo(lat, lon);
      world.mark(lat, lon);
      pickPlace(lat, lon, hit.display_name.split(",").slice(0, 3).join(","));
    } catch { /* search is optional */ }
  });
}
// ---------- Satellites and the secret of the Moon ----------
function showSatellite(s) {
  const card = $("world-pick");
  card.hidden = false;
  card.innerHTML = `<p class="world__place">Satélite ${esc(s.name)}</p>
    <div class="world__facts world__facts--sat"><span><b>${esc(s.mission)}</b>misión</span><span><b>${esc(s.orbit)}</b>órbita</span></div>
    <p>${esc(s.measures)}</p><p class="hint small">${esc(s.use)} El modelo 3D es ilustrativo; la órbita y el tamaño no están a escala.</p>`;
  replay(card);
  say(`Ese es ${s.name}. ${s.measures}`, { state: "happy", ms: 9000, onClick: openTiri });
}
const moonUnlocked = () => { try { return localStorage.getItem("yatirix.moon") === "1"; } catch { return false; } };
const moonKnocks = [];
let moonHinted = false;
/** The secret: with the sky clear (no clouds) and the mountains raised to the top, tap the Moon three times. */
function moonKnock() {
  const now = Date.now();
  moonKnocks.push(now);
  while (moonKnocks.length && now - moonKnocks[0] > 4000) moonKnocks.shift();
  const ready = !$("world-clouds").checked && Number($("world-relief").value) >= Number($("world-relief").max) - 1e-6;
  if (moonUnlocked()) { goToMoon(); return; }
  if (moonKnocks.length >= 3 && ready) { unlockMoon(); return; }
  if (moonKnocks.length >= 3 && !moonHinted) {
    moonHinted = true;
    say("La Luna no contesta… Dicen los abuelos: «cuando el cielo esté limpio y las montañas toquen las estrellas, llámala tres veces».", { state: "think", ms: 12000, onClick: openTiri });
  } else if (moonKnocks.length === 1) {
    say("Esa es la Luna. Está a unos 384.000 km; aquí la ves mucho más cerca.", { state: "happy", ms: 6000 });
  }
}
function unlockMoon() {
  try { localStorage.setItem("yatirix.moon", "1"); } catch { /* this visit only */ }
  const banner = $("moon-unlock");
  banner.hidden = false;
  banner.classList.remove("is-in");
  void banner.offsetWidth;
  banner.classList.add("is-in");
  setTimeout(() => { banner.hidden = true; }, 5200);
  $("world-moon").hidden = false;
  goToMoon();
}
function goToMoon() {
  world.enterMoon();
  $("world-moon").textContent = "Volver a la Tierra";
  document.querySelector(".world").classList.add("is-moon");
  const card = $("world-pick");
  card.hidden = false;
  card.innerHTML = `<p class="world__place">La Luna</p>
    <p>Toca cualquier punto de la Luna y te digo cómo es su terreno, cuánto sol recibe y qué se podría sembrar ahí.</p>
    <p class="hint small">Textura ilustrativa con los mares y cráteres en su posición real. La bandera marca el Mar de la Tranquilidad, donde bajó el Apolo 11 en 1969.</p>`;
  replay(card);
  setTimeout(() => say("¡Llegamos a la Luna! Plantamos la bandera de Yatiri X. En la Luna no hay viento: ondea solo de alegría. Toca un lugar y vemos qué se podría sembrar.", { state: "happy", ms: 12000, onClick: openTiri }), 2600);
}
function leaveMoon() {
  world.exitMoon();
  $("world-moon").textContent = "Ir a la Luna";
  document.querySelector(".world").classList.remove("is-moon");
  $("world-pick").hidden = true;
}
function showLunarSite(lat, lon) {
  const x = lunarSite(lat, lon);
  const card = $("world-pick");
  card.hidden = false;
  card.innerHTML = `<p class="world__place">${esc(x.name)}</p>
    <div class="world__facts"><span><b>${esc(x.kind)}</b>terreno</span><span><b>${esc(x.temp)}</b>temperatura</span><span><b>${esc(x.light)}</b>luz</span><span><b>1/6</b>de la gravedad de la Tierra</span></div>
    <p>${esc(x.ground)}</p>
    <p><b>Para una granja aquí:</b> ${esc(x.plan)}</p>
    <details class="moon-farm"><summary>Qué sembrar en la Luna y cómo</summary>
      <h4>Cultivos candidatos</h4><ul>${LUNAR_FARMING.crops.map(([n, w]) => `<li><b>${esc(n)}:</b> ${esc(w)}</li>`).join("")}</ul>
      <h4>Cómo</h4><ol>${LUNAR_FARMING.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <h4>Lo que ya se probó</h4><ul>${LUNAR_FARMING.evidence.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </details>
    <p class="hint small">Valores aproximados para curiosear: no es un análisis agrícola como el de la Tierra.</p>`;
  replay(card);
  say(`${x.kind}: ${x.plan}`, { state: "talk", ms: 9000, onClick: openTiri });
}

/** A place picked on the planet: elevation, climate band, local time and the way to analyse it. */
async function pickPlace(lat, lon, name = null) {
  const card = $("world-pick");
  card.hidden = false;
  card.innerHTML = '<p class="hint">Leyendo ese punto del planeta…</p>';
  replay(card);
  if (world) world.flyTo(lat, lon, 2.2);
  const band = (worldBands || []).find((b) => Math.abs(lat) >= b.from && Math.abs(lat) < b.to) || { name: "—", color: "#ccc" };
  const solar = new Date(Date.now() + (lon / 15) * 3600e3);
  const hour = `${String(solar.getUTCHours()).padStart(2, "0")}:${String(solar.getUTCMinutes()).padStart(2, "0")}`;
  const [where, place] = await Promise.all([altitudeAt(lat, lon).catch(() => null), name ? Promise.resolve(name) : placeName(lat, lon)]);
  if (where && where.altitude < -5) {
    card.innerHTML = `<p><b>Mar u océano</b> (${num(-where.altitude)} m de profundidad). Elige un punto en tierra firme para analizarlo.</p>`;
    return;
  }
  card.innerHTML = `
    <p class="world__place" translate="no">${esc(place || `${lat.toFixed(3)}, ${lon.toFixed(3)}`)}</p>
    <div class="world__facts">
      <span><b>${where ? `${num(where.altitude)} m` : "—"}</b>altitud</span>
      <span><b><i class="band-dot" style="background:${band.color}"></i>${esc(band.name)}</b>franja climática</span>
      <span><b>${hour}</b>hora solar</span>
      <span><b>${lat >= 0 ? "Norte" : "Sur"}</b>hemisferio</span>
    </div>
    <div class="world__actions">
      <button type="button" class="btn btn--primary btn--shine" id="world-go" data-magnetic>Analizar este lugar</button>
      <button type="button" class="btn btn--ghost" id="world-ask">Preguntarle a Tiri</button>
    </div>
    ${where && where.local ? '<p class="hint small">Estás en Cochabamba: además se usan las capas oficiales del municipio.</p>' : '<p class="hint small">Se calculará con 45 años de NASA POWER para este punto exacto.</p>'}`;
  $("world-go").addEventListener("click", async () => {
    newParcel();
    show("wizard");
    if (map) map.setView([lat, lon], 15);
    await selectSite(lat, lon, place);
  });
  $("world-ask").addEventListener("click", async () => {
    await selectSite(lat, lon, place);
    openTiri();
    askTiri("¿Qué puedo sembrar en este lugar y qué riesgos tiene?");
  });
}

// ---------- Start ----------
/** Crop names and months are swapped like numbers when translating (maíz -> sara), custom crops included. */
function refreshTerms() {
  const terms = { ...QU_CROPS };
  for (const c of crops.crops) {
    const short = c.name.replace(/\s*\(.*\)$/, "");
    if (!terms[c.name]) terms[c.name] = c.name;
    if (short !== c.name && !terms[short]) terms[short] = terms[c.name];
  }
  // month names too (Quechua in Cochabamba uses the Spanish ones): one translation for every date
  for (const m of [...MONTHS, ...MONTHS_LONG]) terms[m] = m;
  setTerms(terms);
}
function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  $("mode").value = mode;
  savePrefs();
  if (state.result) { renderResults(); setTab(state.tab); }
}
const LANG_CODES = ["es", "qu", "ay", "gn", "en", "pt", "fr", "de", "it", "sw", "hi", "zh", "ar"];
function setLang(lang) {
  if (!LANG_CODES.includes(lang)) lang = "es";
  state.lang = lang;
  applyLanguage(lang);
  splitWords(document.querySelector("[data-split]"));
  $("lang").value = lang;
  renderStepper();
  if ($("home-modules").children.length) renderHomeModules();
  if (state.result) { renderTabs(); renderPredicciones(); }
  setLanguage(lang, { skipValues: QU_VALUES });
  savePrefs();
}

async function start() {
  initMotion();
  try {
    [climate, crops, grid, knowledge] = await Promise.all(["climate_weekly", "crops", "srtm_grid", "knowledge"].map((f) => loadJson(`data/${f}.json`)));
    baseClimate = climate;
  } catch (error) {
    document.querySelector("#hero-fact .hero__fact-body").textContent = `No se pudieron cargar los datos. ${error.message}. Recarga la página.`;
    return;
  }
  // crop names (and their short forms, "Frijol" for "Frijol (poroto)") are swapped like numbers when translating
  refreshTerms();

  try { images = await loadJson("data/images.json", 8000); } catch { /* photos are optional */ }
  try { cbbaPhotos = (await loadJson("data/cbba_images.json", 8000)).photos || []; } catch { /* optional */ }
  buildFlags();
  try {
    const sprite = await (await fetch("img/icons.svg")).text();
    const holder = document.createElement("div");
    holder.className = "sprite";
    holder.setAttribute("aria-hidden", "true");
    holder.innerHTML = sprite;
    document.body.prepend(holder);
  } catch { /* icons fall back to empty boxes */ }
  loadJson("/api/config", 8000).then((c) => {
    if (!c.cloud) return;
    account.config = c.cloud;
    if (cloud.hasPendingSession()) startAccount(); else renderSaved();
  }).catch(() => {});
  loadJson("/api/health", 20000).then((h) => {
    if (h.whatsapp_number) {
      state.waNumber = h.whatsapp_number;
      if (state.result) renderPredicciones();
      const a = $("tiri-wa");
      a.href = `https://wa.me/${h.whatsapp_number}?text=${encodeURIComponent("Hola Tiri")}`;
      a.hidden = false;
    }
  }).catch(() => {});
  const prefs = readStore().prefs || {};
  if (prefs.basemap) state.basemap = prefs.basemap;
  setMode(prefs.mode || "medio");
  // first visit: the browser's language when Yatiri X speaks it
  const browserLang = (navigator.language || "es").slice(0, 2).toLowerCase();
  setLang(LANG_CODES.includes(prefs.lang) ? prefs.lang : LANG_CODES.includes(browserLang) ? browserLang : "es");
  renderHomeModules();
  renderHeroFact();
  initWorld();
  // Tiri: face, voice and the watch over saved plots
  $("tiri-avatar").innerHTML = avatarSVG(34);
  $("tiri-avatar-big").innerHTML = avatarSVG(64);
  $("tiri-voice").checked = voiceEnabled();
  $("tiri-voice").addEventListener("change", (e) => setVoice(e.target.checked));
  $("tiri-notify").addEventListener("click", async () => {
    if (!("Notification" in window)) { $("tiri-notify").textContent = "Este navegador no permite avisos"; return; }
    const p = await Notification.requestPermission();
    $("tiri-notify").textContent = p === "granted" ? "Avisos del navegador activados" : "Avisos bloqueados en este navegador";
  });
  const listen = microphone(() => state.lang, (text) => { openTiri(); askTiri(text); }, (on) => $("tiri-mic").classList.toggle("is-listening", on));
  if (listen) { $("tiri-mic").hidden = false; $("tiri-mic").addEventListener("click", listen); }
  setTimeout(() => say("¡Hola! Soy Tiri. Toca un lugar del planeta o pregúntame lo que quieras, también hablando.", { state: "happy", ms: 9000, onClick: openTiri }), 4500);
  setTimeout(tiriWatch, 7000);
  renderForm();
  renderSaved();
  renderTiri();
  goStep(1);
  document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); show(el.dataset.go); }));
  $("lang").addEventListener("change", (e) => setLang(e.target.value));
  // high contrast, remembered in this browser
  const setHc = (on) => { document.body.classList.toggle("hc", on); $("hc").setAttribute("aria-pressed", String(on)); try { localStorage.setItem("yatirix.hc", on ? "1" : "0"); } catch { /* this visit only */ } };
  try { setHc(localStorage.getItem("yatirix.hc") === "1"); } catch { /* default off */ }
  $("hc").addEventListener("click", () => setHc(!document.body.classList.contains("hc")));
  $("mode").addEventListener("change", (e) => setMode(e.target.value));
  $("next").addEventListener("click", nextStep);
  $("prev").addEventListener("click", () => goStep(state.step - 1));
  $("analyze").addEventListener("click", analyze);
  $("gps").addEventListener("click", useGps);
  $("search-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("search-input").value.trim(); if (q) searchPlaces(q); });
  renderMapTools();
  $("pdf").addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((s) => { s.hidden = false; });
    document.querySelectorAll(".tab details").forEach((d) => { d.open = true; });
    window.print();
    setTab(state.tab);
  });
  $("edit").addEventListener("click", () => { show("wizard"); goStep(1); });
  $("json").addEventListener("click", () => download(`yatirix-${(state.name || "terreno").replace(/\W+/g, "-")}.json`,
    { inputs: inputsSnapshot(), result: state.result, assessment: state.assessment, plot: state.plot, soil: state.soil, outlook: state.outlook }));
  $("tiri-toggle").addEventListener("click", () => {
    const body = $("tiri-body");
    body.hidden = !body.hidden;
    $("tiri-toggle").setAttribute("aria-expanded", String(!body.hidden));
    if (!body.hidden) $("tiri-input").focus();
  });
  $("tiri-form").addEventListener("submit", (e) => { e.preventDefault(); askTiri($("tiri-input").value); $("tiri-input").value = ""; });
}

start();
