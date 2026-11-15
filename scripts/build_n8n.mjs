// Writes the n8n workflows that send Yatiri X messages from the team's dedicated WhatsApp number:
//   node scripts/build_n8n.mjs   ->  n8n/workflows/*.json  (import them in n8n: Workflows > Import from file)
// Secrets never go in these files: n8n asks for two credentials of type "Header Auth" when you open them
// (see n8n/README.md).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "n8n", "workflows");
mkdirSync(out, { recursive: true });

const CFG = "Configuración";
const cfg = (field) => `$('${CFG}').first().json.${field}`;
// stable ids: the same file always gets the same ids, so re-importing updates instead of duplicating
let n = 0;
let scope = "";
const id = () => { n += 1; const h = createHash("sha1").update(`${scope}:${n}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

const config = (pos) => ({
  id: id(), name: CFG, type: "n8n-nodes-base.set", typeVersion: 3.4, position: pos,
  parameters: {
    assignments: {
      assignments: [
        { id: id(), name: "base_url", type: "string", value: "https://yatirix-cochabamba.netlify.app" },
        { id: id(), name: "graph_url", type: "string", value: "https://graph.facebook.com/v21.0" },
        { id: id(), name: "phone_number_id", type: "string", value: "PEGAR_AQUI_EL_PHONE_NUMBER_ID" },
        { id: id(), name: "team_phone", type: "string", value: "" },
      ],
    },
    options: {},
  },
  notes: "base_url: la web. phone_number_id: el ID del número dedicado (Meta > WhatsApp > API Setup). team_phone: un celular del equipo con código de país (591…), para avisos de fallas; vacío para no avisar.",
});

const yatiriAuth = { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" };
const credYatiri = { httpHeaderAuth: { name: "Yatiri X: clave de avisos (x-alerts-secret)" } };
const credMeta = { httpHeaderAuth: { name: "WhatsApp Cloud API: token (Authorization)" } };

const getMessages = (pos, path, name) => ({
  id: id(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos,
  parameters: { method: "GET", url: `={{ ${cfg("base_url")} }}${path}`, ...yatiriAuth, options: { timeout: 120000 } },
  credentials: credYatiri,
});
const split = (pos) => ({
  id: id(), name: "Separar mensajes", type: "n8n-nodes-base.splitOut", typeVersion: 1, position: pos,
  parameters: { fieldToSplitOut: "items", options: {} },
});
const prepare = (pos) => ({
  id: id(), name: "Preparar mensaje", type: "n8n-nodes-base.code", typeVersion: 2, position: pos,
  parameters: {
    mode: "runOnceForEachItem",
    jsCode: [
      "// WhatsApp only lets a business write first with an approved template; the text goes as its only parameter",
      "const it = $json;",
      "const body = it.template",
      "  ? { messaging_product: 'whatsapp', to: it.phone, type: 'template', template: { name: it.template, language: { code: it.template_lang || 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: it.text.replace(/\\s*\\n+\\s*/g, ' ').slice(0, 1000) }] }] } }",
      "  : { messaging_product: 'whatsapp', to: it.phone, type: 'text', text: { body: it.text.slice(0, 3900) } };",
      "return { json: { ...it, wa_body: body } };",
    ].join("\n"),
  },
});
const sendWa = (pos, name = "Enviar por WhatsApp") => ({
  id: id(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos,
  parameters: {
    method: "POST", url: `={{ ${cfg("graph_url")} }}/{{ ${cfg("phone_number_id")} }}/messages`, ...yatiriAuth,
    sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json.wa_body) }}",
    options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } }, response: { response: { neverError: true } }, timeout: 15000 },
  },
  credentials: credMeta,
  notes: "Un mensaje por segundo para respetar los límites de Meta. Si Meta rechaza uno, se anota y sigue con los demás.",
});
const result = (pos) => ({
  id: id(), name: "Resultado", type: "n8n-nodes-base.code", typeVersion: 2, position: pos,
  parameters: {
    mode: "runOnceForEachItem",
    jsCode: [
      "const src = $('Preparar mensaje').item.json;",
      "const ok = Array.isArray($json.messages) && $json.messages.length > 0;",
      "return { json: { ok, key: src.key, mark: src.mark, lang: src.lang, kind: src.kind, error: ok ? null : (($json.error && $json.error.message) || 'sin respuesta de Meta') } };",
    ].join("\n"),
  },
});
const summary = (pos) => ({
  id: id(), name: "Resumen", type: "n8n-nodes-base.code", typeVersion: 2, position: pos,
  parameters: {
    mode: "runOnceForAllItems",
    jsCode: [
      "const all = $input.all().map((i) => i.json);",
      "const ok = all.filter((x) => x.ok);",
      "const bad = all.filter((x) => !x.ok);",
      "return [{ json: { sent: ok.map((x) => ({ key: x.key, mark: x.mark })), ok: ok.length, failed: bad.length, quechua: ok.filter((x) => x.lang === 'qu').length, errors: [...new Set(bad.map((x) => x.error))].slice(0, 3) } }];",
    ].join("\n"),
  },
});
const markSent = (pos) => ({
  id: id(), name: "Marcar enviados", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos,
  parameters: {
    method: "POST", url: `={{ ${cfg("base_url")} }}/api/n8n/sent`, ...yatiriAuth,
    sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify({ sent: $json.sent }) }}", options: {},
  },
  credentials: credYatiri,
  notes: "Así nadie recibe el mismo aviso dos veces en el día (ni el resumen dos veces en la semana).",
});
const teamIfFailed = (pos) => ({
  id: id(), name: "¿Avisar al equipo?", type: "n8n-nodes-base.code", typeVersion: 2, position: pos,
  parameters: {
    mode: "runOnceForAllItems",
    jsCode: [
      "const r = $('Resumen').first().json;",
      `const team = ${cfg("team_phone")};`,
      "if (!r.failed || !team) return [];",
      "const text = `Yatiri X (n8n): ${r.failed} mensajes no salieron y ${r.ok} sí. Motivo: ${r.errors.join(' | ')}`;",
      "return [{ json: { wa_body: { messaging_product: 'whatsapp', to: team, type: 'text', text: { body: text } } } }];",
    ].join("\n"),
  },
});
const note = (pos, content, size = [460, 300]) => ({
  id: id(), name: "Nota", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: pos,
  parameters: { content, width: size[0], height: size[1] },
});
const schedule = (pos, cron, name) => ({
  id: id(), name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: pos,
  parameters: { rule: { interval: [{ field: "cronExpression", expression: cron }] } },
});
// every scheduled workflow also gets a manual start, to try it from the editor or with "n8n execute"
const manual = (pos) => ({ id: id(), name: "Probar ahora", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: pos, parameters: {} });
const toConfig = { main: [[{ node: CFG, type: "main", index: 0 }]] };
const chain = (...names) => Object.fromEntries(names.slice(0, -1).map((a, i) => [a, { main: [[{ node: names[i + 1], type: "main", index: 0 }]] }]));
const settings = { executionOrder: "v1", timezone: "America/La_Paz", saveManualExecutions: true, callerPolicy: "workflowsFromSameOwner" };

function sender({ file, name, trigger, path, explain }) {
  const nodes = [
    trigger, manual([0, 480]), config([220, 300]), getMessages([440, 300], path, "Pedir mensajes a Yatiri X"), split([660, 300]),
    prepare([880, 300]), sendWa([1100, 300]), result([1320, 300]), summary([1540, 300]), markSent([1760, 220]),
    teamIfFailed([1760, 420]), sendWa([1980, 420], "Avisar falla al equipo"), note([0, 0], explain),
  ];
  const connections = {
    ...chain(trigger.name, CFG, "Pedir mensajes a Yatiri X", "Separar mensajes", "Preparar mensaje", "Enviar por WhatsApp", "Resultado", "Resumen"),
    "Probar ahora": toConfig,
    Resumen: { main: [[{ node: "Marcar enviados", type: "main", index: 0 }, { node: "¿Avisar al equipo?", type: "main", index: 0 }]] },
    "¿Avisar al equipo?": { main: [[{ node: "Avisar falla al equipo", type: "main", index: 0 }]] },
  };
  writeFileSync(join(out, file), `${JSON.stringify({ name, nodes, connections, settings, active: false, pinData: {}, meta: { templateCredsSetupCompleted: false } }, null, 2)}\n`);
}

scope = "1"; n = 0;
sender({
  file: "1-avisos-urgentes.json",
  name: "Yatiri X · Avisos urgentes por WhatsApp",
  trigger: schedule([0, 300], "0 7,12,17 * * *", "Tres veces al día"),
  path: "/api/n8n/alerts",
  explain: "## Avisos urgentes\nA las 7:00, 12:00 y 17:00 (hora de Bolivia) pide a Yatiri X los terrenos con **helada** (3 de cada 10 escenarios) o **lluvia fuerte** (5 de cada 10 con 10 mm o más) en los próximos dos días, y escribe a cada persona desde el número dedicado, **en castellano o en quechua** según eligió.\n\nUn aviso por persona por día. Solo a quien escribió ALERTAS o WILLAWAY; BAJA borra todo.",
});
scope = "2"; n = 0;
sender({
  file: "2-resumen-semanal.json",
  name: "Yatiri X · Resumen semanal por WhatsApp",
  trigger: schedule([0, 300], "0 7 * * 1", "Lunes 7:00"),
  path: "/api/n8n/digest",
  explain: "## Resumen semanal\nCada lunes a las 7:00 envía a cada persona suscrita: días con lluvia y heladas de la semana, lluvia frente a lo normal, cómo suele ser el mes y un consejo. En su idioma (castellano o quechua).",
});
// demo: a test message to every subscriber, without marking anything as sent
{
  scope = "3"; n = 0;
  const trigger = { id: id(), name: "Probar ahora", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 300], parameters: {} };
  const nodes = [trigger, config([220, 300]), getMessages([440, 300], "/api/n8n/alerts?test=1", "Pedir mensajes a Yatiri X"), split([660, 300]),
    prepare([880, 300]), sendWa([1100, 300]), result([1320, 300]), summary([1540, 300]),
    note([0, 0], "## Aviso de prueba (demo)\nPulsa **Probar ahora**: cada persona suscrita recibe un mensaje de prueba en su idioma. No marca nada como enviado.")];
  const connections = chain("Probar ahora", CFG, "Pedir mensajes a Yatiri X", "Separar mensajes", "Preparar mensaje", "Enviar por WhatsApp", "Resultado", "Resumen");
  writeFileSync(join(out, "3-aviso-de-prueba.json"), `${JSON.stringify({ name: "Yatiri X · Aviso de prueba (demo)", nodes, connections, settings, active: false, pinData: {}, meta: {} }, null, 2)}\n`);
}
// watch: tells the team when the web, Tiri's AI, the municipal layers or WhatsApp stop working
{
  scope = "4"; n = 0;
  const trigger = schedule([0, 300], "*/30 * * * *", "Cada 30 minutos");
  const health = {
    id: id(), name: "Revisar Yatiri X", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [440, 300],
    parameters: { method: "GET", url: `={{ ${cfg("base_url")} }}/api/health`, options: { timeout: 30000, response: { response: { neverError: true } } } },
  };
  const check = {
    id: id(), name: "¿Algo falla?", type: "n8n-nodes-base.code", typeVersion: 2, position: [660, 300],
    parameters: {
      mode: "runOnceForAllItems",
      jsCode: [
        "const h = $input.first().json || {};",
        `const team = ${cfg("team_phone")};`,
        "const problems = [];",
        "if (!h.ok) problems.push('la web o la API no responde');",
        "else {",
        "  if (h.tiri && h.tiri.engine === 'rules') problems.push('Tiri responde sin IA (revisar GEMINI_API_KEY)');",
        "  if (h.gamc_check && h.gamc_check !== 'ok') problems.push(`capas del GAMC: ${h.gamc_check}`);",
        "  if (h.whatsapp === false) problems.push('WhatsApp sin credenciales en Netlify');",
        "}",
        "// one message per problem every 6 hours at most",
        "const memo = $getWorkflowStaticData('global');",
        "const key = problems.join('|');",
        "if (!problems.length) { memo.last = ''; return []; }",
        "if (!team || (memo.last === key && Date.now() - (memo.at || 0) < 6 * 3600e3)) return [];",
        "memo.last = key; memo.at = Date.now();",
        "return [{ json: { wa_body: { messaging_product: 'whatsapp', to: team, type: 'text', text: { body: `Yatiri X: ${problems.join('; ')}.` } } } }];",
      ].join("\n"),
    },
  };
  const nodes = [trigger, manual([0, 480]), config([220, 300]), health, check, sendWa([880, 300], "Avisar al equipo"),
    note([0, 0], "## Vigilancia\nCada 30 minutos revisa /api/health. Si la web no responde, Tiri se queda sin IA, fallan las capas del GAMC o WhatsApp pierde las credenciales, escribe al celular del equipo (team_phone). Como mucho un mensaje cada 6 horas por el mismo problema.\n\nMeta solo entrega texto libre si ese celular escribió al número dedicado en las últimas 24 horas.")];
  const connections = { ...chain("Cada 30 minutos", CFG, "Revisar Yatiri X", "¿Algo falla?", "Avisar al equipo"), "Probar ahora": toConfig };
  writeFileSync(join(out, "4-vigilancia.json"), `${JSON.stringify({ name: "Yatiri X · Vigilancia del servicio", nodes, connections, settings, active: false, pinData: {}, meta: {} }, null, 2)}\n`);
}
// Gmail bulletin: works without WhatsApp and without any Yatiri X secret (it only reads public routes).
// Every day at 7:00 it checks the service and the probabilistic forecast of the example plots and emails a summary.
{
  scope = "5"; n = 0;
  const trigger = schedule([0, 300], "0 7 * * *", "Cada día 7:00");
  const conf = {
    id: id(), name: CFG, type: "n8n-nodes-base.set", typeVersion: 3.4, position: [220, 300],
    parameters: {
      assignments: {
        assignments: [
          { id: id(), name: "base_url", type: "string", value: "https://yatirix-cochabamba.netlify.app" },
          { id: id(), name: "destinatarios", type: "string", value: "PEGAR_CORREOS_SEPARADOS_POR_COMA" },
          { id: id(), name: "terrenos", type: "string", value: "Distrito 9|-17.4629|-66.1867;Distrito 13|-17.3385|-66.1358" },
        ],
      },
      options: {},
    },
    notes: "destinatarios: correos separados por coma. terrenos: nombre|latitud|longitud separados por punto y coma.",
  };
  const health = {
    id: id(), name: "Estado de Yatiri X", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [440, 300],
    parameters: { method: "GET", url: `={{ ${cfg("base_url")} }}/api/health`, options: { timeout: 30000, response: { response: { neverError: true } } } },
  };
  const plots = {
    id: id(), name: "Separar terrenos", type: "n8n-nodes-base.code", typeVersion: 2, position: [660, 300],
    parameters: {
      mode: "runOnceForAllItems",
      jsCode: [
        `const list = String(${cfg("terrenos")}).split(';').map((t) => t.split('|')).filter((t) => t.length === 3);`,
        "return list.map(([name, lat, lon]) => ({ json: { name: name.trim(), lat: Number(lat), lon: Number(lon) } }));",
      ].join("\n"),
    },
  };
  const outlook = {
    id: id(), name: "Pronóstico de cada terreno", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [880, 300],
    parameters: {
      method: "GET", url: `={{ ${cfg("base_url")} }}/api/outlook?lat={{ $json.lat }}&lon={{ $json.lon }}`,
      options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 500 } }, response: { response: { neverError: true } } },
    },
  };
  const build = {
    id: id(), name: "Armar boletín", type: "n8n-nodes-base.code", typeVersion: 2, position: [1100, 300],
    parameters: {
      mode: "runOnceForAllItems",
      jsCode: [
        "const h = $('Estado de Yatiri X').first().json || {};",
        "const plots = $('Separar terrenos').all().map((i) => i.json);",
        "const pct = (x) => `${Math.round((x || 0) * 100)} %`;",
        "const alerts = [];",
        "const blocks = $input.all().map((item, i) => {",
        "  const o = item.json || {};",
        "  const name = (plots[i] || {}).name || `Terreno ${i + 1}`;",
        "  if (!o.daily) return `<h3>${name}</h3><p>El pronóstico no respondió hoy.</p>`;",
        "  const days = o.daily.days.slice(0, 3);",
        "  days.forEach((d, k) => { if (d.pFrost >= 0.3) alerts.push(`${name}: helada ${k === 0 ? 'hoy' : k === 1 ? 'mañana' : 'pasado mañana'} (${pct(d.pFrost)} de los escenarios)`); if (d.pHeavyRain >= 0.5) alerts.push(`${name}: lluvia fuerte ${k === 0 ? 'hoy' : k === 1 ? 'mañana' : 'pasado mañana'} (${pct(d.pHeavyRain)})`); });",
        "  const w = o.weekly && o.weekly.weeks[0];",
        "  const rows = days.map((d) => `<tr><td>${d.date}</td><td>${pct(d.pRain)}</td><td>${Math.round(d.rainMedian)} mm</td><td>${Math.round(d.tminMedian)}° / ${Math.round(d.tmaxMedian)}°</td><td>${pct(d.pFrost)}</td></tr>`).join('');",
        "  return `<h3>${name} (${o.altitude} m)</h3><table border='1' cellpadding='6' style='border-collapse:collapse'><tr><th>Día</th><th>Lluvia</th><th>Cantidad</th><th>Mín / máx</th><th>Helada</th></tr>${rows}</table>`",
        "    + (w ? `<p>Esta semana: unos ${Math.round(w.rainMedian)} mm (lo normal: ${Math.round(w.normal)} mm).</p>` : '');",
        "}).join('');",
        "const service = h.ok ? `Servicio en línea · Tiri: ${(h.tiri && h.tiri.engine) || '?'} · capas GAMC: ${h.gamc_check || '?'}` : 'ATENCIÓN: la web o la API de Yatiri X no responde';",
        "const subject = alerts.length ? `Yatiri X · AVISO: ${alerts[0]}` : `Yatiri X · Boletín del ${new Date().toISOString().slice(0, 10)}`;",
        "const html = `<h2>Boletín diario de Yatiri X</h2>${alerts.length ? `<p style='color:#a3332a'><b>Avisos:</b><br>${alerts.join('<br>')}</p>` : '<p>Sin heladas ni lluvias fuertes probables en los próximos tres días.</p>'}${blocks}<p style='color:#6b5a48'>${service}. Pronóstico por escenarios GFS (NOAA) comparado con 45 años de NASA POWER. https://yatirix-cochabamba.netlify.app</p>`;",
        "return [{ json: { subject, html, alerts: alerts.length } }];",
      ].join("\n"),
    },
  };
  const gmail = {
    id: id(), name: "Enviar por Gmail", type: "n8n-nodes-base.gmail", typeVersion: 2.1, position: [1320, 300],
    parameters: { sendTo: `={{ ${cfg("destinatarios")} }}`, subject: "={{ $json.subject }}", emailType: "html", message: "={{ $json.html }}", options: { appendAttribution: false } },
    credentials: { gmailOAuth2: { name: "Gmail (Yatiri X)" } },
  };
  const nodes = [trigger, manual([0, 480]), conf, health, plots, outlook, build, gmail,
    note([0, 0], "## Boletín por Gmail (sin WhatsApp)\nCada día a las 7:00 revisa que Yatiri X esté en línea y el pronóstico por escenarios de los terrenos de la lista, y envía un correo. Si hay helada o lluvia fuerte probable en los próximos tres días, el asunto empieza con **AVISO**.\n\n1. Crea la credencial **Gmail OAuth2** (botón *Sign in with Google*).\n2. En **Configuración** pon los correos y los terrenos.\n3. Pulsa **Probar ahora** y luego activa el flujo.")];
  const connections = { ...chain("Cada día 7:00", CFG, "Estado de Yatiri X", "Separar terrenos", "Pronóstico de cada terreno", "Armar boletín", "Enviar por Gmail"), "Probar ahora": toConfig };
  writeFileSync(join(out, "5-boletin-gmail.json"), `${JSON.stringify({ name: "Yatiri X · Boletín diario por Gmail", nodes, connections, settings, active: false, pinData: {}, meta: {} }, null, 2)}\n`);
}
console.log("Flujos escritos en n8n/workflows/");
