// Visualisations of Yatiri X Global: the climate year as a radial clock, the next crop growing week by week and
// small animated weather scenes. Pure SVG/HTML strings with CSS animations (world.css), no library.
const TAU = Math.PI * 2;
const C = 200; // centre of the 400 x 400 radial chart
const f1 = (x) => x.toFixed(1);
/** angle 0 at the top, clockwise */
const at = (r, a) => [C + r * Math.sin(a), C - r * Math.cos(a)];
function sector(r0, r1, a0, a1) {
  const [x0, y0] = at(r1, a0);
  const [x1, y1] = at(r1, a1);
  const [x2, y2] = at(r0, a1);
  const [x3, y3] = at(r0, a0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${f1(x0)} ${f1(y0)}A${r1} ${r1} 0 ${big} 1 ${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}A${r0} ${r0} 0 ${big} 0 ${f1(x3)} ${f1(y3)}Z`;
}
const escText = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * The year as a clock: rain bars outside, frost and dry rings, crop cycles inside, a needle on today.
 * weeks: [{ rainMean, pFrost, pDry }] (52); months: [{ week, label }]; today: week; cycles: [{ start, len, color, label }]
 * label(week) -> "3 de mar"; centre: { big, small }
 */
export function radialYear({ weeks, months, today, cycles = [], label, centre }) {
  const n = weeks.length;
  const step = TAU / n;
  const maxRain = Math.max(...weeks.map((w) => w.rainMean), 1);
  let s = `<defs><radialGradient id="ry-bg"><stop offset="0" stop-color="#14254f"/><stop offset="1" stop-color="#050a18"/></radialGradient>
    <linearGradient id="ry-rain" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#48c6ff"/><stop offset="1" stop-color="#8ef0ff"/></linearGradient></defs>
    <circle cx="${C}" cy="${C}" r="199" fill="url(#ry-bg)"/>
    <circle class="ry-sweep" cx="${C}" cy="${C}" r="150" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="60" stroke-dasharray="40 900"/>`;
  weeks.forEach((w, i) => {
    const a0 = i * step + 0.004;
    const a1 = (i + 1) * step - 0.004;
    const h = 8 + (w.rainMean / maxRain) * 50;
    s += `<path class="ry-rain" style="--i:${i}" d="${sector(122, 122 + h, a0, a1)}" fill="url(#ry-rain)"><title>${escText(label(i))}: lluvia media ${Math.round(w.rainMean)} mm</title></path>`;
    s += `<path d="${sector(104, 118, a0, a1)}" fill="#7fd8ff" fill-opacity="${w.pFrost ? (0.18 + 0.82 * w.pFrost).toFixed(2) : 0.04}"><title>${escText(label(i))}: helada en ${Math.round(w.pFrost * 100)} % de los años</title></path>`;
    s += `<path d="${sector(86, 100, a0, a1)}" fill="#ffb23f" fill-opacity="${(0.06 + 0.94 * w.pDry).toFixed(2)}"><title>${escText(label(i))}: semana seca en ${Math.round(w.pDry * 100)} % de los años</title></path>`;
  });
  cycles.forEach((c, k) => {
    const r0 = 68 - k * 13;
    const a0 = c.start * step;
    const a1 = Math.min(a0 + Math.max(1, c.len) * step, a0 + TAU - 0.001);
    s += `<path class="ry-cycle" style="--k:${k}" d="${sector(r0, r0 + 10, a0, a1)}" fill="${c.color}" stroke="#fff" stroke-opacity=".75" stroke-width="1.2"><title>${escText(c.label)}: ${escText(label(c.start))} a ${escText(label(c.start + c.len))}</title></path>`;
    const [lx, ly] = at(r0 + 5, a0);
    s += `<circle cx="${f1(lx)}" cy="${f1(ly)}" r="4" fill="#fff" stroke="${c.color}" stroke-width="2"/>`;
  });
  for (const m of months) {
    const a = m.week * step;
    const [x0, y0] = at(84, a);
    const [x1, y1] = at(184, a);
    const [tx, ty] = at(193, a + step * 0.9);
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="rgba(255,255,255,.14)"/>`;
    s += `<text x="${f1(tx)}" y="${f1(ty)}" class="ry-month" text-anchor="middle" dominant-baseline="middle">${escText(m.label)}</text>`;
  }
  const ta = (today + 0.5) * step;
  const [nx, ny] = at(186, ta);
  const [dx, dy] = at(190, ta);
  s += `<g class="ry-needle"><line x1="${C}" y1="${C}" x2="${f1(nx)}" y2="${f1(ny)}" stroke="#ff3d6e" stroke-width="2.5" stroke-linecap="round"/>
    <circle class="ry-pulse" cx="${f1(dx)}" cy="${f1(dy)}" r="6" fill="#ff3d6e"/></g>
    <circle cx="${C}" cy="${C}" r="${cycles.length ? 68 - cycles.length * 13 : 70}" fill="#050a18" stroke="rgba(255,255,255,.12)"/>`;
  if (centre) s += `<text x="${C}" y="${C - 4}" class="ry-big" text-anchor="middle">${escText(centre.big)}</text><text x="${C}" y="${C + 16}" class="ry-small" text-anchor="middle">${escText(centre.small)}</text>`;
  return `<svg class="radial-year" viewBox="0 0 400 400" role="img" aria-label="El año del clima de tu terreno: lluvia, heladas, semanas secas y ciclo del cultivo">${s}</svg>`;
}

