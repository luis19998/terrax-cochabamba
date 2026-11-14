// Tiri, the assistant of Yatiri X. Answers questions about one plot using only the evaluation computed by the
// engine, the probabilistic outlook and the knowledge base. The language model only writes the answer; the numbers
// always come from those sources.
//   GEMINI_API_KEY      -> Google Gemini (REST API). GEMINI_MODEL picks the model; without it the newest
//                          "flash" model the key can use is chosen automatically.
//   ANTHROPIC_API_KEY   -> Claude, if Gemini is not available.
//   neither, or a model error -> fixed rules, so the assistant is always available.
import { explain, recommend } from "../web/js/engine.js";
import { assessPlot } from "../web/js/assess.js";

const DEFAULT_MODEL = "claude-haiku-5-5"; // the model the team context names for short explanations; override with TERRA_MODEL
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
// Verified on 2026-11-14 with the team's key. Older names (gemini-pro, gemini-1.5-flash, gemini-2.0-flash) return 404.
const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";

/** A key pasted from a chat can carry look-alike letters from other alphabets; such a key can never work. */
export const usableKey = (key) => Boolean(key) && /^[\x21-\x7E]+$/.test(key);

const SYSTEM = `Eres Tiri, la asistente agrícola inteligente de Yatiri X para el municipio de Cochabamba, Bolivia. Hablas con agricultores que leen en el teléfono. Solo orientas en temas agrícolas de esta plataforma: cultivos, suelo, humedad, agua, clima, relieve, riesgos, plagas, cuidados de la tierra y predicciones de la parcela.

Cómo respondes:
- En el idioma de la pregunta (español o quechua), sencillo y sin tecnicismos, en un máximo de 5 frases cortas. Sin listas largas ni formato Markdown.
- Usa solo los números que vienen en DATOS DE LA PARCELA. Nunca inventes cifras, fechas, precios ni umbrales.
- Cuando des un dato, di de dónde sale (por ejemplo: "según datos de NASA POWER" o "según el pronóstico por escenarios").
- Las probabilidades del pronóstico son la parte de los escenarios que cumplen la condición: dilas como "X de cada 10 escenarios".
- Si los datos no alcanzan para responder, dilo con claridad y sugiere consultar a un técnico de la zona.

Límites:
- No recomiendes dosis de agroquímicos ni mezclas de productos químicos. Los preparados caseros de la base de conocimiento sí puedes explicarlos, con su cuidado.
- Plagas, especies invasoras y repelentes vienen de una base de conocimiento general: dilo y recomienda confirmar con SENASAG o un técnico.
- Propiedad de la tierra: Yatiri X no tiene registros oficiales. Explica dónde verificar (Derechos Reales, Catastro del GAMC, INRA) usando la parte legal de los datos.
- Ganancias: no hay precios ni costos oficiales. Explica cómo el riesgo afecta el rendimiento y sugiere usar la calculadora con sus propios números.
- Eres un prototipo de apoyo a la decisión. No reemplazas al agricultor ni al técnico, y lo dices si te preguntan.
- Si te preguntan algo que no es agrícola, responde amablemente que solo ayudas con temas de la tierra y los cultivos.`;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function weekLabel(week) {
  if (week === null || week === undefined) return null;
  let day = (((week % 52) + 52) % 52) * 7;
  let m = 0;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m += 1; }
  return `${day + 1} de ${MONTHS[m]}`;
}
const pct = (x) => Math.round(x * 100);
const tenths = (p) => Math.round(p * 10);
const mm = (x) => Math.round(x / 5) * 5;
const plain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function createTerra({ env, climate, crops, knowledge, plotService, gamcInfo, forecast, outlook }) {
  let clientPromise = null;
  function getClient() {
    if (!usableKey(env.ANTHROPIC_API_KEY)) return null;
    clientPromise ??= import("@anthropic-ai/sdk")
      .then(({ default: Anthropic }) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20000, maxRetries: 1 }))
      .catch(() => null);
    return clientPromise;
  }

  async function evaluate(input, { fast = false } = {}) {
    const plot = await plotService.evaluate(input.lat, input.lon, { gamcInfo, forecast, fast });
    if (!plot) return null;
    const result = recommend(climate, crops, {
      altitude: plot.altitude, history: input.history || [], irrigation: Boolean(input.irrigation),
      priorities: input.priorities && input.priorities.length ? input.priorities : ["risk"], preferred: input.preferred || [],
    });
    const outlookData = outlook
      ? await Promise.race([outlook.outlook(input.lat, input.lon, plot.altitude).catch(() => null), new Promise((r) => { setTimeout(() => r(null), 7000); })])
      : null;
    return { plot, result, assessment: assessPlot(plot, result, crops), outlook: outlookData };
  }

  function place(plot) {
    const d = plot.gamc && plot.gamc.distritos && !plot.gamc.distritos.error ? plot.gamc.distritos : null;
    return d ? `distrito ${d.Distrito}` : "Cochabamba";
  }
  const zoneOf = (plot) => (plot.gamc && plot.gamc.periurbanos && !plot.gamc.periurbanos.error ? plot.gamc.periurbanos.Periurbano : null);
  const inDrainage = (plot) => Boolean(plot.gamc && plot.gamc.drenaje && !plot.gamc.drenaje.error);

  function cropsInPlay(result) {
    const ids = new Set();
    result.strategies.forEach((s) => s.years.forEach((y) => { if (y.group !== "fallow") ids.add(y.crop); }));
    return [...ids];
  }

  /** Compact, source-tagged facts handed to the language model. */
  function facts({ plot, result, assessment, outlook: o }) {
    const ids = cropsInPlay(result);
    return {
      producto: "Yatiri X, prototipo de apoyo a la decisión",
      parcela: {
        lugar: place(plot), zona_segun_gamc: zoneOf(plot) || "sin dato", en_area_de_drenaje_gamc: inDrainage(plot), altitud_m: plot.altitude,
        pendiente_pct: plot.slope ? Math.round(plot.slope.percent * 10) / 10 : "sin dato", riego: result.site.irrigation,
      },
      rotaciones: result.strategies.map((s) => ({
        nombre: s.label, puntaje_de_100: s.score, riego_tres_anios_mm: mm(s.irrigationTotalMm),
        anios: s.years.map((y) => (y.group === "fallow" ? { cultivo: y.name } : {
          cultivo: y.name, siembra_hacia: weekLabel(y.sowWeek), helada_danina_pct_campanas: pct(y.frostProb),
          lluvia_cubre_pct: pct(y.coverage), riego_mm: mm(y.irrigationMm),
        })),
        por_que: s.why,
      })),
      riesgos: assessment.hazards.map((h) => ({ riesgo: h.title, nivel: h.levelLabel, detalle: h.text, que_hacer: h.action, fuente: h.source })),
      cultivos_que_no_convienen: assessment.avoid.map((a) => ({ cultivo: a.name, motivos: a.reasons })),
      suelo: plot.soil ? {
        ph: plot.soil.ph && Math.round(plot.soil.ph * 10) / 10, textura: plot.soil.texture,
        carbono_organico_g_kg: plot.soil.soc_gkg && Math.round(plot.soil.soc_gkg), consejos: assessment.soilAdvice, fuente: plot.soil.source,
      } : "sin dato de suelo para este punto",
      cultivos_de_la_rotacion_recomendada: ids,
      abono_por_cultivo: knowledge.fertility,
      plagas_por_cultivo: Object.fromEntries(Object.keys(knowledge.pests).map((id) => [id, (knowledge.pests[id] || []).map((p) => ({
        nombre: p.name, cientifico: p.scientific, cuando: p.season, senales: p.signs, prevencion: p.prevention, casero: p.homemade,
      }))])),
      especies_invasoras: knowledge.invasive.map((x) => ({ nombre: x.name, riesgo: x.risk, que_hacer: x.action })),
      repelentes_caseros: knowledge.repellents.map((x) => ({ nombre: x.name, para: x.for, como: x.how, cuidado: x.care })),
      legal: {
        resumen: knowledge.legal.summary,
        nota_de_zona: [zoneOf(plot) && knowledge.legal.zone_notes[zoneOf(plot)], inDrainage(plot) && knowledge.legal.zone_notes.drainage].filter(Boolean),
        donde_verificar: knowledge.legal.checks,
      },
      clima_reciente: plot.conditions ? {
        hasta: plot.conditions.asOf, lluvia_30_dias_mm: Math.round(plot.conditions.rain30), lluvia_normal_30_dias_mm: Math.round(plot.conditions.rain30Normal),
        humedad_suelo_0_a_1: plot.conditions.soilWetness && Math.round(plot.conditions.soilWetness * 100) / 100,
        humedad_suelo_normal: Math.round(plot.conditions.soilWetnessNormal * 100) / 100, fuente: plot.conditions.source,
      } : "sin dato",
      pronostico_probabilistico: o ? {
        proximos_7_dias: o.daily ? o.daily.days.slice(0, 7).map((d) => ({ fecha: d.date, prob_lluvia: d.pRain, lluvia_mediana_mm: d.rainMedian, prob_helada: d.pFrost, minima_mediana_c: d.tminMedian })) : "sin dato",
        semanas: o.weekly ? o.weekly.weeks : "sin dato",
        meses: o.monthly ? o.monthly.months : "sin dato",
        fuentes: [o.daily && o.daily.model, o.monthly && o.monthly.model, o.normal_source].filter(Boolean),
        nota: o.note,
      } : "sin dato",
      fuente_clima_historico: `NASA POWER, ${result.site.period}, celda de unos 50 km ajustada por altitud con NASA SRTM`,
      limites: ["umbrales de helada, coeficientes de cultivo y base de plagas generales, sin validar localmente", "sin precios, costos ni registros de propiedad", "las heladas de fondo de valle pueden estar subestimadas"],
    };
  }

  /** Answer without a language model: keyword intent, numbers straight from the evaluation. */
  function rules(question, ctx) {
    const { plot, result, assessment, outlook: o } = ctx;
    const q = plain(question || "");
    const best = result.strategies[1];
    const first = best.years.find((y) => y.group !== "fallow");
    const f = plot.forecast;
    const power = `NASA POWER, ${result.site.period}`;
    const ids = cropsInPlay(result);
    const mentioned = crops.crops.find((c) => c.group !== "fallow" && q.includes(plain(c.name)));
    if (/duen|propiet|legal|titulo|catastro|derechos reales|papeles|inra/.test(q)) {
      const notes = [zoneOf(plot) && knowledge.legal.zone_notes[zoneOf(plot)], inDrainage(plot) && knowledge.legal.zone_notes.drainage].filter(Boolean);
      return `${knowledge.legal.summary} ${notes.join(" ")} Para el título: Derechos Reales; para el uso de suelo: Catastro del GAMC; para tierras rurales: el INRA.`;
    }
    if (/invasor|maleza|kikuyo|eucalipto|caracol/.test(q)) {
      return `Especies a vigilar (conocimiento general, confirmar con SENASAG): ${knowledge.invasive.map((x) => `${x.name.toLowerCase()}: ${x.action.toLowerCase()}`).join(" ")}`;
    }
    if (/repelente|casero|natural|ajo|jabon|muna|organico/.test(q)) {
      const picks = knowledge.repellents.slice(0, 3).map((r) => `${r.name} (${r.for}): ${r.how}`);
      return `Preparados caseros de la base de conocimiento: ${picks.join(" ")} ${knowledge.meta.safety}`;
    }
    if (/plaga|insect|gusano|hongo|enfermedad|polilla|gorgojo|pulgon|bicho/.test(q)) {
      const id = mentioned ? mentioned.id : first.crop;
      const list = knowledge.pests[id] || [];
      if (!list.length) return "No tengo plagas registradas para ese cultivo. Consulta a SENASAG o a un técnico.";
      const top = list.slice(0, 2).map((p) => `${p.name}: ${p.signs} Prevención: ${p.prevention} Casero: ${p.homemade}`);
      return `Para ${crops.crops.find((c) => c.id === id).name.toLowerCase()} (conocimiento general, confirmar con SENASAG): ${top.join(" ")}`;
    }
    if (/gana|rentab|precio|perd|dinero|costo|plata|vender/.test(q)) {
      return `No tengo precios ni costos oficiales. Usa la calculadora de ganancias con tus números. Lo que sí sé: ${first.name.toLowerCase()} tiene helada dañina en ${pct(first.frostProb)} % de las campañas y pide ${mm(first.irrigationMm)} mm de riego (${power}).`;
    }
    if (/abono|fertiliz|estiercol|compost|nutri/.test(q)) {
      const id = mentioned ? mentioned.id : first.crop;
      const soil = plot.soil ? ` Según SoilGrids: ${assessment.soilAdvice.slice(0, 2).join(" ")}` : " No tengo dato de suelo para ese punto: un análisis de laboratorio es lo más seguro.";
      return `${crops.crops.find((c) => c.id === id).name}: ${knowledge.fertility[id]}${soil}`;
    }
    if (/suelo|\bph\b|cal\b|tierra es/.test(q)) {
      if (!plot.soil) return "No tengo dato de suelo para ese punto (pasa en zonas urbanas o si el servicio no respondió). Un análisis de laboratorio es lo más seguro.";
      return `Según SoilGrids (estimación de un modelo, no un análisis): ${assessment.soilAdvice.slice(0, 3).join(" ")}`;
    }
    if (/riesgo|peligro|desastre|inund|erosi|desliz|aneg|derrumb/.test(q)) {
      return `Riesgos de tu parcela: ${assessment.hazards.map((h) => `${h.title.toLowerCase()} (${h.levelLabel})`).join(", ")}. El principal: ${assessment.hazards[0].text} ${assessment.hazards[0].action}`;
    }
    if (/no (puedo|conviene|debo)|evitar|que no/.test(q)) {
      return assessment.avoid.length
        ? `Aquí no conviene: ${assessment.avoid.map((a) => `${a.name.toLowerCase()} (${a.reasons[0]})`).join("; ")}. Fuente: ${power}.`
        : `Con los datos que tengo ningún cultivo de la lista queda descartado en tu parcela. Fuente: ${power}.`;
    }
    if (/hela|frio|congel|qasa/.test(q)) {
      const h = assessment.hazards.find((x) => x.id === "frost");
      const next = o && o.weekly ? ` Próximas dos semanas: helada en ${tenths(o.weekly.weeks[0].pFrost)} y ${tenths(o.weekly.weeks[1].pFrost)} de cada 10 escenarios (pronóstico por escenarios).` : "";
      return `${h.text}${next} ${h.action}`;
    }
    if (/mes|meses|temporada|proximo mes/.test(q) && o && o.monthly) {
      return `Según 45 años de datos de NASA POWER: ${o.monthly.months.map((m) => `en ${m.name} suelen caer unos ${m.rainMedian} mm; fue muy seco ${tenths(m.pDryMonth)} de cada 10 años y heló ${tenths(m.pFrost)} de cada 10 años`).join("; ")}. Es lo que suele pasar, no un pronóstico exacto.`;
    }
    if (/agua|rieg|regar|sed|canal/.test(q)) {
      return `${first.name} pide unos ${mm(first.cropWaterMm)} mm de agua y la lluvia cubre ${pct(first.coverage)} %: faltan ${mm(first.irrigationMm)} mm con riego (${power}). ${f ? `Esta semana se esperan ${Math.round(f.rain7)} mm de lluvia y ${Math.round(f.et07)} mm de evaporación (Open-Meteo).` : ""}`;
    }
    if (/lluvi|llover|pronost|tiempo|clima|semana|para\b/.test(q)) {
      const w = o && o.weekly ? o.weekly.weeks[0] : null;
      const prob = w ? ` Esta semana: unos ${Math.round(w.rainMedian)} mm (lo normal ${Math.round(w.normal)} mm); más lluvia que lo normal en ${tenths(w.pAboveNormal)} de cada 10 escenarios.` : "";
      const c = plot.conditions;
      const recent = c ? ` En los últimos 30 días llovieron ${Math.round(c.rain30)} mm; lo normal son ${Math.round(c.rain30Normal)} mm (NASA POWER).` : "";
      return `${prob}${recent}`.trim() || "No pude leer el pronóstico ahora.";
    }
    if (/siembr|sembr|cultiv|rotaci|plant|conviene|recomien|tarpu/.test(q)) return explain(result).join(" ");
    return summary(ctx);
  }

  function summary(ctx) {
    const { plot, assessment } = ctx;
    const top = assessment.hazards.filter((h) => h.level >= 2).map((h) => h.title.toLowerCase());
    return `Soy Tiri. Tu parcela está en ${place(plot)}, a ${plot.altitude} m. ${top.length ? `Ojo con: ${top.join(", ")}.` : "No veo riesgos altos."} Pregúntame qué sembrar, cuánta agua hace falta, si va a llover o helar, qué abono conviene, qué plagas vigilar o qué riesgos tiene tu tierra.`;
  }

  let geminiModel = null;
  let geminiDownUntil = 0; // after an auth or model error, skip Gemini for a while instead of failing on every question
  async function pickGeminiModel() {
    if (env.GEMINI_MODEL) return env.GEMINI_MODEL;
    if (geminiModel) return geminiModel;
    const r = await fetch(`${GEMINI_API}/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) { geminiDownUntil = Date.now() + 10 * 60 * 1000; return null; }
    const { models = [] } = await r.json();
    const usable = models
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .filter((m) => /flash/.test(m.name) && !/(lite|image|tts|audio|live|exp|preview|embed|thinking)/.test(m.name))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    geminiModel = usable.length ? usable[0].name.replace(/^models\//, "") : null;
    return geminiModel;
  }

  async function gemini(question, ctx, history) {
    if (!usableKey(env.GEMINI_API_KEY) || Date.now() < geminiDownUntil) return null;
    try {
      const model = await pickGeminiModel();
      if (!model) return null;
      const r = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            { role: "user", parts: [{ text: `DATOS DE LA PARCELA (JSON):\n${JSON.stringify(facts(ctx))}\n\nPREGUNTA DEL AGRICULTOR: ${question}` }] },
          ],
          // room for the model's internal reasoning plus a short answer
          generationConfig: { maxOutputTokens: 4000 },
        }),
      });
      if (r.status === 404 && model !== FALLBACK_GEMINI_MODEL) { geminiModel = FALLBACK_GEMINI_MODEL; return gemini(question, ctx, history); }
      if (r.status === 401 || r.status === 403 || r.status === 404) { geminiDownUntil = Date.now() + 10 * 60 * 1000; return null; }
      if (!r.ok) return null;
      const data = await r.json();
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
      return text ? { text, model } : null;
    } catch {
      return null; // any API problem falls back to the next option
    }
  }

  async function claude(question, ctx, history) {
    const client = await getClient();
    if (!client) return null;
    try {
      const response = await client.messages.create({
        model: env.TERRA_MODEL || DEFAULT_MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [
          ...history,
          { role: "user", content: `DATOS DE LA PARCELA (JSON):\n${JSON.stringify(facts(ctx))}\n\nPREGUNTA DEL AGRICULTOR: ${question}` },
        ],
      });
      if (response.stop_reason === "refusal") return null;
      const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
      return text ? { text, model: env.TERRA_MODEL || DEFAULT_MODEL } : null;
    } catch {
      return null; // any API problem falls back to the rule-based answer
    }
  }

  /** input: { question, lat, lon, history: [cropId], irrigation, priorities, messages: [{role, content}] } */
  async function ask(input) {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    if (input.lat === null || input.lat === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { answer: "Soy Tiri. Para ayudarte necesito saber dónde está tu terreno: ubícalo en el mapa o envíame tu ubicación.", engine: "rules" };
    }
    const ctx = await evaluate({ ...input, lat, lon }, { fast: true }); // answers must come back in a few seconds
    if (!ctx) return { answer: "Ese punto está fuera del municipio de Cochabamba. Por ahora Yatiri X solo cubre el municipio.", engine: "rules" };
    const question = String(input.question || "").slice(0, 600);
    const history = (Array.isArray(input.messages) ? input.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    while (history.length && history[0].role !== "user") history.shift();
    if (history.length && history[history.length - 1].role === "user") history.pop();
    let fromModel = null;
    let engine = "rules";
    if (question) {
      fromModel = await gemini(question, ctx, history);
      if (fromModel) engine = "gemini";
      else {
        fromModel = await claude(question, ctx, history);
        if (fromModel) engine = "claude";
      }
    }
    return {
      answer: fromModel ? fromModel.text : (question ? rules(question, ctx) : summary(ctx)),
      engine,
      model: fromModel ? fromModel.model : null,
    };
  }

  /** Which engine answers right now, for /api/health. */
  async function status() {
    if (usableKey(env.GEMINI_API_KEY)) {
      if (Date.now() >= geminiDownUntil) await pickGeminiModel().catch(() => null);
      if (Date.now() >= geminiDownUntil && (geminiModel || env.GEMINI_MODEL)) return { engine: "gemini", model: geminiModel || env.GEMINI_MODEL };
    }
    if (usableKey(env.ANTHROPIC_API_KEY)) return { engine: "claude", model: env.TERRA_MODEL || DEFAULT_MODEL };
    return { engine: "rules", note: usableKey(env.GEMINI_API_KEY) ? "Google rechazó GEMINI_API_KEY: revisa que sea una clave de la API de Gemini" : undefined };
  }

  return { ask, evaluate, summary, status };
}
