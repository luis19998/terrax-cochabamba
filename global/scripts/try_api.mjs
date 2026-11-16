// Calls the API handler directly (no server): node scripts/try_api.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "../api/handler.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const env = {};
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const api = createApi({
  env, climate: read("web/data/climate_weekly.json"), crops: read("web/data/crops.json"), gamc: read("data/gamc_layers.json"),
  grid: read("web/data/srtm_grid.json"), knowledge: read("web/data/knowledge.json"),
});
const call = async (path, body) => {
  const t0 = performance.now();
  const r = await api(new Request(`http://local${path}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}));
  return { status: r.status, ms: Math.round(performance.now() - t0), data: await r.json() };
};

const o = await call("/api/outlook?lat=-17.3385&lon=-66.1358");
console.log(`outlook ${o.status} en ${o.ms} ms | diario: ${o.data.daily ? o.data.daily.days.length + " dias" : "null"} | semanas: ${o.data.weekly ? JSON.stringify(o.data.weekly.weeks[0]) : "null"}`);
console.log(`meses: ${o.data.monthly ? o.data.monthly.months.map((m) => `${m.name} ${m.rainMedian}mm [${m.rainP20}-${m.rainP80}] seco ${m.pDryMonth} humedo ${m.pWetMonth} helada ${m.pFrost}`).join(" | ") : "null"}`);
console.log(`dia 1: ${o.data.daily ? JSON.stringify(o.data.daily.days[0]) : "null"}`);
for (const q of ["que plagas tiene la papa", "repelente casero", "tiene dueno mi terreno", "va a helar", "como viene la lluvia los proximos meses", "que abono le pongo al maiz", "especies invasoras"]) {
  const r = await call("/api/tiri", { question: q, lat: -17.3385, lon: -66.1358, history: ["papa"] });
  console.log(`\n[${q}] (${r.data.engine}, ${r.ms} ms) ${r.data.answer}`);
}
const h = await call("/api/health");
console.log("\nhealth:", JSON.stringify(h.data));
