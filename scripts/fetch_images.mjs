// Finds real photos for crops, pests and invasive species on Wikipedia / Wikimedia Commons and records the author
// and licence of each one, so the app can show them with credit. Output: web/data/images.json
//   node scripts/fetch_images.mjs
// Images are linked from upload.wikimedia.org (not copied). Run again to refresh.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const knowledge = JSON.parse(readFileSync(join(root, "web/data/knowledge.json"), "utf8"));
const UA = { "User-Agent": "YatiriX-hackathon-prototype/0.3 (NASA Space Apps 2026 Cochabamba)" };

const CROPS = {
  papa: ["Solanum tuberosum", "Papa"], maiz: ["Zea mays", "MaÃ­z"], haba: ["Vicia faba", "Haba"], arveja: ["Pisum sativum", "Guisante"],
  trigo: ["Triticum aestivum", "Triticum"], cebada: ["Hordeum vulgare", "Cebada"], quinua: ["Chenopodium quinoa", "Quinua"],
  alfalfa: ["Medicago sativa", "Alfalfa"], cebolla: ["Allium cepa", "Cebolla"], tomate: ["Solanum lycopersicum", "Tomate"],
};
// crops added later: the scientific name in crops.json is the first candidate
const cropsJson = JSON.parse(readFileSync(join(root, "web/data/crops.json"), "utf8"));
for (const c of cropsJson.crops) if (!CROPS[c.id] && c.scientific) CROPS[c.id] = [c.scientific, c.name.replace(/ \(.*\)/, "")];
// titles that work better than the scientific name on Wikipedia
const EXTRA = { repollo: ["Cabbage", "Repollo"], trebol: ["Trifolium repens", "White clover"], vainita_arbustiva: ["Snow pea"] };
for (const [id, titles] of Object.entries(EXTRA)) CROPS[id] = [...titles, ...(CROPS[id] || [])];
const PEST_TITLES = { "Acanthoscelides obtectus": ["Bean weevil", "Acanthoscelides"], "Eurysacca melanocampta": ["Eurysacca"] };
const PLACES = { valle: ["Valle Alto (Bolivia)", "Cochabamba Valley", "Valle de Cochabamba", "Departamento de Cochabamba"] };

const candidatesFor = (scientific) => {
  const first = scientific.split(/ y |,|\(/)[0].replace(/\bspp\.?/, "").trim();
  const genus = first.split(" ")[0];
  return [...new Set([first, genus])];
};

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
/** fetch with a pause between calls and retries when Wikimedia asks to slow down (429) */
async function politeFetch(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1200 + attempt * 4000);
    const r = await fetch(url, { headers: UA });
    if (r.status !== 429 && r.status < 500) return r;
  }
  return { ok: false, status: 429 };
}

async function summary(lang, title) {
  const r = await politeFetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!r.ok) return null;
  const s = await r.json();
  const img = s.originalimage || s.thumbnail;
  if (!img || s.type === "disambiguation") return null;
  return { page: s.content_urls && s.content_urls.desktop.page, title: s.title, image: img.source.split("?")[0] };
}

async function licence(imageUrl) {
  const file = decodeURIComponent(imageUrl.split("/").pop());
  const r = await politeFetch(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query", format: "json", prop: "imageinfo", iiprop: "extmetadata|url", iiurlwidth: "640", titles: `File:${file}`, origin: "*",
  })}`);
  if (!r.ok) return null;
  const data = await r.json();
  const page = Object.values(data.query.pages)[0];
  const info = page.imageinfo && page.imageinfo[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const strip = (h) => (h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return {
    thumb: info.thumburl || info.url,
    file_page: info.descriptionurl,
    licence: strip(meta.LicenseShortName && meta.LicenseShortName.value) || "ver la pÃ¡gina del archivo",
    author: strip(meta.Artist && meta.Artist.value).slice(0, 120) || "Wikimedia Commons",
  };
}

async function find(titles) {
  for (const title of titles) {
    for (const lang of ["es", "en"]) {
      try {
        const s = await summary(lang, title);
        if (!s) continue;
        const l = await licence(s.image);
        if (l && /\.(jpe?g|png)$/i.test(s.image)) return { title: s.title, wiki: s.page, ...l };
      } catch { /* try the next one */ }
    }
  }
  return null;
}

const file = join(root, "web/data/images.json");
// photos checked by hand and removed because they showed another species
const REMOVED = new Set(["Peronospora variabilis", "Cenchrus clandestinus (Pennisetum clandestinum)", "Uromyces appendiculatus", "Colletotrichum lupini", "Podosphaera xanthii", "Puccinia spp."]);
let previous = {};
try { previous = JSON.parse(readFileSync(file, "utf8")); } catch { /* first run */ }
const out = { source: "Wikipedia y Wikimedia Commons; cada imagen con su autor y licencia", generated: new Date().toISOString().slice(0, 10), crops: {}, pests: {}, invasive: {}, places: {} };
async function fill(group, key, titles, label) {
  const known = previous[group] && previous[group][key];
  // keep earlier photos; never bring back the ones removed by hand; retry the ones that failed before
  out[group][key] = known || (REMOVED.has(key) || !titles.length ? null : await find(titles));
  console.log(label, key, out[group][key] ? out[group][key].licence : "sin imagen");
}
for (const [id, titles] of Object.entries(CROPS)) await fill("crops", id, titles, "cultivo");
for (const list of Object.values(knowledge.pests)) for (const p of list) {
  if (out.pests[p.scientific] !== undefined) continue;
  await fill("pests", p.scientific, /varias/.test(p.scientific) ? [] : [...(PEST_TITLES[p.scientific] || []), ...candidatesFor(p.scientific)], "plaga");
}
for (const x of knowledge.invasive) await fill("invasive", x.scientific, candidatesFor(x.scientific), "invasora");
for (const [id, titles] of Object.entries(PLACES)) await fill("places", id, titles, "lugar");
writeFileSync(join(root, "web/data/images.json"), JSON.stringify(out, null, 1));
console.log("Guardado web/data/images.json");
