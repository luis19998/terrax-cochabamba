// 3D view of the terrain around a plot, as a block diagram: real elevation with the satellite image on top, where the
// rain water runs (computed from the relief), the catchment that drains into the plot, the real rivers and canals
// of OpenStreetMap, an animated flow, a "how high can the water rise" simulation and, on the sides of the block, the
// soil layers and the groundwater moving underneath (a diagram, not a measurement).
//   Elevation: Terrarium tiles (SRTM-based, ~10 m pixels at zoom 14), served by /api/terrain (the bucket has no CORS).
//   Image:     Esri World Imagery tiles (same Web Mercator grid, so both line up pixel by pixel).
//   Waterways: OpenStreetMap through the Overpass API.
// three.js is loaded only when the view is opened, so the rest of the app stays light on a phone.
const Z = 14;
const TILE = 256;
const WINDOW = 256; // pixels of the window around the plot (~2.3 km at zoom 14 and this latitude)
const GRID = 128;   // vertices per side of the 3D mesh

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z * TILE;
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * TILE;
};
const x2lon = (x, z) => (x / (2 ** z * TILE)) * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / (2 ** z * TILE); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No cargó ${url}`));
    img.src = url;
  });
}

/** Stitches the tiles that cover the window and returns a canvas of WINDOW x WINDOW pixels. */
async function mosaic(cx, cy, urlFor) {
  const left = Math.round(cx - WINDOW / 2);
  const top = Math.round(cy - WINDOW / 2);
  const canvas = document.createElement("canvas");
  canvas.width = WINDOW;
  canvas.height = WINDOW;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const jobs = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + WINDOW - 1) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + WINDOW - 1) / TILE); tx++) {
      jobs.push(loadImage(urlFor(tx, ty)).then((img) => ctx.drawImage(img, tx * TILE - left, ty * TILE - top)));
    }
  }
  await Promise.all(jobs);
  return { canvas, ctx, left, top };
}

/** Rain water on the relief: depressions filled (priority flood), steepest-descent direction and the area that drains
 *  through every cell. n x n grid of heights in metres. */
export function hydrology(h, n) {
  const N = n * n;
  const filled = Float32Array.from(h);
  const closed = new Uint8Array(N);
  const heap = [];
  const push = (e, c) => {
    heap.push([e, c]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (let i = 0; i < n; i++) for (const c of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (!closed[c]) { closed[c] = 1; push(filled[c], c); }
  const D = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  while (heap.length) {
    const [e, c] = pop();
    const x = c % n;
    const y = (c / n) | 0;
    for (const [dx, dy] of D) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const nb = yy * n + xx;
      if (closed[nb]) continue;
      closed[nb] = 1;
      filled[nb] = Math.max(filled[nb], e + 1e-3);
      push(filled[nb], nb);
    }
  }
  const dir = new Int32Array(N).fill(-1);
  for (let c = 0; c < N; c++) {
    const x = c % n;
    const y = (c / n) | 0;
    let best = 0;
    for (const [dx, dy] of D) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const nb = yy * n + xx;
      const drop = (filled[c] - filled[nb]) / Math.hypot(dx, dy);
      if (drop > best) { best = drop; dir[c] = nb; }
    }
  }
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
  const acc = new Float32Array(N).fill(1);
  for (const c of order) if (dir[c] >= 0) acc[dir[c]] += acc[c];
  return { filled, dir, acc };
}

/** Cells whose water ends up passing through cell `p`. */
function catchmentOf(dir, p) {
  const up = new Map();
  dir.forEach((d, c) => { if (d >= 0) { if (!up.has(d)) up.set(d, []); up.get(d).push(c); } });
  const inside = new Uint8Array(dir.length);
  const stack = [p];
  inside[p] = 1;
  while (stack.length) for (const c of up.get(stack.pop()) || []) if (!inside[c]) { inside[c] = 1; stack.push(c); }
  return inside;
}

const RAMP = [[0, [46, 125, 50]], [0.25, [124, 179, 66]], [0.45, [229, 214, 106]], [0.65, [196, 140, 68]], [0.82, [142, 94, 60]], [1, [245, 245, 245]]];
function ramp(t) {
  for (let k = 1; k < RAMP.length; k++) {
    if (t <= RAMP[k][0]) {
      const [t0, a] = RAMP[k - 1];
      const [t1, b] = RAMP[k];
      const f = (t - t0) / (t1 - t0);
      return a.map((v, i) => v + (b[i] - v) * f);
    }
  }
  return RAMP[RAMP.length - 1][1];
}

/** Texture of the sides of the block: soil, subsoil with the groundwater band, and rock. */
function strataTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  const bands = [[0, 0.1, "#3b2a1a"], [0.1, 0.32, "#7a5230"], [0.32, 0.5, "#a0784c"], [0.5, 0.66, "#2f7fd1"], [0.66, 1, "#5d5f66"]];
  for (const [a, b, col] of bands) { g.fillStyle = col; g.fillRect(0, a * 256, 512, (b - a) * 256); }
  // gravel and grains in each layer, flowing streaks in the water layer
  for (let k = 0; k < 2200; k++) {
    const y = Math.random() * 256;
    const inWater = y > 128 && y < 169;
    g.fillStyle = inWater ? "rgba(170,225,255,.55)" : y > 169 ? "rgba(30,30,35,.35)" : "rgba(255,240,220,.18)";
    if (inWater) g.fillRect(Math.random() * 512, y, 10 + Math.random() * 26, 1.3);
    else g.fillRect(Math.random() * 512, y, 2 + Math.random() * 3, 2 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

async function waterways(bbox) {
  const [s, w, n, e] = bbox.map((v) => v.toFixed(5));
  const q = `[out:json][timeout:20];(way["waterway"~"river|stream|canal|ditch|drain|brook"](${s},${w},${n},${e});way["natural"="water"](${s},${w},${n},${e});way["landuse"="reservoir"](${s},${w},${n},${e}););out geom;`;
  // the main server is often busy: a mirror takes over
  let last = null;
  for (const host of ["https://overpass-api.de", "https://overpass.kumi.systems"]) {
    try {
      const r = await fetch(`${host}/api/interpreter?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(20000) });
      if (r.ok) return (await r.json()).elements || [];
      last = new Error(`Overpass ${r.status}`);
    } catch (error) { last = error; }
  }
  throw last;
}

