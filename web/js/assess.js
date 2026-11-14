// Plot assessment: turns the data of one plot into hazards, soil advice and crops to avoid.
// Pure functions shared by the browser and the server. Every rule is written out so it can be reviewed.
//
// Thresholds are general guidance, not local agronomy: slope classes follow the FAO Guidelines for Soil
// Description (2006); soil ranges are common agronomic reference values. A local technician must confirm them.

const pct = (x) => `${Math.round(x * 100)} %`;
const median = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const weekMonth = (week) => MONTHS[Math.min(11, Math.floor((week * 7 + 3) / 30.44))];

/** Elevation (m) of a point from the regular SRTM grid, by bilinear interpolation. Null outside the grid. */
export function elevationFromGrid(g, lat, lon) {
  if (lat < g.min_lat || lat > g.max_lat || lon < g.min_lon || lon > g.max_lon) return null;
  const fy = ((lat - g.min_lat) / (g.max_lat - g.min_lat)) * (g.n_lat - 1);
  const fx = ((lon - g.min_lon) / (g.max_lon - g.min_lon)) * (g.n_lon - 1);
  const y0 = Math.min(Math.floor(fy), g.n_lat - 2);
  const x0 = Math.min(Math.floor(fx), g.n_lon - 2);
  const ty = fy - y0;
  const tx = fx - x0;
  const at = (y, x) => g.elevation_m[y * g.n_lon + x];
  const v = [at(y0, x0), at(y0, x0 + 1), at(y0 + 1, x0), at(y0 + 1, x0 + 1)];
  if (v.some((e) => e === null)) return null;
  return Math.round(v[0] * (1 - tx) * (1 - ty) + v[1] * tx * (1 - ty) + v[2] * (1 - tx) * ty + v[3] * tx * ty);
}

export function slopeClass(percent) {
  if (percent < 2) return "plano";
  if (percent < 5) return "casi plano";
  if (percent < 15) return "inclinado";
  if (percent < 30) return "empinado";
  return "muy empinado";
}

/** Simplified texture class from sand, silt and clay percentages. */
export function textureClass(sand, silt, clay) {
  if ([sand, silt, clay].some((x) => x === null || x === undefined)) return null;
  if (clay >= 40) return "arcilloso";
  if (sand >= 70 && clay < 15) return "arenoso";
  if (clay >= 27) return "franco arcilloso";
  if (silt >= 50) return "franco limoso";
  if (sand >= 52) return "franco arenoso";
  return "franco";
}

const LEVELS = { 3: "alto", 2: "medio", 1: "bajo" };
const hazard = (id, level, title, text, action, source) => ({ id, level, levelLabel: LEVELS[level], title, text, action, source });

/**
 * plot:   { altitude, slope: {percent}, soil: {ph, sand, silt, clay, soc_gkg}, gamc: {drenaje}, forecast, conditions }
 * result: output of recommend() for the same plot
 */
