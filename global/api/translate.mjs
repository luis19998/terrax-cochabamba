// Spanish -> Bolivian Quechua (Cochabamba) for every text the web shows, including the computed results.
// Order of use: web/data/qu.json (reviewed dictionary, in the repository) -> this cache -> Gemini.
// Texts arrive already "normalised" by web/js/translate.js: numbers are replaced by {0}, {1}… so one translation
// serves every plot. Translations are a DRAFT until a Quechua speaker reviews web/data/qu.json.
import { createHash } from "node:crypto";

export const QUECHUA_RULES = `Traduces del castellano al quechua boliviano, variedad de Cochabamba, para agricultores que leen en el teléfono.
Reglas:
- Alfabeto oficial de Bolivia: vocales a, i, u (e y o solo en préstamos); j en lugar de h (jallp'a, janaq); ch, chh, ch', k, kh, k', p, ph, p', q, qh, q', t, th, t'.
- Quechua de Bolivia, no del Perú: progresivo con -chka- (kachkan, parachkan, tarpuchkanki), nunca -sha- (kashan); "ancha" y no "ashkha"; "hayk'a" y no "mashkha"; "-manta", "-pi", "-wan" como en Cochabamba.
- Palabras sencillas y cotidianas, como se habla en el campo. Si no hay una palabra quechua de uso común, usa el préstamo del castellano que la gente usa (riego, abono, semana, análisis) en lugar de inventar.
- No traduzcas y deja igual: Yatiri X, Tiri, TIRI, NASA, POWER, SRTM, SMAP, MODIS, GPM, IMERG, GIBS, GFS, NOAA, GAMC, SENASAG, INIAF, FAO, ECOCROP, SoilGrids, Open-Meteo, Esri, Maxar, OpenStreetMap, OpenTopoMap, Wikimedia Commons, WhatsApp, GPS, PDF, JSON, Supabase, nombres científicos en latín, unidades (mm, °C, m, ha, km, %, m³, g/kg) y siglas.
- Meses: los nombres en castellano (enero, febrero…), como se usan en Cochabamba.
- Cultivos: el nombre quechua común si existe (maíz: sara; haba: jawas; quinua: kinuwa; oca: uqa; papalisa: ulluku; tarwi: tarwi; papa: papa); si no, el nombre en castellano.
- Conserva exactamente las marcas {0}, {1}, {2}… (cada una una sola vez) y las etiquetas HTML con sus atributos (<b>, </b>, <br>, <span class="…">…). Puedes moverlas dentro de la oración para respetar el orden quechua.
- Conserva los signos de puntuación del inicio y del final, las comillas «» y los dos puntos.
- Un texto muy corto (un botón, una etiqueta) se traduce corto.
- Si el texto ya está en quechua o es solo un nombre propio, devuélvelo igual.`;

// best Quechua first; the free tier allows few calls a day to the newest model, so the next ones take over
const MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
const exhausted = new Map(); // model -> time when it can be tried again
const keyOf = (text) => `qu:${createHash("sha1").update(text).digest("hex")}`;

/** Peruvian forms that the models still slip in, turned into their Bolivian (Cochabamba) forms. */
export function bolivian(text) {
  return text
    .replace(/(\p{L})sha(n|nki|ni|nchik|yku|nku|nkichik|nqa|ptin|spa)(?=[^\p{L}]|$)/gu, "$1chka$2")
    .replace(/\bashkha\b/giu, "ancha")
    .replace(/\bmashkha\b/giu, "hayk'a");
}

/** true when a translation keeps every {n} mark and every HTML tag of the source */
export function sameMarks(src, out) {
  if (typeof out !== "string" || !out.trim()) return false;
  const marks = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
  const tags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).map((t) => t.replace(/\s.*?(\/?)>$/, "$1>")).sort().join();
  return marks(src) === marks(out) && tags(src) === tags(out);
}

async function geminiTranslate(env, texts) {
  const models = [env.TRANSLATE_MODEL, ...MODEL_FALLBACKS].filter(Boolean);
  let lastError = null;
  for (const model of [...new Set(models)]) {
    if ((exhausted.get(model) || 0) > Date.now()) continue;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: QUECHUA_RULES }] },
        contents: [{ role: "user", parts: [{ text: `Traduce cada elemento de este arreglo JSON. Responde solo con un arreglo JSON de la misma longitud y en el mismo orden.\n${JSON.stringify(texts)}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      // out of quota (429) or model gone (404): skip it for a while and try the next one
      if (r.status === 429 || r.status === 404) exhausted.set(model, Date.now() + (r.status === 429 ? 30 : 24 * 60) * 60e3);
      lastError = new Error(`${model}: HTTP ${r.status}`);
      continue;
    }
    const data = await r.json();
    const raw = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts.map((p) => p.text || "").join("");
    let out = null;
    try { out = JSON.parse(raw); } catch { /* try the next model */ }
    if (!Array.isArray(out) || out.length !== texts.length) { lastError = new Error(`${model}: respuesta incompleta`); continue; }
    return out;
  }
  throw lastError || new Error("Sin modelo de Gemini disponible");
}

/**
 * createTranslator({ env, cache }) -> { translate(texts) -> { [text]: quechua } }
 * cache: object with get/set (Netlify Blobs or a local file). Texts that fail the checks stay out of the answer,
 * so the web keeps them in Spanish instead of showing a broken sentence.
 */
export function createTranslator({ env, cache }) {
  return {
    available: () => Boolean(env.GEMINI_API_KEY),
    async translate(texts) {
      const clean = [...new Set(texts.filter((t) => typeof t === "string" && t.trim() && t.length <= 2000))].slice(0, 80);
      const result = {};
      const missing = [];
      for (const text of clean) {
        const hit = cache ? await cache.get(keyOf(text)).catch(() => null) : null;
        if (hit && hit.qu) result[text] = hit.qu; else missing.push(text);
      }
      if (!missing.length || !env.GEMINI_API_KEY) return result;
      // batches small enough for one answer
      const batches = [];
      let batch = [];
      let size = 0;
      for (const text of missing) {
        if (batch.length >= 40 || size + text.length > 6000) { batches.push(batch); batch = []; size = 0; }
        batch.push(text);
        size += text.length;
      }
      if (batch.length) batches.push(batch);
      for (const b of batches) {
        let out;
        try { out = await geminiTranslate(env, b); } catch { continue; }
        for (let i = 0; i < b.length; i++) {
          if (!sameMarks(b[i], out[i])) continue;
          const qu = bolivian(out[i]);
          result[b[i]] = qu;
          if (cache) await cache.set(keyOf(b[i]), { es: b[i], qu, at: new Date().toISOString().slice(0, 10) }).catch(() => {});
        }
      }
      return result;
    },
  };
}
