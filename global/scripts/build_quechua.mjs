// Builds the Quechua dictionary that ships with the site (web/data/qu.json) from:
//   1. web/data/qu-corrections.json   corrections made by hand; they always win
//   2. web/data/qu.json               what is already published (kept, never overwritten by new machine output)
//   3. data/local/translations.json   translations made while using the local web (written by the local server)
// Every machine translation goes through bolivian() (Peruvian -sha- -> Bolivian -chka-, and similar).
//   node server.mjs, open http://localhost:4173, switch to Quechua and go through every screen and view
//   node scripts/build_quechua.mjs
// To correct a translation, add or edit it in web/data/qu-corrections.json (keep the {0}, {1}… marks and the HTML
// tags) and run the script again.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bolivian } from "../api/translate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dictPath = join(root, "web", "data", "qu.json");
const read = (path, fallback) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } };

const dict = read(dictPath, { meta: {}, entries: {} });
const corrections = read(join(root, "web", "data", "qu-corrections.json"), { entries: {} }).entries;
const cache = read(join(root, "data", "local", "translations.json"), {});

const entries = {};
for (const row of Object.values(cache)) if (row && row.es && row.qu) entries[row.es] = bolivian(row.qu);
for (const [es, qu] of Object.entries(dict.entries)) entries[es] = bolivian(qu); // published entries win over new ones
const added = Object.keys(entries).length - Object.keys(dict.entries).length;
Object.assign(entries, corrections);

dict.entries = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, "es")));
dict.meta = {
  language: "Quechua boliviano (Cochabamba)",
  status: "Borrador: traducción automática (Gemini) con correcciones a mano en qu-corrections.json. Debe revisarlo un hablante.",
  keys: "Los números se reemplazan por {0}, {1}… para que una traducción sirva para cualquier terreno.",
  source: "scripts/build_quechua.mjs",
  updated: new Date().toISOString().slice(0, 10),
  count: Object.keys(dict.entries).length,
  corrected_by_hand: Object.keys(corrections).length,
};
writeFileSync(dictPath, `${JSON.stringify(dict, null, 1)}\n`);
console.log(`web/data/qu.json: ${dict.meta.count} textos (${Math.max(0, added)} nuevos, ${dict.meta.corrected_by_hand} corregidos a mano).`);
