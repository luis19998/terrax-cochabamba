// WhatsApp Cloud API webhook (Meta). Farmers talk to Tiri, the Yatiri X assistant, from WhatsApp:
// they send their location and ask.
//
//   GET  /api/whatsapp   webhook verification (hub.challenge)
//   POST /api/whatsapp   incoming messages; the reply is sent with the Graph API
//
// Environment variables (set on the server, never in the repository):
//   WHATSAPP_VERIFY_TOKEN     any phrase; the same one typed in the Meta webhook form
//   WHATSAPP_TOKEN            access token of the WhatsApp Business app
//   WHATSAPP_PHONE_NUMBER_ID  id of the sending number
//   WHATSAPP_APP_SECRET       optional; when set, the signature of every request is checked
//   WHATSAPP_GRAPH_VERSION    optional; Graph API version, default below
//
// Privacy: phone numbers are never stored or logged. The plot of each chat lives in memory, keyed by a hash of
// the number, and disappears when the server restarts. Sending BAJA deletes it at once.
const DEFAULT_GRAPH_VERSION = "v21.0";
const PRESETS = [
  { pattern: /\b(d|distrito)\s*9\b/i, lat: -17.4629, lon: -66.1867, label: "Distrito 9" },
  { pattern: /\b(d|distrito)\s*13\b/i, lat: -17.3385, lon: -66.1358, label: "Distrito 13" },
];
const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const plain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function createWhatsApp({ env, terra, crops }) {
  const sessions = new Map();
  const configured = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  const cropWords = crops.crops.filter((c) => c.group !== "fallow").map((c) => ({ id: c.id, word: plain(c.name) }));
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

  async function sessionKey(phone) {
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`terrax:${phone}`)));
  }

  async function signatureOk(request, raw) {
    if (!env.WHATSAPP_APP_SECRET) return true;
    const header = request.headers.get("x-hub-signature-256") || "";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHATSAPP_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))}`;
    return header.length === expected.length && header === expected;
  }

  async function send(to, body) {
    const r = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 3900) } }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  }

  async function reply(message) {
    const key = await sessionKey(message.from);
    const session = sessions.get(key) || { history: [] };
    if (message.type === "location" && message.location) {
      session.lat = Number(message.location.latitude);
      session.lon = Number(message.location.longitude);
      sessions.set(key, session);
      const { answer } = await terra.ask({ lat: session.lat, lon: session.lon, history: session.history, fast: true });
      return `${answer} Para afinar, dime qué sembraste la última campaña (por ejemplo: papa). Escribe BAJA para que olvide tu parcela.`;
    }
    if (message.type !== "text" || !message.text) return "Por ahora entiendo mensajes de texto y ubicaciones. Envíame la ubicación de tu parcela con el clip.";
    const text = String(message.text.body || "").trim();
    if (/^baja$/i.test(text)) {
      sessions.delete(key);
      return "Listo: olvidé tu parcela. Si quieres volver, envíame tu ubicación.";
    }
    const preset = PRESETS.find((p) => p.pattern.test(text));
    if (preset) { session.lat = preset.lat; session.lon = preset.lon; }
    const mentioned = cropWords.filter((c) => plain(text).includes(c.word)).map((c) => c.id);
    if (mentioned.length && /sembr|plant|coseche|tenia|tengo|puse/.test(plain(text))) session.history = mentioned.slice(-2);
    if (session.lat === undefined) {
      return "🌱 ¡Hola! Soy Tiri, tu asistente agrícola de Yatiri X. Envíame la ubicación de tu terreno (clip, Ubicación) o escribe Distrito 9 o Distrito 13, y te digo qué sembrar, cuánta agua hace falta, qué plagas vigilar y qué riesgos tiene tu tierra.";
    }
    if (sessions.size > 2000) sessions.delete(sessions.keys().next().value);
    sessions.set(key, session);
    const { answer } = await terra.ask({ question: preset && text.length < 16 ? "" : text, lat: session.lat, lon: session.lon, history: session.history, fast: true });
    return answer;
  }

  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (!env.WHATSAPP_VERIFY_TOKEN) return json(503, { configured: false, error: "Falta configurar WHATSAPP_VERIFY_TOKEN" });
      const okay = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN;
      return okay ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } }) : json(403, { error: "Token de verificación incorrecto" });
    }
    const raw = await request.text();
    if (!(await signatureOk(request, raw))) return json(401, { error: "Firma no válida" });
    let payload;
    try { payload = JSON.parse(raw); } catch { return json(400, { error: "JSON no válido" }); }
    const messages = (payload.entry || []).flatMap((e) => e.changes || []).flatMap((c) => (c.value && c.value.messages) || []).slice(0, 3);
    const replies = [];
    for (const message of messages) {
      let text;
      try { text = await reply(message); } catch { text = "Tuve un problema para revisar tu parcela. Intenta de nuevo en un momento."; }
      const sent = configured ? await send(message.from, text).catch(() => false) : false;
      replies.push({ sent, ...(configured ? {} : { text }) });
    }
    // Meta only needs a 200. Without credentials (local tests) the replies are returned so the flow can be checked.
    return json(200, { ok: true, configured, replies });
  };
}
