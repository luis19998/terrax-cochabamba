// The Moon of Yatiri X Global: an illustrative texture drawn in the browser (maria and craters at their real
// selenographic positions, no download), the places worth naming, a waving Yatiri X flag and what could be grown
// there according to published experiments. Used by globe.js; the lunar mode is the hidden "secret" of the planet.
const DEG = Math.PI / 180;

// maria as ellipses: [lat, lon, half-height in degrees, half-width in degrees]
const MARIA = [
  [20, -55, 22, 18], [2, -60, 14, 10], [36, -45, 10, 12], // Oceanus Procellarum
  [33, -16, 15, 18], // Imbrium
  [28, 17.5, 9, 10], // Serenitatis
  [8.5, 31.4, 10, 11], [3, 22, 5, 6], // Tranquillitatis
  [17, 59, 6, 8], // Crisium
  [-7.8, 51.3, 8, 7], // Fecunditatis
  [-15, 35, 5, 5], // Nectaris
  [-21, -16.6, 9, 10], // Nubium
  [-24, -39, 5, 5], // Humorum
  [13, 3.6, 4, 5], // Vaporum
  [56, -20, 4, 14], [57, 15, 4, 16], // Frigoris
  [27, 148, 4, 4], // Moscoviense (far side)
];
const inMare = (lat, lon) => MARIA.some(([a, b, h, w]) => ((lat - a) / h) ** 2 + ((((lon - b + 540) % 360) - 180) / w) ** 2 < 1);

// named craters: [lat, lon, radius in degrees, rays]
const CRATERS = [[-43.3, -11.2, 2.8, true], [9.6, -20.1, 3, true], [8.1, -38, 1.3, true], [23.7, -47.4, 1.2, false], [-89.9, 0, 0.9, false], [-9.4, 13.1, 2.4, false], [51.6, -9.4, 3, false]];

