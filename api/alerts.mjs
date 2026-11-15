// Daily frost and heavy-rain warnings by WhatsApp for the people who wrote ALERTAS.
// For each subscription: probabilistic forecast for the next two days at the plot (31 GFS ensemble scenarios, see
// outlook.mjs). A warning is sent when, on either day, 3 or more out of 10 scenarios bring frost, or 5 or more out
// of 10 bring 10 mm or more of rain. At most one warning per person per day.
//
// WhatsApp only lets a business write first with an approved message template. With WHATSAPP_ALERT_TEMPLATE set,
// the warning goes as that template with the text as its single parameter; without it, as plain text, which only
// reaches people who wrote to the number in the last 24 hours.
import { elevationFromGrid } from "../web/js/assess.js";

const GRAPH = (env) => `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export async function sendWhatsApp(env, to, text, { template } = {}) {
  const body = template
    ? { messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG || "es" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000) }] }] } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 3900) } };
  const r = await fetch(GRAPH(env), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return r.ok;
}

const tenths = (p) => Math.round(p * 10);

/** The warning for one plot, or null when the next two days look safe. */
export function warningFor(outlook, place) {
  if (!outlook || !outlook.daily) return null;
  const days = outlook.daily.days.slice(0, 2);
  const parts = [];
  const frostDay = days.find((d) => d.pFrost >= 0.3);
  if (frostDay) {
    parts.push(`posible helada ${frostDay === days[0] ? "esta noche" : "mañana"}: ${tenths(frostDay.pFrost)} de cada 10 escenarios bajan de 0 °C (mínima cerca de ${Math.round(frostDay.tminP10)} °C). Cubre almácigos y cultivos tiernos y riega la tarde anterior`);
  }
  const rainDay = days.find((d) => d.pHeavyRain >= 0.5);
  if (rainDay) {
    parts.push(`lluvia fuerte ${rainDay === days[0] ? "hoy" : "mañana"}: ${tenths(rainDay.pHeavyRain)} de cada 10 escenarios dan 10 mm o más. Limpia canales y desagües y no dejes el suelo desnudo`);
  }
  if (!parts.length) return null;
  return `Aviso de Yatiri X para tu terreno en ${place}: ${parts.join("; ")}. Fuente: pronóstico por escenarios GFS (NOAA). Escribe BAJA para no recibir más avisos.`;
}

/** Runs once for every subscription. `simulate` sends a test message to everybody (for the demo). */
export async function runAlerts({ env, subscribers, outlook, grid, simulate = false }) {
  const list = await subscribers.list();
  const today = new Date().toISOString().slice(0, 10);
  const summary = { subscribers: list.length, sent: 0, skipped: 0, failed: 0, configured: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) };
  for (const sub of list) {
    try {
      if (!simulate && sub.lastAlert === today) { summary.skipped += 1; continue; }
      const altitude = elevationFromGrid(grid, sub.lat, sub.lon);
      const o = altitude === null ? null : await outlook.outlook(sub.lat, sub.lon, altitude);
      const text = simulate
        ? `Prueba de aviso de Yatiri X: así te llegará una alerta de helada o lluvia fuerte para tu terreno en ${sub.place || "Cochabamba"}. Escribe BAJA para no recibir más avisos.`
        : warningFor(o, sub.place || "Cochabamba");
      if (!text) { summary.skipped += 1; continue; }
      if (!summary.configured) { summary.skipped += 1; continue; }
      const ok = await sendWhatsApp(env, sub.phone, text, { template: env.WHATSAPP_ALERT_TEMPLATE });
      if (ok) {
        summary.sent += 1;
        if (!simulate) await subscribers.set(sub.key, { ...sub, lastAlert: today });
      } else summary.failed += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
