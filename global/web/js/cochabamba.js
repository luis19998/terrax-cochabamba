// Cochabamba and Bolivia in depth: the agro-ecological zone of the plot, native crops, the Andean farming calendar,
// department figures with their source, the municipal (GAMC) context, salinity, geology and the Bolivian legal frame.
// Data compiled from the sources named next to each item; zones are drawn with approximate limits.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const inBolivia = (lat, lon) => lat > -22.95 && lat < -9.6 && lon > -69.7 && lon < -57.4;
export const inCochabambaDept = (lat, lon) => lat > -18.65 && lat < -15.6 && lon > -67.6 && lon < -64.2;

const ZONES = {
  tropico: {
    name: "Trópico de Cochabamba", where: "Chapare, Carrasco y la parte baja de Tiraque", alt: "200 a 1.200 m",
    crops: ["Plátano y banano: el producto agrícola de mayor volumen del departamento", "Cítricos: cerca del 70 % de los del departamento", "Piña, palmito, arroz, yuca, maracuyá y cacao"],
    risks: ["Inundaciones y desbordes de ríos en época de lluvias", "Sigatoka negra en banano y plátano", "Suelos lavados y ácidos por la lluvia intensa"],
  },
  andina: {
    name: "Zona andina y de puna", where: "Tapacarí, Morochata, Arque, Bolívar, Colomi y las alturas de Ayopaya y Tiraque", alt: "3.300 a 4.500 m",
    crops: ["Papa nativa, en rotación con oca, papalisa e isaño y luego cebada", "Cañahua, haba, tarwi y quinua", "Chuño y tunta: papa conservada con helada y sol"],
    risks: ["Heladas casi todo el año", "Granizo en plena campaña", "Erosión en laderas sin terrazas ni barreras"],
  },
  conosur: {
    name: "Cono Sur", where: "valles mesotérmicos (Mizque, Aiquile, Omereque, Pasorapa, Vila Vila) y zona alta (Totora, Pocona, Pojo, Alalay, Vacas)", alt: "1.800 a 3.300 m",
    crops: ["Maíz, papa y hortalizas", "Maní, ají y frutales como durazno y vid en los valles más cálidos", "Trigo y cebada en la zona alta"],
    risks: ["Sequía y heladas: en 2023 dañaron hasta el 98 % de la papa y las hortalizas en 13 municipios", "Lluvia muy irregular de un año a otro"],
  },
  valleAlto: {
    name: "Valle Alto", where: "Punata, Cliza, Tarata, San Benito, Arani, Tolata y Toko", alt: "2.600 a 3.300 m",
    crops: ["Maíz (también para chicha), papa y trigo", "Alfalfa y lechería", "Durazno y hortalizas"],
    risks: ["Sales y sodio en los suelos: un estudio de 84 muestras modeló el sodio intercambiable (PSI = 0,9725 · RAS + 1,5765)", "Sequía, granizo y heladas"],
  },
  valleBajo: {
    name: "Valle Bajo", where: "Quillacollo, Vinto, Sipe Sipe, Tiquipaya y Colcapirhua", alt: "2.400 a 3.000 m",
    crops: ["Hortalizas, maíz y papa (también mishka, adelantada con riego)", "Alfalfa y lechería", "Flores y frutales"],
    risks: ["Torrenteras del Tunari: lluvias intensas y breves que causan crecidas violentas", "Loteamientos sobre tierras agrícolas y zonas de recarga de acuíferos", "Granizo"],
  },
  valleCentral: {
    name: "Valle Central", where: "Cercado (ciudad de Cochabamba) y Sacaba", alt: "2.500 a 2.800 m",
    crops: ["Flores: el valle central y metropolitano produce las flores del departamento", "Hortalizas y forrajes", "Maíz y lechería en las zonas periurbanas"],
    risks: ["Crecimiento urbano sobre tierras de cultivo", "Desbordes de torrenteras y del río Rocha", "Agua escasa y disputada entre ciudad y riego"],
  },
};

