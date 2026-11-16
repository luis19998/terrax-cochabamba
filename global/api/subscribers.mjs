// Where the WhatsApp alert subscriptions are kept. Same interface for both places:
//   get(key) -> object | null, set(key, object), delete(key), list() -> [object]
//   Hosted:  Netlify Blobs store "alert-subscribers" (private to the site, never in the repository)
//   Local:   data/local/subscribers.json (ignored by git)
// A subscription holds the phone number (needed to send), the approximate plot location and the crops.
// It is created only when the person writes ALERTAS, and deleted when they write BAJA.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function fileSubscribers(path) {
  const read = () => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; } };
  const write = (data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 1)); };
  return {
    kind: "archivo local",
    async get(key) { return read()[key] || null; },
    async set(key, value) { const d = read(); d[key] = value; write(d); },
    async delete(key) { const d = read(); delete d[key]; write(d); },
    async list() { return existsSync(path) ? Object.values(read()) : []; },
  };
}

export function blobSubscribers(store) {
  return {
    kind: "Netlify Blobs",
    get: (key) => store.get(key, { type: "json" }),
    set: (key, value) => store.setJSON(key, value),
    delete: (key) => store.delete(key),
    async list() {
      const { blobs } = await store.list();
      const values = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
      return values.filter(Boolean);
    },
  };
}
