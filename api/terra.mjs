// Terra, the assistant of Terrax. Answers questions about one plot using only the evaluation computed by the
// engine. With ANTHROPIC_API_KEY it writes the answer with Claude; without it (or if the model fails) it answers
// from fixed rules, so the assistant is always available.
import { explain, recommend } from "../web/js/engine.js";
import { assessPlot } from "../web/js/assess.js";

const DEFAULT_MODEL = "claude-haiku-5-5"; // the model the team context names for short explanations; override with TERRA_MODEL

const SYSTEM = `Eres Terra, la asistente agrícola de Terrax para el municipio de Cochabamba, Bolivia. Hablas con agricultores que leen en el teléfono.

Cómo respondes:
- En español sencillo, sin tecnicismos, en un máximo de 4 frases cortas. Sin listas largas ni formato Markdown.
- Usa solo los números que vienen en DATOS DE LA PARCELA. Nunca inventes cifras, fechas, precios ni umbrales.
- Cuando des un dato, di de dónde sale (por ejemplo: "según datos de NASA POWER").
- Si los datos no alcanzan para responder, dilo con claridad y sugiere consultar a un técnico de la zona.

Límites:
- No recomiendes dosis de agroquímicos ni mezclas de productos.
- No des consejos médicos, financieros ni legales. Terrax no tiene datos oficiales de propiedad de la tierra: para eso remite al Catastro municipal, Derechos Reales o el INRA.
- Sobre plagas, especies invasoras o remedios caseros puedes dar buenas prácticas generales, pero aclara que es conocimiento general y no un dato de Terrax, y recomienda confirmarlo con SENASAG o un técnico.
- Sobre ganancias: Terrax no tiene precios ni costos oficiales. Puedes explicar los riesgos que afectan el rendimiento, sin estimar dinero.
- Eres un prototipo de apoyo a la decisión. No reemplazas al agricultor ni al técnico, y lo dices si te preguntan.`;

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
const mm = (x) => Math.round(x / 5) * 5;
const plain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function createTerra({ env, climate, crops, plotService, gamcInfo, forecast }) {
  let clientPromise = null;
  function getClient() {
    if (!env.ANTHROPIC_API_KEY) return null;
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
    return { plot, result, assessment: assessPlot(plot, result, crops) };
  }

  function place(plot) {
    const d = plot.gamc && plot.gamc.distritos && !plot.gamc.distritos.error ? plot.gamc.distritos : null;
    return d ? `distrito ${d.Distrito}` : "Cochabamba";
  }

  /** Compact, source-tagged facts handed to the language model. */
  function facts({ plot, result, assessment }) {
    const p = plot.gamc && plot.gamc.periurbanos && !plot.gamc.periurbanos.error ? plot.gamc.periurbanos : null;
    return {
      producto: "Terrax, prototipo de apoyo a la decisión",
      parcela: {
        lugar: place(plot), zona_segun_gamc: p ? p.Periurbano : "sin dato", altitud_m: plot.altitude,
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
      clima_reciente: plot.conditions ? {
        hasta: plot.conditions.asOf, lluvia_30_dias_mm: Math.round(plot.conditions.rain30), lluvia_normal_30_dias_mm: Math.round(plot.conditions.rain30Normal),
        humedad_suelo_0_a_1: plot.conditions.soilWetness && Math.round(plot.conditions.soilWetness * 100) / 100,
        humedad_suelo_normal: Math.round(plot.conditions.soilWetnessNormal * 100) / 100, fuente: plot.conditions.source,
      } : "sin dato",
      pronostico: plot.forecast ? {
        lluvia_7_dias_mm: Math.round(plot.forecast.rain7), lluvia_14_dias_mm: Math.round(plot.forecast.rain14),
        minima_7_dias_c: Math.round(plot.forecast.tmin7 * 10) / 10, dia_mas_frio: plot.forecast.tminDate, fuente: "Open-Meteo (no es dato de NASA)",
      } : "sin dato",
      fuente_clima: `NASA POWER, ${result.site.period}, celda de unos 50 km ajustada por altitud con NASA SRTM`,
      limites: ["umbrales de helada y coeficientes de cultivo generales, sin validar localmente", "sin precios, costos ni datos de propiedad", "las heladas de fondo de valle pueden estar subestimadas"],
    };
  }

  /** Answer without a language model: keyword intent, numbers straight from the evaluation. */
  function rules(question, ctx) {
    const { plot, result, assessment } = ctx;
    const q = plain(question || "");
    const best = result.strategies[1];
    const first = best.years.find((y) => y.group !== "fallow");
    const f = plot.forecast;
    const power = `NASA POWER, ${result.site.period}`;
    if (/duen|propiet|legal|titulo|catastro|derechos reales/.test(q)) {
      return "Terrax no tiene datos oficiales de propiedad de la tierra. Para saber si un terreno tiene dueño registrado hay que consultar el Catastro del municipio, Derechos Reales o el INRA.";
    }
    if (/gana|rentab|precio|perd|dinero|costo|plata|vender/.test(q)) {
      return `No tengo precios ni costos oficiales, así que no puedo estimar dinero. En la web puedes poner tu rendimiento y tu precio para calcularlo. Lo que sí sé: ${first.name.toLowerCase()} tiene helada dañina en ${pct(first.frostProb)} % de las campañas y pide ${mm(first.irrigationMm)} mm de riego (${power}).`;
    }
    if (/plaga|invasor|maleza|repelente|insect|gusano|hongo|enfermedad/.test(q)) {
      return "Todavía no tengo una fuente oficial de plagas para tu zona: consulta a SENASAG o a un técnico. Lo que ayuda siempre es no repetir la misma familia de cultivo dos campañas seguidas, que es lo que hace la rotación recomendada.";
    }
    if (/suelo|abono|fertiliz|estiercol|\bph\b|compost|cal\b/.test(q)) {
      if (!plot.soil) return "No tengo dato de suelo para ese punto (pasa en zonas urbanas). Un análisis de laboratorio es lo más seguro para decidir el abono.";
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
    if (/hela|frio|congel/.test(q)) {
      const h = assessment.hazards.find((x) => x.id === "frost");
      return `${h.text} ${f ? `En los próximos 7 días la mínima prevista es de ${f.tmin7.toFixed(1)} °C (Open-Meteo).` : ""} ${h.action}`;
    }
    if (/agua|rieg|regar|sed|canal/.test(q)) {
      return `${first.name} pide unos ${mm(first.cropWaterMm)} mm de agua y la lluvia cubre ${pct(first.coverage)} %: faltan ${mm(first.irrigationMm)} mm con riego (${power}). ${f ? `Esta semana se esperan ${Math.round(f.rain7)} mm de lluvia y ${Math.round(f.et07)} mm de evaporación (Open-Meteo).` : ""}`;
    }
    if (/lluvi|llover|pronost|tiempo|clima|semana/.test(q)) {
      const c = plot.conditions;
      const recent = c ? ` En los últimos 30 días llovieron ${Math.round(c.rain30)} mm; lo normal son ${Math.round(c.rain30Normal)} mm (NASA POWER).` : "";
      return f ? `Se esperan ${Math.round(f.rain7)} mm en 7 días y ${Math.round(f.rain14)} mm en 14, con mínima de ${f.tmin7.toFixed(1)} °C (Open-Meteo).${recent}` : `No pude leer el pronóstico ahora.${recent}`;
    }
    if (/siembr|sembr|cultiv|rotaci|plant|conviene|recomien/.test(q)) return explain(result).join(" ");
    return summary(ctx);
  }

  function summary(ctx) {
    const { plot, assessment } = ctx;
    const top = assessment.hazards.filter((h) => h.level >= 2).map((h) => h.title.toLowerCase());
    return `Soy Terra. Tu parcela está en ${place(plot)}, a ${plot.altitude} m. ${top.length ? `Ojo con: ${top.join(", ")}.` : "No veo riesgos altos."} Pregúntame qué sembrar, cuánta agua hace falta, si va a helar o llover, cómo está el suelo o qué riesgos tiene tu tierra.`;
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
      return text || null;
    } catch {
      return null; // any API problem falls back to the rule-based answer
    }
  }

  /** input: { question, lat, lon, history: [cropId], irrigation, priorities, messages: [{role, content}], fast } */
  async function ask(input) {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { answer: "Soy Terra. Para ayudarte necesito saber dónde está tu parcela: márcala en el mapa o envíame tu ubicación.", engine: "rules" };
    }
    const ctx = await evaluate({ ...input, lat, lon }, { fast: true }); // answers must come back in a few seconds
    if (!ctx) return { answer: "Ese punto está fuera del municipio de Cochabamba. Por ahora Terrax solo cubre el municipio.", engine: "rules" };
    const question = String(input.question || "").slice(0, 600);
    const history = (Array.isArray(input.messages) ? input.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    while (history.length && history[0].role !== "user") history.shift();
    if (history.length && history[history.length - 1].role === "user") history.pop();
    const fromModel = question ? await claude(question, ctx, history) : null;
    return {
      answer: fromModel || (question ? rules(question, ctx) : summary(ctx)),
      engine: fromModel ? "claude" : "rules",
      model: fromModel ? env.TERRA_MODEL || DEFAULT_MODEL : null,
    };
  }

  return { ask, evaluate, summary };
}