/** Approximate agro-ecological zone of a point in the department of Cochabamba. */
export function cochabambaZone(lat, lon, alt) {
  if (!inCochabambaDept(lat, lon)) return null;
  if (alt < 1200) return { id: "tropico", ...ZONES.tropico };
  if (alt >= 3300) return { id: "andina", ...ZONES.andina };
  if (lat < -17.6 && lon > -65.75) return { id: "conosur", ...ZONES.conosur };
  if (lon > -66.05 && lon < -65.55 && lat < -17.35 && lat > -17.8) return { id: "valleAlto", ...ZONES.valleAlto };
  if (lon <= -66.19 && lat > -17.6 && lat < -17.2) return { id: "valleBajo", ...ZONES.valleBajo };
  if (lon > -66.19 && lon <= -66.0 && lat > -17.6 && lat < -17.2) return { id: "valleCentral", ...ZONES.valleCentral };
  return null;
}

/** Big regions of Bolivia for points outside Cochabamba. */
export function boliviaRegion(lat, lon, alt) {
  if (alt >= 3500) return { name: "Altiplano", text: "Meseta alta entre las cordilleras: papa, quinua (la Quinua Real del altiplano sur), cañahua, cebada y camélidos. Heladas casi todas las noches del invierno." };
  if (alt >= 1500) return { name: "Valles interandinos", text: "Valles templados entre montañas: maíz, papa, trigo, frutales, hortalizas y vid. Riesgo de sequía, granizo y heladas." };
  if (lat > -16.5 && lon < -66.5 && alt >= 600) return { name: "Yungas", text: "Laderas húmedas que bajan a la Amazonía: café, cítricos, banano, cacao y coca. Suelos en pendiente que se erosionan fácil." };
  if (lat < -19) return { name: "Chaco", text: "Llanura seca y caliente del sudeste: maíz, maní, sorgo, ganado. Sequías largas." };
  return { name: "Llanos y Amazonía", text: "Tierras bajas: soya, arroz, caña de azúcar, girasol, ganado; castaña en el norte. Inundaciones y quemas." };
}

export const NATIVE_CROPS = [
  { id: "papa", name: "Papa nativa", text: "Los Andes de Bolivia y Perú son su centro de origen. La «mishka» se siembra adelantada con riego (julio a septiembre) y la siembra grande con las lluvias (octubre a diciembre). Con chuño y tunta se guarda por años." },
  { id: "quinua", name: "Quinua", text: "Grano andino con proteína completa. La «Quinua Real» crece en el altiplano sur, cerca del Salar de Uyuni. Resiste sequía, frío y algo de sal." },
  { id: "canahua", name: "Cañahua", text: "Pariente de la quinua que aguanta heladas fuertes. Se cultiva en altura, como en Tapacarí, donde el cambio del clima ya la afecta." },
  { id: "tarwi", name: "Tarwi", text: "Leguminosa andina con mucha proteína y aceite; fija nitrógeno y mejora el suelo. El grano se desamarga en agua antes de comerlo." },
  { id: "oca", name: "Oca, papalisa e isaño", text: "Tubérculos andinos que siguen a la papa en la rotación de altura. El isaño repele plagas del suelo." },
  { id: "amaranto", name: "Amaranto (coime)", text: "Grano andino resistente a la sequía, rico en proteína y hierro." },
  { id: "maiz", name: "Maíz de los valles", text: "Base de la comida y de la chicha del Valle Alto. En Vinto, el Centro de Investigaciones Fitoecogenéticas de Pairumani mejora variedades de maíz y frijol." },
  { id: "locoto", name: "Locoto", text: "Ají de altura de carne gruesa y semillas negras, base de la llajua cochabambina." },
  { id: "durazno", name: "Durazno", text: "Fruta de los valles; los valles alto y bajo aportan la mayor parte de la fruta de clima templado del departamento." },
  { id: "achojcha", name: "Achojcha", text: "Cucurbitácea andina de fruto hueco que se rellena; trepadora de huerto familiar." },
];

