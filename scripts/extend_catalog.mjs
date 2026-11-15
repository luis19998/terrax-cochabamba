// Second extension of the catalogue (November 2026): more crops (Andean roots, grains, legumes, forage, vegetables,
// herbs, fruit trees, flowers), a shared library of pests and diseases assigned to every crop, more invasive species
// and more home remedies. Idempotent: running it again does not duplicate anything.
//   node scripts/extend_catalog.mjs
// Values are general reference values (FAO-56 Tables 11 and 12 for cycle and Kc, FAO ECOCROP for pH and frost,
// CIP, PROINPA, INIAF and SENASAG material for pests). Everything stays marked as needing validation.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cropsPath = join(root, "web/data/crops.json");
const knowPath = join(root, "web/data/knowledge.json");
const cropsData = JSON.parse(readFileSync(cropsPath, "utf8"));
const knowledge = JSON.parse(readFileSync(knowPath, "utf8"));

// id, name, scientific, family, type, group, cycle_days, frost_damage_c, kc [ini, mid, end], ph, extra
const C = (id, name, scientific, family, type, group, cycle_days, frost_damage_c, kc, ph, extra = {}) => ({
  id, name, scientific, family, type, cycle_days, frost_damage_c, kc, ph, fixes_nitrogen: false, forage: false, group, ...extra,
});
const P = { perennial: true };
const N = { fixes_nitrogen: true };
const F = { forage: true };
const NEW_CROPS = [
  // Andean roots and tubers
  C("isano", "Isaño (mashua)", "Tropaeolum tuberosum", "Tropeoláceas", "Tubérculo", "tuber", 210, -2, [0.5, 1.1, 0.75], [5, 7]),
  C("yacon", "Yacón", "Smallanthus sonchifolius", "Asteráceas", "Tubérculo", "tuber", 240, -1, [0.5, 1.05, 0.8], [5.5, 7.5]),
  C("racacha", "Racacha (arracacha)", "Arracacia xanthorrhiza", "Apiáceas", "Tubérculo", "tuber", 300, -1, [0.5, 1.05, 0.8], [5.5, 6.5]),
  C("camote", "Camote", "Ipomoea batatas", "Convolvuláceas", "Tubérculo", "tuber", 150, 0, [0.5, 1.15, 0.65], [5.5, 6.5]),
  // grains
  C("centeno", "Centeno", "Secale cereale", "Gramíneas", "Grano", "cereal", 150, -6, [0.4, 1.15, 0.25], [5, 7.5]),
  C("triticale", "Triticale", "× Triticosecale", "Gramíneas", "Grano", "cereal", 150, -5, [0.4, 1.15, 0.25], [5.5, 7.5]),
  C("sorgo", "Sorgo", "Sorghum bicolor", "Gramíneas", "Grano", "cereal", 130, 0, [0.3, 1.0, 0.55], [5.5, 7.5]),
  C("canahua", "Cañahua", "Chenopodium pallidicaule", "Amarantáceas", "Grano", "grain", 150, -4, [0.5, 1.0, 0.7], [5, 8]),
  // legumes
  C("lenteja", "Lenteja", "Lens culinaris", "Leguminosas", "Leguminosa", "legume", 120, -3, [0.4, 1.1, 0.3], [6, 8], N),
  C("garbanzo", "Garbanzo", "Cicer arietinum", "Leguminosas", "Leguminosa", "legume", 130, -2, [0.4, 1.0, 0.35], [6, 8], N),
  C("mani", "Maní", "Arachis hypogaea", "Leguminosas", "Leguminosa", "legume", 140, 0, [0.4, 1.15, 0.6], [5.5, 7], N),
  C("vainita", "Vainita (poroto verde)", "Phaseolus vulgaris", "Leguminosas", "Hortaliza de ciclo corto", "legume", 75, 0, [0.5, 1.05, 0.9], [6, 7.5], N),
  C("trebol", "Trébol blanco", "Trifolium repens", "Leguminosas", "Forraje", "legume", 364, -6, [0.4, 0.9, 0.85], [6, 7], { ...N, ...F, ...P }),
  // forage
  C("ryegrass", "Ryegrass (ballica)", "Lolium multiflorum", "Gramíneas", "Forraje", "cereal", 240, -6, [0.9, 1.0, 0.95], [5.5, 7.5], F),
  C("festuca", "Festuca alta", "Festuca arundinacea", "Gramíneas", "Forraje", "cereal", 364, -8, [0.9, 0.95, 0.95], [5.5, 8], { ...F, ...P }),
  C("maiz_forrajero", "Maíz forrajero (ensilaje)", "Zea mays", "Gramíneas", "Forraje", "cereal", 120, 0, [0.3, 1.15, 0.6], [5.5, 7.5], F),
  // vegetables
  C("pimenton", "Pimentón (morrón)", "Capsicum annuum", "Solanáceas", "Hortaliza", "vegetable", 150, 0, [0.6, 1.05, 0.9], [5.5, 7]),
  C("berenjena", "Berenjena", "Solanum melongena", "Solanáceas", "Hortaliza", "vegetable", 140, 0, [0.6, 1.05, 0.9], [5.5, 7]),
  C("zapallito", "Zapallito (zucchini)", "Cucurbita pepo", "Cucurbitáceas", "Hortaliza de ciclo corto", "vegetable", 85, 0, [0.5, 0.95, 0.75], [6, 7.5]),
  C("sandia", "Sandía", "Citrullus lanatus", "Cucurbitáceas", "Fruta", "vegetable", 110, 0, [0.4, 1.0, 0.75], [5.5, 7]),
  C("melon", "Melón", "Cucumis melo", "Cucurbitáceas", "Fruta", "vegetable", 110, 0, [0.5, 1.05, 0.75], [6, 7.5]),
  C("puerro", "Puerro", "Allium ampeloprasum", "Amarilidáceas", "Hortaliza", "vegetable", 150, -5, [0.7, 1.0, 1.0], [6, 7.5]),
  C("cebollin", "Cebollín (cebolla de verdeo)", "Allium fistulosum", "Amarilidáceas", "Hortaliza de ciclo corto", "vegetable", 70, -5, [0.7, 1.0, 1.0], [6, 7.5]),
  C("perejil", "Perejil", "Petroselinum crispum", "Apiáceas", "Hortaliza de ciclo corto", "vegetable", 80, -5, [0.7, 1.0, 0.95], [5.5, 7]),
  C("rucula", "Rúcula", "Eruca vesicaria", "Brasicáceas", "Hortaliza de ciclo corto", "vegetable", 40, -3, [0.7, 1.0, 0.95], [6, 7.5]),
  C("kale", "Col rizada (kale)", "Brassica oleracea var. sabellica", "Brasicáceas", "Hortaliza", "vegetable", 90, -8, [0.7, 1.05, 0.95], [6, 7.5]),
  C("pakchoi", "Col china (pak choi)", "Brassica rapa subsp. chinensis", "Brasicáceas", "Hortaliza de ciclo corto", "vegetable", 50, -3, [0.7, 1.05, 0.95], [6, 7.5]),
  C("vainita_arbustiva", "Arveja china", "Pisum sativum var. macrocarpon", "Leguminosas", "Hortaliza de ciclo corto", "legume", 70, -3, [0.5, 1.15, 1.1], [6, 7.5], N),
  C("esparrago", "Espárrago", "Asparagus officinalis", "Asparagáceas", "Hortaliza", "vegetable", 364, -3, [0.5, 0.95, 0.3], [6.5, 7.5], P),
  C("alcachofa", "Alcachofa", "Cynara cardunculus var. scolymus", "Asteráceas", "Hortaliza", "vegetable", 364, -3, [0.5, 1.0, 0.95], [6.5, 7.5], P),
  // herbs (catalogue only, not in three-year rotations)
  C("quirquina", "Quirquiña", "Porophyllum ruderale", "Asteráceas", "Aromática", "herb", 90, 0, [0.6, 0.95, 0.85], [5.5, 7.5]),
  C("huacataya", "Huacataya", "Tagetes minuta", "Asteráceas", "Aromática", "herb", 120, 0, [0.6, 0.95, 0.85], [5.5, 7.5]),
  C("oregano", "Orégano", "Origanum vulgare", "Lamiáceas", "Aromática", "herb", 364, -10, [0.6, 0.9, 0.85], [6, 8], P),
  C("manzanilla", "Manzanilla", "Matricaria chamomilla", "Asteráceas", "Aromática", "herb", 100, -3, [0.5, 0.9, 0.8], [6, 7.5]),
  C("hierbabuena", "Hierbabuena", "Mentha spicata", "Lamiáceas", "Aromática", "herb", 364, -5, [0.6, 1.15, 1.1], [6, 7.5], P),
  C("muna", "Muña", "Minthostachys mollis", "Lamiáceas", "Aromática", "herb", 364, -5, [0.5, 0.9, 0.85], [5.5, 7.5], P),
  // fruit trees and shrubs (catalogue only)
  C("durazno", "Durazno", "Prunus persica", "Rosáceas", "Frutal", "tree", 364, -2, [0.55, 0.9, 0.65], [6, 7.5], P),
  C("manzano", "Manzano", "Malus domestica", "Rosáceas", "Frutal", "tree", 364, -2, [0.45, 0.95, 0.7], [6, 7.5], P),
  C("peral", "Peral", "Pyrus communis", "Rosáceas", "Frutal", "tree", 364, -2, [0.45, 0.95, 0.7], [6, 7.5], P),
  C("ciruelo", "Ciruelo", "Prunus domestica", "Rosáceas", "Frutal", "tree", 364, -2, [0.55, 0.9, 0.65], [6, 7.5], P),
  C("membrillo", "Membrillo", "Cydonia oblonga", "Rosáceas", "Frutal", "tree", 364, -3, [0.45, 0.95, 0.7], [6, 7.5], P),
  C("vid", "Vid (uva)", "Vitis vinifera", "Vitáceas", "Frutal", "tree", 364, -1, [0.3, 0.7, 0.45], [6, 7.5], P),
  C("higuera", "Higuera", "Ficus carica", "Moráceas", "Frutal", "tree", 364, -2, [0.5, 0.8, 0.6], [6, 8], P),
  C("nogal", "Nogal", "Juglans regia", "Juglandáceas", "Frutal", "tree", 364, -2, [0.5, 1.1, 0.65], [6, 7.5], P),
  C("palto", "Palto (palta)", "Persea americana", "Lauráceas", "Frutal", "tree", 364, -1, [0.6, 0.85, 0.75], [5.5, 7], P),
  C("chirimoya", "Chirimoya", "Annona cherimola", "Anonáceas", "Frutal", "tree", 364, -1, [0.5, 0.8, 0.7], [6, 7], P),
  C("tuna", "Tuna", "Opuntia ficus-indica", "Cactáceas", "Frutal", "tree", 364, -5, [0.3, 0.5, 0.4], [6, 8], P),
  C("tumbo", "Tumbo", "Passiflora tripartita var. mollissima", "Pasifloráceas", "Frutal", "tree", 364, -2, [0.5, 0.9, 0.8], [5.5, 7], P),
  C("aguaymanto", "Aguaymanto (capulí)", "Physalis peruviana", "Solanáceas", "Frutal", "tree", 364, -1, [0.5, 1.0, 0.8], [5.5, 7.5], P),
  // flowers (catalogue only)
  C("clavel", "Clavel", "Dianthus caryophyllus", "Cariofiláceas", "Flor", "flower", 180, -2, [0.6, 1.0, 0.9], [6, 7]),
  C("gladiolo", "Gladiolo", "Gladiolus × hortulanus", "Iridáceas", "Flor", "flower", 100, 0, [0.5, 1.0, 0.8], [6, 7]),
];

