// Real photos of Cochabamba (places, farming, markets, the kantuta) from Wikimedia Commons, with author and licence,
// for the loading screens of Yatiri X Global. Output: web/data/cbba_images.json. Images are linked, not copied.
//   node scripts/fetch_cbba_images.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "YatiriX-hackathon-prototype/0.4 (NASA Space Apps 2026 Cochabamba)" };
// Commons category -> caption shown under the photo
const CATEGORIES = [
  ["Cantua buxifolia", "Kantuta, flor nacional de Bolivia"],
  ["Cristo de la Concordia", "Cristo de la Concordia, Cochabamba"],
  ["Cristo de la Concordia (Cochabamba)", "Cristo de la Concordia, Cochabamba"],
  ["Cochabamba (city)", "Ciudad de Cochabamba"],
  ["Cerro Tunari", "Cerro Tunari, 5.035 m"],
  ["Laguna Alalay", "Laguna Alalay, Cochabamba"],
  ["Tunari National Park", "Parque Nacional Tunari"],
  ["Cordillera del Tunari", "Cordillera del Tunari"],
  ["Cochabamba Valley", "Valle de Cochabamba"],
  ["Agriculture in Cochabamba Department", "Agricultura en Cochabamba"],
  ["Agriculture in Bolivia", "Agricultura en Bolivia"],
  ["La Cancha (Cochabamba)", "La Cancha, el gran mercado de Cochabamba"],
  ["Markets in Cochabamba", "Mercados de Cochabamba"],
  ["Tiquipaya", "Tiquipaya"],
  ["Quillacollo", "Quillacollo"],
  ["Sacaba", "Sacaba"],
  ["Punata", "Punata, Valle Alto"],
  ["Tarata", "Tarata, Valle Alto"],
  ["Cliza", "Cliza, Valle Alto"],
  ["Incallajta", "Incallajta, Pocona"],
  ["Torotoro National Park", "Parque Nacional Torotoro"],
  ["Villa Tunari", "Villa Tunari, trópico de Cochabamba"],
  ["Chapare Province", "Chapare, trópico de Cochabamba"],
  ["Potatoes of Bolivia", "Papas de Bolivia"],
  ["Quinoa in Bolivia", "Quinua en Bolivia"],
];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const plain = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const out = [];
for (const [category, caption] of CATEGORIES) {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "categorymembers", gcmtitle: `Category:${category}`, gcmtype: "file", gcmlimit: "12",
    prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "640",
  });
  try {
    let data = null;
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      await sleep(3500 + attempt * 8000);
      const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: UA });
      const text = await r.text();
      try { data = JSON.parse(text); } catch { /* asked to slow down: wait and retry */ }
    }
    if (!data) throw new Error("sin respuesta");
    const pages = Object.values((data.query && data.query.pages) || {});
    let taken = 0;
    for (const p of pages) {
      const info = p.imageinfo && p.imageinfo[0];
      if (!info || info.mime !== "image/jpeg" || !info.thumburl) continue;
      const meta = info.extmetadata || {};
      const licence = plain(meta.LicenseShortName && meta.LicenseShortName.value);
      if (!/CC|Public domain|PD/i.test(licence)) continue;
      out.push({ src: info.thumburl, title: caption, author: plain(meta.Artist && meta.Artist.value).slice(0, 80) || "Wikimedia Commons", licence, page: info.descriptionurl });
      if (++taken >= 4) break;
    }
    console.log(`${category}: ${taken}`);
  } catch (error) {
    console.log(`${category}: error ${error.message}`);
  }
}
writeFileSync(join(root, "web/data/cbba_images.json"), `${JSON.stringify({ meta: { source: "Wikimedia Commons", generated: new Date().toISOString().slice(0, 10) }, photos: out }, null, 1)}\n`);
console.log(`total ${out.length}`);
