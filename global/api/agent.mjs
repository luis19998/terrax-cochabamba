// Tiri as an AI agent (Yatiri X Global). Gemini decides which tools to call; the server runs the data tools and
// returns the interface tools as "actions" for the browser to carry out (open a tab, fly the globe, analyse a place,
// change language or view). Tiri never invents numbers: every figure comes from a tool result.
//   POST /api/agent { question, messages, lat, lon, history, lang, mode, tab, customCrops } ->
//        { answer, actions: [{ name, args }], tools: [names], engine, model, lang }
// Without a Gemini key (or if it fails) the classic Tiri answers instead (rules or Claude).

const LANGS = {
  es: "castellano", qu: "quechua boliviano (Cochabamba; progresivo -chka-)", ay: "aimara", gn: "guaraní", en: "English",
  pt: "português", fr: "français", de: "Deutsch", it: "italiano", sw: "Kiswahili", hi: "हिन्दी (Hindi)", zh: "中文 (简体)", ar: "العربية",
};
const TABS = ["general", "bolivia", "predicciones", "clima", "suelo", "relieve", "agua", "riesgos", "comparar", "cultivos", "catalogo", "plagas", "legal", "ganancias", "fuentes"];

const SYSTEM = `Eres Tiri, la agente agrícola de Yatiri X Global. Ayudas a agricultoras y agricultores de cualquier lugar del planeta a decidir qué sembrar, cuándo, con cuánta agua y cómo cuidar su tierra.
Cómo trabajas:
- Usa SIEMPRE las herramientas para obtener datos reales (análisis del lugar, pronóstico, ficha del cultivo, buscar un lugar). Nunca inventes cifras, fechas ni probabilidades: cita solo lo que devuelven las herramientas, diciendo de dónde salen (NASA POWER, pronóstico por escenarios GFS, FAO).
- Puedes operar la web con las herramientas de interfaz (ui_*) cuando ayuden: por ejemplo, abrir la pestaña de plagas si preguntan por plagas, volar el planeta a un lugar que mencionen, o empezar el análisis de un lugar.
- Sé proactiva: cuando veas un riesgo (helada, lluvia fuerte, falta de agua), dilo primero y propone qué hacer hoy. Termina con UNA sugerencia útil de qué más puedes hacer.
- Responde en el idioma que se te indica, con frases cortas y claras, sin Markdown pesado. Máximo 6 frases.
- Si el terreno está en Bolivia, la pestaña «bolivia» tiene su zona agroecológica de Cochabamba, cultivos nativos, calendario agrícola andino, cifras del departamento y las leyes bolivianas: ábrela cuando pregunten por eso.
- No recomiendes dosis de agroquímicos. Eres apoyo a la decisión: no reemplazas al técnico.`;

const FN = (name, description, properties = {}, required = []) => ({ name, description, parameters: { type: "OBJECT", properties, required } });
const NUM = (d) => ({ type: "NUMBER", description: d });
const STR = (d, extra = {}) => ({ type: "STRING", description: d, ...extra });
const TOOLS = [
  FN("get_place_analysis", "Análisis completo de un terreno: altitud, rotación recomendada de 3 años, riesgos (helada, sequía, anegamiento, erosión), cultivos que no convienen, clima del pronóstico.", { lat: NUM("latitud"), lon: NUM("longitud"), last_crops: { type: "ARRAY", items: { type: "STRING" }, description: "ids o nombres de lo que se sembró la última campaña (opcional)" } }, ["lat", "lon"]),
  FN("get_forecast", "Pronóstico probabilístico de los próximos 7 días (31 escenarios GFS) y lo normal de 45 años de NASA POWER para el próximo mes.", { lat: NUM("latitud"), lon: NUM("longitud") }, ["lat", "lon"]),
  FN("get_crop_info", "Ficha de un cultivo del catálogo (147 cultivos): ciclo, helada que lo daña, pH, calor que necesita, abono y plagas a vigilar.", { name: STR("nombre común del cultivo EN CASTELLANO (traduce antes: potato -> papa, maize -> maíz)") }, ["name"]),
  FN("find_place", "Busca un lugar del planeta por nombre y devuelve su latitud y longitud.", { query: STR("nombre del lugar") }, ["query"]),
  FN("ui_open_tab", "Abre una pestaña de resultados en la web.", { tab: STR("pestaña", { enum: TABS }) }, ["tab"]),
  FN("ui_fly_to", "Mueve el planeta 3D hasta un lugar y lo marca.", { lat: NUM("latitud"), lon: NUM("longitud"), label: STR("nombre del lugar") }, ["lat", "lon"]),
  FN("ui_analyze_place", "Empieza el análisis de un lugar en la web (lleva a la persona al paso de cultivos).", { lat: NUM("latitud"), lon: NUM("longitud"), label: STR("nombre del lugar") }, ["lat", "lon"]),
  FN("ui_set_language", "Cambia el idioma de la web.", { code: STR("código", { enum: Object.keys(LANGS) }) }, ["code"]),
  FN("ui_set_view", "Cambia el nivel de información: simple, medio o avanzado.", { mode: STR("vista", { enum: ["simple", "medio", "avanzado"] }) }, ["mode"]),
];

