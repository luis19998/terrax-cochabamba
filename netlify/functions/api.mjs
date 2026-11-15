// Hosted version of the API: the same handler as the local server, with the data bundled into the function.
// Secrets are read from the site's environment variables, never from the repository.
import { getStore } from "@netlify/blobs";
import climate from "../../web/data/climate_weekly.json" with { type: "json" };
import crops from "../../web/data/crops.json" with { type: "json" };
import grid from "../../web/data/srtm_grid.json" with { type: "json" };
import gamc from "../../data/gamc_layers.json" with { type: "json" };
import knowledge from "../../web/data/knowledge.json" with { type: "json" };
import { createApi } from "../../api/handler.mjs";
import { blobSubscribers } from "../../api/subscribers.mjs";

export const ENV_NAMES = [
  "GAMC_WMS_URL", "GAMC_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "ANTHROPIC_API_KEY", "TERRA_MODEL",
  "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_PUBLIC_NUMBER", "WHATSAPP_ALERT_TEMPLATE", "WHATSAPP_TEMPLATE_LANG", "ALERTS_SECRET",
];
const env = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]).filter(([, value]) => value));

let api;
export default (request) => {
  // stores are created inside the request, where Netlify provides the Blobs context
  api ??= createApi({
    env, climate, crops, gamc, grid, knowledge,
    subscribers: blobSubscribers(getStore("alert-subscribers")),
    sessionStore: blobSubscribers(getStore("wa-sessions")),
  });
  return api(request);
};

export const config = { path: "/api/*" };