export function assessPlot(plot, result, cropsData) {
  const hazards = [];
  const period = result.site.period;
  const weeks = result.calendar.weeks;
  const power = `NASA POWER, ${period}`;

  // --- Frost (climate) ---
  const peak = Math.max(...weeks.map((w) => w.pFrost));
  const frostWeeks = weeks.filter((w) => w.pFrost >= 0.2);
  const frostLevel = peak >= 0.5 ? 3 : peak >= 0.2 ? 2 : 1;
  hazards.push(hazard("frost", frostLevel, "Heladas",
    frostWeeks.length
      ? `Hiela (0 °C o menos) hasta en ${pct(peak)} de los años, sobre todo de ${weekMonth(frostWeeks[0].week)} a ${weekMonth(frostWeeks[frostWeeks.length - 1].week)}.`
      : `Los datos casi no registran heladas a esta altitud (como mucho ${pct(peak)} de los años en una semana). En el fondo del valle pueden quedar subestimadas.`,
    frostLevel > 1 ? "Sembrar para que el cultivo no esté tierno en esos meses, o elegir cultivos que aguanten frío." : "Vigilar el pronóstico en invierno.",
    `${power}, temperatura mínima ajustada por altitud`));

  // --- Water shortage (climate and hydrology) ---
  const coverage = median(Object.values(result.crops).map((c) => c.coverage));
  const dryLevel = coverage < 0.4 ? 3 : coverage < 0.7 ? 2 : 1;
  hazards.push(hazard("drought", result.site.irrigation ? Math.max(1, dryLevel - 1) : dryLevel, "Falta de agua",
    `La lluvia cubre cerca de ${pct(coverage)} del agua que piden los cultivos en su mejor fecha de siembra.`,
    result.site.irrigation ? "Con riego el riesgo baja: repartir el agua en las semanas de más demanda." : "Sin riego conviene ciclo corto, siembra con las primeras lluvias firmes y cobertura del suelo.",
    `${power}, lluvia y evapotranspiración FAO-56`));

  // --- Waterlogging and flooding (hydrology, topography) ---
  const flat = plot.slope && plot.slope.percent < 2;
  const drainage = Boolean(plot.gamc && plot.gamc.drenaje && !plot.gamc.drenaje.error);
  const clayey = plot.soil && plot.soil.clay !== null && plot.soil.clay >= 40;
  if (flat || drainage) {
    const level = (flat && drainage) || (flat && clayey) ? 3 : 2;
    const parts = [];
    if (flat) parts.push(`El terreno es plano (pendiente de ${plot.slope.percent.toFixed(1)} %)`);
    if (drainage) parts.push("la parcela cae dentro del área de drenaje e influencia que marca el GAMC");
    if (clayey) parts.push("el suelo es arcilloso y drena lento");
    hazards.push(hazard("waterlogging", level, "Anegamiento",
      `${parts.join(", ")}. Con lluvias fuertes (más de ${Math.round(result.calendar.heavyRainMm)} mm en una semana) el agua puede estancarse.`,
      "Mantener limpios canales y drenes, sembrar en camellones y no dejar el suelo desnudo en la época de lluvias.",
      [flat ? "NASA SRTM 30 m" : null, drainage ? "GAMC, capa Drenaje e Influencia" : null, power].filter(Boolean).join("; ")));
  }

  // --- Erosion and landslides (topography, geomorphology) ---
  if (plot.slope && plot.slope.percent >= 5) {
    const s = plot.slope.percent;
    const level = s >= 15 ? 3 : 2;
    const text = s >= 30
      ? `Pendiente muy empinada (${Math.round(s)} %): el suelo se pierde rápido y puede haber deslizamientos.`
      : `Pendiente de ${Math.round(s)} % (terreno ${slopeClass(s)}): la lluvia arrastra el suelo.`;
    const action = s >= 30 ? "No sembrar cultivos anuales sin terrazas; mejor frutales, forraje permanente o forestación."
      : s >= 15 ? "Terrazas o barreras vivas, surcos en contorno y suelo siempre cubierto."
        : "Surcos en contorno y rastrojo o cobertura entre campañas.";
    hazards.push(hazard("erosion", level, s >= 30 ? "Erosión y deslizamientos" : "Erosión", text, action, "NASA SRTM 30 m"));
  }

  // --- Short term: forecast ---
  const f = plot.forecast;
  if (f && f.tmin7 !== null && f.tmin7 <= 0) {
    hazards.push(hazard("frost_now", 3, "Helada en los próximos días", `Se prevé una mínima de ${f.tmin7.toFixed(1)} °C.`, "Proteger almácigos y cultivos tiernos; regar la tarde anterior ayuda.", "Open-Meteo"));
  }
  if (f && f.rain7 !== null && f.rain7 >= result.calendar.heavyRainMm) {
    hazards.push(hazard("rain_now", 3, "Lluvia fuerte esta semana", `Se prevén ${Math.round(f.rain7)} mm en 7 días.`, "Revisar canales y desagües antes de la lluvia.", "Open-Meteo"));
  }

  // --- Crops to avoid on this plot ---
  const byId = Object.fromEntries(cropsData.crops.map((c) => [c.id, c]));
  const avoid = [];
  for (const [id, e] of Object.entries(result.crops)) {
    const crop = byId[id];
    const reasons = [];
    if (e.frostProb >= 0.4) reasons.push(`helada dañina en ${pct(e.frostProb)} de las campañas`);
    if (!result.site.irrigation && e.coverage < 0.35) reasons.push(`sin riego, la lluvia cubre solo ${pct(e.coverage)} del agua que necesita`);
    if (plot.soil && plot.soil.ph !== null && crop.ph) {
      if (plot.soil.ph < crop.ph[0] - 0.3) reasons.push(`el suelo es más ácido (pH ${plot.soil.ph.toFixed(1)}) de lo que tolera`);
      if (plot.soil.ph > crop.ph[1] + 0.3) reasons.push(`el suelo es más alcalino (pH ${plot.soil.ph.toFixed(1)}) de lo que tolera`);
    }
    if (reasons.length) avoid.push({ crop: id, name: crop.name, reasons });
  }

  // --- Soil advice (only when there is soil data) ---
  const soilAdvice = [];
  if (plot.soil) {
    const s = plot.soil;
    if (s.ph !== null) {
      if (s.ph < 5.5) soilAdvice.push(`Suelo ácido (pH ${s.ph.toFixed(1)}): suele convenir cal agrícola. La cantidad la define un análisis de laboratorio.`);
      else if (s.ph > 7.5) soilAdvice.push(`Suelo alcalino (pH ${s.ph.toFixed(1)}): ayuda la materia orgánica bien descompuesta. El hierro y el fósforo quedan menos disponibles.`);
      else soilAdvice.push(`pH ${s.ph.toFixed(1)}: sirve para la mayoría de los cultivos.`);
    }
    if (s.soc_gkg !== null) {
      soilAdvice.push(s.soc_gkg < 10
        ? `Poca materia orgánica (${s.soc_gkg.toFixed(0)} g de carbono por kg): estiércol compostado, rastrojos incorporados o abono verde.`
        : `Materia orgánica aceptable (${s.soc_gkg.toFixed(0)} g de carbono por kg): mantenerla con rastrojos y compost.`);
    }
    if (s.texture === "arenoso" || s.texture === "franco arenoso") soilAdvice.push("Suelo suelto: guarda poca agua. Riegos cortos y frecuentes, y más materia orgánica.");
    if (s.texture === "arcilloso" || s.texture === "franco arcilloso") soilAdvice.push("Suelo pesado: drena lento. No labrar mojado y cuidar los desagües.");
    soilAdvice.push("Una leguminosa en la rotación (haba, arveja, alfalfa) aporta nitrógeno y baja el gasto en fertilizante.");
  }

  hazards.sort((a, b) => b.level - a.level);
  return { hazards, avoid, soilAdvice };
}
