// Hosted version of the API: the same handler as the local server, with the data bundled into the function.
// Secrets are read from the site's environment variables, never from the repository.
import climate from "../../web/data/climate_weekly.json" with { type: "json" };
import crops from "../../web/data/crops.json" with { type: "json" };
import grid from "../../web/data/srtm_grid.json" with { type: "json" };
import gamc from "../../data/gamc_layers.json" with { type: "json" };
import { createApi } from "../../api/handler.mjs";

const NAMES = [
  "GAMC_WMS_URL", "GAMC_API_KEY", "ANTHROPIC_API_KEY", "TERRA_MODEL",
  "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_GRAPH_VERSION",
];
const env = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]).filter(([, value]) => value));

const api = createApi({ env, climate, crops, gamc, grid });

export default (request) => api(request);

export const config = { path: "/api/*" };