export const CALENDAR = [
  { m: 0, work: "Deshierbes y aporques; cosecha de durazno temprano en los valles.", fest: "" },
  { m: 1, work: "Primeras cosechas de choclo y papa de siembra grande.", fest: "Anata o Carnaval: ch'alla a la chacra y a la casa." },
  { m: 2, work: "Cosecha de choclo, haba verde y papa; fin de las lluvias fuertes.", fest: "" },
  { m: 3, work: "Cosecha de papa, maíz seco y trigo; secado de granos.", fest: "" },
  { m: 4, work: "Cosecha y almacenamiento en pirwas; trillas de trigo y cebada.", fest: "" },
  { m: 5, work: "Heladas: tiempo de hacer chuño y tunta en las alturas.", fest: "21 de junio: Año Nuevo Andino Amazónico (Willkakuti)." },
  { m: 6, work: "Preparación de suelos y abonado; siembra mishka con riego.", fest: "" },
  { m: 7, work: "Siembra mishka de papa y hortalizas con riego.", fest: "1 de agosto: mes de la Pachamama. 15 de agosto: Urkupiña, Quillacollo." },
  { m: 8, work: "Riegos; últimas siembras mishka; se alistan semillas para la siembra grande.", fest: "14 de septiembre: día de Cochabamba." },
  { m: 9, work: "Inicio de la siembra grande con las primeras lluvias firmes.", fest: "" },
  { m: 10, work: "Siembra grande de papa, maíz y haba.", fest: "1 y 2 de noviembre: Todos Santos." },
  { m: 11, work: "Fin de las siembras; primeros deshierbes.", fest: "" },
];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const DEPT_FIGURES = [
  { value: "1.531.932 t", text: "de alimentos produjo Cochabamba en la campaña 2023-2024; los frutales aportaron 725.175 t, con el plátano a la cabeza.", source: "INE y Cámara Agropecuaria de Cochabamba, vía eju.tv" },
  { value: "77 %", text: "de la fruta del departamento sale de los valles alto y bajo; el trópico aporta el 70 % de los cítricos (88.604 t).", source: "Gobernación de Cochabamba, vía Portalfrutícola" },
  { value: "100 %", text: "de las flores del departamento se producen en el valle central y metropolitano.", source: "Gobernación de Cochabamba, vía Portalfrutícola" },
  { value: "10.000 ha", text: "de cultivos se perdieron con la sequía de 2023, que afectó a la mitad de los municipios.", source: "Los Tiempos, 9 de febrero de 2023" },
  { value: "20.000 ha", text: "afectadas por granizadas, sequías e inundaciones en la campaña 2025-2026.", source: "Los Tiempos, 8 de abril de 2026" },
  { value: "2026", text: "Censo Agropecuario del INE: actualiza unidades productivas, sistemas de producción y tecnología del campo.", source: "INE Bolivia" },
];

export const GEOLOGY_CBBA = {
  title: "Geología de Cochabamba",
  items: [
    "La Cordillera del Tunari y los cerros que rodean el valle son rocas sedimentarias antiguas del Paleozoico (Ordovícico a Devónico): cuarcitas, lutitas y pizarras, como las formaciones Anzaldo y Amutara de la Cordillera Oriental.",
    "El fondo del valle está relleno de sedimentos recientes que bajan del Tunari por ríos y torrenteras: abanicos de grava y arena junto al cerro y suelos más finos y arcillosos hacia el centro y el río Rocha.",
    "Al meteorizarse, las lutitas y pizarras dan arcillas (illita y clorita) y micas; las cuarcitas, arena de cuarzo. Por eso los suelos al pie del Tunari son pedregosos y sueltos, y los del centro del valle, más pesados.",
    "En el Valle Alto hay suelos con sales y sodio: el agua se evapora y deja las sales arriba.",
  ],
  mining: "Bolivia es país minero: estaño, plata, zinc y plomo en el occidente, y litio en el Salar de Uyuni. En Cochabamba hay wolframio en Kami (Ayopaya). Si tu agua de riego viene de una zona minera, conviene analizar metales pesados.",
  sources: "IRD (región de Cochabamba, serie paleozoica); estudios de la Cordillera Oriental; estudio de salinidad del Valle Alto (2020).",
};