const plainName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function createAgent({ env, terra, outlook, crops, knowledge, quNames = {} }) {
  const pct = (x) => `${Math.round((x || 0) * 100)} %`;

  async function placeAnalysis({ lat, lon, last_crops: lastCrops }, base) {
    const history = Array.isArray(lastCrops) && lastCrops.length ? [lastCrops.map((x) => findCrop(x)?.id).filter(Boolean)] : base.history || [];
    const ctx = await terra.evaluate({ lat, lon, history, irrigation: base.irrigation, customCrops: base.customCrops }, { fast: true });
    if (!ctx) return { error: "No se pudo leer ese punto ahora." };
    const r = ctx.result;
    const [current, best, water] = r.strategies;
    return {
      altitude_m: ctx.plot.altitude,
      slope_percent: ctx.plot.slope ? Math.round(ctx.plot.slope.percent * 10) / 10 : null,
      climate_period: r.site.period,
      current_rotation: { crops: current.years.map((y) => y.name), score: current.score },
      recommended_rotation: { crops: best.years.map((y) => y.name), score: best.score, first_sowing: best.years[0].group === "fallow" ? null : weekText(best.years[0].sowWeek), irrigation_3y_mm: Math.round(best.irrigationTotalMm) },
      water_saving_rotation: { crops: water.years.map((y) => y.name), irrigation_3y_mm: Math.round(water.irrigationTotalMm) },
      risks: ctx.assessment.hazards.filter((h) => h.level >= 2).map((h) => ({ title: h.title, level: h.levelLabel, what: h.text, action: h.action })),
      not_advised: ctx.assessment.avoid.slice(0, 6).map((x) => ({ crop: x.name, why: x.reasons[0] })),
      next_7_days: ctx.outlook && ctx.outlook.daily ? ctx.outlook.daily.days.slice(0, 7).map((d) => ({ date: d.date, rain_chance: pct(d.pRain), frost_chance: pct(d.pFrost), heavy_rain_chance: pct(d.pHeavyRain), tmin: Math.round(d.tminMedian), tmax: Math.round(d.tmaxMedian) })) : null,
      source: "NASA POWER (45 años), NASA SRTM / Open Topo Data, GFS Ensemble (NOAA) vía Open-Meteo, FAO-56",
    };
  }
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function weekText(week) {
    if (week === null || week === undefined) return null;
    const d = new Date(Date.UTC(2025, 0, 1 + week * 7));
    return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
  }
  async function forecast({ lat, lon }) {
    const o = await outlook.outlook(lat, lon);
    return {
      next_7_days: o.daily ? o.daily.days.slice(0, 7).map((d) => ({ date: d.date, rain_chance: pct(d.pRain), rain_mm: Math.round(d.rainMedian), frost_chance: pct(d.pFrost), heavy_rain_chance: pct(d.pHeavyRain), tmin: Math.round(d.tminMedian), tmax: Math.round(d.tmaxMedian) })) : null,
      this_week: o.weekly ? { rain_mm: Math.round(o.weekly.weeks[0].rainMedian), normal_mm: Math.round(o.weekly.weeks[0].normal) } : null,
      next_month: o.monthly ? { month: o.monthly.months[0].name, usual_rain_mm: o.monthly.months[0].rainMedian, frost_years: pct(o.monthly.months[0].pFrost) } : null,
      altitude_m: o.altitude,
      source: `${o.daily ? o.daily.model : "sin pronóstico"}; normal: NASA POWER 1981-2025`,
    };
  }
  function findCrop(name) {
    const q = plainName(name);
    const qu = Object.entries(quNames).find(([, v]) => plainName(v) === q);
    return crops.crops.find((c) => c.id === q || plainName(c.name) === q || plainName(c.name).startsWith(q) || (qu && c.name === qu[0]))
      || crops.crops.find((c) => plainName(c.name).includes(q) || plainName(c.scientific).includes(q));
  }
  function cropInfo({ name }) {
    const c = findCrop(name);
    if (!c) return { error: `No está en el catálogo. Se puede agregar con «Otro» en el paso 2.` };
    return {
      name: c.name, scientific: c.scientific, family: c.family, type: c.type, cycle_days: c.cycle_days, perennial: Boolean(c.perennial),
      frost_damage_c: c.frost_damage_c, ph: c.ph, kc_fao56: c.kc, min_mean_temp_c: c.min_mean_temp_c ?? null, fixes_nitrogen: c.fixes_nitrogen,
      fertility: knowledge.fertility[c.id] || null, pests: (knowledge.pests[c.id] || []).map((p) => p.name),
      source: "FAO-56 y FAO ECOCROP (valores de referencia, a validar localmente)",
    };
  }
  async function findPlace({ query }) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "jsonv2", q: query, limit: "1" })}`, { headers: { "User-Agent": "YatiriX-Global/1.0 (NASA Space Apps 2026)" }, signal: AbortSignal.timeout(8000) });
    const [hit] = await r.json();
    return hit ? { name: hit.display_name, lat: Number(hit.lat), lon: Number(hit.lon) } : { error: "No encontré ese lugar." };
  }

  // the free tier allows few calls per minute per model: when one is saturated, the next one answers
  const busyUntil = new Map();
  async function callGemini(contents, lang, mode, only = null) {
    // once a conversation started with a model it stays with it (tool-call signatures belong to that model)
    const models = only ? [only] : [...new Set([env.GEMINI_MODEL || "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash"])].filter((m) => (busyUntil.get(m) || 0) < Date.now());
    let lastError = new Error("Gemini sin cupo ahora");
    for (const model of models) {
      try { return await callModel(model, contents, lang, mode); } catch (error) {
        lastError = error;
        if (/429|503|404/.test(error.message)) busyUntil.set(model, Date.now() + 60e3); else throw error;
      }
    }
    throw lastError;
  }
  async function callModel(model, contents, lang, mode) {
    const style = `Idioma de la respuesta: ${LANGS[lang] || "castellano"}. Vista: ${mode === "simple" ? "sencilla (palabras de todos los días, sin porcentajes)" : mode === "avanzado" ? "avanzada (con cifras y fuentes)" : "media"}.`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: `${SYSTEM}\n${style}\nHoy es ${new Date().toISOString().slice(0, 10)} (UTC). En el pronóstico, el primer día es hoy y el segundo es mañana.` }] }, contents, tools: [{ functionDeclarations: TOOLS }], generationConfig: { temperature: 0.4 } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
    const data = await r.json();
    return { model, content: data.candidates && data.candidates[0] && data.candidates[0].content };
  }

  async function run(input) {
    const lang = LANGS[input.lang] ? input.lang : "es";
    const mode = input.mode || "medio";
    const question = String(input.question || "").slice(0, 600);
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    const hasPlace = Number.isFinite(lat) && Number.isFinite(lon) && input.lat !== null;
    if (!env.GEMINI_API_KEY) return terra.ask(input);
    const context = `Contexto de la web: ${hasPlace ? `terreno elegido en lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)}` : "todavía no hay terreno elegido"}; pestaña abierta: ${input.tab || "inicio"}; lo sembrado: ${JSON.stringify(input.history || [])}.`;
    const history = (Array.isArray(input.messages) ? input.messages : []).slice(-6)
      .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 800) }] }));
    while (history.length && history[0].role !== "user") history.shift();
    const contents = [...history, { role: "user", parts: [{ text: `${context}\n\n${question}` }] }];
    const actions = [];
    const used = [];
    let model = null;
    let found = null; // a place found by a tool, used if Gemini cannot finish
    try {
      for (let step = 0; step < 5; step++) {
        const out = await callGemini(contents, lang, mode, model);
        model = out.model;
        const parts = (out.content && out.content.parts) || [];
        const calls = parts.filter((p) => p.functionCall);
        if (!calls.length) {
          const text = parts.map((p) => p.text || "").join("").trim();
          if (!text) break;
          return { answer: text, actions, tools: used, engine: "gemini-agent", model, lang };
        }
        contents.push({ role: "model", parts });
        const responses = [];
        for (const { functionCall: fc } of calls) {
          const args = fc.args || {};
          used.push(fc.name);
          let result;
          try {
            if (fc.name.startsWith("ui_")) { actions.push({ name: fc.name, args }); result = { ok: true, done_in_browser: true }; }
            else if (fc.name === "get_place_analysis") result = await placeAnalysis(args, input);
            else if (fc.name === "get_forecast") result = await forecast(args);
            else if (fc.name === "get_crop_info") result = cropInfo(args);
            else if (fc.name === "find_place") { result = await findPlace(args); if (result && Number.isFinite(result.lat)) found = result; }
            else result = { error: "Herramienta desconocida" };
          } catch (error) { result = { error: String(error.message || error).slice(0, 200) }; }
          responses.push({ functionResponse: { name: fc.name, response: { result } } });
        }
        contents.push({ role: "user", parts: responses });
      }
    } catch (error) { if (env.DEBUG_AGENT) console.error("agente:", error); }
    const fallback = await terra.ask(found && !hasPlace ? { ...input, lang, lat: found.lat, lon: found.lon } : { ...input, lang });
    return { ...fallback, actions, tools: used };
  }

  return { run, languages: LANGS };
}