export const MOON_SPOTS = [
  { name: "Mar de la Tranquilidad · Apolo 11", lat: 0.67, lon: 23.47 },
  { name: "Mar de la Serenidad", lat: 28, lon: 17.5 },
  { name: "Mar de las Lluvias", lat: 32.8, lon: -15.6 },
  { name: "Océano de las Tormentas", lat: 18.4, lon: -57.4 },
  { name: "Mar de las Crisis", lat: 17, lon: 59.1 },
  { name: "Cráter Copérnico", lat: 9.6, lon: -20.1 },
  { name: "Cráter Tycho", lat: -43.3, lon: -11.2 },
  { name: "Cráter Shackleton · hielo de agua", lat: -88.5, lon: 0 },
  { name: "Cráter Peary · luz casi continua", lat: 88.6, lon: 33 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Colour and bump textures of the Moon, equirectangular, drawn once in a canvas. */
export function moonTextures(THREE, W = 1024) {
  const H = W / 2;
  const rand = rng(1969);
  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  color.width = bump.width = W;
  color.height = bump.height = H;
  const c = color.getContext("2d");
  const b = bump.getContext("2d");
  // base: value noise in five octaves, maria with soft edges
  const img = c.createImageData(W, H);
  const bimg = b.createImageData(W, H);
  const grids = [6, 16, 40, 110, 280].map((n) => ({ n, rows: n / 2 + 1, v: Float32Array.from({ length: (n + 1) * (n / 2 + 1) }, rand) }));
  const mareRow = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 360 - 180;
      let f = 0;
      for (const [a, bb, h, w] of MARIA) {
        const e = Math.sqrt(((lat - a) / h) ** 2 + ((((lon - bb + 540) % 360) - 180) / w) ** 2);
        if (e < 1.25) f = Math.max(f, Math.min(1, (1.25 - e) / 0.4));
      }
      mareRow[x] = f;
    }
    for (let x = 0; x < W; x++) {
      let v = 0;
      let amp = 0.5;
      for (const g of grids) {
        const gx = (x / W) * g.n;
        const gy = (y / H) * (g.n / 2);
        const x0 = Math.floor(gx);
        const y0 = Math.min(g.rows - 2, Math.floor(gy));
        const fx = gx - x0;
        const fy = gy - y0;
        const r0 = y0 * (g.n + 1);
        const r1 = r0 + g.n + 1;
        const x1 = Math.min(x0 + 1, g.n);
        const top = g.v[r0 + x0] * (1 - fx) + g.v[r0 + x1] * fx;
        const bot = g.v[r1 + x0] * (1 - fx) + g.v[r1 + x1] * fx;
        v += (top * (1 - fy) + bot * fy) * amp;
        amp *= 0.55;
      }
      const f = mareRow[x];
      const high = 158 + (v - 0.5) * 110;
      const mare = 78 + (v - 0.5) * 50;
      const gray = high * (1 - f) + mare * f;
      const i = (y * W + x) * 4;
      img.data[i] = gray * 1.02; img.data[i + 1] = gray; img.data[i + 2] = gray * 0.95; img.data[i + 3] = 255;
      const h = 150 - f * 50 + (v - 0.5) * 90;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h; bimg.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  b.putImageData(bimg, 0, 0);
  const toPx = (lat, lon) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  // a crater: dark floor, lit rim towards the upper left, shadowed rim on the other side
  const crater = (lat, lon, r, rays) => {
    const [x, y] = toPx(lat, lon);
    const ry = Math.max(1.2, (r / 180) * H);
    const rx = Math.min(W / 6, ry / Math.max(0.15, Math.cos(lat * DEG)));
    if (rays) {
      c.save();
      for (let k = 0; k < 22; k++) {
        const a = rand() * Math.PI * 2;
        const len = ry * (3 + rand() * 9);
        const grad = c.createLinearGradient(x, y, x + Math.cos(a) * len * (rx / ry), y + Math.sin(a) * len);
        grad.addColorStop(0, "rgba(245,245,240,.28)");
        grad.addColorStop(1, "rgba(245,245,240,0)");
        c.strokeStyle = grad;
        c.lineWidth = Math.max(1, ry * (0.12 + rand() * 0.2));
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len * (rx / ry), y + Math.sin(a) * len); c.stroke();
      }
      c.restore();
    }
    for (const [ctx, k] of [[c, 1], [b, 1.6]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx / ry, 1);
      const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      floor.addColorStop(0, `rgba(30,30,30,${0.28 * k})`);
      floor.addColorStop(0.8, `rgba(30,30,30,${0.18 * k})`);
      floor.addColorStop(1, "rgba(30,30,30,0)");
      ctx.fillStyle = floor;
      ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(0.8, ry * 0.18);
      ctx.strokeStyle = `rgba(250,250,245,${0.32 * k})`;
      ctx.beginPath(); ctx.arc(0, 0, ry, Math.PI * 0.75, Math.PI * 1.75); ctx.stroke();
      ctx.strokeStyle = `rgba(10,10,10,${0.22 * k})`;
      ctx.beginPath(); ctx.arc(0, 0, ry, -Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
      ctx.restore();
    }
  };
  const count = W >= 2048 ? 2600 : 1300;
  for (let k = 0; k < count; k++) {
    const lat = Math.asin(rand() * 2 - 1) / DEG;
    crater(lat, rand() * 360 - 180, 0.08 + rand() ** 4 * 1.6, false);
  }
  CRATERS.forEach(([lat, lon, r, rays]) => crater(lat, lon, r, rays));
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, bump: new THREE.CanvasTexture(bump) };
}

/** The Yatiri X flag: logo and name on a canvas, waving with a small vertex shader. */
export function flagModel(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 200;
  const g = canvas.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 320, 200);
  grad.addColorStop(0, "#5fc04a");
  grad.addColorStop(1, "#1f6b3a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 320, 200);
  g.fillStyle = "#ffd23f";
  g.fillRect(0, 176, 320, 24);
  g.fillStyle = "#fff";
  g.font = "800 46px 'Plus Jakarta Sans', sans-serif";
  g.textAlign = "center";
  g.fillText("YATIRI X", 160, 150);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new Image();
  logo.onload = () => { g.drawImage(logo, 160 - 30, 18, 60, 82); tex.needsUpdate = true; };
  logo.src = "img/logo-mark.png";

  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.11, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.9, roughness: 0.2 }));
  pole.position.y = 0.055;
  const uniforms = { map: { value: tex }, time: { value: 0 } };
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.04, 24, 12), new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: `uniform float time; varying vec2 vUv; varying float vShade;
      void main() { vUv = uv; float k = uv.x; float w = sin(uv.x * 9.0 - time * 3.2) * 0.0045 * k + sin(uv.y * 5.0 + time * 2.1) * 0.0012 * k;
        vShade = 0.82 + 0.18 * cos(uv.x * 9.0 - time * 3.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, position.y - k * k * 0.004, position.z + w, 1.0); }`,
    fragmentShader: "uniform sampler2D map; varying vec2 vUv; varying float vShade; void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb * vShade, 1.0); }",
  }));
  cloth.position.set(0.032, 0.088, 0);
  group.add(pole, cloth);
  group.userData.uniforms = uniforms;
  return group;
}

