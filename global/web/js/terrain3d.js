// 3D view of the terrain around a plot: real elevation with the real satellite image draped on top.
//   Elevation: Terrarium tiles (SRTM-based, ~10 m pixels at zoom 14), served by /api/terrain because the source
//              bucket sends no CORS header.
//   Image:     Esri World Imagery tiles (same Web Mercator grid, so both line up pixel by pixel).
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

export async function renderTerrain3D(container, { lat, lon, polygon, exaggeration = 2, onStats }) {
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
  const plotElev = elevAt(WINDOW / 2, WINDOW / 2);
  if (onStats) onStats({ min, max, plotElev, sizeKm, metresPerPixel });

  // outline of the plot on the satellite image
  const toPx = ([la, lo]) => [lon2x(lo, Z) - photo.left, lat2y(la, Z) - photo.top];
  const ctx = photo.ctx;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff8a3d";
  if (polygon && polygon.length >= 3) {
    ctx.beginPath();
    polygon.map(toPx).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.arc(WINDOW / 2, WINDOW / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // scene
  container.innerHTML = "";
  const width = container.clientWidth || 600;
  const height = Math.max(320, Math.min(520, width * 0.75));
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    container.innerHTML = '<p class="hint" style="padding:1rem">Este dispositivo no puede mostrar gráficos en 3D.</p>';
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef3f6);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
  camera.position.set(0, -sizeKm * 0.95, sizeKm * 0.75);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.enableDamping = true;

  const geometry = new THREE.PlaneGeometry(sizeKm, sizeKm, GRID - 1, GRID - 1);
  const texture = new THREE.CanvasTexture(photo.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-1, -1, 2);
  scene.add(sun);

  function applyHeights(factor) {
    const pos = geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      // PlaneGeometry vertices go row by row from the top-left, same order as the heights grid
      pos.setZ(k, ((heights[k] - min) / 1000) * factor);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  applyHeights(exaggeration);

  // follow the container width (phone rotation, window resize)
  const heightFor = (w) => Math.max(300, Math.min(520, w * 0.75));
  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (!w) return;
    renderer.setSize(w, heightFor(w));
    camera.aspect = w / heightFor(w);
    camera.updateProjectionMatrix();
  });
  observer.observe(container);

  let running = true;
  (function loop() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return {
    setExaggeration: applyHeights,
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
