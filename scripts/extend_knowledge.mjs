// One-off: adds fertiliser guidance and pests for the crops added on 2026-11-15. Safe to run again.
import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../web/data/knowledge.json", import.meta.url);
const k = JSON.parse(readFileSync(file, "utf8"));

Object.assign(k.fertility, {
  oca: "Demanda moderada; responde bien a estiércol descompuesto. Suele sembrarse después de papa en la rotación andina.",
  papalisa: "Demanda moderada; estiércol descompuesto antes de la siembra.",
  avena: "Nitrógeno moderado; aprovecha el que deja una leguminosa. Buena para cubrir el suelo y para forraje.",
  amaranto: "Demanda moderada de nitrógeno; responde a estiércol descompuesto. Tolera suelos pobres mejor que el maíz.",
  frijol: "Fija su propio nitrógeno: poco abono nitrogenado; agradece fósforo.",
  tarwi: "Fija mucho nitrógeno y mejora suelos pobres; casi no necesita abono.",
  vicia: "Fija nitrógeno; se incorpora al suelo como abono verde antes de florecer o se corta como forraje.",
  ajo: "Pide potasio y azufre; abono orgánico bien descompuesto, nunca fresco.",
  locoto: "Pide potasio en la fructificación; abono orgánico bien descompuesto.",
  aji: "Pide potasio en la fructificación; abono orgánico bien descompuesto.",
  zanahoria: "Poco nitrógeno (el exceso deforma la raíz); suelo suelto, sin piedras ni estiércol fresco.",
  apio: "Pide mucho nitrógeno y agua constante; abono orgánico bien descompuesto.",
  repollo: "Pide mucho nitrógeno; estiércol descompuesto y riego regular.",
  coliflor: "Pide mucho nitrógeno y boro; estiércol descompuesto.",
  brocoli: "Pide mucho nitrógeno; estiércol descompuesto.",
  zapallo: "Pide materia orgánica: compost en el hoyo de siembra.",
  pepino: "Pide materia orgánica y potasio; compost en el surco.",
  remolacha: "Pide potasio y boro; poco nitrógeno.",
  frutilla: "Pide materia orgánica y suelos algo ácidos; cubrir el suelo con paja (mulch).",
  lechuga: "Nitrógeno moderado y riego frecuente; compost maduro.",
  espinaca: "Pide nitrógeno; compost maduro.",
  acelga: "Nitrógeno moderado; compost maduro.",
  rabano: "Poca demanda; ciclo muy corto, entre cultivos principales.",
  nabo: "Poca demanda; sirve de forraje y entre cultivos principales.",
  cilantro: "Poca demanda; compost maduro.",
});