export const LEGAL_BO = [
  { law: "Ley 1715 (1996) y Ley 3545 (2006)", what: "Reforma agraria y saneamiento de tierras (INRA). La pequeña propiedad agraria es patrimonio familiar, inembargable y no paga impuesto a la propiedad agraria (art. 41).", act: "Si tu terreno es rural y no está saneado, consulta al INRA." },
  { law: "Ley 144 (2011), Revolución Productiva Comunitaria Agropecuaria", what: "Creó el Seguro Agrario Universal «Pachamama» y apoyos para la agricultura familiar y comunitaria.", act: "Pregunta en tu alcaldía por los programas vigentes." },
  { law: "Seguro Agrario MINKA (D.S. 4591, 2021; INSA)", what: "Cubre a la agricultura familiar por heladas, inundaciones, sequías y granizo en los municipios elegidos cada año.", act: "Inscríbete con una declaración jurada en tu municipio antes de la campaña." },
  { law: "Ley 2878 (2004), de Riego", what: "Reconoce y registra los derechos de agua para riego, también los de usos y costumbres.", act: "Registra tu derecho de agua en el SENARI." },
  { law: "Ley 300 (2012) y Ley 071 (2010), Madre Tierra", what: "Producción que no dañe suelos, agua ni bosques; derechos de la Madre Tierra.", act: "Evita quemas y no rellenes cauces ni humedales." },
  { law: "Ley 338 (2013), OECAS y OECOM", what: "Reconoce a las organizaciones económicas campesinas y comunitarias para la agricultura familiar sustentable.", act: "Organizarte en una OECA abre acceso a compras y apoyo." },
  { law: "Ley 3525 (2006), producción ecológica", what: "Regula la producción orgánica y su certificación, incluido el Sistema Participativo de Garantía (SPG).", act: "Para vender como ecológico, certifica con un SPG o una certificadora." },
  { law: "Ley 1333 (1992), Medio Ambiente, y SENASAG", what: "Control de contaminación y uso de plaguicidas registrados; sanidad vegetal.", act: "Usa solo productos registrados en SENASAG y respeta los tiempos de carencia." },
];

const fig = (x) => `<div class="fact fact--fig"><b>${esc(x.value)}</b><span>${esc(x.text)}</span><small>${esc(x.source)}</small></div>`;

/** The calendar as twelve months with today marked. */
function calendarHtml(month) {
  return `<div class="andean-cal">${CALENDAR.map((c) => `<div class="andean-cal__m${c.m === month ? " is-now" : ""}" style="--i:${c.m}">
      <b>${MONTHS[c.m]}</b><span>${esc(c.work)}</span>${c.fest ? `<em>${esc(c.fest)}</em>` : ""}</div>`).join("")}</div>`;
}