// five stages of a plant, drawn in a 60 x 80 box; c = crop colour
const STAGES = [
  (c) => `<ellipse cx="30" cy="70" rx="22" ry="5" fill="#8a5a2b"/><ellipse cx="30" cy="66" rx="5" ry="3.5" fill="${c}"/>`,
  (c) => `<ellipse cx="30" cy="70" rx="22" ry="5" fill="#8a5a2b"/><path d="M30 68V52" stroke="#3f8f2f" stroke-width="3" stroke-linecap="round"/><path d="M30 56c-7 0-11-4-12-9 6 0 10 3 12 9zM30 54c7 0 11-4 12-9-6 0-10 3-12 9z" fill="#5fc04a"/>`,
  (c) => `<ellipse cx="30" cy="70" rx="22" ry="5" fill="#8a5a2b"/><path d="M30 68V30" stroke="#3f8f2f" stroke-width="3.5" stroke-linecap="round"/><path d="M30 58c-10 0-15-6-17-12 9 0 14 5 17 12zM30 50c10 0 15-6 17-12-9 0-14 5-17 12zM30 40c-9 0-13-5-15-11 8 0 12 4 15 11zM30 34c8 0 12-5 13-10-7 0-11 4-13 10z" fill="#4fae3c"/><circle cx="30" cy="29" r="2" fill="${c}" opacity=".4"/>`,
  (c) => `<ellipse cx="30" cy="70" rx="22" ry="5" fill="#8a5a2b"/><path d="M30 68V22" stroke="#3f8f2f" stroke-width="3.5" stroke-linecap="round"/><path d="M30 58c-10 0-15-6-17-12 9 0 14 5 17 12zM30 50c10 0 15-6 17-12-9 0-14 5-17 12zM30 40c-9 0-13-5-15-11 8 0 12 4 15 11z" fill="#4fae3c"/><g class="vz-flower"><circle cx="30" cy="16" r="5" fill="#fff36b"/><circle cx="30" cy="9" r="4.5" fill="#fff"/><circle cx="37" cy="16" r="4.5" fill="#fff"/><circle cx="30" cy="23" r="4.5" fill="#fff"/><circle cx="23" cy="16" r="4.5" fill="#fff"/><circle cx="30" cy="16" r="3.5" fill="#ffb23f"/></g>`,
  (c) => `<ellipse cx="30" cy="70" rx="22" ry="5" fill="#8a5a2b"/><path d="M30 68V20" stroke="#6b8f2f" stroke-width="3.5" stroke-linecap="round"/><path d="M30 58c-10 0-15-6-17-12 9 0 14 5 17 12zM30 50c10 0 15-6 17-12-9 0-14 5-17 12z" fill="#8fae3c"/><circle cx="24" cy="30" r="6" fill="${c}"/><circle cx="36" cy="24" r="6.5" fill="${c}"/><circle cx="29" cy="17" r="5.5" fill="${c}"/><circle cx="26" cy="28" r="1.6" fill="#fff" opacity=".6"/><circle cx="34" cy="22" r="1.6" fill="#fff" opacity=".6"/>`,
];
const STAGE_NAMES = ["Siembra", "Brota", "Crece", "Florece", "Cosecha"];
const STAGE_AT = [0, 0.1, 0.38, 0.66, 1];

/** The next crop growing along its cycle: five stages with their dates, a bar that fills and today's mark. */
export function growthTimeline({ name, color, sowWeek, weeks, today, label, photo }) {
  const into = ((today - sowWeek) % 52 + 52) % 52;
  const now = into <= weeks ? into / Math.max(1, weeks) : null;
  return `<div class="growth" style="--crop:${color}">
    ${photo ? `<img class="growth__photo" src="${escText(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
    <div class="growth__body">
      <p class="growth__title"><b>${escText(name)}</b> · ${weeks} semanas de ciclo</p>
      <div class="growth__track">
        <span class="growth__fill" style="--to:${now === null ? 1 : now.toFixed(3)}"></span>
        ${now !== null ? `<span class="growth__now" style="--at:${now.toFixed(3)}">hoy</span>` : ""}
        ${STAGES.map((draw, i) => `<figure class="growth__stage" style="--at:${STAGE_AT[i]};--i:${i}">
          <svg viewBox="0 0 60 80" aria-hidden="true">${draw(color)}</svg>
          <figcaption><b>${STAGE_NAMES[i]}</b><span>${escText(label(sowWeek + Math.round(STAGE_AT[i] * weeks)))}</span></figcaption>
        </figure>`).join("")}
      </div>
    </div>
  </div>`;
}

/** A small animated scene for one day: sun, sun with cloud, rain, storm or frost. */
export function weatherScene(day) {
  const kind = day.pFrost >= 0.3 ? "frost" : day.pHeavyRain >= 0.5 ? "storm" : day.pRain >= 0.6 ? "rain" : day.pRain >= 0.3 ? "cloud" : "sun";
  const drops = kind === "rain" || kind === "storm" ? '<i class="wx__drop"></i><i class="wx__drop"></i><i class="wx__drop"></i><i class="wx__drop"></i>' : "";
  const flakes = kind === "frost" ? '<i class="wx__flake"></i><i class="wx__flake"></i><i class="wx__flake"></i>' : "";
  return `<span class="wx wx--${kind}" aria-hidden="true">${kind === "sun" || kind === "cloud" ? '<i class="wx__sun"></i>' : ""}${kind !== "sun" ? '<i class="wx__cloud"></i>' : ""}${kind === "storm" ? '<i class="wx__bolt"></i>' : ""}${drops}${flakes}</span>`;
}