const add = (id, list) => { k.pests[id] = list; };
const aphid = { name: "Pulgones", scientific: "varias especies", type: "insecto", season: "época seca y templada", signs: "Colonias en brotes y bajo las hojas; hojas enrolladas y pegajosas.", prevention: "Cuidar a las mariquitas; no abonar con exceso de nitrógeno.", homemade: "Agua con jabón neutro; extracto de ajo y ají." };
add("oca", [{ name: "Gorgojo de los Andes", scientific: "Premnotrypes spp.", type: "insecto", season: "lluvias", signs: "Tubérculos con galerías.", prevention: "Rotar con cultivos que no son tubérculos andinos; cosechar a tiempo.", homemade: "Barreras alrededor de la parcela; recoger adultos." }]);
add("papalisa", [{ name: "Gorgojo de los Andes", scientific: "Premnotrypes spp.", type: "insecto", season: "lluvias", signs: "Tubérculos con galerías.", prevention: "Rotar; cosechar a tiempo.", homemade: "Barreras alrededor de la parcela; recoger adultos." }]);
add("avena", [{ name: "Royas", scientific: "Puccinia spp.", type: "hongo", season: "humedad y temperaturas templadas", signs: "Pústulas color óxido en hojas.", prevention: "Variedades resistentes; no sembrar muy denso.", homemade: "No hay remedio casero fiable." }]);
add("amaranto", [{ ...aphid }]);
add("frijol", [
  { name: "Gorgojo del frijol", scientific: "Acanthoscelides obtectus", type: "insecto", season: "en el almacén", signs: "Granos con agujeros redondos.", prevention: "Secar bien el grano y guardarlo cerrado.", homemade: "Mezclar el grano con ceniza fina." },
  { name: "Roya del frijol", scientific: "Uromyces appendiculatus", type: "hongo", season: "humedad", signs: "Pústulas café rojizo en hojas.", prevention: "Rotar y usar semilla sana.", homemade: "No hay remedio casero fiable." },
]);
add("tarwi", [{ name: "Antracnosis del lupino", scientific: "Colletotrichum lupini", type: "hongo", season: "lluvias", signs: "Tallos torcidos con manchas hundidas.", prevention: "Semilla sana y rotación.", homemade: "No hay remedio casero fiable." }]);
add("vicia", [{ ...aphid }]);
add("ajo", [{ name: "Trips", scientific: "Thrips tabaci", type: "insecto", season: "época seca", signs: "Hojas plateadas.", prevention: "Riego regular; eliminar malezas.", homemade: "Trampas azules; agua con jabón neutro." }]);
add("locoto", [{ ...aphid }, { name: "Mosca blanca", scientific: "Bemisia tabaci y Trialeurodes vaporariorum", type: "insecto", season: "época cálida", signs: "Mosquitas blancas al mover las plantas.", prevention: "Eliminar malezas hospederas.", homemade: "Trampas amarillas; extracto de ajo y ají." }]);
add("aji", [{ ...aphid }]);
add("zanahoria", [{ ...aphid }]);
add("apio", [{ name: "Minador de hojas", scientific: "Liriomyza spp.", type: "insecto", season: "época seca", signs: "Caminitos blancos en las hojas.", prevention: "Quitar hojas dañadas.", homemade: "Trampas amarillas." }]);
const plutella = { name: "Polilla de la col", scientific: "Plutella xylostella", type: "insecto", season: "época seca", signs: "Hojas con ventanitas y agujeros; gusanitos verdes.", prevention: "Rotar con cultivos que no son coles; eliminar restos.", homemade: "Extracto de ajo y ají; revisar y recoger a mano." };
const cabbageAphid = { name: "Pulgón de la col", scientific: "Brevicoryne brassicae", type: "insecto", season: "época seca", signs: "Colonias grisáceas en hojas.", prevention: "Cuidar enemigos naturales.", homemade: "Agua con jabón neutro." };
add("repollo", [plutella, cabbageAphid]);
add("coliflor", [plutella, cabbageAphid]);
add("brocoli", [plutella, cabbageAphid]);
add("rabano", [plutella]);
add("nabo", [plutella]);
const powdery = { name: "Oídio de las cucurbitáceas", scientific: "Podosphaera xanthii", type: "hongo", season: "días secos y noches frescas", signs: "Polvo blanco en las hojas.", prevention: "Buena ventilación; no mojar las hojas.", homemade: "Leche diluida en agua, probada primero en pocas plantas." };
add("zapallo", [powdery]);
add("pepino", [powdery, { name: "Mosca blanca", scientific: "Bemisia tabaci y Trialeurodes vaporariorum", type: "insecto", season: "época cálida", signs: "Mosquitas blancas al mover las plantas.", prevention: "Eliminar malezas hospederas.", homemade: "Trampas amarillas." }]);
add("remolacha", [{ name: "Minador de hojas", scientific: "Liriomyza spp.", type: "insecto", season: "época seca", signs: "Caminitos blancos en las hojas.", prevention: "Quitar hojas dañadas.", homemade: "Trampas amarillas." }]);
add("frutilla", [
  { name: "Arañita roja", scientific: "Tetranychus urticae", type: "ácaro", season: "época seca y calurosa", signs: "Hojas con puntitos amarillos y telitas finas.", prevention: "Riego regular; cubrir el suelo con paja.", homemade: "Lavar las hojas con agua; agua con jabón neutro." },
  { name: "Moho gris", scientific: "Botrytis cinerea", type: "hongo", season: "humedad", signs: "Frutos con moho gris.", prevention: "Paja bajo los frutos; cosechar a tiempo.", homemade: "Retirar frutos enfermos." },
]);
add("lechuga", [{ ...aphid }, { name: "Babosas", scientific: "varias especies", type: "molusco", season: "humedad y noches frescas", signs: "Hojas comidas y rastros brillantes.", prevention: "Eliminar escondites (piedras, restos).", homemade: "Trampas de cerveza o de cáscara de cítricos; ceniza alrededor de las plantas." }]);
add("espinaca", [{ name: "Minador de hojas", scientific: "Liriomyza spp.", type: "insecto", season: "época seca", signs: "Caminitos blancos en las hojas.", prevention: "Quitar hojas dañadas.", homemade: "Trampas amarillas." }]);
add("acelga", [{ name: "Minador de hojas", scientific: "Liriomyza spp.", type: "insecto", season: "época seca", signs: "Caminitos blancos en las hojas.", prevention: "Quitar hojas dañadas.", homemade: "Trampas amarillas." }]);
add("cilantro", [{ ...aphid }]);
writeFileSync(file, JSON.stringify(k, null, 2));
console.log("abono:", Object.keys(k.fertility).length, "cultivos | plagas:", Object.keys(k.pests).length, "cultivos");
