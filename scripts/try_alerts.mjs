// Simulates the WhatsApp flow (Spanish and Quechua) and the n8n routes without Meta credentials:
//   node scripts/try_alerts.mjs
// Uses temporary files under data/local/test-*.json and deletes them at the end. Phone numbers are fake.
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "../api/handler.mjs";
import { fileSubscribers } from "../api/subscribers.mjs";
import { digestFor, warningFor } from "../api/alerts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
const subsFile = join(root, "data/local/test-subscribers.json");
const sessFile = join(root, "data/local/test-sessions.json");
const env = { ALERTS_SECRET: "prueba-local", WHATSAPP_ALERT_TEMPLATE: "aviso_terreno" };
const api = createApi({
  env, climate: read("web/data/climate_weekly.json"), crops: read("web/data/crops.json"), gamc: read("data/gamc_layers.json"),
  grid: read("web/data/srtm_grid.json"), knowledge: read("web/data/knowledge.json"),
  subscribers: fileSubscribers(subsFile), sessionStore: fileSubscribers(sessFile),
});
const wa = async (message) => {
  const r = await api(new Request("http://local/api/whatsapp", { method: "POST", body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] }) }));
  return (await r.json()).replies[0].text;
};
const n8n = async (path, init = {}) => {
  const r = await api(new Request(`http://local/api/n8n/${path}`, { ...init, headers: { "x-alerts-secret": "prueba-local", ...(init.headers || {}) } }));
  return { status: r.status, data: await r.json() };
};
const short = (items) => items.map((i) => ({ lang: i.lang, kind: i.kind, text: `${i.text.slice(0, 110)}…` }));

console.log("1) desde la web en castellano:", await wa({ from: "59170000001", type: "text", text: { body: "ALERTAS -17.4629,-66.1867" } }));
console.log("\n2) desde la web en quechua:", await wa({ from: "59170000003", type: "text", text: { body: "ALERTAS -17.3385,-66.1358 QU" } }));
console.log("\n3) saludo en quechua sin ubicación:", await wa({ from: "59170000004", type: "text", text: { body: "Napaykuyki" } }));
console.log("\n4) WILLAWAY sin ubicación:", await wa({ from: "59170000004", type: "text", text: { body: "WILLAWAY" } }));
console.log("\n5) manda la ubicación y queda suscrito:", await wa({ from: "59170000004", type: "location", location: { latitude: -17.42, longitude: -66.17 } }));
console.log("\n6) n8n estado:", JSON.stringify((await n8n("status")).data));
console.log("\n7) n8n mensajes de prueba:", JSON.stringify(short((await n8n("alerts?test=1")).data.items), null, 1));
const digest = await n8n("digest");
console.log("\n8) n8n resumen semanal:", digest.data.count, "mensajes");
for (const i of digest.data.items.slice(0, 2)) console.log(`--- ${i.lang}\n${i.text}`);
const marked = await n8n("sent", { method: "POST", body: JSON.stringify({ sent: digest.data.items.map((i) => ({ key: i.key, mark: i.mark })) }) });
console.log("\n9) n8n marca enviados:", JSON.stringify(marked.data), "| otra vez el resumen:", (await n8n("digest")).data.count, "pendientes");
console.log("10) clave incorrecta:", (await api(new Request("http://local/api/n8n/alerts", { headers: { "x-alerts-secret": "otra" } }))).status);
console.log("\n11) BAJA en quechua:", await wa({ from: "59170000003", type: "text", text: { body: "BAJA" } }));
const fake = { daily: { days: [{ pFrost: 0.6, tminP10: -1.4, pHeavyRain: 0 }, { pFrost: 0, tminP10: 3, pHeavyRain: 0.7 }] } };
console.log("\n12) aviso urgente castellano:", warningFor(fake, "Distrito 13").text);
console.log("    aviso urgente quechua:", warningFor(fake, "Distrito 13", "qu").text);
console.log("\n13) resumen sin pronóstico (quechua):\n" + digestFor(null, "Distrito 9", "qu"));
rmSync(subsFile, { force: true });
rmSync(sessFile, { force: true });