const FERT = {
  isano: "Poco exigente: crece en suelos pobres. Estiércol descompuesto al surco; se suele sembrar junto a papa y oca.",
  yacon: "Pide suelo suelto y profundo con materia orgánica; compost antes de plantar y potasio para las raíces.",
  racacha: "Suelo suelto, profundo y con buen drenaje; estiércol descompuesto y potasio. No tolera encharcamiento.",
  camote: "Más potasio que nitrógeno: el exceso de nitrógeno da mucha hoja y poca raíz.",
  centeno: "Poco exigente; aguanta suelos pobres y ácidos. Nitrógeno moderado.",
  triticale: "Nitrógeno moderado, como el trigo; aprovecha el que deja una leguminosa.",
  sorgo: "Nitrógeno moderado; tolera la sequía mejor que el maíz.",
  canahua: "Muy poco exigente; aguanta frío, sequía y suelos pobres. Estiércol si hay.",
  lenteja: "Fija su propio nitrógeno; agradece fósforo. No necesita abono nitrogenado.",
  garbanzo: "Fija nitrógeno; agradece fósforo. Suelo con buen drenaje.",
  mani: "Fija nitrógeno; necesita calcio para llenar las vainas (yeso agrícola en floración).",
  vainita: "Fija nitrógeno; compost y fósforo. Tutorar las variedades de enrame.",
  trebol: "Fija nitrógeno; mejora el suelo y el forraje cuando se siembra con gramíneas.",
  ryegrass: "Pide nitrógeno después de cada corte; ideal en mezcla con trébol.",
  festuca: "Nitrógeno después de los cortes; aguanta sequía y suelos pesados.",
  maiz_forrajero: "Mucho nitrógeno y estiércol; rinde mejor después de una leguminosa.",
  pimenton: "Pide materia orgánica, potasio y calcio para frutos sanos.",
  berenjena: "Materia orgánica y potasio; mucho sol y calor.",
  zapallito: "Compost abundante en el hoyo; riego parejo.",
  sandia: "Materia orgánica y potasio; suelo arenoso y cálido.",
  melon: "Materia orgánica y potasio; poco nitrógeno al final para frutos más dulces.",
  puerro: "Nitrógeno moderado y materia orgánica; aporcar para blanquear el tallo.",
  cebollin: "Compost; nitrógeno moderado después de cada corte.",
  perejil: "Compost; nitrógeno moderado.",
  rucula: "Poco exigente; compost ligero.",
  kale: "Nitrógeno y compost; aguanta heladas.",
  pakchoi: "Nitrógeno y compost; crece rápido.",
  vainita_arbustiva: "Fija nitrógeno; fósforo y compost ligero.",
  esparrago: "Mucha materia orgánica antes de plantar; dura 10 o más años en el mismo lugar.",
  alcachofa: "Mucha materia orgánica y potasio; dura varios años.",
  quirquina: "Poco exigente; compost ligero.",
  huacataya: "Poco exigente; crece casi sola. Sirve para alejar plagas del suelo.",
  oregano: "Poco exigente; no abonar en exceso para no perder aroma.",
  manzanilla: "Poco exigente; compost ligero.",
  hierbabuena: "Compost y riego parejo; se extiende rápido.",
  muna: "Poco exigente; sus ramas protegen la papa guardada de la polilla.",
  durazno: "Estiércol descompuesto al pie cada invierno; nitrógeno moderado en primavera.",
  manzano: "Estiércol al pie en invierno; potasio y calcio para frutos de calidad.",
  peral: "Estiércol al pie en invierno; nitrógeno moderado.",
  ciruelo: "Estiércol al pie en invierno; nitrógeno moderado.",
  membrillo: "Poco exigente; estiércol al pie en invierno.",
  vid: "Poco nitrógeno; potasio y materia orgánica. Podar cada invierno.",
  higuera: "Poco exigente; aguanta suelos pobres y calcáreos.",
  nogal: "Suelo profundo; estiércol al pie y nitrógeno moderado.",
  palto: "Suelo suelto con muy buen drenaje; materia orgánica y zinc. No tolera encharcamiento.",
  chirimoya: "Materia orgánica y potasio; zona sin heladas.",
  tuna: "Muy poco exigente; aguanta sequía y suelos pobres.",
  tumbo: "Materia orgánica; necesita espaldera o tutor.",
  aguaymanto: "Compost moderado; el exceso de nitrógeno da mucha hoja.",
  clavel: "Materia orgánica, potasio y calcio; suelo con buen drenaje.",
  gladiolo: "Compost y potasio; suelo suelto.",
};

