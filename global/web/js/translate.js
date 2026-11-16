// Any language for the whole page (Quechua, Aymara, Guarani, English, Portuguese, French, German, Italian, Swahili,
// Hindi, Chinese, Arabic), including everything the app computes and draws later (results, messages, Tiri).
// It works on the rendered page: each sentence-sized element (or text piece) is looked up in
//   1. web/data/<lang>.json   dictionary in the repository (qu.json reviewed; en/pt pre-generated)
//   2. this browser's cache of earlier answers
//   3. POST /api/translate (Gemini on the server, cached there too)
// Numbers are replaced by {0}, {1}… before the lookup, so "Unos 25 mm" and "Unos 40 mm" share one translation.
// Elements with translate="no" or the class "notranslate" are left alone. Switching back to Spanish restores the
// original text of every piece that was translated.
const INLINE = new Set(["B", "STRONG", "I", "EM", "BR", "SMALL", "SUP", "SUB", "SPAN", "ABBR", "Q", "MARK"]);
const SKIP = "script,style,noscript,textarea,code,pre,svg text,[translate='no'],.notranslate,.leaflet-control-attribution,.leaflet-tile-pane,.sprite";
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const LETTERS = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]{2,}/;
const CACHE = (l) => (l === "qu" ? "yatirix.qu.v2" : `yatirix.tr.${l}.v1`);
const BUSY = { qu: "Runasimiman t'ikrachkan…", en: "Translating…", pt: "Traduzindo…", fr: "Traduction…", de: "Übersetzung…", it: "Traduzione…", sw: "Inatafsiri…", hi: "अनुवाद हो रहा है…", zh: "正在翻译…", ar: "جارٍ الترجمة…" };
const MAX_BLOCK = 1600;

let lang = "es";
// one store per language: { dict, local, known, terms, loading }
const stores = {};
const store = (l = lang) => (stores[l] ||= { dict: null, local: {}, known: new Set(), terms: null, loading: null });
let skipQu = new Set();
const noSkip = new Set();
let observer = null;
const translated = new Set();
const pending = new Map(); // key -> Set of targets
const failed = new Map(); // key -> time to try again (the server may be out of quota for a while)
let timer = null;
let revisit = null;
let busy = 0;

// Crop names work like numbers: "Sembrar pepino…" and "Sembrar haba…" share one translation, and each name is put
// back in Quechua (maíz -> sara). Set with setTerms().
let termKeys = []; // the Spanish names, as written
let pattern = /\d+(?:[.,]\d+)*/gu;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termMap = (obj) => new Map(Object.entries(obj).map(([es, tr]) => [es.toLowerCase(), tr]));
/** terms: { "Maíz": "Sara", "Frijol (poroto)": "Purutu", … } (Quechua); other languages get theirs from the dictionary */
export function setTerms(map) {
  termKeys = Object.keys(map);
  store("qu").terms = termMap(map);
  const names = termKeys.map((k) => k.toLowerCase()).sort((a, b) => b.length - a.length).map(escape);
  pattern = names.length ? new RegExp(`(?<![\\p{L}])(?:${names.join("|")})(?![\\p{L}])|\\d+(?:[.,]\\d+)*`, "giu") : /\d+(?:[.,]\d+)*/gu;
}
function normalize(s) {
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  const nums = [];
  const key = s.trim().replace(/\s+/g, " ").replace(pattern, (m) => { nums.push(m); return `{${nums.length - 1}}`; });
  return { key, nums, lead, trail };
}
function termOut(m) {
  const t = store().terms;
  const qu = t && t.get(m.toLowerCase());
  if (!qu) return m;
  return m[0] === m[0].toUpperCase() ? qu[0].toUpperCase() + qu.slice(1) : qu.toLowerCase();
}
const fill = (tr, nums) => tr.replace(/\{(\d+)\}/g, (_, i) => (nums[Number(i)] === undefined ? "" : termOut(nums[Number(i)])));
/** a key that is only marks and punctuation ("{0}", "{0}, {1}, {2}") needs no dictionary */
const onlyMarks = (key) => !LETTERS.test(plain(key).replace(/\{\d+\}/g, ""));
const lookup = (key, l = lang) => { const s = store(l); return (s.dict && s.dict[key]) || s.local[key] || null; };
// every translated text we know or wrote: never sent back to be "translated" again
const isKnown = (key) => store().known.has(key);
const remember = (tr, l = lang) => { if (tr) store(l).known.add(tr); };
const skip = { has: (v) => (lang === "qu" ? skipQu : noSkip).has(v) };
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");

