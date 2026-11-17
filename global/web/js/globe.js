// The whole planet in 3D: NASA Blue Marble with exaggerated relief, real day and night for this very minute, city
// lights, clouds, atmosphere, satellites in orbit, notable relief markers, NASA GIBS live layers and climate bands.
// Click anywhere to pick a place.
//   createGlobe(container, { onPick, onProgress }) -> { setLayer, setBands, setRelief, flyTo, mark, dispose, layers }
// Textures: web/vendor/earth (NASA Blue Marble / Black Marble derivatives, public domain).
// Live layers: NASA GIBS WMS in EPSG:4326 (one equirectangular image of the whole planet).
import { flagModel, MOON_SPOTS, moonTextures } from "./moon.js";
const DEG = Math.PI / 180;

export const SATELLITES = {
  Terra: { name: "Terra", mission: "NASA, en órbita desde 1999", orbit: "705 km de altura, órbita polar que pasa siempre a la misma hora solar", measures: "Color real, temperatura de la superficie y verdor de las plantas con sus instrumentos MODIS, ASTER, CERES, MISR y MOPITT.", use: "En Yatiri X: las capas de color real, temperatura del suelo y vegetación." },
  GPM: { name: "GPM Core Observatory", mission: "NASA y JAXA (Japón), desde 2014", orbit: "407 km de altura, inclinada 65°", measures: "La lluvia y la nieve de todo el planeta con un radar de doble frecuencia (DPR) y un radiómetro de microondas (GMI).", use: "En Yatiri X: la capa «Lluvia ahora» (IMERG)." },
  SMAP: { name: "SMAP", mission: "NASA, desde 2015", orbit: "685 km de altura, órbita polar", measures: "La humedad de los primeros 5 cm del suelo con una antena de malla de 6 m que gira unas 14 veces por minuto.", use: "En Yatiri X: la capa de humedad del suelo y la humedad de la zona de raíces." },
};

export const GLOBE_LAYERS = [
  { id: "none", label: "Planeta (Blue Marble)", legend: "Imagen compuesta de la NASA, sin nubes." },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "Color real de ayer (MODIS)", format: "image/jpeg", daysAgo: 1, opaque: true, legend: "Así se veía la Tierra ayer desde el satélite Terra." },
  { id: "IMERG_Precipitation_Rate", label: "Lluvia ahora (GPM IMERG)", format: "image/png", legend: "Lluvia de la última media hora: azul suave a rojo intenso.", colors: ["#7ad3ff", "#2f6bff", "#9b3cff", "#ff2d55"] },
  { id: "MODIS_Terra_Land_Surface_Temp_Day", label: "Temperatura del suelo (MODIS)", format: "image/png", daysAgo: 2, legend: "Temperatura de la superficie de día: azul frío, rojo caliente.", colors: ["#2c3cff", "#2ee6ff", "#ffe600", "#ff3d00"] },
  { id: "MODIS_Terra_NDVI_8Day", label: "Vegetación (MODIS NDVI)", format: "image/png", legend: "Verdor de las plantas: marrón poco, verde intenso mucho.", colors: ["#b07a3a", "#e9df7a", "#5fc04a", "#0b6b24"] },
  { id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", label: "Humedad del suelo (SMAP)", format: "image/png", daysAgo: 3, legend: "Agua en la zona de raíces: rojo seco, azul húmedo.", colors: ["#c8371f", "#f3c14b", "#59d1a0", "#1c55d6"] },
];

export const CLIMATE_BANDS = [
  { name: "Polar", from: 66.5, to: 90, color: "#bfe6ff" },
  { name: "Subpolar", from: 55, to: 66.5, color: "#38d6e8" },
  { name: "Templada", from: 35, to: 55, color: "#5ee35e" },
  { name: "Subtropical", from: 23.44, to: 35, color: "#ffd23f" },
  { name: "Tropical", from: 0, to: 23.44, color: "#ff6b3d" },
];

