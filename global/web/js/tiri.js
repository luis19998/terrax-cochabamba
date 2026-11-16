// Tiri's face and voice (Yatiri X Global): an animated sprout avatar, speech bubbles, text-to-speech and speech
// recognition. The conversation logic lives in app.js; this module only shows and speaks.
const VOICES = { es: "es-BO", qu: "es-BO", ay: "es-BO", gn: "es-PY", en: "en-US", pt: "pt-BR", fr: "fr-FR", de: "de-DE", it: "it-IT", sw: "sw-KE", hi: "hi-IN", zh: "zh-CN", ar: "ar-SA" };

/** The avatar: a sprout with a face. States: idle, think, talk, alert, happy (data-state on the wrapper). */
export function avatarSVG(size = 56) {
  return `<span class="tiri-face" data-state="idle" style="--s:${size}px" aria-hidden="true">
  <svg viewBox="0 0 120 120" width="${size}" height="${size}">
    <defs>
      <radialGradient id="tf-head" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#c8f7a6"/><stop offset=".6" stop-color="#8ef06a"/><stop offset="1" stop-color="#4f9d2f"/></radialGradient>
      <linearGradient id="tf-leaf" x1="0" x2="1"><stop offset="0" stop-color="#5fc04a"/><stop offset="1" stop-color="#2e7d32"/></linearGradient>
    </defs>
    <g class="tf-sprout"><path d="M60 30C60 18 58 12 60 6" stroke="#2e7d32" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path class="tf-leaf tf-leaf--l" d="M59 16C47 16 39 9 37 1c12 0 20 6 22 15z" fill="url(#tf-leaf)"/>
      <path class="tf-leaf tf-leaf--r" d="M61 12C73 12 80 5 82-3 70-3 63 3 61 12z" fill="url(#tf-leaf)"/></g>
    <ellipse cx="60" cy="72" rx="44" ry="42" fill="url(#tf-head)"/>
    <ellipse cx="44" cy="92" rx="8" ry="5" fill="#ff8a7a" opacity=".55"/><ellipse cx="76" cy="92" rx="8" ry="5" fill="#ff8a7a" opacity=".55"/>
    <g class="tf-eyes"><ellipse class="tf-eye" cx="45" cy="70" rx="7" ry="9" fill="#1d2b12"/><ellipse class="tf-eye" cx="75" cy="70" rx="7" ry="9" fill="#1d2b12"/>
      <circle cx="47.5" cy="66.5" r="2.4" fill="#fff"/><circle cx="77.5" cy="66.5" r="2.4" fill="#fff"/></g>
    <path class="tf-mouth" d="M50 90 Q60 99 70 90" stroke="#1d2b12" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse class="tf-mouth-open" cx="60" cy="93" rx="7" ry="5" fill="#1d2b12"/>
    <g class="tf-alert"><circle cx="98" cy="38" r="12" fill="#ff3d6e"/><rect x="96" y="29" width="4" height="11" rx="2" fill="#fff"/><circle cx="98" cy="45" r="2.4" fill="#fff"/></g>
  </svg></span>`;
}

export function setFace(state) {
  document.querySelectorAll(".tiri-face").forEach((f) => { f.dataset.state = state; });
}

let bubbleTimer = null;
/** A short message that pops out of the floating avatar, without opening the chat. */
export function say(text, { state = "talk", ms = 9000, onClick } = {}) {
  const bubble = document.getElementById("tiri-say");
  if (!bubble) return;
  bubble.textContent = text;
  bubble.hidden = false;
  bubble.classList.remove("is-in");
  void bubble.offsetWidth;
  bubble.classList.add("is-in");
  setFace(state);
  bubble.onclick = () => { bubble.hidden = true; if (onClick) onClick(); };
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; setFace("idle"); }, ms);
}

let voiceOn = false;
try { voiceOn = localStorage.getItem("yatirix.voice") === "1"; } catch { /* default off */ }
export const voiceEnabled = () => voiceOn;
export function setVoice(on) { voiceOn = on; try { localStorage.setItem("yatirix.voice", on ? "1" : "0"); } catch { /* ignore */ } if (!on) stopSpeaking(); }

/** Reads a text aloud in the page language (the mouth moves while it speaks). */
export function speak(text, lang = "es") {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#>`]/g, "").slice(0, 900));
  u.lang = VOICES[lang] || "es-BO";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
  if (voice) u.voice = voice;
  u.rate = 1;
  u.onstart = () => setFace("talk");
  u.onend = () => setFace("happy");
  window.speechSynthesis.speak(u);
}
export function stopSpeaking() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }

/** Speech recognition: returns a function that starts listening, or null when the browser cannot. */
export function microphone(lang, onText, onState) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return () => {
    const rec = new SR();
    rec.lang = VOICES[lang()] || "es-BO";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { onState(true); setFace("think"); };
    rec.onend = () => { onState(false); };
    rec.onerror = () => { onState(false); setFace("idle"); };
    rec.onresult = (e) => { const text = e.results[0][0].transcript; if (text) onText(text); };
    rec.start();
  };
}
