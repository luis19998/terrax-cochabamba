// Pre-generates the dictionary of one language for the whole page (web/data/<lang>.json), so it shows at once
// without asking Gemini in every visit. The Spanish texts are the keys of web/data/qu.json (every sentence of the
// web, numbers and crop names as {0}, {1}…); crop and month names go in "terms".
// Usage: node scripts/build_lang.mjs en [pt …]   (needs GEMINI_API_KEY in global/.env; resumes if interrupted)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, LANGUAGES } from "../api/translate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.GEMINI_API_KEY) { console.error("Falta GEMINI_API_KEY en global/.env"); process.exit(1); }

const keys = Object.keys(JSON.parse(readFileSync(join(root, "web/data/qu.json"), "utf8")).entries);
const crops = JSON.parse(readFileSync(join(root, "web/data/crops.json"), "utf8"));
const list = Array.isArray(crops) ? crops : crops.crops;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const termKeys = [...new Set([...list.flatMap((c) => [c.name, c.name.replace(/\s*\(.*\)$/, "")]), ...MONTHS, ...MONTHS_LONG])];

const translator = createTranslator({ env, cache: null });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const lang of process.argv.slice(2)) {
  if (!LANGUAGES[lang] || lang === "qu") { console.error(`Idioma no válido: ${lang}`); continue; }
  const file = join(root, `web/data/${lang}.json`);
  const out = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { meta: {}, entries: {}, terms: {} };
  const save = () => {
    out.meta = { lang, source: "web/data/qu.json (claves en castellano)", engine: "Gemini (borrador automático)", generated: new Date().toISOString().slice(0, 10) };
    writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  };
  for (const [what, all] of [["terms", termKeys], ["entries", keys]]) {
    const todo = all.filter((k) => !out[what][k]);
    console.log(`${lang} ${what}: ${todo.length} por traducir de ${all.length}`);
    for (let i = 0; i < todo.length; i += 40) {
      const batch = todo.slice(i, i + 40);
      let got = {};
      for (let attempt = 0; attempt < 4 && !Object.keys(got).length; attempt++) {
        got = await translator.translate(batch, lang).catch(() => ({}));
        if (!Object.keys(got).length) await wait(20000);
      }
      Object.assign(out[what], got);
      save();
      process.stdout.write(`  ${Math.min(i + 40, todo.length)}/${todo.length}\r`);
      await wait(4500);
    }
    console.log(`  ${what}: ${Object.keys(out[what]).length} listas`);
  }
}