// Shared pest and disease library (real species present in the Andean valleys of Bolivia).
const L = {
  pulgon: { name: "Pulgones", scientific: "Myzus persicae", type: "insecto", season: "época seca y templada", signs: "Colonias en brotes y bajo las hojas; hojas enrolladas y pegajosas.", prevention: "Cuidar a las mariquitas; no abonar con exceso de nitrógeno.", homemade: "Agua con jabón neutro; extracto de ajo y ají." },
  mosca_blanca: { name: "Mosca blanca", scientific: "Trialeurodes vaporariorum", type: "insecto", season: "calor, sobre todo en invernaderos", signs: "Nubes de mosquitas blancas al mover las plantas; hojas pegajosas con hollín negro.", prevention: "Trampas amarillas pegajosas; quitar malezas hospederas; mallas en invernaderos.", homemade: "Agua con jabón neutro bajo las hojas, por la tarde." },
  trips: { name: "Trips", scientific: "Frankliniella occidentalis", type: "insecto", season: "época seca y calurosa", signs: "Manchas plateadas y puntitos negros en las hojas; flores y frutos deformes.", prevention: "Trampas azules pegajosas; riego que evite el estrés; quitar malezas.", homemade: "Agua con jabón neutro; extracto de ajo." },
  arana_roja: { name: "Arañita roja", scientific: "Tetranychus urticae", type: "ácaro", season: "época seca y calurosa", signs: "Hojas con puntitos amarillos y telitas finas debajo; plantas polvorientas.", prevention: "Mantener la humedad del suelo; no usar insecticidas que matan a sus enemigos naturales.", homemade: "Lavar las hojas con agua y jabón neutro; rociar azufre mojable solo con indicación técnica." },
  minador: { name: "Mosca minadora", scientific: "Liriomyza huidobrensis", type: "insecto", season: "todo el año, más en época seca", signs: "Galerías blancas y sinuosas dentro de las hojas.", prevention: "Trampas amarillas pegajosas; quitar y enterrar hojas dañadas; rotar.", homemade: "Trampas amarillas hechas con plástico y aceite." },
  cogollero: { name: "Gusano cogollero", scientific: "Spodoptera frugiperda", type: "insecto", season: "lluvias, plantas jóvenes", signs: "Hojas comidas en el cogollo con aserrín húmedo; agujeros en las hojas nuevas.", prevention: "Sembrar con las primeras lluvias firmes; revisar el cogollo cada semana.", homemade: "Un poco de ceniza o tierra fina en el cogollo; extracto de ajo y ají." },
  cortador: { name: "Gusano cortador (ticona)", scientific: "Agrotis ipsilon", type: "insecto", season: "inicio de campaña, plantas recién nacidas", signs: "Plantitas cortadas a ras del suelo por la noche; gusanos grises enrollados en la tierra.", prevention: "Arar con anticipación para exponer las larvas; limpiar malezas antes de sembrar.", homemade: "Collares de cartón o botella alrededor del tallo; buscar y recoger larvas al amanecer." },
  gusano_blanco: { name: "Gusano blanco (gallina ciega)", scientific: "Phyllophaga spp.", type: "insecto", season: "lluvias", signs: "Raíces y tubérculos comidos; plantas que se marchitan sin razón; larvas blancas en forma de C.", prevention: "Arar para exponer larvas a las aves; usar estiércol bien descompuesto.", homemade: "Dejar que gallinas recorran el terreno al arar." },
  pulguilla: { name: "Pulguilla", scientific: "Epitrix spp.", type: "insecto", season: "inicio de lluvias", signs: "Hojas con muchos agujeritos redondos, como perdigones.", prevention: "Rotar y eliminar malezas solanáceas.", homemade: "Ceniza fina espolvoreada sobre las hojas en la mañana." },
  tuta: { name: "Polilla del tomate", scientific: "Tuta absoluta", type: "insecto", season: "todo el año, más con calor", signs: "Galerías en hojas, tallos y frutos; frutos con agujeros.", prevention: "Quitar y destruir hojas y frutos dañados; trampas de feromona; rotar.", homemade: "Trampas de agua con un poco de aceite bajo una luz por la noche." },
  polilla_col: { name: "Polilla de la col", scientific: "Plutella xylostella", type: "insecto", season: "época seca", signs: "Hojas con ventanitas transparentes y agujeros; gusanos verdes pequeños que se mueven rápido.", prevention: "Rotar con cultivos que no sean coles; cultivos trampa de mostaza.", homemade: "Extracto de ajo y ají; recoger larvas a mano." },
  mariposa_col: { name: "Mariposa de la col", scientific: "Leptophobia aripa", type: "insecto", season: "todo el año", signs: "Gusanos verdes en grupo que dejan solo las nervaduras de la hoja.", prevention: "Revisar el envés de las hojas y quitar los huevos amarillos.", homemade: "Recoger los gusanos a mano; extracto de ajo y ají." },
  babosa: { name: "Babosas y caracoles", scientific: "Deroceras reticulatum", type: "molusco", season: "lluvias, noches húmedas", signs: "Hojas comidas con bordes irregulares y rastros brillantes de baba.", prevention: "Quitar escondites (piedras, tablas, malezas); regar en la mañana.", homemade: "Trampas con cerveza o agua con levadura; ceniza o cáscara de huevo molida alrededor de las plantas." },
  gorgojo_grano: { name: "Gorgojo de los granos", scientific: "Sitophilus zeamais", type: "insecto", season: "almacén, todo el año", signs: "Granos guardados con agujeros y polvillo; gorgojos pequeños oscuros.", prevention: "Secar bien el grano antes de guardar; envases cerrados; limpiar el depósito.", homemade: "Mezclar ceniza fina o hojas de muña con el grano guardado." },
  mosca_fruta: { name: "Mosca de la fruta", scientific: "Ceratitis capitata", type: "insecto", season: "maduración de la fruta, época cálida", signs: "Frutos con picaduras, zonas blandas y gusanos blancos adentro; fruta que cae antes de tiempo.", prevention: "Recoger y enterrar la fruta caída; cosechar a tiempo; trampas; avisar a SENASAG, es plaga bajo control oficial.", homemade: "Trampas de botella con agua, azúcar y un poco de vinagre o jugo de fruta." },
  carpocapsa: { name: "Polilla de la manzana (carpocapsa)", scientific: "Cydia pomonella", type: "insecto", season: "primavera y verano", signs: "Frutos agusanados con un agujero y aserrín oscuro; caen antes de madurar.", prevention: "Recoger fruta caída; fajas de cartón corrugado en el tronco para atrapar larvas; trampas de feromona.", homemade: "Fajas de cartón en el tronco, revisadas y quemadas cada semana." },
  polilla_oriental: { name: "Polilla oriental del durazno", scientific: "Grapholita molesta", type: "insecto", season: "primavera y verano", signs: "Brotes nuevos que se secan y doblan; frutos con galerías cerca del pedúnculo.", prevention: "Podar y quemar brotes dañados; trampas de feromona.", homemade: "Cortar los brotes dañados apenas aparecen." },
  piojo_sanjose: { name: "Piojo de San José (conchuela)", scientific: "Diaspidiotus perniciosus", type: "insecto", season: "todo el año", signs: "Costras grises en ramas y frutos; frutos con manchitas rojas.", prevention: "Poda que ventile la copa; quitar ramas muy atacadas.", homemade: "Aceite vegetal con jabón (emulsión) en invierno, con el árbol sin hojas." },
  pulgon_lanigero: { name: "Pulgón lanígero", scientific: "Eriosoma lanigerum", type: "insecto", season: "primavera y otoño", signs: "Copos como algodón en ramas y heridas de poda; nudos en las ramas.", prevention: "Cuidar a su enemigo natural (la avispita Aphelinus mali); no abonar con exceso de nitrógeno.", homemade: "Cepillar los copos con agua y jabón neutro." },
  kcona: { name: "Polilla de la quinua (kcona kcona)", scientific: "Eurysacca melanocampta", type: "insecto", season: "floración y llenado del grano", signs: "Panojas con hilos de seda y granos comidos; gusanitos verdes o rosados.", prevention: "Sembrar a tiempo, cosechar oportuno y eliminar rastrojos.", homemade: "Extracto de muña o de tarwi amargo." },
  tizon: { name: "Tizón tardío (rancha)", scientific: "Phytophthora infestans", type: "oomiceto (hongo)", season: "lluvias con días nublados", signs: "Manchas oscuras de aspecto húmedo en hojas y tallos, con pelusa blanca debajo.", prevention: "Variedades tolerantes; aporque alto; no regar por aspersión de tarde.", homemade: "Quitar y enterrar plantas enfermas; caldo bordelés solo con indicación técnica." },
  alternaria: { name: "Tizón temprano (alternaria)", scientific: "Alternaria solani", type: "hongo", season: "calor y humedad alterna", signs: "Manchas cafés con anillos, como un blanco de tiro, en hojas viejas.", prevention: "Rotar; quitar hojas bajas enfermas; buena nutrición.", homemade: "Quitar hojas manchadas; caldo de cola de caballo." },
  oidio: { name: "Oídio (ceniza)", scientific: "Podosphaera xanthii", type: "hongo", season: "época seca con noches frescas", signs: "Polvo blanco como harina sobre las hojas.", prevention: "Distancia entre plantas para que circule el aire; no regar las hojas de tarde.", homemade: "Leche diluida (1 parte en 9 de agua) o bicarbonato con jabón, por la mañana." },
  oidio_vid: { name: "Oídio de la vid", scientific: "Erysiphe necator", type: "hongo", season: "primavera y verano", signs: "Polvo blanco en hojas y racimos; granos que se rajan.", prevention: "Poda en verde para ventilar; quitar brotes enfermos.", homemade: "Azufre en polvo con indicación técnica; leche diluida en ataques leves." },
  mildiu: { name: "Mildiu velloso", scientific: "Peronospora destructor", type: "oomiceto (hongo)", season: "lluvias y neblinas", signs: "Manchas pálidas con pelusa gris violeta debajo de la hoja.", prevention: "Rotar; sembrar en lugares ventilados; semilla sana.", homemade: "Quitar hojas enfermas; caldo bordelés solo con indicación técnica." },
  mildiu_quinua: { name: "Mildiu de la quinua", scientific: "Peronospora variabilis", type: "oomiceto (hongo)", season: "lluvias", signs: "Manchas amarillas o rojizas en las hojas con pelusa gris debajo; hojas que caen.", prevention: "Variedades tolerantes; distancia entre surcos; semilla sana.", homemade: "Quitar plantas muy enfermas; caldo de cola de caballo." },
  botrytis: { name: "Moho gris (botrytis)", scientific: "Botrytis cinerea", type: "hongo", season: "humedad y frío", signs: "Frutos y flores con pudrición blanda cubierta de moho gris.", prevention: "Ventilar; no mojar flores y frutos; cosechar a tiempo.", homemade: "Quitar y enterrar partes enfermas; acolchado de paja bajo la frutilla." },
  roya: { name: "Roya", scientific: "Puccinia graminis", type: "hongo", season: "lluvias con calor", signs: "Pústulas anaranjadas o cafés como óxido en hojas y tallos.", prevention: "Variedades resistentes; rotar; eliminar rastrojos enfermos.", homemade: "Quitar hojas muy atacadas al inicio." },
  fusarium: { name: "Marchitez por fusarium", scientific: "Fusarium oxysporum", type: "hongo", season: "calor", signs: "Plantas que se marchitan de un lado; tallo cortado con vetas cafés por dentro.", prevention: "Rotar largo; semilla y plantines sanos; no encharcar.", homemade: "Arrancar y sacar las plantas enfermas del terreno." },
  chupadera: { name: "Chupadera (mal de almácigo)", scientific: "Pythium spp.", type: "oomiceto (hongo)", season: "almácigos con exceso de humedad", signs: "Plantitas que se doblan y mueren a ras del suelo.", prevention: "Almácigo con tierra desinfectada al sol; no regar en exceso.", homemade: "Tierra del almácigo tapada con plástico al sol varios días (solarización)." },
  cloca: { name: "Cloca o abolladura del durazno", scientific: "Taphrina deformans", type: "hongo", season: "brotación con frío y lluvia", signs: "Hojas nuevas gruesas, arrugadas y rojizas que caen.", prevention: "Tratamiento de invierno con cobre, con indicación técnica; poda sanitaria.", homemade: "Quitar y quemar las hojas deformadas." },
  sarna: { name: "Sarna del manzano", scientific: "Venturia inaequalis", type: "hongo", season: "primavera lluviosa", signs: "Manchas oscuras como hollín en hojas y frutos; frutos rajados.", prevention: "Recoger y enterrar las hojas caídas en otoño; poda que ventile.", homemade: "Caldo de cola de caballo en primavera." },
  tristeza_palto: { name: "Pudrición de raíz del palto", scientific: "Phytophthora cinnamomi", type: "oomiceto (hongo)", season: "suelos encharcados", signs: "Hojas pequeñas y amarillas, ramas secas desde la punta; raíces negras.", prevention: "Plantar en camellón con muy buen drenaje; no encharcar.", homemade: "Abundante materia orgánica y acolchado al pie." },
  marchitez_bacteriana: { name: "Marchitez bacteriana", scientific: "Ralstonia solanacearum", type: "bacteria", season: "calor y suelo húmedo", signs: "Plantas que se marchitan de golpe; al cortar el tallo sale un hilo lechoso.", prevention: "Semilla certificada; rotar largo; no regar de un terreno enfermo a uno sano.", homemade: "Sacar y quemar las plantas enfermas; no hay remedio casero que cure." },
  virosis: { name: "Virosis (mosaico)", scientific: "Potato virus Y", type: "virus", season: "cuando hay muchos pulgones", signs: "Hojas con manchas verde claro y oscuro, arrugadas o enrolladas; plantas pequeñas.", prevention: "Semilla sana; controlar pulgones; arrancar plantas enfermas temprano.", homemade: "Sacar plantas enfermas y no usar sus tubérculos como semilla." },
  carbon: { name: "Carbón del maíz", scientific: "Ustilago maydis", type: "hongo", season: "lluvias", signs: "Agallas grandes blancas que se vuelven polvo negro en mazorcas y tallos.", prevention: "Rotar; quitar agallas antes de que se abran.", homemade: "Cortar y enterrar las agallas cuando aún están blancas." },
  agallador: { name: "Nematodo agallador", scientific: "Meloidogyne spp.", type: "nematodo", season: "suelos cálidos y arenosos", signs: "Raíces con nudos o bolitas; plantas amarillas y chicas.", prevention: "Rotar con gramíneas; plantines sanos; huacataya y marigold como cultivo trampa.", homemade: "Incorporar huacataya o mucha materia orgánica." },
  hormiga: { name: "Hormiga cortadora (sepe)", scientific: "Acromyrmex spp.", type: "insecto", season: "todo el año, más en época seca", signs: "Hojas cortadas en medialuna; caminos de hormigas cargando hojas.", prevention: "Ubicar y tratar el nido; barreras en troncos.", homemade: "Ceniza o cal en los caminos; cáscaras de cítricos fermentadas cerca del nido." },
  tortola: { name: "Tórtolas y palomas", scientific: "Zenaida auriculata", type: "ave", season: "siembra y maduración del grano", signs: "Semillas desenterradas y granos comidos en la panoja.", prevention: "Sembrar a buena profundidad; espantapájaros y cintas brillantes que se muevan.", homemade: "Cintas reflectantes o CD viejos colgados." },
  roedor: { name: "Ratones de campo", scientific: "Akodon spp.", type: "roedor", season: "cosecha y almacén", signs: "Tubérculos y granos roídos; caminos y cuevas en los bordes.", prevention: "Limpiar bordes y malezas; guardar en depósitos cerrados.", homemade: "Gatos y trampas; no usar venenos cerca de casas y animales." },
};
// existing species with a different common key
const HOSTS = {
  isano: ["gorgojo_andes", "gusano_blanco", "babosa"], yacon: ["pulgon", "mosca_blanca", "gusano_blanco"], racacha: ["pulgon", "arana_roja", "chupadera"], camote: ["gusano_blanco", "mosca_blanca", "virosis"],
  centeno: ["roya", "pulgon", "gorgojo_grano"], triticale: ["roya", "pulgon", "gorgojo_grano"], sorgo: ["cogollero", "pulgon", "tortola"], canahua: ["kcona", "mildiu_quinua", "tortola"],
  lenteja: ["pulgon", "roya", "gorgojo_grano"], garbanzo: ["pulgon", "fusarium", "gorgojo_grano"], mani: ["trips", "gusano_blanco", "roedor"], vainita: ["mosca_blanca", "arana_roja", "roya", "chupadera"], trebol: ["pulgon", "babosa"],
  ryegrass: ["roya", "gusano_blanco"], festuca: ["roya", "gusano_blanco"], maiz_forrajero: ["cogollero", "cortador", "carbon"],
  pimenton: ["pulgon", "mosca_blanca", "trips", "arana_roja", "virosis", "agallador"], berenjena: ["arana_roja", "mosca_blanca", "pulguilla", "agallador"],
  zapallito: ["oidio", "mosca_blanca", "pulgon"], sandia: ["oidio", "pulgon", "fusarium"], melon: ["oidio", "pulgon", "mosca_blanca", "fusarium"],
  puerro: ["trips", "mildiu"], cebollin: ["trips", "mildiu"], perejil: ["pulgon", "chupadera"], rucula: ["pulguilla", "polilla_col"], kale: ["polilla_col", "mariposa_col", "pulgon"],
  pakchoi: ["polilla_col", "mariposa_col", "babosa"], vainita_arbustiva: ["minador", "pulgon", "oidio"], esparrago: ["fusarium", "babosa"], alcachofa: ["pulgon", "babosa", "botrytis"],
  quirquina: ["pulgon"], huacataya: ["arana_roja"], oregano: ["arana_roja", "fusarium"], manzanilla: ["pulgon"], hierbabuena: ["roya", "arana_roja"], muna: ["arana_roja"],
  durazno: ["mosca_fruta", "polilla_oriental", "cloca", "pulgon", "piojo_sanjose"], manzano: ["carpocapsa", "pulgon_lanigero", "sarna", "piojo_sanjose"], peral: ["carpocapsa", "piojo_sanjose", "mosca_fruta"],
  ciruelo: ["mosca_fruta", "pulgon", "piojo_sanjose"], membrillo: ["carpocapsa", "mosca_fruta"], vid: ["oidio_vid", "botrytis", "trips", "arana_roja"], higuera: ["mosca_fruta", "hormiga"],
  nogal: ["carpocapsa", "pulgon"], palto: ["tristeza_palto", "trips", "arana_roja"], chirimoya: ["mosca_fruta", "hormiga"], tuna: ["piojo_sanjose", "babosa"], tumbo: ["mosca_fruta", "fusarium"],
  aguaymanto: ["mosca_blanca", "pulguilla", "arana_roja"], clavel: ["trips", "arana_roja", "fusarium", "botrytis"], gladiolo: ["trips", "fusarium"],
  // extra pests for crops that were already in the catalogue
  tomate: ["tuta", "mosca_blanca", "alternaria", "agallador"], papa: ["pulguilla", "cortador", "virosis", "marchitez_bacteriana", "alternaria"], maiz: ["cogollero", "cortador", "carbon", "gorgojo_grano"],
  repollo: ["polilla_col", "mariposa_col"], coliflor: ["polilla_col", "mariposa_col"], brocoli: ["polilla_col", "mariposa_col"], lechuga: ["babosa", "minador"], frutilla: ["botrytis", "arana_roja", "babosa"],
  zapallo: ["oidio"], pepino: ["oidio", "mosca_blanca"], cebolla: ["mildiu"], haba: ["minador"], arveja: ["minador", "oidio"], quinua: ["tortola"], trigo: ["roya", "gorgojo_grano"], cebada: ["roya", "gorgojo_grano"],
  locoto: ["mosca_blanca", "virosis"], aji: ["mosca_blanca", "virosis"], acelga: ["minador"], espinaca: ["minador"],
};

