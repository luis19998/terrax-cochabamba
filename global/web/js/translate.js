// Quechua for the whole page, including everything the app computes and draws later (results, messages, Tiri).
// It works on the rendered page: each sentence-sized element (or text piece) is looked up in
//   1. web/data/qu.json   reviewed dictionary in the repository (a speaker can correct it)
//   2. this browser's cache of earlier answers
//   3. POST /api/translate (Gemini on the server, cached there too)
// Numbers are replaced by {0}, {1}… before the lookup, so "Unos 25 mm" and "Unos 40 mm" share one translation.
// Elements with translate="no" or the class "notranslate" are left alone. Switching back to Spanish restores the
// original text of every piece that was translated.
const INLINE = new Set(["B", "STRONG", "I", "EM", "BR", "SMALL", "SUP", "SUB", "SPAN", "ABBR", "Q", "MARK"]);
const SKIP = "script,style,noscript,textarea,code,pre,svg text,[translate='no'],.notranslate,.leaflet-control-attribution,.leaflet-tile-pane,.sprite";
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const LETTERS = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]{2,}/;
const CACHE = "yatirix.qu.v2";
const MAX_BLOCK = 1600;

let lang = "es";
let dict = null;
let dictLoading = null;
let local = {};
let skip = new Set();
let observer = null;
const translated = new Set();
const pending = new Map(); // key -> Set of targets
const failed = new Map(); // key -> time to try again (the server may be out of quota for a while)
let timer = null;
let revisit = null;
let busy = 0;

// Crop names work like numbers: "Sembrar pepino…" and "Sembrar haba…" share one translation, and each name is put
// back in Quechua (maíz -> sara). Set with setTerms().
let terms = new Map(); // lower-case Spanish -> Quechua
let pattern = /\d+(?:[.,]\d+)*/gu;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** terms: { "Maíz": "Sara", "Frijol (poroto)": "Purutu", … } */
export function setTerms(map) {
  terms = new Map(Object.entries(map).map(([es, qu]) => [es.toLowerCase(), qu]));
  const names = [...terms.keys()].sort((a, b) => b.length - a.length).map(escape);
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
  const qu = terms.get(m.toLowerCase());
  if (!qu) return m;
  return m[0] === m[0].toUpperCase() ? qu[0].toUpperCase() + qu.slice(1) : qu.toLowerCase();
}
const fill = (tr, nums) => tr.replace(/\{(\d+)\}/g, (_, i) => (nums[Number(i)] === undefined ? "" : termOut(nums[Number(i)])));
/** a key that is only marks and punctuation ("{0}", "{0}, {1}, {2}") needs no dictionary */
const onlyMarks = (key) => !LETTERS.test(plain(key).replace(/\{\d+\}/g, ""));
const lookup = (key) => (dict && dict[key]) || local[key] || null;
// every Quechua text we know or wrote: never sent back to be "translated" again
const quechua = new Set();
const remember = (tr) => { if (tr) quechua.add(tr); };
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");

function loadDict() {
  if (dict) return Promise.resolve(dict);
  if (!dictLoading) {
    try { local = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch { local = {}; }
    dictLoading = fetch("data/qu.json").then((r) => (r.ok ? r.json() : { entries: {} })).catch(() => ({ entries: {} }))
      .then((d) => { dict = d.entries || {}; Object.values(dict).forEach(remember); Object.values(local).forEach(remember); return dict; });
  }
  return dictLoading;
}
function saveLocal() {
  try {
    const keys = Object.keys(local);
    if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete local[k];
    localStorage.setItem(CACHE, JSON.stringify(local));
  } catch { /* storage full or off: translations still work for this visit */ }
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
  if ((failed.get(key) || 0) > Date.now()) return;
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
  if (!tr) { if (!quechua.has(key)) want(key, el); return; }
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
  if (!tr) { if (!quechua.has(key)) want(key, n); return; }
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
    if (!tr) { if (!quechua.has(key)) want(key, { el, attr: name }); continue; }
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
  if (lang !== "qu" || !pending.size) return;
  const keys = [...pending.keys()].slice(0, 80);
  const targets = keys.map((k) => [k, pending.get(k)]);
  keys.forEach((k) => pending.delete(k));
  busy += 1;
  setBusy();
  try {
    const r = await fetch("/api/translate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texts: keys }),
      signal: AbortSignal.timeout(90000),
    });
    const data = r.ok ? await r.json() : { translations: {} };
    for (const [k, v] of Object.entries(data.translations || {})) { local[k] = v; remember(v); }
    saveLocal();
    for (const [k, set] of targets) {
      if (!lookup(k)) { failed.set(k, Date.now() + 120e3); continue; }
      if (lang === "qu") set.forEach(retry);
    }
  } catch {
    keys.forEach((k) => failed.set(k, Date.now() + 60e3));
  } finally {
    busy -= 1;
    setBusy();
    if (pending.size) flush();
    // what could not be translated now is tried again in a couple of minutes
    if (failed.size) { clearTimeout(revisit); revisit = setTimeout(() => { if (lang === "qu") visit(document.body); }, 130e3); }
  }
}

function setBusy() {
  let chip = document.getElementById("qu-busy");
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "qu-busy";
    chip.className = "qu-busy notranslate";
    chip.setAttribute("role", "status");
    chip.textContent = "Runasimiman t'ikrachkan…";
    document.body.append(chip);
  }
  chip.hidden = !(busy > 0 && lang === "qu");
}

function onRecords(records) {
  if (lang !== "qu") return;
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
  quietly(() => {
    for (const t of translated) {
      if (t.nodeType === 3) { if (t.isConnected && t.nodeValue === t.__quOut) t.nodeValue = t.__quSrc; delete t.__quOut; continue; }
      if (t.__quAttr) {
        for (const [name, rec] of Object.entries(t.__quAttr)) if (t.getAttribute(name) === rec.out) t.setAttribute(name, rec.src);
        delete t.__quAttr;
      }
      if (t.__quOut !== undefined) { if (t.isConnected && t.innerHTML === t.__quOut) t.innerHTML = t.__quSrc; delete t.__quOut; }
    }
    if (document.__quTitle) { document.title = document.__quTitle; delete document.__quTitle; }
  });
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
  if (skipValues) skip = skipValues;
  if (next === lang) return;
  lang = next;
  if (!observer) {
    observer = new MutationObserver(onRecords);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (lang !== "qu") { restore(); setBusy(); return; }
  await loadDict();
  if (lang !== "qu") return;
  translateTitle();
  visit(document.body);
}

/** The Quechua of one Spanish text if it is already known (for texts built outside the page, like alerts). */
export function known(text) {
  const { key, nums } = normalize(text);
  const tr = lookup(key) || (onlyMarks(key) ? key : null);
  return tr ? fill(tr, nums) : null;
}