/** The whole "Cochabamba y Bolivia" tab. ctx: { site, gamc, images, simple, coverage, low } */
export function renderBoliviaTab(ctx) {
  const { site, images, simple } = ctx;
  const bo = inBolivia(site.lat, site.lon);
  if (!bo) {
    return `<h2>Cochabamba y Bolivia</h2><p>Este apartado es para terrenos en Bolivia. Tu punto está fuera del país: el resto del análisis sí vale.</p>
      <p class="hint">Yatiri X nació en Cochabamba para el NASA Space Apps 2026. Prueba con un lugar de Bolivia para ver zonas, cultivos nativos, calendario andino y leyes.</p>`;
  }
  const zone = cochabambaZone(site.lat, site.lon, site.altitude);
  const region = zone ? null : boliviaRegion(site.lat, site.lon, site.altitude);
  const month = new Date().getMonth();
  const salinityRisk = zone && (zone.id === "valleAlto" || ((zone.id === "conosur" || zone.id === "valleBajo") && ctx.coverage < 0.45));
  const photo = (id) => images && images.crops && images.crops[id] ? `<img src="${esc(images.crops[id].thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `
    <h2>${zone ? "Tu terreno en Cochabamba" : "Tu terreno en Bolivia"}</h2>
    <div class="zone-hero${zone ? ` zone-hero--${zone.id}` : ""}">
      <div class="flags flags--inline" aria-hidden="true">${zone ? '<span class="flag flag--cbba" data-flag></span>' : ""}<span class="flag flag--bolivia" data-flag></span></div>
      <div>
        <p class="eyebrow-small">${zone ? "Zona agroecológica (límites aproximados)" : "Región de Bolivia"}</p>
        <p class="zone-hero__name">${esc(zone ? zone.name : region.name)}</p>
        <p>${zone ? `${esc(zone.where)} · ${esc(zone.alt)}` : esc(region.text)}</p>
      </div>
    </div>
    ${zone ? `<div class="zone-cols">
      <section><h3>Qué se cultiva</h3><ul>${zone.crops.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>
      <section><h3>Riesgos de la zona</h3><ul>${zone.risks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>
    </div>` : ""}
    ${ctx.gamcHtml || ""}
    ${salinityRisk ? `<h3>Sales en el suelo</h3>
      <p>${simple ? "En tu zona la tierra puede tener sal. Mira si hay costras blancas o plantas quemadas en los bordes de las hojas." : "En esta zona hay suelos con sales y sodio. Señales: costras blancas al secarse, agua que no entra, hojas quemadas en los bordes. Pide un análisis de conductividad eléctrica (CE) y de la relación de adsorción de sodio (RAS)."}</p>
      <div class="ras-calc mid-up"><label>RAS de tu análisis <input type="number" id="ras-in" min="0" max="80" step="0.5" inputmode="decimal" placeholder="por ejemplo 8"></label><output id="ras-out">Escribe la RAS para estimar el sodio intercambiable.</output></div>` : ""}
    <h3>Cifras del departamento</h3>
    <div class="facts facts--figs">${DEPT_FIGURES.map(fig).join("")}</div>
    <h3>Cultivos nativos y de los valles</h3>
    <div class="native-grid">${NATIVE_CROPS.map((c, i) => `<article class="native" style="--i:${i}">${photo(c.id)}<div><b>${esc(c.name)}</b><p>${esc(c.text)}</p></div></article>`).join("")}</div>
    <h3>Calendario agrícola andino</h3>
    <p class="hint">${simple ? "Lo que se hace en el campo cada mes. El mes de hoy brilla." : "Trabajos del campo y fiestas de cada mes en los valles y alturas de Cochabamba; el mes actual está resaltado. Las fechas cambian con la lluvia de cada año: el análisis del clima te dice cuándo."}</p>
    ${calendarHtml(month)}
    <p class="source">Fuentes: Los Tiempos; eju.tv; Portalfrutícola (estudio de la Gobernación); INE Bolivia; Helvetas (rotación de altura en Morochata y Colomi); AGRUCO (cañahua en Tapacarí); estudio de salinidad del Valle Alto (2020). Los límites de zona son aproximados.</p>`;
}

/** Bolivian legal frame, as cards. */
export function legalBoliviaHtml(simple) {
  return `<h3>Leyes de Bolivia que tocan tu chacra</h3>
    <div class="law-grid">${LEGAL_BO.map((l, i) => `<article class="law" style="--i:${i}"><b>${esc(l.law)}</b><p>${esc(simple ? l.act : l.what)}</p>${simple ? "" : `<p class="law__act">${esc(l.act)}</p>`}</article>`).join("")}</div>
    <h3>Pasos para tener tu terreno en regla</h3>
    <ol class="steps-list">
      <li>Pide el folio real de tu terreno en Derechos Reales (DD.RR.).</li>
      <li>Si es rural y no está saneado, consulta al INRA.</li>
      <li>Registra tu derecho de agua para riego en el SENARI.</li>
      <li>Inscríbete en el seguro agrario de tu municipio antes de sembrar.</li>
      <li>Si vendes como ecológico, certifica con un SPG.</li>
    </ol>
    <p class="source">Leyes 1715, 3545, 144, 2878, 300, 071, 338, 3525 y 1333; D.S. 4591. Resumen orientativo: confirma en la Gaceta Oficial de Bolivia o con un abogado antes de decidir.</p>`;
}

/** PSI from RAS with the Valle Alto model, and what it means. */
export function psiFromRas(ras) {
  const psi = 0.9725 * ras + 1.5765;
  return { psi, sodic: psi >= 15, text: psi >= 15 ? "suelo sódico: el agua no entra bien y las plantas sufren. Se corrige con yeso agrícola y lavados con buena agua." : psi >= 7 ? "sodio moderado: vigila, usa abono orgánico y riega con agua de buena calidad." : "sodio bajo: sin problema por ahora." };
}