const INVASIVE = [
  { name: "Eucalipto", scientific: "Eucalyptus globulus", kind: "planta", origin: "Australia", risk: "Seca el suelo alrededor, sus hojas frenan otras plantas y baja el agua de vertientes cercanas.", action: "No plantar junto a chacras ni vertientes; dejar al menos 20 metros de distancia." },
  { name: "Pino", scientific: "Pinus radiata", kind: "planta", origin: "California (Estados Unidos)", risk: "Se dispersa solo por semillas y acidifica el suelo bajo su copa.", action: "Arrancar plantitas jóvenes que aparezcan lejos de la plantación." },
  { name: "Retama", scientific: "Spartium junceum", kind: "planta", origin: "Mediterráneo", risk: "Arbusto que invade laderas y bordes de caminos y desplaza la vegetación nativa.", action: "Arrancar plantas jóvenes con raíz; cortar antes de que suelte semillas." },
  { name: "Higuerilla (ricino)", scientific: "Ricinus communis", kind: "planta", origin: "África oriental", risk: "Crece rápido en bordes y torrenteras; sus semillas son muy venenosas para personas y animales.", action: "Arrancar antes de que dé semilla; no dejar semillas al alcance de niños ni animales." },
  { name: "Caña brava", scientific: "Arundo donax", kind: "planta", origin: "Asia y Mediterráneo", risk: "Forma macizos en canales y ríos, tapa el paso del agua y aumenta el riesgo de desborde.", action: "Cortar y sacar los rizomas; no plantar en bordes de canales." },
  { name: "Pasto bermuda (gramilla)", scientific: "Cynodon dactylon", kind: "planta", origin: "África", risk: "Maleza que se extiende por estolones y rizomas; compite fuerte por agua y nutrientes.", action: "Sacar los rizomas al arar en época seca; cubrir el suelo con cultivos densos." },
  { name: "Coquito (cebollín)", scientific: "Cyperus rotundus", kind: "planta", origin: "Eurasia", risk: "Una de las peores malezas del mundo: sus tubérculos rebrotan y se multiplican al arar.", action: "Arrancar a mano antes de que forme tubérculos; acolchado grueso." },
  { name: "Sorgo de Alepo", scientific: "Sorghum halepense", kind: "planta", origin: "Mediterráneo", risk: "Maleza perenne de rizomas que invade maizales y forrajes.", action: "Sacar rizomas al arar; no dejar que semille." },
  { name: "Mostacilla (nabo silvestre)", scientific: "Brassica rapa", kind: "planta", origin: "Europa", risk: "Maleza de cereales y papa; hospeda plagas de las coles.", action: "Deshierbe temprano, antes de la floración." },
  { name: "Lengua de vaca", scientific: "Rumex crispus", kind: "planta", origin: "Europa", risk: "Maleza de raíz profunda en suelos húmedos y potreros.", action: "Sacar con toda la raíz; mejorar el drenaje." },
  { name: "Diente de león", scientific: "Taraxacum officinale", kind: "planta", origin: "Europa", risk: "Se dispersa por el viento; compite en almácigos y hortalizas pequeñas.", action: "Arrancar con raíz antes de la floración; tiene uso medicinal y como forraje." },
  { name: "Ataco (amaranto silvestre)", scientific: "Amaranthus hybridus", kind: "planta", origin: "América", risk: "Maleza de crecimiento rápido en hortalizas y maíz; produce miles de semillas.", action: "Deshierbe temprano, antes de que semille." },
  { name: "Paloma doméstica", scientific: "Columba livia", kind: "animal", origin: "Europa y Asia", risk: "Come semillas recién sembradas y granos; ensucia depósitos.", action: "Sembrar a buena profundidad; cubrir almácigos con malla." },
  { name: "Rata", scientific: "Rattus rattus", kind: "animal", origin: "Asia", risk: "Daña granos y tubérculos guardados y transmite enfermedades.", action: "Depósitos cerrados y limpios; trampas; no dejar restos de comida." },
  { name: "Caracol africano", scientific: "Lissachatina fulica", kind: "animal", origin: "África oriental", risk: "Caracol gigante que se come cultivos y puede transmitir parásitos; ya está en tierras bajas de Bolivia.", action: "No tocar con las manos; si lo ve, avisar a SENASAG." },
];

