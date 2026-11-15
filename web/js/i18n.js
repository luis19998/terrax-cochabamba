// Interface languages. Spanish is the text already in the HTML; Quechua (Bolivian runasimi) is a DRAFT that a
// speaker must review before it is shown as final (team rule). Any key without a translation falls back to Spanish.
const QU = {
  language: "Simi",
  mode: "Rikuy",
  modeSimple: "Pisilla",
  modeMedium: "Chawpi",
  modeAdvanced: "Tukuy",
  quNote: "Runasimiman t'ikrasqaqa manaraq runasimi rimaqkunawan qhawarisqachu (borrador). Pantasqata rikuspaqa willawayku.",
  heroTitle: "Jallp'aykita riqsiyku, aswan allin p'unchaykunata tarpuyku.",
  ctaStart: "Jallp'ayta qhawariy",
  ctaHow: "Imaynata llamk'an",
  heroFactLabel: "Chiqap rikuchiy, 9 Distrito",
  problemTitle: "Sasachakuy",
  whoTitle: "Pikunamantaq chayan",
  riskTitle: "Imataq chinkayta atin",
  saveTitle: "Imataq waqaychakun",
  howTitle: "Imaynata llamk'an",
  s1: "Jallp'aykita tariy",
  s2: "Willawayku",
  s3: "Yatiri X qhawarin",
  s4: "Yanapakuykunata chaskiy",
  step1Title: "Maypitaq jallp'ayki kachkan?",
  useGps: "GPS-wan tariy",
  search: "Maskhay",
  searchPh: "Llaqtaykita maskhay",
  mapHint: "Mapata llamiy jallp'aykita riqsichinaykipaq.",
  draw: "Linderokunata siq'iy",
  drawDone: "Siq'iyta tukuy",
  drawClear: "Siq'isqata pichay",
  layers: "Mapapi capakuna",
  plotName: "Jallp'aykiq sutin",
  step2Title: "Tarpuyniyki, jallp'ayki",
  lastCrop: "Qhipa kutipi imatataq tarpurqanki?",
  prevCrop: "Ñawpaqnin kutipiri?",
  soilType: "Imaynataq jallp'ayki?",
  labTitle: "Laboratorio willakuyniyuq kani",
  step3Title: "Yakuyki",
  waterSource: "Maymantataq yakuyki jamun?",
  irrigSystem: "Imaynatataq qarpanki?",
  waterAvail: "Hayk'a yakuyuqtaq kanki?",
  step4Title: "Imataq aswan munasqa qampaq?",
  step5Title: "Qhawariy, qhawarichiy",
  analyze: "Jallp'ayta qhawariy",
  back: "Kutiy",
  next: "Qhipanman",
  pdf: "PDF willakuyta urayachiy",
  edit: "Willakuyniyta t'ikray",
  askTiri: "Tirita tapuy",
  ask: "Tapuy",
  askPh: "Tapuyniykita qillqay",
  footer2: "Willakuyniykiqa kay aparatullapi waqaychakun.",
  modulesTitle: "Chakra jallp'akunata qhawarinapaq yachayniyuq plataforma",
  startTitle: "Qhawariyta qallariy",
  startSub: "Chakraykiq imaynan kasqanta riqsiy.",
  mod_ubicacion: "Jallp'a maypi kasqan",
  mod_suelo: "Jallp'ata qhawariy",
  mod_clima: "Paray ruphay, ñawpaqmanta willay",
  mod_relieve: "Urqukuna pampakuna",
  mod_agua: "Ch'aran, yaku",
  mod_predicciones: "Ñawpaqmanta yachay",
  tab_predicciones: "Ñawpaqmanta yachay",
  // tabs
  tab_general: "Imaynalla",
  tab_clima: "Paray ruphay",
  tab_suelo: "Jallp'a",
  tab_relieve: "Urqu pampa",
  tab_agua: "Yaku",
  tab_riesgos: "Sasachakuykuna",
  tab_cultivos: "Tarpuykuna",
  tab_plagas: "Khurukuna",
  tab_legal: "Kamachiykuna",
  tab_ganancias: "Qullqi",
  tab_fuentes: "Maymanta",
  // stepper
  st1: "Maypi", st2: "Tarpuy", st3: "Yaku", st4: "Munasqa", st5: "Qhawariy",
};

/** Crop names in Quechua (Cochabamba). Loans stay as people say them. Draft for a speaker to review. */
export const QU_CROPS = {
  "Papa": "Papa", "Oca": "Uqa", "Papalisa": "Ulluku", "Maíz": "Sara", "Trigo": "Triku", "Cebada": "Siwara",
  "Avena forrajera": "Avena", "Quinua": "Kinuwa", "Amaranto (achita)": "Achita", "Haba": "Jawas", "Arveja": "Alwirja",
  "Frijol (poroto)": "Purutu", "Tarwi (chocho)": "Tarwi", "Vicia (abono verde y forraje)": "Vicia", "Alfalfa": "Alfa",
  "Cebolla": "Siwulla", "Ajo": "Ajus", "Tomate": "Tomate", "Locoto": "Luqutu", "Ají": "Uchu", "Zanahoria": "Zanahoria",
  "Apio": "Apio", "Repollo": "Repollo", "Coliflor": "Coliflor", "Brócoli": "Brócoli", "Zapallo": "Zapallu",
  "Pepino": "Pepino", "Remolacha (betarraga)": "Remolacha", "Frutilla": "Frutilla", "Lechuga": "Lechuga",
  "Espinaca": "Espinaca", "Acelga": "Acelga", "Rábano": "Rábano", "Nabo": "Nabo", "Cilantro": "Kulantru",
  "Descanso o abono verde": "Samarichiy (abono verde)",
};

/** Texts that are already Quechua: the page translator leaves them as they are. */
export const QU_VALUES = new Set(Object.values(QU));

const TAB_ES = {
  tab_general: "Estado general", tab_predicciones: "Predicciones", tab_catalogo: "Todas las siembras", tab_clima: "Clima y pronóstico", tab_suelo: "Suelo", tab_relieve: "Relieve", tab_agua: "Agua",
  tab_riesgos: "Riesgos", tab_cultivos: "Qué sembrar", tab_plagas: "Plagas y cuidados", tab_legal: "Legal", tab_ganancias: "Ganancias",
  tab_fuentes: "Fuentes",
  st1: "Ubicación", st2: "Cultivo y suelo", st3: "Agua", st4: "Prioridades", st5: "Analizar",
};

const original = new Map();

/** Text for a key in the current language. */
export function t(key, lang) {
  if (lang === "qu" && QU[key]) return QU[key];
  return TAB_ES[key] || original.get(key) || key;
}

/** Applies the language to every element marked with data-i18n, data-i18n-placeholder or data-i18n-aria. */
export function applyLanguage(lang) {
  document.documentElement.lang = lang === "qu" ? "qu" : "es";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!original.has(key)) original.set(key, el.textContent);
    el.textContent = lang === "qu" && QU[key] ? QU[key] : original.get(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!original.has(`ph:${key}`)) original.set(`ph:${key}`, el.placeholder);
    el.placeholder = lang === "qu" && QU[key] ? QU[key] : original.get(`ph:${key}`);
  });
  const note = document.getElementById("qu-note");
  if (note) note.hidden = lang !== "qu";
}