/** What a picked lunar point is like and what could be grown there (rough figures, with the evidence). */
export function lunarSite(lat, lon) {
  const near = MOON_SPOTS.map((s) => ({ s, d: Math.hypot(s.lat - lat, (((s.lon - lon + 540) % 360) - 180) * Math.cos(lat * DEG)) })).sort((a, b) => a.d - b.d)[0];
  const polar = Math.abs(lat) > 80;
  const mare = !polar && inMare(lat, lon);
  const day = Math.round(-150 + 270 * Math.max(0, Math.cos(lat * DEG)) ** 0.25);
  return {
    name: near.d < 9 ? near.s.name : `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "O"}`,
    kind: polar ? "Región polar" : mare ? "Mar lunar" : "Tierras altas",
    ground: polar ? "Cráteres en sombra eterna con hielo de agua detectado (Chandrayaan-1 M3, 2018) y bordes con luz casi continua."
      : mare ? "Llanura de basalto oscuro, rica en hierro y titanio: lava solidificada hace más de 3.000 millones de años."
        : "Roca clara (anortosita) muy vieja y llena de cráteres; más aluminio y calcio.",
    temp: polar ? "hasta −240 °C en los cráteres en sombra" : `unos ${day} °C de día y −170 °C de noche`,
    light: polar ? "en algunos bordes, sol más del 80 % del tiempo" : "14,8 días de sol y 14,8 días de noche",
    plan: polar
      ? "El mejor lugar para una granja lunar: energía solar casi continua en el borde del cráter y agua del hielo a pocos kilómetros."
      : mare ? "Buen suelo para enterrar un invernadero: 2 a 3 m de regolito encima protegen de la radiación. Hace falta luz LED durante la noche de 14 días."
        : "Terreno duro y accidentado: mejor como sitio de paso o de minería; la granja conviene en un mar o en un polo.",
  };
}

export const LUNAR_FARMING = {
  crops: [
    ["Lechuga y rábano", "ciclo de 30 a 45 días: comida fresca rápido"],
    ["Papa", "probada por el Centro Internacional de la Papa (Lima) y la NASA en condiciones de Marte (2016-2017)"],
    ["Quinua", "estudiada por la NASA desde 1993 para sistemas de soporte de vida: mucha proteína"],
    ["Trigo enano", "cultivado en la Estación Espacial y en invernaderos de la NASA"],
    ["Tomate y arveja", "dieron fruto en suelo que imita al lunar (Universidad de Wageningen, 2016)"],
  ],
  steps: [
    "Invernadero sellado y presurizado, enterrado bajo regolito contra la radiación.",
    "Agua del hielo de los polos, reciclada casi por completo.",
    "Luz LED durante las dos semanas de noche lunar; paneles solares en los bordes iluminados.",
    "Regolito mezclado con compost y microbios, o cultivo sin suelo (hidroponía).",
    "Aire con CO₂ de la respiración de la tripulación; los restos vuelven como abono.",
  ],
  evidence: [
    "2022: Arabidopsis brotó en suelo lunar real de las misiones Apolo 11, 12 y 17, aunque con estrés (Universidad de Florida, Communications Biology).",
    "2019: una semilla de algodón brotó en la cara oculta dentro de la sonda china Chang'e 4.",
    "2016: tomate, arveja, centeno y rábano dieron semilla en un simulante del suelo lunar de la NASA (Wageningen, Países Bajos).",
  ],
};
