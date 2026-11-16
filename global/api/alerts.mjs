// WhatsApp messages that Yatiri X sends on its own, in the language of each person (es / qu):
//   urgent warnings  frost or heavy rain in the next two days at the plot (31 GFS ensemble scenarios, outlook.mjs).
//                    Sent when, on either day, 3 or more out of 10 scenarios bring frost, or 5 or more out of 10
//                    bring 10 mm or more of rain. At most one per person per day.
//   weekly summary   the next 7 days, this week against normal, the month ahead and one piece of advice.
//
// Who sends them (env ALERTS_SENDER):
//   "n8n"     the n8n workflows in n8n/ ask /api/n8n/alerts and /api/n8n/digest, send with the dedicated number
//             and report back to /api/n8n/sent. The Netlify schedule stays quiet.
//   (unset)   the Netlify scheduled function (netlify/functions/alerts.mjs) sends the urgent warnings itself.
//
// WhatsApp only lets a business write first with an approved message template. With WHATSAPP_ALERT_TEMPLATE set,
// the text goes as that template's single parameter; without it, as plain text, which only reaches people who
// wrote to the number in the last 24 hours. Meta has no Quechua template language, so the Quechua text travels
// inside the Spanish template.
import { elevationFromGrid } from "../web/js/assess.js";

const GRAPH = (env) => `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export async function sendWhatsApp(env, to, text, { template } = {}) {
  const body = template
    ? { messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG || "es" }, components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\s*\n+\s*/g, " ").slice(0, 1000) }] }] } }
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
const round5 = (x) => Math.round(x / 5) * 5;
const today = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); // Bolivia, UTC-4

const T = {
  es: {
    frost: (when, n, t) => `posible helada ${when === 0 ? "esta noche" : "mañana"}: ${n} de cada 10 escenarios bajan de 0 °C (mínima cerca de ${t} °C). Cubre almácigos y cultivos tiernos y riega la tarde anterior`,
    rain: (when, n) => `lluvia fuerte ${when === 0 ? "hoy" : "mañana"}: ${n} de cada 10 escenarios dan 10 mm o más. Limpia canales y desagües y no dejes el suelo desnudo`,
    warning: (place, parts) => `Aviso de Yatiri X para tu terreno (${place}): ${parts.join("; ")}. Fuente: pronóstico por escenarios GFS (NOAA). Escribe BAJA para no recibir más avisos.`,
    test: (place) => `Prueba de aviso de Yatiri X: así te llegará una alerta de helada o lluvia fuerte para tu terreno (${place}). Escribe BAJA para no recibir más avisos.`,
    noForecast: "• El pronóstico no respondió ahora; te escribo apenas tenga datos.",
    rainWord: (mm) => (mm >= 100 ? "llueve mucho" : mm >= 40 ? "llueve regular" : mm >= 10 ? "llueve poco" : "casi no llueve"),
    tip: { frost: "en las noches frías tapa los almácigos y las plantas tiernas", wet: "limpia canales y desagües antes de las lluvias", dry: "planifica el riego y cubre el suelo con rastrojo para que no se seque", normal: "buen momento para revisar plagas y preparar el terreno" },
    digest: ({ place, rainy, frost, week, normal, month, monthWord, tip, days }) => [
      `Resumen semanal de Yatiri X para tu terreno (${place}):`,
      !days ? T.es.noForecast : `• Próximos 7 días: ${rainy} ${rainy === 1 ? "día" : "días"} con lluvia probable${frost ? `, ${frost} ${frost === 1 ? "noche" : "noches"} con posible helada` : ", sin heladas a la vista"}.`,
      week !== null ? `• Lluvia de esta semana: unos ${week} mm (lo normal: ${normal} mm).` : null,
      month ? `• En ${month} ${monthWord}.` : null,
      `• Consejo: ${tip}.`,
      "Escríbeme tu pregunta cuando quieras. BAJA para no recibir más mensajes.",
    ].filter(Boolean).join("\n"),
  },
  qu: {
    frost: (when, n, t) => `${when === 0 ? "kunan tuta" : "paqarin tuta"} qasanman: 10 escenariomanta ${n} 0 °C uraman urmanku (${t} °C qayllakama chiriyanqa). Almácigokunata, llullu plantakunatawan qataykuy, ch'isiyaypitaq qarpay`,
    rain: (when, n) => `${when === 0 ? "kunan" : "paqarin"} sinchi paranman: 10 escenariomanta ${n} 10 mm utaq aswan parata qunku. Canalkunata, yaku lluqsinankunatawan pichay, ama jallp'ata q'alata saqiychu`,
    warning: (place, parts) => `Yatiri X willakuy chakraykipaq (${place}): ${parts.join("; ")}. Maymanta: GFS escenariokunawan pronóstico (NOAA). Mana astawan willakuykunata chaskiyta munaspaqa BAJA qillqay.`,
    test: (place) => `Yatiri X willakuypa pruebanmi: kay jinata chayamusunki qasamanta utaq sinchi paramanta willakuy, chakraykipaq (${place}). Mana astawan chaskiyta munaspaqa BAJA qillqay.`,
    rainWord: (mm) => (mm >= 100 ? "ancha paran" : mm >= 40 ? "paran" : mm >= 10 ? "pisita paran" : "manapuni paranchu"),
    tip: { frost: "chiri tutakunapi almácigokunata, llullu plantakunatawan qataykuy", wet: "manaraq paramuchkaptin canalkunata, yaku lluqsinankunatawan pichay", dry: "riegota yuyaykuy, jallp'atataq rastrojowan qataykuy ama ch'akinanpaq", normal: "khurukunata qhawanapaq, jallp'ata allichanapaq allin pacha" },
    noForecast: "• Pronóstico kunan mana kutichinchu; willakuykuna kaptinkama qillqamusqayki.",
    digest: ({ place, rainy, frost, week, normal, month, monthWord, tip, days }) => [
      `Yatiri X semanapi willakuy chakraykipaq (${place}):`,
      !days ? T.qu.noForecast : `• Jamuq 7 p'unchaykuna: ${rainy} p'unchaykuna paranqa jina${frost ? `, ${frost} tutakuna qasanman` : ", mana qasa rikukunchu"}.`,
      week !== null ? `• Kay semanapi para: ${week} mm qayllan (sapa wata kay pachapi: ${normal} mm).` : null,
      month ? `• ${month[0].toUpperCase()}${month.slice(1)} killapi ${monthWord}.` : null,
      `• Yuyaychay: ${tip}.`,
      "Tapuyniykita qillqamuway imaypachapas. BAJA qillqay mana astawan chaskinaykipaq.",
    ].filter(Boolean).join("\n"),
  },
};
const lang = (l) => (l === "qu" ? "qu" : "es");

