// "Otro" crop: the farmer types a crop that is not in the catalogue and Gemini estimates the same agronomic values
// the engine uses for the others (cycle, FAO-56 Kc, frost damage, pH, family, group). The values are checked against
// sensible ranges before they reach the engine, and the web marks them as estimated by AI.
//   POST /api/crop-profile   { name } -> { crop } | 4xx/503 with a message

const GROUPS = ["tuber", "cereal", "grain", "legume", "vegetable", "herb", "tree", "flower"];
const TYPES = { tuber: "Tubérculo", cereal: "Grano", grain: "Grano", legume: "Leguminosa", vegetable: "Hortaliza", herb: "Aromática", tree: "Frutal", flower: "Flor" };
// botanical synonyms, so a custom crop counts as the same family as the catalogue ones in the rotation rules
const FAMILY = {
  fabaceas: "Leguminosas", fabaceae: "Leguminosas", leguminosae: "Leguminosas", papilionaceas: "Leguminosas",
  poaceas: "Gramíneas", poaceae: "Gramíneas", gramineae: "Gramíneas",
  brassicaceae: "Brasicáceas", cruciferas: "Brasicáceas", cruciferae: "Brasicáceas",
  apiaceae: "Apiáceas", umbeliferas: "Apiáceas", umbelliferae: "Apiáceas",
  asteraceae: "Asteráceas", compuestas: "Asteráceas", compositae: "Asteráceas",
  amaranthaceae: "Amarantáceas", quenopodiaceas: "Amarantáceas", chenopodiaceae: "Amarantáceas",
  amaryllidaceae: "Amarilidáceas", aliaceas: "Amarilidáceas", liliaceas: "Amarilidáceas", alliaceae: "Amarilidáceas",
  solanaceae: "Solanáceas", cucurbitaceae: "Cucurbitáceas", rosaceae: "Rosáceas", lamiaceae: "Lamiáceas", labiadas: "Lamiáceas",
};
const plainName = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number(x)));
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

/** Turns anything that claims to be a crop into a safe crop object, or null. Used for Gemini answers and for crops
 * the browser sends back (they are re-checked, never trusted). */
export function cleanCustomCrop(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").replace(/[<>{}]/g, "").trim().slice(0, 40);
  if (!name) return null;
  const group = GROUPS.includes(raw.group) ? raw.group : "vegetable";
  const kc = Array.isArray(raw.kc) && raw.kc.length === 3 ? raw.kc.map((v, i) => clamp(v, 0.2, i === 1 ? 1.3 : 1.2)) : [0.5, 1.0, 0.8];
  const ph = Array.isArray(raw.ph) && raw.ph.length === 2 ? [clamp(raw.ph[0], 4, 8.5), clamp(raw.ph[1], 4.5, 9)].sort((a, b) => a - b) : [5.5, 7.5];
  const perennial = Boolean(raw.perennial) || group === "tree";
  return {
    id: `otro_${slug(String(raw.id || name).replace(/^otro_/, "")) || "cultivo"}`,
    name,
    scientific: String(raw.scientific || "").replace(/[<>{}]/g, "").slice(0, 80),
    family: FAMILY[plainName(String(raw.family || ""))] || String(raw.family || "Sin familia").replace(/[<>{}]/g, "").slice(0, 40),
    type: TYPES[group],
    cycle_days: perennial ? 364 : Math.round(clamp(raw.cycle_days || 120, 30, 364)),
    frost_damage_c: Math.round(clamp(raw.frost_damage_c ?? 0, -12, 4) * 10) / 10,
    kc, ph,
    fixes_nitrogen: Boolean(raw.fixes_nitrogen),
    forage: Boolean(raw.forage),
    group,
    ...(perennial ? { perennial: true } : {}),
    custom: true,
    source: "Estimado por IA (Gemini) a partir del nombre; verificar con un técnico",
  };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    known: { type: "BOOLEAN", description: "false si el texto no es un cultivo o planta cultivable real" },
    name: { type: "STRING" }, scientific: { type: "STRING" }, family: { type: "STRING", description: "familia botánica en castellano, por ejemplo Solanáceas" },
    group: { type: "STRING", enum: GROUPS },
    cycle_days: { type: "NUMBER" }, frost_damage_c: { type: "NUMBER" },
    kc: { type: "ARRAY", items: { type: "NUMBER" } }, ph: { type: "ARRAY", items: { type: "NUMBER" } },
    fixes_nitrogen: { type: "BOOLEAN" }, forage: { type: "BOOLEAN" }, perennial: { type: "BOOLEAN" },
  },
  required: ["known", "name", "scientific", "family", "group", "cycle_days", "frost_damage_c", "kc", "ph", "fixes_nitrogen", "forage", "perennial"],
};
const PROMPT = `Eres agrónomo. Te doy el nombre (en castellano, quechua o local de Bolivia) de algo que un agricultor de Cochabamba sembró.
Devuelve los valores de referencia del cultivo:
- cycle_days: días de siembra a cosecha en valles andinos (364 si es perenne o frutal).
- frost_damage_c: temperatura mínima (°C) a la que la helada daña el cultivo en crecimiento.
- kc: tres coeficientes de cultivo FAO-56 (inicial, mitad de temporada, final), de la tabla 12 o del cultivo más parecido.
- ph: rango de pH del suelo [mínimo, máximo] según FAO ECOCROP.
- group: tuber, cereal, grain (pseudocereal), legume, vegetable, herb (aromática o medicinal), tree (frutal o arbusto), flower.
- name: el nombre común bien escrito en castellano. Si no es un cultivo real, known=false.
Usa valores de referencia conocidos; no inventes precisión.`;

export function createCropProfiler({ env }) {
  const cache = new Map();
  return {
    async profile(input) {
      const name = String(input && input.name || "").trim().slice(0, 40);
      if (name.length < 2) return { status: 400, error: "Escribe el nombre del cultivo." };
      const key = name.toLowerCase();
      if (cache.has(key)) return { status: 200, crop: cache.get(key) };
      if (!env.GEMINI_API_KEY) return { status: 503, error: "El análisis con IA no está disponible en este servidor." };
      for (const model of [env.GEMINI_MODEL || "gemini-2.5-flash", "gemini-3.1-flash-lite"]) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: PROMPT }] },
              contents: [{ role: "user", parts: [{ text: name }] }],
              generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA },
            }),
            signal: AbortSignal.timeout(25000),
          });
          if (!r.ok) continue;
          const data = await r.json();
          const raw = JSON.parse(data.candidates[0].content.parts.map((p) => p.text || "").join(""));
          if (raw.known === false) return { status: 422, error: `No reconozco «${name}» como un cultivo. Revisa el nombre o escribe otro.` };
          const crop = cleanCustomCrop({ ...raw, id: name });
          if (!crop) continue;
          cache.set(key, crop);
          return { status: 200, crop };
        } catch { /* try the next model */ }
      }
      return { status: 503, error: "No pude analizar ese cultivo ahora. Intenta en unos minutos." };
    },
  };
}
