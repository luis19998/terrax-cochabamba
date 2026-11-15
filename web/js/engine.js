// Rotation and water-balance engine. Pure functions, no DOM: the same module runs in the browser and in Node.
//
// Data used (see data/process_power.py and docs/datos-nasa.md):
//   NASA POWER daily, community AG, 1981-2025, aggregated by week: T2M_MIN, T2M_MAX, T2M, PRECTOTCORR,
//   GWETROOT and reference evapotranspiration (FAO-56 Penman-Monteith from POWER radiation, humidity and wind).
//   Grid: 0.5 x 0.625 degrees, one cell for the whole municipality; temperature is corrected by altitude.
//
// Scoring rule (transparent on purpose, weights add up to 100):
//   climate 45, rotation 30, soil 10, farmer priorities 15.

export const WEEKS = 52;
export const WEIGHTS = { climate: 45, rotation: 30, soil: 10, priorities: 15 };
export const DRY_WEEK_MM = 5; // a "dry week" has less than 5 mm of rain
const NEUTRAL_SOIL = 0.5; // no plot-level soil data yet: every strategy gets the same neutral value

const median = (values) => {
  const v = values.filter((x) => x !== null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const mean = (values) => {
  const v = values.filter((x) => x !== null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const quantile = (values, q) => {
  const v = values.filter((x) => x !== null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
};
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Temperature shift (deg C) from the POWER cell to the site, plus the scenario shift. */
export function temperatureShift(climate, altitude, scenario = {}) {
  const { cell_elevation_m: cell, lapse_rate_c_per_m: lapse } = climate.meta;
  return lapse * (cell - altitude) + (scenario.tempC || 0);
}

/** Weekly reference evapotranspiration (mm) for one year, interpolated between the two precomputed altitudes.
 *  A warmer scenario is treated as a lower equivalent altitude (1 deg C = 1 / lapse rate metres). */
function et0Row(climate, yearIndex, altitude, scenario = {}) {
  const [low, high] = climate.meta.et0_altitudes_m;
  const equivalent = altitude - (scenario.tempC || 0) / climate.meta.lapse_rate_c_per_m;
  const t = (equivalent - low) / (high - low);
  const a = climate.weekly.et0_low[yearIndex];
  const b = climate.weekly.et0_high[yearIndex];
  return a.map((x, w) => (x === null || b[w] === null ? null : Math.max(0, x + (b[w] - x) * t)));
}

/** ET0 for every year and week at this altitude and scenario, computed once and reused. */
let et0Cache = { key: null, table: null };
function et0Table(climate, altitude, scenario = {}) {
  const key = `${climate.meta.generated}|${altitude}|${scenario.tempC || 0}`;
  if (et0Cache.key !== key) {
    et0Cache = { key, table: climate.years.map((_, y) => et0Row(climate, y, altitude, scenario)) };
  }
  return et0Cache.table;
}

const rainFactor = (scenario = {}) => 1 + (scenario.rainPct || 0) / 100;

/** Week-by-week picture of the site: frost and dry-week probability, rain, evapotranspiration, soil wetness. */
export function weeklyStats(climate, altitude, scenario = {}) {
  const shift = temperatureShift(climate, altitude, scenario);
  const factor = rainFactor(scenario);
  const n = climate.years.length;
  const allRain = [];
  const out = [];
  for (let w = 0; w < WEEKS; w++) {
    const tmin = climate.weekly.tmin_min.map((row) => (row[w] === null ? null : row[w] + shift));
    const rain = climate.weekly.rain.map((row) => (row[w] === null ? null : row[w] * factor));
    const et0 = et0Table(climate, altitude, scenario).map((row) => row[w]);
    const valid = tmin.filter((x) => x !== null);
    rain.forEach((x) => x !== null && allRain.push(x));
    out.push({
      week: w,
      pFrost: valid.filter((x) => x <= 0).length / valid.length,
      pHardFrost: valid.filter((x) => x <= -2).length / valid.length,
      pDry: rain.filter((x) => x !== null && x < DRY_WEEK_MM).length / n,
      tminMedian: median(tmin),
      rainMean: mean(rain),
      rainP20: quantile(rain, 0.2),
      rainP80: quantile(rain, 0.8),
      et0Mean: mean(et0),
      soilWetness: mean(climate.weekly.gwetroot.map((row) => row[w])),
    });
  }
  const heavyRainMm = quantile(allRain, 0.9);
  return { weeks: out, heavyRainMm };
}

/** Crop coefficient for each week of the cycle (FAO-56 four-stage curve). */
export function kcCurve(crop, fractions) {
  const weeks = Math.max(1, Math.round(crop.cycle_days / 7));
  const [ini, mid, end] = crop.kc;
  const f = fractions;
  const curve = [];
  for (let k = 0; k < weeks; k++) {
    const p = (k + 0.5) / weeks;
    let kc;
    if (p <= f.initial) kc = ini;
    else if (p <= f.initial + f.development) kc = ini + ((p - f.initial) / f.development) * (mid - ini);
    else if (p <= f.initial + f.development + f.mid) kc = mid;
    else kc = mid + ((p - (1 - f.late)) / f.late) * (end - mid);
    curve.push(kc);
  }
  return curve;
}

/** How one crop does when sown in a given week: frost risk during the cycle and water balance. */
export function evaluateCrop(climate, cropsMeta, crop, sowWeek, altitude, irrigation, scenario = {}) {
  if (crop.group === "fallow") {
    return { sowWeek: null, weeks: 0, frostProb: 0, coverage: 1, cropWaterMm: 0, rainMm: 0, irrigationMm: 0, climateScore: 0.75, weekly: [] };
  }
  const kc = kcCurve(crop, cropsMeta.stage_fractions);
  const shift = temperatureShift(climate, altitude, scenario);
  const factor = rainFactor(scenario);
  const et0Rows = et0Table(climate, altitude, scenario);
  const years = climate.years.length;
  const frost = [];
  const coverage = [];
  const need = [];
  const rainTotal = [];
  const deficit = [];
  const meanTemp = [];
  const weekly = kc.map(() => ({ etc: [], rain: [] }));
  for (let y = 0; y < years; y++) {
    let anyFrost = false;
    let etcSum = 0;
    let rainSum = 0;
    let covered = 0;
    let tSum = 0;
    let complete = true;
    for (let k = 0; k < kc.length; k++) {
      const abs = sowWeek + k;
      const yy = y + Math.floor(abs / WEEKS);
      const w = abs % WEEKS;
      if (yy >= years) { complete = false; break; }
      const tmin = climate.weekly.tmin_min[yy][w];
      const rain = climate.weekly.rain[yy][w];
      const et0 = et0Rows[yy][w];
      if (tmin === null || rain === null || et0 === null) { complete = false; break; }
      if (tmin + shift <= crop.frost_damage_c) anyFrost = true;
      const tmean = climate.weekly.tmean[yy][w];
      tSum += (tmean === null ? tmin + 8 : tmean) + shift;
      const etc = kc[k] * et0;
      const r = rain * factor;
      etcSum += etc;
      rainSum += r;
      covered += Math.min(r, etc);
      weekly[k].etc.push(etc);
      weekly[k].rain.push(r);
    }
    if (!complete) continue;
    frost.push(anyFrost ? 1 : 0);
    coverage.push(etcSum > 0 ? covered / etcSum : 1);
    need.push(etcSum);
    rainTotal.push(rainSum);
    deficit.push(Math.max(0, etcSum - covered));
    meanTemp.push(tSum / kc.length);
  }
  const frostProb = mean(frost);
  const cover = median(coverage);
  const waterScore = irrigation ? 0.5 + 0.5 * cover : cover;
  // warm-season crops: each degree below the mean temperature they need costs a fifth of the climate score
  const cycleTemp = median(meanTemp);
  const warmth = crop.min_mean_temp_c === undefined ? 1 : Math.max(0, Math.min(1, 1 - (crop.min_mean_temp_c - cycleTemp) / 5));
  return {
    sowWeek,
    weeks: kc.length,
    seasons: frost.length,
    frostProb,
    coverage: cover,
    cropWaterMm: median(need),
    rainMm: median(rainTotal),
    irrigationMm: median(deficit),
    climateScore: (0.5 * (1 - frostProb) + 0.5 * waterScore) * warmth,
    meanTempC: Math.round(cycleTemp * 10) / 10,
    warmth,
    weekly: weekly.map((x, k) => ({ week: (sowWeek + k) % WEEKS, kc: kc[k], etc: median(x.etc), rain: median(x.rain) })),
  };
}

/** Best sowing week of a crop for this site: the week with the highest climate score. */
export function bestSowing(climate, cropsMeta, crop, altitude, irrigation, scenario = {}) {
  if (crop.group === "fallow") return evaluateCrop(climate, cropsMeta, crop, 0, altitude, irrigation, scenario);
  // perennials and fruit trees stay in the ground all year: the "sowing" week is planting with the first firm rains
  if (crop.perennial || crop.cycle_days >= 364) return evaluateCrop(climate, cropsMeta, crop, 43, altitude, irrigation, scenario);
  // coarse pass every 3 weeks, then the two neighbours of the best one (same result in practice, a third of the work)
  let best = null;
  const tryWeek = (w) => {
    const e = evaluateCrop(climate, cropsMeta, crop, ((w % WEEKS) + WEEKS) % WEEKS, altitude, irrigation, scenario);
    if (!best || e.climateScore > best.climateScore + 1e-9) best = e;
  };
  for (let w = 0; w < WEEKS; w += 3) tryWeek(w);
  const coarse = best.sowWeek;
  for (const d of [-2, -1, 1, 2]) tryWeek(coarse + d);
  return best;
}

/** Score of planting `next` after `previous` (0-1). `previous` can be several crops sown in the same campaign:
 * then the worst case counts (repeating the family of any of them is a repeat). */
export function transitionScore(previous, next) {
  if (Array.isArray(previous)) {
    if (!previous.length) return transitionScore(null, next);
    if (previous.length === 1) return transitionScore(previous[0], next);
    return previous.map((p) => transitionScore(p, next)).sort((a, b) => a.score - b.score)[0];
  }
  if (!previous) return { score: 0.6, rule: "sin dato de la campaña anterior" };
  if (next.group === "fallow") return { score: 0.8, rule: "el descanso o abono verde deja recuperar el suelo" };
  if (previous.group === "fallow") return { score: 0.8, rule: "siembra después de un descanso" };
  if (previous.id === next.id && next.perennial) return { score: 0.8, rule: `${next.name} es un cultivo de varios años` };
  if (previous.family === next.family) return { score: 0, rule: `repite la familia ${next.family}: más plagas y enfermedades y desgaste del suelo` };
  if (next.fixes_nitrogen && !previous.fixes_nitrogen) return { score: 1, rule: `${next.name} fija nitrógeno después de ${previous.name}` };
  if (previous.fixes_nitrogen && (next.group === "cereal" || next.group === "tuber")) return { score: 1, rule: `${next.name} aprovecha el nitrógeno que dejó ${previous.name}` };
  return { score: 0.6, rule: `cambia de familia: ${previous.family} a ${next.family}` };
}

function priorityScore(sequence, evals, priorities, preferred, maxIrrigation) {
  if (!priorities.length) return { score: 0.5, parts: [] };
  const crops = sequence.filter((c) => c.group !== "fallow");
  const parts = priorities.map((p) => {
    if (p === "risk") return { id: p, value: mean(sequence.map((c) => evals[c.id].climateScore)) };
    if (p === "water") return { id: p, value: 1 - clamp(mean(sequence.map((c) => evals[c.id].irrigationMm)) / (maxIrrigation || 1)) };
    if (p === "soil") {
      const restoring = sequence.filter((c) => c.fixes_nitrogen || c.group === "fallow").length / sequence.length;
      const families = new Set(sequence.map((c) => c.family)).size / sequence.length;
      return { id: p, value: 0.5 * restoring + 0.5 * families };
    }
    if (p === "forage") return { id: p, value: sequence.filter((c) => c.forage).length / sequence.length };
    if (p === "preferred") return { id: p, value: crops.length ? crops.filter((c) => preferred.includes(c.id)).length / sequence.length : 0 };
    return { id: p, value: 0.5 };
  });
  return { score: mean(parts.map((x) => x.value)), parts };
}

function scoreSequence(sequence, ctx) {
  const { evals, history, priorities, preferred, maxIrrigation } = ctx;
  const climate = mean(sequence.map((c) => evals[c.id].climateScore));
  const transitions = [];
  let previous = history.length ? history[history.length - 1] : null;
  for (const crop of sequence) {
    const from = Array.isArray(previous) ? previous.map((c) => c.id).join("+") : previous ? previous.id : null;
    transitions.push({ from, to: crop.id, ...transitionScore(previous, crop) });
    previous = crop;
  }
  // 70 % how each crop follows the previous one, 30 % how many different families the three years have
  const diversity = new Set(sequence.filter((c) => c.group !== "fallow").map((c) => c.family)).size / sequence.length;
  const rotation = 0.7 * mean(transitions.map((t) => t.score)) + 0.3 * diversity;
  const prio = priorityScore(sequence, evals, priorities, preferred, maxIrrigation);
  const parts = {
    climate: WEIGHTS.climate * climate,
    rotation: WEIGHTS.rotation * rotation,
    soil: WEIGHTS.soil * NEUTRAL_SOIL,
    priorities: WEIGHTS.priorities * prio.score,
  };
  return { total: parts.climate + parts.rotation + parts.soil + parts.priorities, parts, transitions, priorityParts: prio.parts };
}

const pct = (x) => `${Math.round(x * 100)} %`;
const mm = (x) => `${Math.round(x / 5) * 5} mm`;

function describe(kind, sequence, scored, ctx) {
  const { evals, irrigation, period } = ctx;
  const crops = sequence.filter((c) => c.group !== "fallow");
  const power = { dataset: "NASA POWER", period };
  const why = [];
  const evidence = [];
  const benefits = [];
  const risks = [];
  const repeats = scored.transitions.filter((t) => t.score === 0);
  const good = scored.transitions.filter((t) => t.score === 1);

  if (kind === "current") why.push("Es lo que vienes sembrando: sirve de punto de comparación.");
  if (kind === "best") why.push("Es la combinación con mejor puntaje para tu parcela y lo que marcaste como importante.");
  if (kind === "water") why.push("Es la buena combinación que menos agua de riego pide.");
  good.forEach((t) => why.push(t.rule[0].toUpperCase() + t.rule.slice(1) + "."));

  crops.forEach((c) => {
    const e = evals[c.id];
    evidence.push({
      text: `${c.name}: helada dañina (${c.frost_damage_c} °C o menos) en ${pct(e.frostProb)} de las campañas`,
      value: e.frostProb, parameter: "T2M_MIN corregida por altitud", ...power,
    });
    evidence.push({
      text: `${c.name}: necesita ${mm(e.cropWaterMm)} de agua y la lluvia cubre ${pct(e.coverage)}; faltan ${mm(e.irrigationMm)}`,
      value: e.coverage, parameter: "PRECTOTCORR y evapotranspiración FAO-56", ...power,
    });
    if (e.frostProb >= 0.3) risks.push(`${c.name} tiene helada dañina en ${pct(e.frostProb)} de las campañas: revisar la fecha de siembra con un técnico.`);
    if (!irrigation && e.coverage < 0.5) risks.push(`Sin riego, la lluvia cubre solo ${pct(e.coverage)} del agua que necesita ${c.name.toLowerCase()}.`);
  });

  const fixers = sequence.filter((c) => c.fixes_nitrogen);
  if (fixers.length) benefits.push(`${[...new Set(fixers.map((c) => c.name))].join(" y ")} fija nitrógeno y reduce la necesidad de fertilizante.`);
  const families = new Set(crops.map((c) => c.family)).size;
  if (families >= 3) benefits.push("Tres familias distintas en tres años cortan el ciclo de plagas y enfermedades.");
  if (sequence.some((c) => c.group === "fallow")) benefits.push("El descanso o abono verde aporta materia orgánica y cubre el suelo.");
  const irrigationTotal = sequence.reduce((a, c) => a + evals[c.id].irrigationMm, 0);
  benefits.push(`Riego estimado en tres años: ${mm(irrigationTotal)}.`);

  repeats.forEach((t) => risks.push(t.rule[0].toUpperCase() + t.rule.slice(1) + "."));
  risks.push("Los umbrales de helada y los coeficientes de cultivo son valores generales: validarlos con un técnico o con INIAF.");

  const gaps = [
    "Sin análisis de suelo de la parcela: textura, pH y materia orgánica no entran todavía en el puntaje.",
    "Sin precios ni costos de semilla: el mercado solo entra por los cultivos que marcaste como preferidos.",
    "El clima viene de una celda de unos 50 km: las heladas de fondo de valle pueden quedar subestimadas.",
  ];
  return { why, evidence, benefits, gaps, risks, irrigationTotalMm: irrigationTotal };
}

function pack(kind, label, sequence, ctx) {
  const scored = scoreSequence(sequence, ctx);
  return {
    kind,
    label,
    score: Math.round(scored.total),
    parts: Object.fromEntries(Object.entries(scored.parts).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    years: sequence.map((c, i) => {
      const e = ctx.evals[c.id];
      return {
        year: i + 1, crop: c.id, name: c.name, family: c.family, group: c.group,
        sowWeek: e.sowWeek, weeks: e.weeks, frostProb: e.frostProb, coverage: e.coverage,
        cropWaterMm: e.cropWaterMm, irrigationMm: e.irrigationMm, transition: scored.transitions[i].rule,
      };
    }),
    ...describe(kind, sequence, scored, ctx),
  };
}

/**
 * Main entry point.
 * input: { altitude, history: [campaign older..recent], irrigation: bool, priorities: [risk|water|soil|forage|preferred],
 *          (each campaign is a crop id, or a list of ids when several crops were sown together)
 *          preferred: [cropId], scenario: { rainPct, tempC } }
 * Returns the site calendar and three strategies: the current rotation, the best one and a water-saving one.
 */
export function recommend(climate, cropsData, input) {
  const scenario = input.scenario || {};
  const irrigation = Boolean(input.irrigation);
  const byId = Object.fromEntries(cropsData.crops.map((c) => [c.id, c]));
  // each campaign is a list of crops (several can be sown together); unknown ids are ignored
  const history = (input.history || [])
    .map((camp) => (Array.isArray(camp) ? camp : [camp]).map((id) => byId[id]).filter(Boolean))
    .filter((camp) => camp.length);
  const priorities = input.priorities || [];
  const preferred = input.preferred || [];

  const evals = {};
  for (const crop of cropsData.crops) {
    evals[crop.id] = bestSowing(climate, cropsData.meta, crop, input.altitude, irrigation, scenario);
  }
  const maxIrrigation = Math.max(...cropsData.crops.map((c) => evals[c.id].irrigationMm));
  const period = `${climate.years[0]}-${climate.years[climate.years.length - 1]}`;
  const ctx = { evals, history, priorities, preferred, maxIrrigation, irrigation, period };

  // Current rotation: keep sowing what the farmer has been sowing.
  const pattern = history.length ? history.map((camp) => camp[0]) : [byId.papa];
  const current = [0, 1, 2].map((i) => pattern[(history.length + i) % pattern.length] || pattern[0]);

  // Every three-year sequence of main crops (short vegetables fit between them and are listed in the catalogue).
  // Fallow is allowed once.
  const all = [];
  const crops = cropsData.crops;
  const minDays = cropsData.meta.main_crop_min_days || 0;
  // fruit trees, aromatic herbs and flowers live in the catalogue, not in a three-year field rotation
  const NOT_ROTATION = new Set(["tree", "herb", "flower"]);
  // crops that are rare in the valleys (local: false) enter a rotation only when the farmer prefers or already sows them
  const keepIds = new Set([...preferred, ...history.flat().map((c) => c.id)]);
  const eligible = crops.filter((c) => !NOT_ROTATION.has(c.group) && (c.local !== false || keepIds.has(c.id))
    && (c.group === "fallow" || c.perennial || c.cycle_days >= minDays));
  // to stay fast with a large catalogue, only the crops with the best climate for this plot are combined
  // (plus the ones the farmer prefers or already sows)
  const keep = new Set([...preferred, ...history.flat().map((c) => c.id)]);
  const ranked = eligible.filter((c) => c.group !== "fallow").sort((a, b) => evals[b.id].climateScore - evals[a.id].climateScore);
  const mainCrops = [...eligible.filter((c) => c.group === "fallow"), ...ranked.filter((c, i) => i < 22 || keep.has(c.id))];
  for (const a of mainCrops) for (const b of mainCrops) for (const c of mainCrops) {
    const seq = [a, b, c];
    if (seq.filter((x) => x.group === "fallow").length > 1) continue;
    all.push({ seq, scored: scoreSequence(seq, ctx) });
  }
  all.sort((x, y) => y.scored.total - x.scored.total);
  const key = (seq) => seq.map((c) => c.id).join(">");
  const currentKey = key(current);
  const best = all.find((x) => key(x.seq) !== currentKey);

  // Water-saving alternative: among the sequences close to the best score, the one that needs least irrigation,
  // and different from the best one in at least two of the three years.
  const irrigationOf = (seq) => seq.reduce((a, c) => a + evals[c.id].irrigationMm, 0);
  const differs = (s1, s2) => s1.filter((c, i) => c.id !== s2[i].id).length >= 2;
  const pool = all.filter((x) => x.scored.total >= best.scored.total - 12 && differs(x.seq, best.seq) && key(x.seq) !== currentKey
    && x.seq.every((c) => c.group !== "fallow") && x.scored.transitions.every((t) => t.score > 0));
  pool.sort((x, y) => irrigationOf(x.seq) - irrigationOf(y.seq));
  const water = pool[0] || all.find((x) => differs(x.seq, best.seq) && key(x.seq) !== currentKey);

  const calendar = weeklyStats(climate, input.altitude, scenario);
  return {
    site: {
      altitude: input.altitude,
      temperatureShift: Math.round(temperatureShift(climate, input.altitude, scenario) * 10) / 10,
      irrigation, period, scenario: { rainPct: scenario.rainPct || 0, tempC: scenario.tempC || 0 },
    },
    strategies: [
      pack("current", "Tu rotación actual", current, ctx),
      pack("best", "Rotación recomendada", best.seq, ctx),
      pack("water", "Rotación que ahorra agua", water.seq, ctx),
    ],
    calendar,
    crops: Object.fromEntries(crops.filter((c) => c.group !== "fallow").map((c) => {
      const e = evals[c.id];
      return [c.id, { sowWeek: e.sowWeek, weeks: e.weeks, frostProb: e.frostProb, coverage: e.coverage, cropWaterMm: e.cropWaterMm, irrigationMm: e.irrigationMm, climateScore: e.climateScore, meanTempC: e.meanTempC, warmth: e.warmth, weekly: e.weekly }];
    })),
    onset: climate.onset,
    sources: {
      climate: `${climate.meta.dataset}, ${climate.meta.period}, rejilla de ${climate.meta.grid.split(":")[0]}`,
      et0: climate.meta.et0_method,
    },
  };
}

/** Plain-language summary in at most three sentences, built only from numbers of the result (no language model). */
export function explain(result) {
  const best = result.strategies[1];
  const current = result.strategies[0];
  const first = best.years[0];
  const names = best.years.map((y) => y.name.toLowerCase()).join(", luego ");
  const s1 = `Para tu parcela conviene ${names}: suma ${best.score} puntos de 100 frente a ${current.score} de tu rotación actual.`;
  const s2 = first.group === "fallow"
    ? "El primer año deja descansar el suelo o siembra abono verde."
    : `${first.name} tiene helada dañina en ${pct(first.frostProb)} de las campañas y la lluvia cubre ${pct(first.coverage)} del agua que necesita (datos de NASA POWER, ${result.site.period}).`;
  const s3 = "Es una ayuda para decidir: confirma las fechas y los cultivos con un técnico de tu zona.";
  return [s1, s2, s3];
}