const REPELLENTS = [
  { name: "Purín de ortiga", for: "pulgones y para fortalecer las plantas", how: "Un kilo de ortiga picada en diez litros de agua por una a dos semanas, removiendo cada día. Colar y diluir una parte en diez de agua.", care: "Huele fuerte; usar guantes al cortar la ortiga." },
  { name: "Caldo de cola de caballo", for: "hongos como oídio, alternaria y roya", how: "Hervir 100 gramos de cola de caballo seca en un litro de agua por media hora, colar y diluir en cinco litros de agua.", care: "Preventivo: aplicar antes de que aparezca la enfermedad." },
  { name: "Leche diluida", for: "oídio (ceniza)", how: "Una parte de leche en nueve de agua; rociar las hojas por la mañana con sol.", care: "Funciona en ataques leves." },
  { name: "Trampas amarillas pegajosas", for: "mosca blanca, mosca minadora y pulgones con alas", how: "Plástico o cartón amarillo untado con aceite o grasa, colgado a la altura de las plantas.", care: "Cambiar o limpiar cuando estén llenas." },
  { name: "Extracto de muña", for: "polillas y gorgojos de granos y tubérculos guardados", how: "Ramas secas de muña entre los tubérculos o granos guardados, o un macerado de muña en agua por dos días para rociar.", care: "Práctica andina tradicional; renovar las ramas cada mes." },
  { name: "Huacataya en los bordes", for: "nematodos y algunas plagas del suelo", how: "Sembrar huacataya entre surcos o en los bordes; incorporarla al suelo al florecer.", care: "Puede volverse maleza si se deja semillar." },
  { name: "Caldo bordelés", for: "tizón, mildiu y cloca del durazno", how: "Sulfato de cobre y cal viva disueltos por separado y mezclados, en las proporciones que indique un técnico.", care: "Es un producto con cobre: usar guantes, no aplicar con flores abiertas y seguir la indicación técnica." },
];

