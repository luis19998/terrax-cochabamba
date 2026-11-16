// Motion for Yatiri X, without libraries (the same approach as the Space Apps Cochabamba site): CSS animations plus
// a few small observers. Everything is off for people who ask their device for less motion, and the pointer effects
// only run on devices with a real mouse.
//   - scroll reveal: [data-reveal] blurs in and rises; [data-reveal-group] staggers its children
//   - headline split word by word ([data-split])
//   - counters ([data-count-to]) that run when they come into view
//   - 3D tilt with a light that follows the pointer ([data-tilt]); magnetic buttons ([data-magnetic])
//   - parallax layers in the hero ([data-depth]), scroll progress bar, glassy top bar after scrolling
//   - view transitions between screens when the browser supports them
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

let revealObserver = null;

function reveal(el) {
  el.classList.add("is-visible");
  el.querySelectorAll("[data-count-to]").forEach(countUp);
  if (el.matches("[data-count-to]")) countUp(el);
}

/** Watches every element marked for reveal, including the ones the app draws later. */
function watch(root = document) {
  const items = [...root.querySelectorAll("[data-reveal]:not(.is-watched), [data-reveal-group]:not(.is-watched)")];
  if (root.matches && root.matches("[data-reveal], [data-reveal-group]") && !root.classList.contains("is-watched")) items.push(root);
  for (const el of items) {
    el.classList.add("is-watched");
    if (reduce() || !revealObserver) reveal(el); else revealObserver.observe(el);
  }
  // numbers drawn inside a block that is already visible count up straight away
  root.querySelectorAll(".is-visible [data-count-to]:not([data-counted])").forEach(countUp);
}

/** Splits a headline into words that rise one after the other (only once; the text stays readable for screen readers). */
export function splitWords(el) {
  if (!el || el.querySelector(".word") || reduce()) return;
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute("aria-label", el.textContent.trim());
  el.innerHTML = words.map((w, i) => `<span class="word" aria-hidden="true" style="--w:${i}"><span>${w.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</span></span>`).join(" ");
  el.classList.add("is-split");
  // once every word is in place, the title goes back to plain text so the brand gradient can flow across it
  const label = el.getAttribute("aria-label");
  setTimeout(() => {
    if (!el.classList.contains("is-split")) return;
    // the language may have changed meanwhile: then the new text is already plain
    if (el.querySelector(".word")) el.textContent = label;
    el.removeAttribute("aria-label");
    el.classList.remove("is-split");
  }, 120 + words.length * 75 + 950);
}

/** Counts a number up from zero (keeps the same decimals and thousands format). */
export function countUp(el) {
  if (el.dataset.counted) return;
  el.dataset.counted = "1";
  const to = Number(el.dataset.countTo);
  if (!Number.isFinite(to) || reduce()) return;
  const decimals = Number(el.dataset.decimals || 0);
  const fmt = (x) => x.toLocaleString("es", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const start = performance.now();
  const dur = 1200 + Math.min(800, Math.abs(to) / 4);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - t) ** 4;
    el.textContent = fmt(to * eased);
    if (t < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(step);
}

function tilt(el) {
  if (el.dataset.tiltOn) return;
  el.dataset.tiltOn = "1";
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
    el.classList.add("is-tilting");
  });
  el.addEventListener("pointerleave", () => {
    el.classList.remove("is-tilting");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  });
}

function magnetic(el) {
  if (el.dataset.magOn) return;
  el.dataset.magOn = "1";
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--tx", `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px`);
    el.style.setProperty("--ty", `${((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1)}px`);
  });
  el.addEventListener("pointerleave", () => { el.style.setProperty("--tx", "0px"); el.style.setProperty("--ty", "0px"); });
}

function pointerEffects(root = document) {
  if (reduce() || !finePointer()) return;
  root.querySelectorAll("[data-tilt]").forEach(tilt);
  root.querySelectorAll("[data-magnetic]").forEach(magnetic);
}

/** Hero: layers move with the pointer and with the scroll (parallax), the light follows the pointer. */
function parallax() {
  const hero = document.querySelector(".hero");
  if (!hero || reduce()) return;
  const layers = [...hero.querySelectorAll("[data-depth]")];
  let px = 0;
  let py = 0;
  let sy = 0;
  let queued = false;
  const paint = () => {
    queued = false;
    for (const l of layers) {
      const d = Number(l.dataset.depth);
      l.style.transform = `translate3d(${(px * d * 18).toFixed(1)}px, ${(py * d * 10 + sy * d * 0.25).toFixed(1)}px, 0)`;
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  if (finePointer()) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      hero.style.setProperty("--hx", `${((px + 0.5) * 100).toFixed(1)}%`);
      hero.style.setProperty("--hy", `${((py + 0.5) * 100).toFixed(1)}%`);
      queue();
    });
  }
  window.addEventListener("scroll", () => { sy = Math.min(window.scrollY, 900); queue(); }, { passive: true });
}

function scrollChrome() {
  const bar = document.getElementById("scroll-progress");
  const top = document.querySelector(".topbar");
  const steps = document.querySelector(".steps-intro");
  let queued = false;
  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    if (top) top.classList.toggle("is-scrolled", window.scrollY > 12);
    if (steps && steps.offsetParent) {
      const r = steps.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (window.innerHeight * 0.75 - r.top) / r.height));
      steps.style.setProperty("--line", p.toFixed(3));
    }
  };
  window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(paint); } }, { passive: true });
  paint();
}

/** Switches screens with a cross-fade when the browser supports view transitions. */
export function transition(update) {
  if (document.startViewTransition && !reduce() && !document.hidden) {
    const vt = document.startViewTransition(update);
    // a quick second change skips the first transition: that is expected, not an error
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) if (p) p.catch(() => {});
  } else update();
}

/** Re-plays the entrance of a panel (tabs, results). */
export function replay(el) {
  if (!el || reduce()) return;
  el.classList.remove("is-entering");
  void el.offsetWidth;
  el.classList.add("is-entering");
}

export function initMotion() {
  document.documentElement.classList.add("motion-ready");
  if (!reduce() && "IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        reveal(e.target);
        revealObserver.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  }
  splitWords(document.querySelector("[data-split]"));
  watch();
  pointerEffects();
  parallax();
  scrollChrome();
  // content drawn later by the app (results, catalogue, cards) gets the same treatment
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; watch(); pointerEffects(); });
  }).observe(document.body, { childList: true, subtree: true });
}
