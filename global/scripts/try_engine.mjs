// Quick manual check of the engine: node scripts/try_engine.mjs [altitude] [crop,crop] [irrigation 0|1]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { recommend, explain } from "../web/js/engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const climate = JSON.parse(readFileSync(join(root, "web/data/climate_weekly.json"), "utf8"));
const crops = JSON.parse(readFileSync(join(root, "web/data/crops.json"), "utf8"));

const altitude = Number(process.argv[2] || 2560);
const history = (process.argv[3] || "papa,papa").split(",");
const irrigation = process.argv[4] === "1";
const t0 = performance.now();
const result = recommend(climate, crops, { altitude, history, irrigation, priorities: ["risk"], preferred: [] });
const ms = Math.round(performance.now() - t0);

const date = (week) => new Date(Date.UTC(2025, 0, 1 + week * 7)).toLocaleDateString("es-BO", { day: "numeric", month: "short", timeZone: "UTC" });
console.log(`altitud ${altitude} m | historial ${history.join(", ")} | riego ${irrigation} | ${ms} ms | ajuste de temperatura ${result.site.temperatureShift} C`);
for (const s of result.strategies) {
  console.log(`\n${s.label}: ${s.score}/100  ${JSON.stringify(s.parts)}  riego 3 años ${Math.round(s.irrigationTotalMm)} mm`);
  for (const y of s.years) {
    console.log(`  año ${y.year}: ${y.name.padEnd(22)} ${y.sowWeek === null ? "".padEnd(16) : ("siembra " + date(y.sowWeek)).padEnd(16)} helada ${(y.frostProb * 100).toFixed(0).padStart(3)} %  lluvia cubre ${(y.coverage * 100).toFixed(0).padStart(3)} %  riego ${Math.round(y.irrigationMm)} mm  | ${y.transition}`);
  }
}
console.log("\nCultivos (mejor semana de siembra):");
for (const [id, c] of Object.entries(result.crops)) {
  console.log(`  ${id.padEnd(8)} siembra ${date(c.sowWeek).padEnd(8)} helada ${(c.frostProb * 100).toFixed(0).padStart(3)} %  agua ${Math.round(c.cropWaterMm)} mm  lluvia cubre ${(c.coverage * 100).toFixed(0)} %`);
}
const cal = result.calendar.weeks;
console.log(`\nSemanas con helada >= 20 %: ${cal.filter((w) => w.pFrost >= 0.2).map((w) => w.week).join(",") || "ninguna"} | lluvia intensa semanal (p90): ${result.calendar.heavyRainMm.toFixed(0)} mm`);
console.log("Explicacion:", explain(result).join(" "));
