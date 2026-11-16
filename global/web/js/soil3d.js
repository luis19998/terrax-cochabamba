// The soil of a plot in 3D, down to 2 m: one block per SoilGrids depth (colour from texture and organic carbon,
// stones from coarse fragments), the roots of the next crop growing to their usual depth (FAO-56), rain soaking in at
// the speed the texture allows (seen on the open front face of the cut), an illustrative water table with water moving underground, and the minerals that the
// pH and texture make likely. Hover or tap a layer or a crystal to read it.
//   renderSoil3D(container, { profile, summary, crop, wetBottom, onPick }) -> { explode, toggle, dispose }
const DEPTHS = [["0-5cm", 0, 5], ["5-15cm", 5, 15], ["15-30cm", 15, 30], ["30-60cm", 30, 60], ["60-100cm", 60, 100], ["100-200cm", 100, 200]];
// usual maximum root depth (m), FAO-56 table 22, by crop group
export const ROOT_DEPTH = { tuber: 0.5, cereal: 1.2, grain: 1.0, legume: 0.8, vegetable: 0.45, herb: 0.4, tree: 1.7, flower: 0.4, fallow: 0.6 };

/** A layer colour: sand yellowish, clay reddish, silt greyish; organic carbon darkens it. */
function layerColor(l) {
  const sand = l.sand ?? 40;
  const clay = l.clay ?? 25;
  const silt = l.silt ?? 35;
  const t = sand + clay + silt || 100;
  const base = [
    (sand * 196 + clay * 150 + silt * 140) / t,
    (sand * 160 + clay * 92 + silt * 118) / t,
    (sand * 102 + clay * 62 + silt * 96) / t,
  ];
  const dark = Math.max(0.35, 1 - Math.min(1, (l.soc ?? 5) / 45));
  return base.map((v) => Math.round(v * dark));
}

/** The minerals a layer probably has, from pH and texture (a guide, not a mineral analysis). */
export function likelyMinerals(l) {
  const out = [];
  if ((l.sand ?? 0) >= 45) out.push({ id: "quartz", name: "Cuarzo", why: "mucha arena: casi toda la arena es cuarzo", color: 0xf4f7ff });
  if ((l.clay ?? 0) >= 25 && (l.phh2o ?? 7) < 6.2) out.push({ id: "kaolinite", name: "Caolinita (arcilla)", why: "arcilla en suelo ácido y lavado", color: 0xf2e6d0 });
  if ((l.clay ?? 0) >= 25 && (l.phh2o ?? 7) >= 7) out.push({ id: "smectite", name: "Esmectita (arcilla que se hincha)", why: "arcilla en suelo alcalino: se hincha al mojarse y se agrieta al secar", color: 0xc9c2a0 });
  if ((l.phh2o ?? 7) >= 7.6) out.push({ id: "calcite", name: "Calcita (carbonato de calcio)", why: `pH ${(l.phh2o ?? 0).toFixed(1)}: los suelos alcalinos suelen guardar cal`, color: 0xffffff });
  if ((l.phh2o ?? 7) < 6.5 && (l.clay ?? 0) >= 20) out.push({ id: "ironoxide", name: "Óxidos de hierro (hematita, goethita)", why: "suelo ácido con arcilla: el hierro se oxida y da color rojizo", color: 0xc4471f });
  if ((l.soc ?? 0) >= 15) out.push({ id: "humus", name: "Humus", why: "mucho carbono orgánico: restos de plantas ya descompuestos", color: 0x2a1a0e });
  return out;
}