// Warm-season crops: mean temperature of the growing period below which they grow and yield poorly (reference
// values of the ECOCROP optimal range). The engine lowers their climate score when the plot is colder.
const WARM = {
  sandia: 20, melon: 20, mani: 20, camote: 18, sorgo: 18, berenjena: 18, pimenton: 17, pepino: 17, aji: 17,
  tomate: 15, zapallo: 15, zapallito: 15, frijol: 15, vainita: 15, maiz: 14, maiz_forrajero: 14, locoto: 13,
  chirimoya: 16, palto: 15, vid: 15, higuera: 15, aguaymanto: 13, tuna: 14, mani_forrajero: 20,
};

// ---------- apply ----------
const have = new Set(cropsData.crops.map((c) => c.id));
const fallowIndex = cropsData.crops.findIndex((c) => c.group === "fallow");
const added = NEW_CROPS.filter((c) => !have.has(c.id));
cropsData.crops.splice(fallowIndex, 0, ...added);
for (const c of cropsData.crops) if (WARM[c.id] && c.min_mean_temp_c === undefined) c.min_mean_temp_c = WARM[c.id];
cropsData.meta.min_mean_temp_note = "min_mean_temp_c: warm-season crops need at least this mean temperature during the cycle (ECOCROP optimal range); below it the engine lowers the climate score.";
cropsData.meta.groups_note = "Groups tree (fruit trees and shrubs), herb (aromatic plants) and flower are shown in the catalogue but not used in three-year rotations.";