/** The urgent warning for one plot, or null when the next two days look safe. */
export function warningFor(outlook, place, language = "es") {
  if (!outlook || !outlook.daily) return null;
  const t = T[lang(language)];
  const days = outlook.daily.days.slice(0, 2);
  const parts = [];
  const frostDay = days.find((d) => d.pFrost >= 0.3);
  if (frostDay) parts.push(t.frost(days.indexOf(frostDay), tenths(frostDay.pFrost), Math.round(frostDay.tminP10)));
  const rainDay = days.find((d) => d.pHeavyRain >= 0.5);
  if (rainDay) parts.push(t.rain(days.indexOf(rainDay), tenths(rainDay.pHeavyRain)));
  if (!parts.length) return null;
  return { text: t.warning(place, parts), kinds: [frostDay ? "helada" : null, rainDay ? "lluvia fuerte" : null].filter(Boolean) };
}

/** The weekly summary for one plot (always something to say). */
export function digestFor(outlook, place, language = "es") {
  const t = T[lang(language)];
  const next7 = outlook && outlook.daily ? outlook.daily.days.slice(0, 7) : [];
  const w = outlook && outlook.weekly ? outlook.weekly.weeks[0] : null;
  const m = outlook && outlook.monthly ? outlook.monthly.months[0] : null;
  const frost = next7.filter((d) => d.pFrost >= 0.3).length;
  const tip = frost ? t.tip.frost : w && w.pWetterThanUsual >= 0.6 ? t.tip.wet : w && w.pDrierThanUsual >= 0.6 ? t.tip.dry : t.tip.normal;
  return t.digest({
    place, days: next7.length, rainy: next7.filter((d) => d.pRain >= 0.5).length, frost,
    week: w ? round5(w.rainMedian) : null, normal: w ? round5(w.normal) : null,
    month: m ? m.name : null, monthWord: m ? t.rainWord(m.rainMedian) : "", tip,
  });
}

