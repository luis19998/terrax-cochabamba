// Local server for the planner: static web app + the API in api/handler.mjs. No dependencies (Node 20+).
//
//   node server.mjs            -> http://localhost:4173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api/handler.mjs";
import { fileSubscribers } from "./api/subscribers.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "web");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

function loadEnv() {
  const env = {};
  const file = join(root, ".env");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts), "utf8"));
const climate = readJson("web", "data", "climate_weekly.json");
const crops = readJson("web", "data", "crops.json");
const api = createApi({
  env: loadEnv(), climate, crops,
  gamc: readJson("data", "gamc_layers.json"), grid: readJson("web", "data", "srtm_grid.json"),
  knowledge: readJson("web", "data", "knowledge.json"),
  subscribers: fileSubscribers(join(root, "data", "local", "subscribers.json")),
  sessionStore: fileSubscribers(join(root, "data", "local", "wa-sessions.json")),
  translationStore: fileSubscribers(join(root, "data", "local", "translations.json")),
});

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

async function serveApi(req, res, url) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const request = new Request(url, {
    method: req.method,
    // the headers the API reads: body type, the alerts secret (n8n) and Meta's signature
    headers: Object.fromEntries([
      ["content-type", req.headers["content-type"] || "application/json"],
      ...["x-alerts-secret", "x-hub-signature-256"].filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]),
    ]),
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
  const response = await api(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(res, url) {
  const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = normalize(join(webRoot, relative));
  if (!file.startsWith(webRoot)) { res.writeHead(403).end("Prohibido"); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("No encontrado");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await serveApi(req, res, url);
    else await serveStatic(res, url);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: error.message }));
  }
}).listen(PORT, HOST, () => {
  console.log(`Terrax listo en http://localhost:${PORT} (clima ${climate.meta.period}, ${crops.crops.length} cultivos)`);
});