function loadDict(l) {
  const s = store(l);
  if (s.dict) return Promise.resolve(s.dict);
  if (!s.loading) {
    try { s.local = JSON.parse(localStorage.getItem(CACHE(l))) || {}; } catch { s.local = {}; }
    s.loading = fetch(`data/${l}.json`).then((r) => (r.ok ? r.json() : { entries: {} })).catch(() => ({ entries: {} }))
      .then((d) => {
        s.dict = d.entries || {};
        if (d.terms && l !== "qu") s.terms = termMap(d.terms);
        Object.values(s.dict).forEach((v) => remember(v, l));
        Object.values(s.local).forEach((v) => remember(v, l));
        return s.dict;
      });
  }
  return s.loading;
}
function saveLocal(l) {
  const local = store(l).local;
  try {
    const keys = Object.keys(local);
    if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete local[k];
    localStorage.setItem(CACHE(l), JSON.stringify(local));
  } catch { /* storage full or off: translations still work for this visit */ }
}
async function ask(texts, l) {
  const r = await fetch("/api/translate", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texts, lang: l }),
    signal: AbortSignal.timeout(90000),
  });
  return r.ok ? (await r.json()).translations || {} : {};
}
/** crop and month names for a language without a dictionary file: asked once, then kept in this browser */
async function ensureTerms(l) {
  const s = store(l);
  if (s.terms || !termKeys.length) return false;
  const key = `yatirix.terms.${l}.v1`;
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) { s.terms = termMap(saved); return true; } } catch { /* ask */ }
  const out = {};
  for (let i = 0; i < termKeys.length; i += 80) Object.assign(out, await ask(termKeys.slice(i, i + 80), l).catch(() => ({})));
  if (!Object.keys(out).length) return false;
  s.terms = termMap(out);
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* this visit only */ }
  return true;
}

/** runs fn without feeding its own changes back into the observer */
function quietly(fn) {
  if (!observer) { fn(); return; }
  const before = observer.takeRecords();
  fn();
  observer.takeRecords();
  if (before.length) onRecords(before);
}

function isBlock(el) {
  let text = false;
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.nodeValue.trim()) text = true; continue; }
    if (n.nodeType !== 1) continue;
    if (!INLINE.has(n.tagName) || n.id || n.matches(SKIP) || Object.keys(n.dataset).length) return false;
    for (const c of n.querySelectorAll("*")) if (!INLINE.has(c.tagName) || c.id || Object.keys(c.dataset).length) return false;
  }
  return text;
}

function want(key, target) {
  if ((failed.get(`${lang}|${key}`) || 0) > Date.now()) return;
  if (!pending.has(key)) pending.set(key, new Set());
  pending.get(key).add(target);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

function doBlock(el) {
  const html = el.innerHTML;
  if (el.__quOut !== undefined && html === el.__quOut) return;
  const text = plain(html).trim();
  if (!LETTERS.test(text) || skip.has(text)) return;
  const { key, nums } = normalize(html);
  const tr = lookup(key) || (onlyMarks(key) ? key : null);
  if (!tr) { if (!isKnown(key)) want(key, el); return; }
  el.__quSrc = html;
  el.__quOut = fill(tr, nums);
  quietly(() => { el.innerHTML = el.__quOut; el.__quOut = el.innerHTML; });
  translated.add(el);
}
function doText(n) {
  const v = n.nodeValue;
  if (n.__quOut !== undefined && v === n.__quOut) return;
  if (!LETTERS.test(v) || skip.has(v.trim())) return;
  const parent = n.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const { key, nums, lead, trail } = normalize(v);
  const tr = lookup(key) || (onlyMarks(key) ? key : null);
  if (!tr) { if (!isKnown(key)) want(key, n); return; }
  n.__quSrc = v;
  n.__quOut = lead + fill(tr, nums) + trail;
  quietly(() => { n.nodeValue = n.__quOut; });
  translated.add(n);
}
function doAttrs(el) {
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    const v = el.getAttribute(name);
    el.__quAttr ||= {};
    const rec = el.__quAttr[name];
    if (rec && v === rec.out) continue;
    if (!LETTERS.test(v) || skip.has(v.trim())) continue;
    const { key, nums } = normalize(v);
    const tr = lookup(key) || (onlyMarks(key) ? key : null);
    if (!tr) { if (!isKnown(key)) want(key, { el, attr: name }); continue; }
    el.__quAttr[name] = { src: v, out: fill(tr, nums) };
    quietly(() => el.setAttribute(name, el.__quAttr[name].out));
    translated.add(el);
  }
}
function visit(el) {
  if (el.nodeType === 3) { doText(el); return; }
  if (el.nodeType !== 1 || el.closest(SKIP)) return;
  doAttrs(el);
  for (const c of el.querySelectorAll("[placeholder],[aria-label],[title],[alt]")) if (!c.closest(SKIP)) doAttrs(c);
  walk(el);
}
function walk(el) {
  if (el.matches(SKIP)) return;
  if (isBlock(el) && el.innerHTML.length <= MAX_BLOCK && el.tagName !== "BODY") { doBlock(el); return; }
  for (const n of [...el.childNodes]) {
    if (n.nodeType === 3) doText(n);
    else if (n.nodeType === 1) walk(n);
  }
}