export async function renderSoil3D(container, { profile, summary, crop, wetBottom = false, onPick }) {
  container.innerHTML = '<p class="hint" style="padding:1rem">Armando el corte del suelo en 3D…</p>';
  const [THREE, { OrbitControls }] = await Promise.all([import("three"), import("../vendor/three/OrbitControls.js")]);
  // layers: SoilGrids by depth, or an estimate from the 0-30 cm summary
  let layers = (profile || []).filter((l) => l && (l.clay !== null || l.sand !== null));
  const estimated = layers.length < 3;
  const generic = estimated && (!summary || (summary.clay == null && summary.sand == null && summary.ph == null));
  if (estimated) {
    // with no data at all, a typical loam profile, shown as an example
    const s = generic ? { ph: summary && summary.ph != null ? summary.ph : 6.8, clay: 22, sand: 40, silt: 38, soc_gkg: 18 } : summary;
    layers = DEPTHS.map(([d], k) => ({ depth: d, phh2o: s.ph ?? null, clay: s.clay != null ? s.clay + k * 2 : null, sand: s.sand ?? null, silt: s.silt ?? null, soc: s.soc_gkg != null ? s.soc_gkg * Math.max(0.1, 1 - k * 0.22) : null, cfvo: generic ? 5 + k * 4 : null, bdod: null }));
  }
  const byDepth = Object.fromEntries(layers.map((l) => [l.depth, l]));
  const rows = DEPTHS.map(([d, top, bot]) => ({ ...(byDepth[d] || { depth: d }), top: top / 100, bot: bot / 100 }));

  container.innerHTML = "";
  const width = container.clientWidth || 600;
  const heightFor = (w) => Math.max(340, Math.min(560, w * 0.8));
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
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
  const camera = new THREE.PerspectiveCamera(40, width / heightFor(width), 0.01, 50);
  camera.position.set(1.1, 0.15, 2.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.95, -0.1);
  controls.enableDamping = true;
  controls.minDistance = 1;
  controls.maxDistance = 6;
  let sway = true;
  renderer.domElement.addEventListener("pointerdown", () => { sway = false; });
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.8);
  key.position.set(2, 3, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88bbff, 0.8);
  rim.position.set(-2, 1, -2);
  scene.add(rim);

  const W = 1.2; // block width in metres
  const block = new THREE.Group();
  scene.add(block);
  const layerMeshes = [];
  rows.forEach((l, k) => {
    const [r, g, b] = layerColor(l).map((v) => Math.round(v * (1 - k * 0.05)));
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 128, 128);
    const stones = Math.min(160, Math.round((l.cfvo ?? 8) * 3));
    for (let i = 0; i < 900; i++) { const v = Math.random() * 40 - 20; ctx.fillStyle = `rgba(${r + v},${g + v},${b + v},.6)`; ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    for (let i = 0; i < stones; i++) { ctx.fillStyle = `rgba(${150 + Math.random() * 60},${145 + Math.random() * 50},${140 + Math.random() * 40},.9)`; ctx.beginPath(); ctx.ellipse(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = l.bot - l.top;
    // half a block: the front face (z = 0) is the open cut where roots, water and minerals show
    const geo = new THREE.BoxGeometry(W, h, W / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, emissive: 0x000000 }));
    mesh.position.z = -W / 4;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1a120a })));
    mesh.userData = { layer: l, home: -(l.top + h / 2), k };
    mesh.position.y = mesh.userData.home + 3 + k * 0.6; // they fall into place
    block.add(mesh);
    layerMeshes.push(mesh);
  });
  // grass on top
  const grass = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, W / 2), new THREE.MeshStandardMaterial({ color: 0x5fae3c, roughness: 1 }));
  grass.position.set(0, 0.01, -W / 4);
  block.add(grass);

  // the next crop: a small plant and its roots growing to their usual depth
  const rootDepth = ROOT_DEPTH[crop && crop.group] || 0.6;
  const roots = new THREE.Group();
  const rootMat = new THREE.MeshStandardMaterial({ color: 0xf3e2b8, roughness: 0.7, emissive: 0x3a2a10 });
  const branch = (from, dir, len, depthLeft, w) => {
    if (len < 0.03 || depthLeft <= 0) return;
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    to.y = Math.max(to.y, -rootDepth);
    to.z = 0;
    const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * len * 0.3, 0, 0)), to]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, w, 5, false), rootMat);
    roots.add(m);
    const n = depthLeft > 1 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.1, dir.y - 0.3, 0).normalize();
      branch(to, d, len * 0.72, depthLeft - 1, w * 0.7);
    }
  };
  for (let i = 0; i < 5; i++) branch(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3((i - 2) * 0.25, -1, 0).normalize(), rootDepth * 0.42, 4, 0.012);
  roots.position.z = 0.02;
  roots.scale.y = 0.001;
  block.add(roots);
  const plant = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0x3f8f2f }));
  stem.position.y = 0.13;
  plant.add(stem);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6), new THREE.MeshStandardMaterial({ color: 0x5fc04a, roughness: 0.6 }));
    leaf.scale.set(1.5, 0.25, 0.7);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.07, 0.1 + i * 0.03, Math.sin(a) * 0.07);
    leaf.rotation.y = -a;
    plant.add(leaf);
  }
  plant.position.z = -0.03;
  plant.scale.setScalar(0.001);
  block.add(plant);

  // the water table (illustrative) and water moving through it
  const tableDepth = wetBottom ? 1.25 : 1.7;
  const aquifer = new THREE.Mesh(new THREE.BoxGeometry(W * 1.006, 2 - tableDepth, W / 2 + 0.012), new THREE.MeshStandardMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.42, roughness: 0.1, depthWrite: false }));
  aquifer.position.set(0, -(tableDepth + (2 - tableDepth) / 2), -W / 4);
  block.add(aquifer);
  const dropTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "rgba(220,250,255,1)");
    rg.addColorStop(0.4, "rgba(80,200,255,.9)");
    rg.addColorStop(1, "rgba(80,200,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const N = 420;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  const kind = new Uint8Array(N); // 0 rain soaking in, 1 groundwater moving sideways
  const resetDrop = (i) => {
    kind[i] = i % 3 === 0 ? 1 : 0;
    pos[i * 3] = (Math.random() - 0.5) * W * 0.96;
    pos[i * 3 + 2] = 0.012 + Math.random() * 0.03; // on the open face of the cut
    pos[i * 3 + 1] = kind[i] ? -(tableDepth + Math.random() * (2 - tableDepth) * 0.95) : Math.random() * 0.3 + 0.05;
    if (kind[i]) pos[i * 3] = -W / 2;
    vel[i] = 0.5 + Math.random() * 0.8;
  };
  for (let i = 0; i < N; i++) { resetDrop(i); pos[i * 3] = kind[i] ? (Math.random() - 0.5) * W : pos[i * 3]; pos[i * 3 + 1] = kind[i] ? pos[i * 3 + 1] : -Math.random() * tableDepth; }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ size: 0.045, map: dropTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  block.add(drops);
  // how fast water soaks in each layer: sand fast, clay slow
  const speedAt = (y) => {
    const l = rows.find((r) => -y >= r.top && -y < r.bot) || rows[rows.length - 1];
    return 0.08 + ((l.sand ?? 40) / 100) * 0.5 - ((l.clay ?? 25) / 100) * 0.25;
  };

  // likely minerals, as small crystals inside their layer
  const crystals = [];
  rows.forEach((l) => {
    for (const m of likelyMinerals(l)) {
      const geo = m.id === "calcite" ? new THREE.OctahedronGeometry(0.03) : m.id === "quartz" ? new THREE.ConeGeometry(0.018, 0.06, 6) : m.id === "humus" ? new THREE.DodecahedronGeometry(0.022) : new THREE.BoxGeometry(0.05, 0.008, 0.04);
      const mat = new THREE.MeshStandardMaterial({ color: m.color, metalness: m.id === "ironoxide" ? 0.4 : 0.1, roughness: 0.25, emissive: m.color, emissiveIntensity: 0.25 });
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(geo, mat);
        // on the open face, and a few on the sides
        const side = k % 4;
        const y = -(l.top + 0.01 + Math.random() * Math.max(0.01, l.bot - l.top - 0.02));
        if (side < 3) c.position.set((Math.random() - 0.5) * W * 0.9, y, 0.016);
        else c.position.set((Math.random() < 0.5 ? -1 : 1) * (W / 2 + 0.012), y, -Math.random() * W / 2);
        c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        c.userData = { mineral: m, layer: l };
        block.add(c);
        crystals.push(c);
      }
    }
  });

  // labels of depth on one corner
  const ruler = new THREE.Group();
  for (const [, , cm] of DEPTHS) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    tick.position.set(-W / 2 - 0.08, -cm / 100, 0);
    ruler.add(tick);
  }
  block.add(ruler);

  // hover and tap
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const describe = (o) => {
    if (o.userData.mineral) {
      const m = o.userData.mineral;
      return { html: `<b>Posible: ${m.name}</b><br>${m.why}.<br><small>Deducido del pH y la textura, no de un análisis mineral.</small>`, text: `Posiblemente hay ${m.name.toLowerCase()} a ${o.userData.layer.depth.replace("cm", " cm")}: ${m.why}.` };
    }
    const l = o.userData.layer;
    const f = (v, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));
    return {
      html: `<b>${l.depth.replace("-", " a ").replace("cm", " cm")}</b><br>pH ${f(l.phh2o, 1)} · arcilla ${f(l.clay)} % · arena ${f(l.sand)} % · limo ${f(l.silt)} %<br>carbono orgánico ${f(l.soc, 1)} g/kg${l.cfvo !== null && l.cfvo !== undefined ? ` · piedras ${f(l.cfvo)} %` : ""}${l.bdod ? ` · densidad ${f(l.bdod, 2)} kg/dm³` : ""}`,
      text: `Entre ${l.depth.replace("-", " y ").replace("cm", " cm")}: ${(l.clay ?? 0) >= 35 ? "mucha arcilla, guarda agua pero se encharca" : (l.sand ?? 0) >= 55 ? "arenosa, el agua pasa rápido" : "textura equilibrada"}${(l.soc ?? 0) >= 15 ? ", con buena materia orgánica" : ""}.`,
    };
  };
  function probe(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...crystals, ...layerMeshes], false)[0];
    layerMeshes.forEach((m) => { m.material.emissive.setHex(0x000000); });
    if (!hit) { tip.hidden = true; return; }
    if (hit.object.userData.layer && !hit.object.userData.mineral) hit.object.material.emissive.setHex(0x333322);
    const d = describe(hit.object);
    tip.hidden = false;
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.innerHTML = d.html;
    if (e.type === "click" && onPick) onPick(d.text);
  }
  renderer.domElement.addEventListener("pointermove", probe);
  renderer.domElement.addEventListener("click", probe);
  renderer.domElement.addEventListener("pointerleave", () => { tip.hidden = true; layerMeshes.forEach((m) => m.material.emissive.setHex(0)); });

  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (!w) return;
    renderer.setSize(w, heightFor(w));
    camera.aspect = w / heightFor(w);
    camera.updateProjectionMatrix();
  });
  observer.observe(container);

  let gap = 0;
  let running = true;
  const clock = new THREE.Clock();
  (function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    // layers fall into place, then the plant and its roots grow
    layerMeshes.forEach((m) => {
      const target = m.userData.home - m.userData.k * gap;
      m.position.y += (target - m.position.y) * Math.min(1, dt * (3 + m.userData.k));
    });
    if (t > 1.2) { plant.scale.setScalar(Math.min(1, plant.scale.x + dt * 0.8)); roots.scale.y = Math.min(1, roots.scale.y + dt * 0.35); }
    roots.position.y = -gap * 1.5;
    aquifer.position.y = -(tableDepth + (2 - tableDepth) / 2) - gap * 4.5;
    for (let i = 0; i < N; i++) {
      if (kind[i]) {
        pos[i * 3] += dt * vel[i] * 0.18;
        if (pos[i * 3] > W / 2) resetDrop(i);
      } else {
        pos[i * 3 + 1] -= dt * vel[i] * speedAt(pos[i * 3 + 1]);
        if (pos[i * 3 + 1] < -tableDepth) resetDrop(i);
      }
    }
    dropGeo.attributes.position.needsUpdate = true;
    if (sway) block.rotation.y = Math.sin(t * 0.35) * 0.5;
    controls.update();
    renderer.render(scene, camera);
  })();

  return {
    estimated,
    generic,
    rows,
    rootDepth,
    tableDepth,
    minerals: [...new Map(rows.flatMap((l) => likelyMinerals(l)).map((m) => [m.id, m])).values()],
    explode(x) { gap = x; },
    toggle(name, on) {
      if (name === "water") { drops.visible = on; aquifer.visible = on; }
      if (name === "roots") { roots.visible = on; plant.visible = on; }
      if (name === "minerals") crystals.forEach((c) => { c.visible = on; });
      if (name === "spin") sway = on;
    },
    dispose() {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.innerHTML = "";
    },
  };
}
