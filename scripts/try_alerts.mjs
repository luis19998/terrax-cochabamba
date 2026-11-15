// Simulates the WhatsApp alert flow without Meta credentials: node scripts/try_alerts.mjs
// Uses temporary files under data/local/test-*.json and deletes them at the end.
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "../api/handler.mjs";
import { fileSubscribers } from "../api/subscribers.mjs";
import { warningFor } from "../api/alerts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const subsFile = join(root, "data/local/test-subscribers.json");
const sessFile = join(root, "data/local/test-sessions.json");
const env = { ALERTS_SECRET: "prueba-local" };
const api = createApi({
  env, climate: read("web/data/climate_weekly.json"), crops: read("web/data/crops.json"), gamc: read("data/gamc_layers.json"),
  grid: read("web/data/srtm_grid.json"), knowledge: read("web/data/knowledge.json"),
  subscribers: fileSubscribers(subsFile), sessionStore: fileSubscribers(sessFile),
});
const wa = async (message) => {
  const r = await api(new Request("http://local/api/whatsapp", { method: "POST", body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] }) }));
  return (await r.json()).replies[0].text;
};
const health = async () => (await (await api(new Request("http://local/api/health"))).json()).alerts;

console.log("1) desde la web:", await wa({ from: "59170000001", type: "text", text: { body: "ALERTAS -17.4629,-66.1867" } }));
console.log("\n2) ALERTAS sin ubicación:", await wa({ from: "59170000002", type: "text", text: { body: "alertas" } }));
console.log("\n3) luego manda la ubicación:", await wa({ from: "59170000002", type: "location", location: { latitude: -17.3385, longitude: -66.1358 } }));
console.log("\n4) salud:", JSON.stringify(await health()));
const run = await api(new Request("http://local/api/alerts/run", { method: "POST", headers: { "x-alerts-secret": "prueba-local" }, body: "{}" }));
console.log("\n5) corrida diaria (sin credenciales de Meta no envía):", JSON.stringify(await run.json()));
const bad = await api(new Request("http://local/api/alerts/run", { method: "POST", headers: { "x-alerts-secret": "otra" }, body: "{}" }));
console.log("6) clave incorrecta:", bad.status);
console.log("\n7) BAJA:", await wa({ from: "59170000001", type: "text", text: { body: "BAJA" } }));
console.log("8) salud:", JSON.stringify(await health()));
const fake = { daily: { days: [{ pFrost: 0.6, tminP10: -1.4, pHeavyRain: 0 }, { pFrost: 0, tminP10: 3, pHeavyRain: 0.7 }] } };
console.log("\n9) texto de un aviso con helada y lluvia:", warningFor(fake, "Distrito 13"));
rmSync(subsFile, { force: true });
rmSync(sessFile, { force: true });
