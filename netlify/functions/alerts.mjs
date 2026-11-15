// Scheduled function: every day at 22:00 UTC (18:00 in Bolivia) it checks the forecast of every subscribed plot
// and sends the WhatsApp warnings (see api/alerts.mjs).
import { getStore } from "@netlify/blobs";
import climate from "../../web/data/climate_weekly.json" with { type: "json" };
import grid from "../../web/data/srtm_grid.json" with { type: "json" };
import { createOutlook } from "../../api/outlook.mjs";
import { runAlerts } from "../../api/alerts.mjs";
import { blobSubscribers } from "../../api/subscribers.mjs";

const NAMES = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_ALERT_TEMPLATE", "WHATSAPP_TEMPLATE_LANG"];

export default async () => {
  const env = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]).filter(([, v]) => v));
  const summary = await runAlerts({
    env, grid, outlook: createOutlook({ climate }), subscribers: blobSubscribers(getStore("alert-subscribers")),
  });
  console.log("Avisos Yatiri X:", JSON.stringify(summary)); // counts only, never phone numbers
};

export const config = { schedule: "0 22 * * *" };