function retry(target) {
  if (target.attr) { if (target.el.isConnected) doAttrs(target.el); return; }
  if (!target.isConnected) return;
  if (target.nodeType === 3) doText(target); else doBlock(target);
}

async function flush() {
  if (lang === "es" || !pending.size) return;
  const l = lang;
  const keys = [...pending.keys()].slice(0, 80);
  const targets = keys.map((k) => [k, pending.get(k)]);
  keys.forEach((k) => pending.delete(k));
  busy += 1;
  setBusy();
  try {
    const translations = await ask(keys, l);
    for (const [k, v] of Object.entries(translations)) { store(l).local[k] = v; remember(v, l); }
    saveLocal(l);
    for (const [k, set] of targets) {
      if (!lookup(k, l)) { failed.set(`${l}|${k}`, Date.now() + 120e3); continue; }
      if (lang === l) set.forEach(retry);
    }
  } catch {
    keys.forEach((k) => failed.set(`${l}|${k}`, Date.now() + 60e3));
  } finally {
    busy -= 1;
    setBusy();
    if (pending.size) flush();
    // what could not be translated now is tried again in a couple of minutes
    if (failed.size) { clearTimeout(revisit); revisit = setTimeout(() => { if (lang !== "es") visit(document.body); }, 130e3); }
  }
}

function setBusy() {
  let chip = document.getElementById("qu-busy");
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "qu-busy";
    chip.className = "qu-busy notranslate";
    chip.setAttribute("role", "status");
    document.body.append(chip);
  }
  chip.textContent = BUSY[lang] || "Traduciendo…";
  chip.hidden = !(busy > 0 && lang !== "es");
}

function onRecords(records) {
  if (lang === "es") return;
  const seen = new Set();
  for (const rec of records) {
    if (rec.type === "childList") rec.addedNodes.forEach((n) => { if (!seen.has(n)) { seen.add(n); visit(n); } });
    else if (rec.type === "characterData") {
      const n = rec.target;
      const block = n.parentElement && n.parentElement.closest("*");
      if (block && block.__quOut !== undefined) doBlock(block); else doText(n);
    } else if (rec.type === "attributes") doAttrs(rec.target);
  }
  // a block whose text changed inside (textContent set on a <b>) is checked again as a whole
}

function restore() {
  // changes waiting in the observer belong to the language we leave: a full pass follows for the new one
  if (observer) observer.takeRecords();
  (() => {
    for (const t of translated) {
      if (t.nodeType === 3) { if (t.isConnected && t.nodeValue === t.__quOut) t.nodeValue = t.__quSrc; delete t.__quOut; continue; }
      if (t.__quAttr) {
        for (const [name, rec] of Object.entries(t.__quAttr)) if (t.getAttribute(name) === rec.out) t.setAttribute(name, rec.src);
        delete t.__quAttr;
      }
      if (t.__quOut !== undefined) { if (t.isConnected && t.innerHTML === t.__quOut) t.innerHTML = t.__quSrc; delete t.__quOut; }
    }
    if (document.__quTitle) { document.title = document.__quTitle; delete document.__quTitle; }
  })();
  if (observer) observer.takeRecords();
  translated.clear();
  pending.clear();
}

async function translateTitle() {
  const v = document.title;
  const { key, nums } = normalize(v);
  const tr = lookup(key) || (onlyMarks(key) ? key : null);
  if (tr) { document.__quTitle = v; document.title = fill(tr, nums); }
}

/** skipValues: texts that are already Quechua (the hand-made interface dictionary). */
export async function setLanguage(next, { skipValues } = {}) {
  if (skipValues) skipQu = skipValues;
  if (next === lang) return;
  if (lang !== "es") restore();
  lang = next;
  if (!observer) {
    observer = new MutationObserver(onRecords);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (lang === "es") { setBusy(); return; }
  const l = lang;
  await loadDict(l);
  if (lang !== l) return;
  translateTitle();
  visit(document.body);
  // crop and month names: when they arrive, the page is gone over again with them
  if (await ensureTerms(l).catch(() => false)) { if (lang === l) { restore(); translateTitle(); visit(document.body); } }
}
export const currentLanguage = () => lang;

/** The Quechua of one Spanish text if it is already known (for texts built outside the page, like alerts). */
export function known(text) {
  const { key, nums } = normalize(text);
  const tr = lookup(key) || (onlyMarks(key) ? key : null);
  return tr ? fill(tr, nums) : null;
}