async function outlookFor(sub, outlook, grid) {
  const altitude = elevationFromGrid(grid, sub.lat, sub.lon);
  return altitude === null ? null : outlook.outlook(sub.lat, sub.lon, altitude);
}

/**
 * What should go out now, without sending it (for n8n).
 * kind "urgent": only plots at risk, skipping people already warned today. kind "digest": every plot, skipping
 * people who got this week's summary. Each item: { key, phone, lang, kind, text, template, template_lang }.
 */
export async function pendingMessages({ env, subscribers, outlook, grid, kind = "urgent", test = false }) {
  const list = await subscribers.list();
  const day = today();
  const week = (() => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const items = [];
  for (const sub of list) {
    try {
      const place = sub.place || "Cochabamba";
      let text = null;
      let kinds = [];
      if (test) text = T[lang(sub.lang)].test(place);
      else if (kind === "digest") {
        if (sub.lastDigest === week) continue;
        text = digestFor(await outlookFor(sub, outlook, grid), place, sub.lang);
      } else {
        if (sub.lastAlert === day) continue;
        const warning = warningFor(await outlookFor(sub, outlook, grid), place, sub.lang);
        if (!warning) continue;
        ({ text, kinds } = warning);
      }
      items.push({
        key: sub.key, phone: sub.phone, lang: lang(sub.lang), kind: test ? "prueba" : kind, risks: kinds, text,
        template: env.WHATSAPP_ALERT_TEMPLATE || null, template_lang: env.WHATSAPP_TEMPLATE_LANG || "es",
        mark: kind === "digest" ? { lastDigest: week } : { lastAlert: day },
      });
    } catch { /* one plot failing must not stop the others */ }
  }
  return { generated: new Date().toISOString(), kind: test ? "prueba" : kind, subscribers: list.length, count: items.length, items };
}

/** n8n reports what it sent, so nobody gets the same message twice. body: { sent: [{ key, mark }] } */
export async function markSent({ subscribers, sent }) {
  let updated = 0;
  for (const s of Array.isArray(sent) ? sent.slice(0, 500) : []) {
    if (!s || typeof s.key !== "string") continue;
    const sub = await subscribers.get(s.key);
    if (!sub) continue;
    const mark = {};
    if (s.mark && typeof s.mark.lastAlert === "string") mark.lastAlert = s.mark.lastAlert.slice(0, 10);
    if (s.mark && typeof s.mark.lastDigest === "string") mark.lastDigest = s.mark.lastDigest.slice(0, 10);
    await subscribers.set(s.key, { ...sub, ...mark });
    updated += 1;
  }
  return { updated };
}

/** Sends the urgent warnings from the server itself (Netlify schedule, or the demo button). */
export async function runAlerts({ env, subscribers, outlook, grid, simulate = false }) {
  const configured = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  const { items, subscribers: total } = await pendingMessages({ env, subscribers, outlook, grid, kind: "urgent", test: simulate });
  const summary = { subscribers: total, sent: 0, skipped: total - items.length, failed: 0, configured };
  for (const item of items) {
    if (!configured) { summary.skipped += 1; continue; }
    try {
      const ok = await sendWhatsApp(env, item.phone, item.text, { template: env.WHATSAPP_ALERT_TEMPLATE });
      if (!ok) { summary.failed += 1; continue; }
      summary.sent += 1;
      if (!simulate) await markSent({ subscribers, sent: [{ key: item.key, mark: item.mark }] });
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