export const RELIEFS = [
  { name: "Cordillera de los Andes · Cochabamba", lat: -17.39, lon: -66.16 },
  { name: "Altiplano", lat: -18.5, lon: -68.2 },
  { name: "Himalaya · Everest", lat: 27.99, lon: 86.93 },
  { name: "Meseta del Tíbet", lat: 33, lon: 88 },
  { name: "Kilimanjaro", lat: -3.07, lon: 37.35 },
  { name: "Montañas Rocosas", lat: 39.1, lon: -106.4 },
  { name: "Alpes", lat: 46.5, lon: 10.5 },
  { name: "Cuenca del Amazonas", lat: -3.4, lon: -62 },
  { name: "Sahara", lat: 23, lon: 13 },
  { name: "Gran Valle del Rift", lat: 0.5, lon: 36 },
];

/** Direction of the Sun (unit vector in globe coordinates) for a date: subsolar point from declination and the
 *  equation of time (accurate to a fraction of a degree, enough for the day/night line). */
export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 864e5;
  const g = (2 * Math.PI / 365) * (doy - 1 + (date.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const lon = -((minutes + eqtime) / 4 - 180);
  return { lat: decl / DEG, lon: ((lon + 540) % 360) - 180 };
}

const VERT = `
uniform sampler2D topo;
uniform float relief;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  float h = texture2D(topo, uv).r;
  vec3 p = position + normal * h * relief;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D waterMap;
uniform sampler2D topo;
uniform sampler2D overlay;
uniform float overlayOn;
uniform float overlayOpaque;
uniform float bandsOn;
uniform sampler2D cloudMap;
uniform float cloudsOn;
uniform float cloudShift;
uniform vec3 sunDir;
uniform vec3 camPos;
uniform float time;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
vec3 bandColor(float lat) {
  float a = abs(lat);
  if (a > 66.5) return vec3(0.75, 0.9, 1.0);
  if (a > 55.0) return vec3(0.22, 0.84, 0.91);
  if (a > 35.0) return vec3(0.37, 0.89, 0.37);
  if (a > 23.44) return vec3(1.0, 0.82, 0.25);
  return vec3(1.0, 0.42, 0.24);
}
void main() {
  // bump from the topography so mountains catch the light
  float e = 1.0 / 2048.0;
  float hC = texture2D(topo, vUv).r;
  float hX = texture2D(topo, vUv + vec2(e, 0.0)).r;
  float hY = texture2D(topo, vUv + vec2(0.0, e)).r;
  vec3 n = normalize(vNormalW);
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4));
  vec3 b = normalize(cross(n, t));
  n = normalize(n - (t * (hX - hC) + b * (hY - hC)) * 9.0);
  float light = dot(n, normalize(sunDir));
  float dayMix = smoothstep(-0.12, 0.22, light);
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec4 ov = texture2D(overlay, vUv);
  if (overlayOn > 0.5) day = mix(day, ov.rgb, overlayOpaque > 0.5 ? 1.0 : ov.a * 0.92);
  if (bandsOn > 0.5) {
    float lat = (vUv.y - 0.5) * 180.0;
    vec3 bc = bandColor(lat);
    float edge = 1.0 - smoothstep(0.0, 0.6, min(abs(abs(lat) - 23.44), min(abs(abs(lat) - 35.0), min(abs(abs(lat) - 55.0), abs(abs(lat) - 66.5)))));
    day = mix(day, bc, 0.42) + edge * 0.35;
  }
  // shadows of the clouds on the ground
  float shade = texture2D(cloudMap, vec2(fract(vUv.x - cloudShift - 0.004), vUv.y + 0.003)).a * cloudsOn;
  day *= 1.0 - shade * 0.32;
  vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.85, 0.6) * (1.45 + 0.2 * sin(time * 1.3 + vUv.x * 40.0 + vUv.y * 25.0));
  vec3 color = mix(night + day * 0.09, day * (0.2 + 1.05 * max(light, 0.0)), dayMix);
  // warm band of sunrise and sunset along the line between day and night
  color += vec3(1.0, 0.42, 0.12) * exp(-pow(light * 7.0, 2.0)) * 0.22;
  // sun glint on the oceans
  float water = texture2D(waterMap, vUv).r;
  vec3 viewDir = normalize(camPos - vPosW);
  vec3 h = normalize(normalize(sunDir) + viewDir);
  float ripple = 0.9 + 0.1 * sin(time * 0.6 + vUv.y * 60.0);
  color += water * pow(max(dot(n, h), 0.0), 60.0) * 0.6 * ripple * dayMix;
  color = mix(color, color * vec3(0.82, 0.95, 1.12), water * 0.35 * dayMix);
  // soft rim of the atmosphere on the disc edge
  float rim = pow(1.0 - max(dot(viewDir, normalize(vNormalW)), 0.0), 3.0);
  color += vec3(0.25, 0.55, 1.0) * rim * 0.55 * (0.3 + dayMix);
  gl_FragColor = vec4(color, 1.0);
}`;

const ATMO_VERT = `
varying vec3 vN; varying vec3 vP;
void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FRAG = `
uniform vec3 sunDir; uniform vec3 camPos; varying vec3 vN; varying vec3 vP;
void main() {
  vec3 v = normalize(camPos - vP);
  float i = pow(max(0.66 - dot(vN, v), 0.0), 3.6) * 1.25;
  float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.4, dot(vN, normalize(sunDir)));
  gl_FragColor = vec4(vec3(0.3, 0.62, 1.0) * lit, clamp(i, 0.0, 1.0));
}`;

export const latLonToVec = (THREE, lat, lon, r = 1) => {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

function glowTexture(THREE, inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function solarCells(THREE) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 256, 64);
  grad.addColorStop(0, "#14306e");
  grad.addColorStop(0.5, "#2b5ed8");
  grad.addColorStop(1, "#14306e");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "rgba(190,215,255,.55)";
  g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = "#c9d6e8";
  g.lineWidth = 3;
  g.strokeRect(1, 1, 254, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A satellite with bus, gold foil, solar wings, antennas, instruments and a blinking light. kind: Terra, GPM or SMAP. */
function satelliteModel(THREE, kind, color, cells) {
  const sat = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0xe0ac3c, metalness: 0.95, roughness: 0.32, emissive: 0x2a1800 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xe3e8ef, metalness: 0.85, roughness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30343d, metalness: 0.5, roughness: 0.55 });
  const wingMat = new THREE.MeshStandardMaterial({ map: cells, metalness: 0.55, roughness: 0.28, emissive: 0x0b1f66, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); sat.add(o); return o; };
  const rod = (len, x, y, z, rx = 0, rz = 0, r = 0.0012) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), silver); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); sat.add(o); return o; };
  const wing = (side, len, segs) => {
    rod(0.03, side * 0.032, 0, 0, 0, Math.PI / 2);
    for (let k = 0; k < segs; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len / segs - 0.003, 0.0016, 0.034), wingMat);
      seg.position.set(side * (0.048 + (k + 0.5) * (len / segs)), 0, 0);
      sat.add(seg);
    }
  };
  const dish = (r, y, z, tilt) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const x = (i / 10) * r; pts.push(new THREE.Vector2(x, (x * x) / (r * 1.6))); }
    const d = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
    d.position.set(0, y, z);
    d.rotation.x = tilt;
    sat.add(d);
    return d;
  };
  // main bus with gold foil and an instrument deck facing the ground (-y)
  box(0.036, 0.032, 0.05, foil);
  box(0.03, 0.008, 0.03, dark, 0, -0.02, 0);
  box(0.01, 0.01, 0.012, silver, 0.008, -0.026, 0.008);
  box(0.008, 0.012, 0.008, silver, -0.01, -0.027, -0.01);
  if (kind === "Terra") {
    wing(1, 0.13, 4);
    dish(0.011, 0.012, 0.03, Math.PI / 2);
    rod(0.03, -0.022, 0.012, 0, 0, 0.6);
    box(0.012, 0.012, 0.016, silver, -0.024, -0.006, 0.012);
  } else if (kind === "GPM") {
    wing(1, 0.1, 3);
    wing(-1, 0.1, 3);
    dish(0.016, 0.03, 0, 0); // GMI radiometer on top
    box(0.03, 0.004, 0.03, new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.7, roughness: 0.3 }), 0, -0.03, 0); // DPR radar
  } else {
    wing(1, 0.09, 3);
    rod(0.05, 0, 0.04, 0, 0, 0, 0.0016); // boom
    const spinner = new THREE.Group();
    const tilt = Math.PI / 2.4;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.045, 40), new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0016, 6, 48), silver);
    const spokes = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b8, wireframe: true, transparent: true, opacity: 0.5 }));
    for (const o of [mesh, rim, spokes]) { o.rotation.x = tilt; spinner.add(o); }
    spinner.position.y = 0.068;
    sat.add(spinner);
    sat.userData.spinner = spinner;
  }
  rod(0.026, 0.012, 0.02, -0.02);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3d3d, transparent: true }));
  light.position.set(0, 0.018, 0.026);
  sat.add(light);
  // sensor cone pointing to the ground, and a larger invisible target so a tap hits the satellite
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  cone.position.y = -0.1;
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.satellite = kind;
  sat.add(cone, hit);
  sat.userData.cone = cone;
  sat.userData.light = light;
  sat.userData.hit = hit;
  return sat;
}

export async function createGlobe(container, { onPick = () => {}, onProgress = () => {}, onSatellite = () => {}, onMoonClick = () => {}, onMoonPick = () => {}, autoRotate = true } = {}) {
  const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("../vendor/three/OrbitControls.js")]);
  const width = () => container.clientWidth || 600;
  const height = () => container.clientHeight || 600;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width() / height(), 0.005, 200);
  camera.position.set(0, 0.6, 3.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  // phones: one finger up or down scrolls the page, sideways turns the model, two fingers zoom
  renderer.domElement.style.touchAction = "pan-y";
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.25;
  controls.maxDistance = 9;
  controls.enablePan = false;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 0.45;

  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => onProgress(loaded / total, url);
  const loader = new THREE.TextureLoader(manager);
  loader.setCrossOrigin("anonymous");
  const tex = (file) => {
    const t = loader.load(`vendor/earth/${file}`);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const day = tex("earth-blue-marble.jpg");
  day.colorSpace = THREE.SRGBColorSpace;
  const night = tex("earth-night.jpg");
  night.colorSpace = THREE.SRGBColorSpace;
  const topo = tex("earth-topology.png");
  const water = tex("earth-water.png");
  const cloudsTex = tex("clouds.png");
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;

  const sun = subsolarPoint();
  const sunDir = latLonToVec(THREE, sun.lat, sun.lon, 1).normalize();
  // start looking at the day side, with the line between day and night in view
  camera.position.copy(latLonToVec(THREE, sun.lat * 0.4 + 8, sun.lon - 38, 3.4));
  // on wide screens the planet sits to the right of the title
  let moonMode = false;
  const frameView = () => {
    const w = width();
    const h = height();
    if (w > 860 && !moonMode) camera.setViewOffset(w, h, -w * 0.17, 0, w, h); else camera.clearViewOffset();
  };
  frameView();
  const uniforms = {
    dayMap: { value: day }, nightMap: { value: night }, waterMap: { value: water }, topo: { value: topo }, overlay: { value: blank },
    overlayOn: { value: 0 }, overlayOpaque: { value: 0 }, bandsOn: { value: 0 }, relief: { value: 0.035 },
    cloudMap: { value: cloudsTex }, cloudsOn: { value: 1 }, cloudShift: { value: 0 },
    sunDir: { value: sunDir.clone() }, camPos: { value: camera.position }, time: { value: 0 },
  };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 384, 192), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }));
  scene.add(earth);

  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.028, 128, 64), new THREE.MeshLambertMaterial({ map: cloudsTex, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(clouds);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.11, 96, 48), new THREE.ShaderMaterial({
    uniforms: { sunDir: uniforms.sunDir, camPos: uniforms.camPos }, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(atmo);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 2600; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40);
    pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(stars);

  // the Sun, far away in its real direction
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, "rgba(255,248,214,1)", "rgba(255,190,80,0)"), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunSprite.scale.setScalar(7);
  sunSprite.position.copy(sunDir).multiplyScalar(30);
  scene.add(sunSprite);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.position.copy(sunDir).multiplyScalar(10);
  scene.add(sunLight, new THREE.AmbientLight(0x6688cc, 0.35));

  const cells = solarCells(THREE);
  // satellites: polar (Terra/Aqua-like), tilted (GPM-like) and one more polar (SMAP-like)
  const orbits = [
    { name: "Terra", incl: 98.2, r: 1.32, speed: 0.22, phase: 0, color: 0x93c572 },
    { name: "GPM", incl: 65, r: 1.25, speed: 0.3, phase: 2.1, color: 0x52a8ff },
    { name: "SMAP", incl: 98.1, r: 1.4, speed: 0.18, phase: 4.2, color: 0xffb347, node: 1.2 },
  ].map((o) => {
    const pivot = new THREE.Group();
    pivot.rotation.z = (o.incl - 90) * DEG;
    pivot.rotation.y = o.node || 0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r, 0.0018, 6, 256), new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.35 }));
    ring.rotation.y = Math.PI / 2;
    const sat = satelliteModel(THREE, o.name, o.color, cells);
    pivot.add(ring, sat);
    scene.add(pivot);
    const trail = new THREE.Mesh(new THREE.TorusGeometry(o.r, 0.004, 6, 96, 0.9), new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    trail.rotation.x = Math.PI / 2;
    pivot.add(trail);
    return { ...o, pivot, sat, trail };
  });

  // the Moon: illustrative texture at real positions, tilted orbit of 5 degrees, always the same face to the Earth
  const moonTex = moonTextures(THREE);
  const moonPivot = new THREE.Group();
  moonPivot.rotation.x = 5.1 * DEG;
  const MOON_R = 0.273;
  const MOON_ORBIT = 2.75;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 128, 64), new THREE.MeshStandardMaterial({ map: moonTex.map, bumpMap: moonTex.bump, bumpScale: 1.2, roughness: 0.95, metalness: 0, emissive: 0x8899bb, emissiveMap: moonTex.map, emissiveIntensity: 0.22 }));
  moonPivot.add(moon);
  scene.add(moonPivot);
  let moonAngle = 1.2;
  let moonHiRes = false;
  const flag = flagModel(THREE);
  flag.scale.setScalar(0.45);
  flag.visible = false;
  moon.add(flag);
  {
    const at = latLonToVec(THREE, MOON_SPOTS[0].lat, MOON_SPOTS[0].lon, MOON_R);
    flag.position.copy(at);
    flag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize());
  }
  const moonLabelEls = MOON_SPOTS.map((m) => { const el = document.createElement("span"); el.className = "globe-label globe-label--moon is-hidden"; el.textContent = m.name; return el; });
  const satLabelEls = orbits.map((o) => { const el = document.createElement("span"); el.className = "globe-label globe-label--sat"; el.textContent = o.name; return el; });

  // notable reliefs and the picked place
  const markers = new THREE.Group();
  earth.add(markers);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  for (const r of RELIEFS) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), markerMat);
    m.position.copy(latLonToVec(THREE, r.lat, r.lon, 1.04));
    m.userData = r;
    markers.add(m);
  }
  const labels = document.createElement("div");
  labels.className = "globe-labels";
  container.append(labels);
  const labelEls = RELIEFS.map((r) => { const el = document.createElement("span"); el.className = "globe-label"; el.textContent = r.name; labels.append(el); return el; });
  labels.append(...moonLabelEls, ...satLabelEls);
  const pin = new THREE.Group();
  const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff3d6e }));
  const pinRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 48), new THREE.MeshBasicMaterial({ color: 0xff3d6e, transparent: true, side: THREE.DoubleSide }));
  pin.add(pinHead, pinRing);
  pin.visible = false;
  earth.add(pin);

  // overlays
  let overlayToken = 0;
  function setLayer(id) {
    const layer = GLOBE_LAYERS.find((l) => l.id === id) || GLOBE_LAYERS[0];
    const token = ++overlayToken;
    if (layer.id === "none") { uniforms.overlayOn.value = 0; uniforms.overlayOpaque.value = 0; clouds.visible = cloudsWanted; return Promise.resolve(layer); }
    const date = new Date(Date.now() - (layer.daysAgo || 0) * 864e5).toISOString().slice(0, 10);
    const params = new URLSearchParams({ SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0", LAYERS: layer.id, CRS: "EPSG:4326", BBOX: "-90,-180,90,180", WIDTH: "2048", HEIGHT: "1024", FORMAT: layer.format, TRANSPARENT: layer.opaque ? "FALSE" : "TRUE" });
    if (layer.daysAgo) params.set("TIME", date);
    return new Promise((resolve, reject) => {
      loader.load(`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`, (t) => {
        if (token !== overlayToken) return;
        t.colorSpace = THREE.SRGBColorSpace;
        uniforms.overlay.value = t;
        uniforms.overlayOpaque.value = layer.opaque ? 1 : 0;
        uniforms.overlayOn.value = 1;
        clouds.visible = !layer.opaque && cloudsWanted;
        resolve(layer);
      }, undefined, reject);
    });
  }
  const setBands = (on) => { uniforms.bandsOn.value = on ? 1 : 0; };
  let cloudsWanted = true;
  const setClouds = (on) => { cloudsWanted = on; clouds.visible = on && !uniforms.overlayOpaque.value; uniforms.cloudsOn.value = on ? 1 : 0; };
  const setRelief = (x) => { uniforms.relief.value = x; };

  // camera flight to a place
  let flight = null;
  function flyTo(lat, lon, distance = 2.1) {
    if (moonMode) exitMoon();
    const target = latLonToVec(THREE, lat, lon, distance).applyMatrix4(earth.matrixWorld);
    flight = { from: camera.position.clone(), to: target, t: 0, look: [controls.target.clone(), new THREE.Vector3()] };
    controls.autoRotate = false;
  }
  // lunar mode: the Moon stops, the camera flies to it and orbits around it; the flag appears
  const moonWorld = () => moon.getWorldPosition(new THREE.Vector3());
  function enterMoon() {
    moonMode = true;
    flag.visible = true;
    const m = moonWorld();
    const toEarth = m.clone().negate().normalize();
    const eye = m.clone().add(toEarth.multiplyScalar(1.05)).add(new THREE.Vector3(0, 0.18, 0));
    // sharper Moon once it is the centre of the view
    if (!moonHiRes && window.innerWidth >= 700) { moonHiRes = true; setTimeout(() => { const hi = moonTextures(THREE, 2048); moon.material.map = hi.map; moon.material.emissiveMap = hi.map; moon.material.bumpMap = hi.bump; moon.material.needsUpdate = true; }, 50); }
    flight = { from: camera.position.clone(), to: eye, t: 0, look: [controls.target.clone(), m], straight: true, secs: 2.6 };
    controls.minDistance = MOON_R + 0.04;
    controls.autoRotate = false;
    frameView();
    camera.updateProjectionMatrix();
  }
  function exitMoon() {
    moonMode = false;
    controls.minDistance = 1.25;
    flight = { from: camera.position.clone(), to: new THREE.Vector3(0, 0.6, 3.2), t: 0, look: [controls.target.clone(), new THREE.Vector3()], straight: true, secs: 2.2 };
    frameView();
    camera.updateProjectionMatrix();
  }
  function mark(lat, lon) {
    pin.position.copy(latLonToVec(THREE, lat, lon, 1.04));
    pin.lookAt(new THREE.Vector3(0, 0, 0));
    pin.visible = true;
  }

  // picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = moonMode ? [moon] : [moon, earth, ...orbits.map((o) => o.sat.userData.hit)];
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;
    if (hit.object.userData.satellite) { onSatellite(SATELLITES[hit.object.userData.satellite]); return; }
    if (hit.object === moon) {
      const q = moon.worldToLocal(hit.point.clone()).normalize();
      const mlat = 90 - Math.acos(q.y) / DEG;
      const mlon = ((Math.atan2(q.z, -q.x) / DEG - 180 + 540) % 360) - 180;
      if (moonMode) onMoonPick({ lat: mlat, lon: mlon }); else onMoonClick();
      return;
    }
    const p = earth.worldToLocal(hit.point.clone()).normalize();
    const lat = 90 - Math.acos(p.y) / DEG;
    let lon = Math.atan2(p.z, -p.x) / DEG - 180;
    lon = ((lon + 540) % 360) - 180;
    mark(lat, lon);
    onPick({ lat, lon });
  });

  const resize = new ResizeObserver(() => {
    camera.aspect = width() / height();
    frameView();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
  });
  resize.observe(container);

  let running = true;
  let visible = true;
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; });
  io.observe(container);
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uniforms.time.value = t;
    clouds.rotation.y += dt * 0.012;
    uniforms.cloudShift.value = clouds.rotation.y / (Math.PI * 2);
    for (const o of orbits) {
      const a = t * o.speed + o.phase;
      o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
      o.sat.lookAt(0, 0, 0);
      o.sat.rotateX(-Math.PI / 2); // the sensor cone (local -y) faces the ground
      o.sat.userData.cone.material.opacity = 0.12 + 0.1 * Math.sin(t * 3 + o.phase);
      o.sat.userData.light.material.opacity = Math.sin(t * 5 + o.phase) > 0.7 ? 1 : 0.15;
      if (o.sat.userData.spinner) o.sat.userData.spinner.rotation.y += dt * 1.53; // 14.6 turns a minute
      o.trail.rotation.z = -a; // the bright trail follows behind the satellite
    }
    if (!moonMode) moonAngle += dt * 0.05;
    moon.position.set(Math.cos(moonAngle) * MOON_ORBIT, 0, Math.sin(moonAngle) * MOON_ORBIT);
    moon.rotation.y = Math.PI - moonAngle; // the near side always faces the Earth
    flag.userData.uniforms.time.value = t;
    pinRing.scale.setScalar(1 + 0.35 * Math.sin(t * 4));
    pinRing.material.opacity = 0.6 - 0.3 * Math.sin(t * 4);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / (flight.secs || 1.6));
      const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      camera.position.copy(flight.from).lerp(flight.to, k);
      if (!flight.straight) camera.position.setLength(flight.from.length() + (flight.to.length() - flight.from.length()) * k);
      if (flight.look) controls.target.copy(flight.look[0]).lerp(flight.look[1], k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    uniforms.camPos.value.copy(camera.position);
    renderer.render(scene, camera);
    // relief labels follow their point and hide on the far side
    const w = width();
    const h = height();
    markers.children.forEach((m, i) => {
      m.getWorldPosition(tmp);
      const facing = tmp.clone().normalize().dot(camera.position.clone().normalize()) > 0.25;
      tmp.project(camera);
      const el = labelEls[i];
      el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
      el.classList.toggle("is-hidden", !facing || moonMode);
    });
    // satellite names, and the named places of the Moon in lunar mode
    const camDir = camera.position.clone().normalize();
    orbits.forEach((o, i) => {
      o.sat.getWorldPosition(tmp);
      const behind = tmp.clone().normalize().dot(camDir) < -0.35 && tmp.length() < camera.position.length();
      tmp.project(camera);
      satLabelEls[i].style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
      satLabelEls[i].classList.toggle("is-hidden", behind || moonMode || tmp.z > 1);
    });
    const mc = moonWorld();
    MOON_SPOTS.forEach((m, i) => {
      const world = moon.localToWorld(latLonToVec(THREE, m.lat, m.lon, MOON_R * 1.01));
      const facing = world.clone().sub(mc).normalize().dot(camera.position.clone().sub(world).normalize()) > 0.2;
      world.project(camera);
      moonLabelEls[i].style.transform = `translate(${((world.x + 1) / 2) * w}px, ${((1 - world.y) / 2) * h}px)`;
      moonLabelEls[i].classList.toggle("is-hidden", !moonMode || !facing);
    });
  }
  frame();

  return {
    layers: GLOBE_LAYERS, setLayer, setBands, setRelief, setClouds, flyTo, mark, enterMoon, exitMoon,
    inMoon: () => moonMode,
    stopRotation: () => { controls.autoRotate = false; },
    dispose() { running = false; resize.disconnect(); io.disconnect(); renderer.dispose(); container.innerHTML = ""; },
  };
}