for (const [id, text] of Object.entries(FERT)) if (!knowledge.fertility[id]) knowledge.fertility[id] = text;
const existingAndes = Object.values(knowledge.pests).flat().find((p) => /Premnotrypes/.test(p.scientific));
const LIB = { ...L, gorgojo_andes: existingAndes };
for (const [id, keys] of Object.entries(HOSTS)) {
  const list = knowledge.pests[id] || (knowledge.pests[id] = []);
  for (const k of keys) {
    const p = LIB[k];
    if (p && !list.some((x) => x.scientific === p.scientific || x.name === p.name)) list.push(p);
  }
}
for (const x of INVASIVE) if (!knowledge.invasive.some((y) => y.scientific === x.scientific)) knowledge.invasive.push(x);
for (const x of knowledge.invasive) if (!x.kind) x.kind = "planta";
for (const r of REPELLENTS) if (!knowledge.repellents.some((y) => y.name === r.name)) knowledge.repellents.push(r);
const sources = [
  "FAO, Irrigation and Drainage Paper 56 (Allen y otros, 1998): duración de etapas y coeficientes Kc",
  "FAO ECOCROP: rangos de pH y temperatura de los cultivos",
  "SENASAG: plagas bajo vigilancia oficial en Bolivia (mosca de la fruta)",
];
for (const s of sources) if (!knowledge.meta.sources.includes(s)) knowledge.meta.sources.push(s);

writeFileSync(cropsPath, `${JSON.stringify(cropsData, null, 1)}\n`);
writeFileSync(knowPath, `${JSON.stringify(knowledge, null, 1)}\n`);
const pestCount = new Set(Object.values(knowledge.pests).flat().map((p) => p.scientific)).size;
console.log(`Cultivos: ${cropsData.crops.length} (${added.length} nuevos). Plagas y enfermedades distintas: ${pestCount}. Invasoras: ${knowledge.invasive.length}. Remedios: ${knowledge.repellents.length}.`);