export async function renderTerrain3D(container, { lat, lon, polygon, exaggeration = 2, onStats, onPoint }) {
  container.innerHTML = '<p class="hint" style="padding:1rem">Cargando el relieve en 3D…</p>';
  const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("../vendor/three/OrbitControls.js")]);
  const cx = lon2x(lon, Z);
  const cy = lat2y(lat, Z);
  const [dem, photo] = await Promise.all([
    mosaic(cx, cy, (x, y) => `/api/terrain/${Z}/${x}/${y}.png`),
    mosaic(cx, cy, (x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}`),
  ]);

  // elevation in metres from the Terrarium encoding: R * 256 + G + B / 256 - 32768
  const px = dem.ctx.getImageData(0, 0, WINDOW, WINDOW).data;
  const elevAt = (x, y) => {
    const i = (Math.min(WINDOW - 1, Math.max(0, Math.round(y))) * WINDOW + Math.min(WINDOW - 1, Math.max(0, Math.round(x)))) * 4;
    return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
  };
  let min = Infinity;
  let max = -Infinity;
  const heights = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const e = elevAt((i / (GRID - 1)) * (WINDOW - 1), (j / (GRID - 1)) * (WINDOW - 1));
    heights[j * GRID + i] = e;
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (2 ** Z * TILE);
  const sizeKm = (WINDOW * metresPerPixel) / 1000;
  const cellM = (sizeKm * 1000) / (GRID - 1);
  const plotElev = elevAt(WINDOW / 2, WINDOW / 2);

  // where the rain water goes
  const hyd = hydrology(heights, GRID);
  const plotCell = Math.round((GRID - 1) / 2) * GRID + Math.round((GRID - 1) / 2);
  const basin = catchmentOf(hyd.dir, plotCell);
  const basinCells = basin.reduce((a, b) => a + b, 0);
  const STREAM = Math.max(60, Math.round((GRID * GRID) / 200));
  let nearest = Infinity;
  for (let c = 0; c < GRID * GRID; c++) if (hyd.acc[c] >= STREAM) nearest = Math.min(nearest, Math.hypot((c % GRID) - (plotCell % GRID), ((c / GRID) | 0) - ((plotCell / GRID) | 0)));
  const stats = {
    min, max, plotElev, sizeKm, metresPerPixel,
    basinHa: (basinCells * cellM * cellM) / 1e4,
    streamM: Number.isFinite(nearest) ? nearest * cellM : null,
  };
  if (onStats) onStats(stats);

  // base images: satellite, height colours with contour lines, slope
  const toPx = ([la, lo]) => [lon2x(lo, Z) - photo.left, lat2y(la, Z) - photo.top];
  const cellPx = (c) => [((c % GRID) / (GRID - 1)) * (WINDOW - 1), (((c / GRID) | 0) / (GRID - 1)) * (WINDOW - 1)];
  const sat = photo.canvas;
  const make = () => { const c = document.createElement("canvas"); c.width = c.height = WINDOW; return c; };
  const hyps = make();
  const slope = make();
  {
    const hi = hyps.getContext("2d").createImageData(WINDOW, WINDOW);
    const si = slope.getContext("2d").createImageData(WINDOW, WINDOW);
    const range = Math.max(1, max - min);
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => range / s <= 14) || 250;
    for (let y = 0; y < WINDOW; y++) for (let x = 0; x < WINDOW; x++) {
      const e = elevAt(x, y);
      const ex = elevAt(x + 1, y);
      const ey = elevAt(x, y + 1);
      const dzdx = (ex - elevAt(x - 1, y)) / (2 * metresPerPixel);
      const dzdy = (ey - elevAt(x, y - 1)) / (2 * metresPerPixel);
      const shade = Math.max(0.45, Math.min(1.15, 0.9 + (-dzdx - dzdy) * 0.6));
      const contour = Math.floor(e / step) !== Math.floor(ex / step) || Math.floor(e / step) !== Math.floor(ey / step);
      const [r, g, b] = ramp((e - min) / range);
      const i = (y * WINDOW + x) * 4;
      const k = contour ? 0.45 : shade;
      hi.data[i] = r * k; hi.data[i + 1] = g * k; hi.data[i + 2] = b * k; hi.data[i + 3] = 255;
      const pct = Math.hypot(dzdx, dzdy) * 100;
      const col = pct < 5 ? [67, 160, 71] : pct < 15 ? [253, 216, 53] : pct < 30 ? [251, 140, 0] : [229, 57, 53];
      si.data[i] = col[0] * shade; si.data[i + 1] = col[1] * shade; si.data[i + 2] = col[2] * shade; si.data[i + 3] = 255;
    }
    hyps.getContext("2d").putImageData(hi, 0, 0);
    slope.getContext("2d").putImageData(si, 0, 0);
    stats.contourM = step;
  }

  // scene
  container.innerHTML = "";
  const width = container.clientWidth || 600;
  const heightFor = (w) => Math.max(320, Math.min(560, w * 0.75));
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    container.innerHTML = '<p class="hint" style="padding:1rem">Este dispositivo no puede mostrar gráficos en 3D.</p>';
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, heightFor(width));
  container.append(renderer.domElement);
  const tip = document.createElement("div");
  tip.className = "terrain-tip";
  tip.hidden = true;
  container.append(tip);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1530);
  scene.fog = new THREE.Fog(0x0b1530, sizeKm * 2.2, sizeKm * 5);
  const camera = new THREE.PerspectiveCamera(45, width / heightFor(width), 0.01, 100);
  camera.position.set(0, -sizeKm * 1.05, sizeKm * 0.8);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -sizeKm * 0.02);
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; });

  const geometry = new THREE.PlaneGeometry(sizeKm, sizeKm, GRID - 1, GRID - 1);
  const work = make();
  const texture = new THREE.CanvasTexture(work);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
  sun.position.set(-1, -1, 2);
  scene.add(sun);

  // sides of the block: soil layers and groundwater (diagram)
  const bottom = -sizeKm * 0.12;
  const strata = strataTexture(THREE);
  const sideMat = new THREE.MeshStandardMaterial({ map: strata, roughness: 0.9, side: THREE.DoubleSide });
  const sideGeos = [];
  const edges = [
    (k) => k, // top row (north)
    (k) => (GRID - 1) * GRID + k, // bottom row (south)
    (k) => k * GRID, // west
    (k) => k * GRID + GRID - 1, // east
  ];
  for (const at of edges) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(GRID * 2 * 3);
    const uv = new Float32Array(GRID * 2 * 2);
    const idx = [];
    for (let k = 0; k < GRID; k++) {
      uv.set([k / (GRID - 1), 1, k / (GRID - 1), 0], k * 4);
      if (k < GRID - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.userData.at = at;
    sideGeos.push(g);
    scene.add(new THREE.Mesh(g, sideMat));
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sizeKm, sizeKm), new THREE.MeshStandardMaterial({ color: 0x3d3f45 }));
  floor.position.z = bottom;
  floor.rotation.x = Math.PI;
  scene.add(floor);

  // animated water flowing down the channels
  const P = 700;
  const flowGeo = new THREE.BufferGeometry();
  const flowPos = new Float32Array(P * 3);
  flowGeo.setAttribute("position", new THREE.BufferAttribute(flowPos, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const dg = dot.getContext("2d");
  const rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, "rgba(220,250,255,1)");
  rg.addColorStop(0.4, "rgba(80,200,255,.9)");
  rg.addColorStop(1, "rgba(80,200,255,0)");
  dg.fillStyle = rg;
  dg.fillRect(0, 0, 32, 32);
  const flow = new THREE.Points(flowGeo, new THREE.PointsMaterial({ size: sizeKm * 0.014, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(flow);
  const sources = [];
  for (let c = 0; c < GRID * GRID; c++) if (hyd.acc[c] >= STREAM / 4 && hyd.dir[c] >= 0) sources.push(c);
  const parts = Array.from({ length: P }, () => ({ c: sources[(Math.random() * sources.length) | 0], t: Math.random(), life: 40 + Math.random() * 80 }));

  // water rising: the "bathtub" simulation
  const water = new THREE.Mesh(new THREE.PlaneGeometry(sizeKm, sizeKm), new THREE.MeshStandardMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.2 }));
  water.visible = false;
  scene.add(water);

  let factor = exaggeration;
  const zOf = (e) => ((e - min) / 1000) * factor;
  const xyOf = (c) => [((c % GRID) / (GRID - 1) - 0.5) * sizeKm, (0.5 - ((c / GRID) | 0) / (GRID - 1)) * sizeKm];
  function applyHeights(f) {
    factor = f;
    const pos = geometry.attributes.position;
    // PlaneGeometry vertices go row by row from the top-left, same order as the heights grid
    for (let k = 0; k < pos.count; k++) pos.setZ(k, zOf(heights[k]));
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    for (const g of sideGeos) {
      const p = g.attributes.position;
      for (let k = 0; k < GRID; k++) {
        const c = g.userData.at(k);
        const [x, y] = xyOf(c);
        p.setXYZ(k * 2, x, y, zOf(heights[c]));
        p.setXYZ(k * 2 + 1, x, y, bottom);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
    }
    setLevel(level);
  }

  // what is drawn on top of the relief
  const opts = { mode: "sat", streams: true, basin: true, rivers: true };
  let osm = [];
  function compose() {
    const g = work.getContext("2d");
    const base = opts.mode === "hyps" ? hyps : opts.mode === "slope" ? slope : sat;
    g.globalAlpha = 1;
    g.drawImage(base, 0, 0);
    if (opts.mode === "water") { g.fillStyle = "rgba(5,15,40,.55)"; g.fillRect(0, 0, WINDOW, WINDOW); }
    const cs = WINDOW / (GRID - 1);
    if (opts.basin) {
      g.fillStyle = "rgba(0,229,200,.28)";
      for (let c = 0; c < basin.length; c++) if (basin[c]) { const [x, y] = cellPx(c); g.fillRect(x - cs / 2, y - cs / 2, cs + 0.5, cs + 0.5); }
    }
    if (opts.streams) {
      g.lineCap = "round";
      for (let c = 0; c < hyd.acc.length; c++) {
        if (hyd.acc[c] < STREAM || hyd.dir[c] < 0) continue;
        const [x0, y0] = cellPx(c);
        const [x1, y1] = cellPx(hyd.dir[c]);
        g.strokeStyle = "rgba(56,199,255,.95)";
        g.lineWidth = Math.min(4, 0.8 + Math.log2(hyd.acc[c] / STREAM) * 0.7);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
    if (opts.rivers) {
      for (const el of osm) {
        if (!el.geometry) continue;
        const kind = el.tags && (el.tags.waterway || (el.tags.natural === "water" || el.tags.landuse === "reservoir" ? "lake" : ""));
        const pts = el.geometry.map((p) => toPx([p.lat, p.lon]));
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        if (kind === "lake") { g.closePath(); g.fillStyle = "rgba(30,136,229,.7)"; g.fill(); continue; }
        g.strokeStyle = kind === "river" ? "#1565ff" : kind === "canal" ? "#00e5ff" : kind === "ditch" || kind === "drain" ? "#7cf3c4" : "#4fa8ff";
        g.lineWidth = kind === "river" ? 4 : kind === "canal" ? 3 : 2;
        g.setLineDash(kind === "ditch" || kind === "drain" ? [4, 3] : []);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // the plot
    g.lineWidth = 3;
    g.strokeStyle = "#ff8a3d";
    if (polygon && polygon.length >= 3) {
      g.beginPath();
      polygon.map(toPx).forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
    }
    g.fillStyle = "#ff3d6e";
    g.beginPath();
    g.arc(WINDOW / 2, WINDOW / 2, 4.5, 0, Math.PI * 2);
    g.fill();
    texture.needsUpdate = true;
  }

  let level = 0;
  function setLevel(m) {
    level = m;
    water.visible = m > 0;
    water.position.z = zOf(min + m);
    let under = 0;
    for (const e of heights) if (e < min + m) under += 1;
    return { flooded: under / heights.length, plot: plotElev < min + m };
  }

  applyHeights(exaggeration);
  compose();
  const bbox = [y2lat(photo.top + WINDOW, Z), x2lon(photo.left, Z), y2lat(photo.top, Z), x2lon(photo.left + WINDOW, Z)];
  const osmReady = waterways(bbox).then((els) => {
    osm = els;
    compose();
    const named = [...new Set(els.map((e) => e.tags && e.tags.name).filter(Boolean))];
    const counts = {};
    for (const e of els) { const k = e.tags.waterway || "lake"; counts[k] = (counts[k] || 0) + 1; }
    return { counts, named, total: els.length };
  }).catch(() => null);

  // hover or tap: what is at that point
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function probe(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh)[0];
    if (!hit || !hit.uv) { tip.hidden = true; return; }
    const i = Math.round(hit.uv.x * (GRID - 1));
    const j = Math.round((1 - hit.uv.y) * (GRID - 1));
    const c = j * GRID + i;
    const elev = heights[c];
    const x = Math.min(GRID - 2, Math.max(1, i));
    const y = Math.min(GRID - 2, Math.max(1, j));
    const sl = Math.hypot((heights[y * GRID + x + 1] - heights[y * GRID + x - 1]) / (2 * cellM), (heights[(y + 1) * GRID + x] - heights[(y - 1) * GRID + x]) / (2 * cellM)) * 100;
    const drains = (hyd.acc[c] * cellM * cellM) / 1e4;
    const info = { elev, slope: sl, drainsHa: drains, stream: hyd.acc[c] >= STREAM, basin: Boolean(basin[c]) };
    tip.hidden = false;
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.innerHTML = `<b>${Math.round(elev)} m</b> · pendiente ${Math.round(sl)} %<br>${info.stream ? "Cauce: aquí corre el agua de lluvia" : `Aquí escurre el agua de ${drains < 1 ? "menos de 1 ha" : `${Math.round(drains)} ha`}`}${info.basin ? "<br>Dentro de la cuenca de tu terreno" : ""}`;
    if (onPoint && e.type === "click") onPoint(info);
  }
  renderer.domElement.addEventListener("pointermove", probe);
  renderer.domElement.addEventListener("click", probe);
  renderer.domElement.addEventListener("pointerleave", () => { tip.hidden = true; });

  // follow the container width (phone rotation, window resize)
  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (!w) return;
    renderer.setSize(w, heightFor(w));
    camera.aspect = w / heightFor(w);
    camera.updateProjectionMatrix();
  });
  observer.observe(container);

  let running = true;
  const clock = new THREE.Clock();
  (function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    strata.offset.x -= dt * 0.03; // groundwater moving through the layer
    if (flow.visible) {
      for (let k = 0; k < P; k++) {
        const q = parts[k];
        q.t += dt * (2 + Math.min(6, Math.log2(hyd.acc[q.c] + 1)));
        while (q.t >= 1) {
          q.t -= 1;
          q.life -= 1;
          const next = hyd.dir[q.c];
          if (next < 0 || q.life <= 0) { q.c = sources[(Math.random() * sources.length) | 0]; q.life = 40 + Math.random() * 80; q.t = 0; break; }
          q.c = next;
        }
        const next = hyd.dir[q.c] >= 0 ? hyd.dir[q.c] : q.c;
        const [x0, y0] = xyOf(q.c);
        const [x1, y1] = xyOf(next);
        flowPos[k * 3] = x0 + (x1 - x0) * q.t;
        flowPos[k * 3 + 1] = y0 + (y1 - y0) * q.t;
        flowPos[k * 3 + 2] = zOf(heights[q.c] + (heights[next] - heights[q.c]) * q.t) + sizeKm * 0.004;
      }
      flowGeo.attributes.position.needsUpdate = true;
    }
    controls.update();
    renderer.render(scene, camera);
  })();

  return {
    stats,
    waterways: osmReady,
    setExaggeration: applyHeights,
    setMode(mode) { opts.mode = mode; compose(); },
    toggle(name, on) { if (name === "flow") flow.visible = on; else { opts[name] = on; compose(); } },
    setLevel,
    spin(on) { controls.autoRotate = on; },
    dispose() {
      running = false;
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      container.innerHTML = "";
    },
  };
}
