import * as THREE from "./vendor/three.module.js";
import { SoftwareRenderer } from "./software-renderer.js";
const $ = (id) => document.getElementById(id),
  canvas = $("atlas-canvas"),
  stage = $("map-3d"),
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderer,
  scene,
  camera,
  group,
  record,
  features = [],
  meshes = [],
  frame,
  version = 0,
  active = true,
  auto = false,
  yaw = 0,
  tilt = 0.72,
  distance = 144,
  hover = null,
  drag = null,
  pending = true,
  entrance = 0,
  lastTime = 0;
const target = new THREE.Vector3();
let flight = null,
  labels = [],
  lastScope = "",
  lastRecord = "";
function flyTo(next, duration = 850) {
  const destination = new THREE.Vector3(...next.target);
  if (reduced) {
    target.copy(destination);
    distance = next.distance;
    position();
    request();
    return;
  }
  flight = {
    from: target.clone(),
    to: destination,
    startDistance: distance,
    distance: next.distance,
    start: performance.now(),
    duration,
  };
  request();
}
function fitCamera(items) {
  const box = new THREE.Box3();
  for (const mesh of items) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox);
  }
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3()),
    aspect = Math.max(0.5, camera.aspect);
  const fitted = Math.min(
    250,
    Math.max(
      26,
      (Math.max(size.x / aspect, size.z * 0.95, size.y * 1.8) /
        (2 * Math.tan(THREE.MathUtils.degToRad(43 / 2)))) *
        1.3,
    ),
  );
  flyTo({ target: [center.x, center.y * 0.45, center.z], distance: fitted });
}
function updateLabels() {
  if (!camera) return;
  const box = elBox();
  for (const label of labels) {
    const p = label.point.clone().project(camera),
      x = ((p.x + 1) * box.w) / 2,
      y = ((1 - p.y) * box.h) / 2;
    label.element.hidden =
      p.z > 1 || x < 20 || x > box.w - 20 || y < 85 || y > box.h - 105;
    label.element.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
  }
}
function elBox() {
  return { w: stage.clientWidth, h: stage.clientHeight };
}
function rebuildLabels(projection) {
  $("map-labels").innerHTML = "";
  labels = [];
  const ranked = features
    .filter((x) => x.record)
    .slice()
    .sort((a, b) => b.record.turns["2"].valid - a.record.turns["2"].valid)
    .slice(0, 3);
  const selected = features.find(
    (x) => x.record?.code === record?.code && record?.level === "mu",
  );
  if (selected && !ranked.includes(selected)) ranked.push(selected);
  for (const item of ranked) {
    const point = d3.geoPath(projection).centroid(item.feature);
    const v = measure(item.record),
      max = Math.max(
        1,
        ...features
          .filter((x) => x.record)
          .map((x) => Math.abs(measure(x.record))),
      );
    const element = document.createElement("span");
    element.className = "map-place-label";
    element.textContent =
      item.record.level === "uf"
        ? item.record.uf.toUpperCase()
        : item.record.name;
    $("map-labels").append(element);
    labels.push({
      element,
      point: new THREE.Vector3(
        point[0],
        2.5 + (Math.abs(v) / max) * 14,
        point[1],
      ),
    });
  }
}

const cache = new Map(),
  raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2(),
  teal = new THREE.Color("#77dfc1"),
  neutral = new THREE.Color("#314650"),
  coral = new THREE.Color("#ed967f");
function measure(r) {
  if ($("map-metric").value === "margin")
    return window.VoteAnalytics.marginChange(r);
  if ($("map-metric").value === "turnout")
    return r.turns["2"].turnout - r.turns["1"].turnout;
  const n = $("map-candidate").value,
    a = r.turns["1"],
    b = r.turns["2"],
    x = a.votes[n],
    y = b.votes[n],
    k = $("map-metric").value;
  if (["pp", "share"].includes(k) && (!a.valid || !b.valid)) return null;
  return k === "delta"
    ? y - x
    : k === "pp"
      ? (y / b.valid - x / a.valid) * 100
      : k === "votes"
        ? y
        : (y / b.valid) * 100;
}
function value(v) {
  if (v == null || !Number.isFinite(v)) return "Não calculável";
  const k = $("map-metric").value;
  return (
    (["pp", "delta", "margin", "turnout"].includes(k) && v > 0 ? "+" : "") +
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v) +
    (k === "pp"
      ? " p.p."
      : k === "share"
        ? "%"
        : k === "turnout"
          ? " comparecimentos"
          : " votos")
  );
}
async function json(path) {
  if (!cache.has(path))
    cache.set(
      path,
      fetch(path).then((r) => {
        if (!r.ok) throw Error("Cartografia indisponível");
        return r.json();
      }),
    );
  return cache.get(path);
}
function request() {
  pending = true;
}
function position() {
  const d = distance;
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(tilt) * d,
    target.y + Math.sin(tilt) * d,
    target.z + Math.cos(yaw) * Math.cos(tilt) * d,
  );
  camera.lookAt(target);
}
function resize() {
  if (!renderer) return;
  const w = stage.clientWidth,
    h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  position();
  request();
}
function init() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    renderer = new SoftwareRenderer(canvas);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#0e1c26", 0.0021);
  camera = new THREE.PerspectiveCamera(43, 1, 1, 650);
  scene.add(new THREE.HemisphereLight("#c5f8ef", "#10202b", 2.5));
  const key = new THREE.DirectionalLight("#edfff8", 4.4);
  key.position.set(-35, 100, 45);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -85;
  key.shadow.camera.right = 85;
  key.shadow.camera.top = 85;
  key.shadow.camera.bottom = -85;
  key.shadow.camera.far = 240;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.12;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#6caccd", 2.3);
  rim.position.set(60, 25, -50);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShadowMaterial({ opacity: 0.34 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.45;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(300, 40, "#31535d", "#213d49");
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.position.y = -0.38;
  scene.add(grid);
  group = new THREE.Group();
  scene.add(group);
  new ResizeObserver(resize).observe(stage);
  resize();
  frame = requestAnimationFrame(tick);
}
function tick(time) {
  frame = requestAnimationFrame(tick);
  if (!active || document.hidden) return;
  if (renderer.software && time - lastTime < 80 && !pending) return;
  if (flight) {
    const t = Math.min(1, (time - flight.start) / flight.duration),
      ease = 1 - Math.pow(1 - t, 3);
    target.lerpVectors(flight.from, flight.to, ease);
    distance =
      flight.startDistance + (flight.distance - flight.startDistance) * ease;
    position();
    pending = true;
    if (t >= 1) flight = null;
  }
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  let animate = false;
  if (entrance < 1 && !reduced && !renderer.software) {
    entrance = Math.min(1, entrance + dt * 1.2);
    group.scale.y = 1 - Math.pow(1 - entrance, 3);
    animate = true;
  }
  if (auto && !reduced && !drag) {
    yaw += dt * 0.065;
    position();
    animate = true;
  }
  if (pending || animate) {
    renderer.render(scene, camera);
    updateLabels();
    pending = false;
  }
}
function dispose() {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose();
    if (Array.isArray(child.material))
      child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }
  meshes = [];
  labels = [];
  $("map-labels").innerHTML = "";
  hover = null;
  $("map-tooltip").hidden = true;
}
window.drawAtlas = async function (r) {
  record = r;
  if (!renderer) return;
  const ticket = ++version,
    municipal = r.uf !== "br" && r.uf !== "zz";
  if (r.uf === "zz") {
    dispose();
    request();
    $("map-title").textContent = "Exterior · sem geometria";
    $("map-loading").textContent =
      "Exterior disponível nas tabelas; não representado no mapa.";
    $("map-min").textContent = "";
    $("map-max").textContent = "";
    $("map-detail").textContent =
      "Escolha uma localidade do exterior no filtro ou na tabela.";
    return;
  }
  try {
    const [geo, records] = await Promise.all([
      json(
        municipal ? `data/geometry/${r.uf}.json` : "data/geometry/states.json",
      ),
      municipal
        ? json(`data/municipalities/${r.uf}.json`)
        : Promise.resolve(window.atlasData.states.filter((s) => s.uf !== "zz")),
    ]);
    if (ticket !== version) return;
    const byId = new Map(
      records.map((x) => [municipal ? String(x.ibge) : x.uf.toUpperCase(), x]),
    );
    features = geo.features.map((f) => ({
      feature: f,
      record: byId.get(
        municipal ? String(f.properties.id) : f.properties.sigla,
      ),
    }));
    if (window.atlasFocusCodes && r.uf === "rj")
      features = features.filter((x) =>
        window.atlasFocusCodes.includes(String(x.record?.ibge)),
      );
    if (r.level === "mu")
      features = features.filter((x) => x.record?.code === r.code);
    const scopeGeo = {
      type: "FeatureCollection",
      features: features.map((x) => x.feature),
    };
    const vals = features.filter((x) => x.record).map((x) => measure(x.record)),
      max = Math.max(1, ...vals.map(Math.abs)),
      diverging = ["delta", "pp", "margin", "turnout"].includes(
        $("map-metric").value,
      ),
      projection = d3.geoMercator().fitExtent(
        [
          [-48, -43],
          [48, 43],
        ],
        scopeGeo,
      );
    dispose();
    for (const item of features) {
      const v = item.record ? measure(item.record) : 0,
        ratio = Math.abs(v) / max,
        color =
          v < 0
            ? neutral.clone().lerp(coral, ratio)
            : neutral.clone().lerp(teal, ratio);
      if (!item.record) color.set("#4a545c");
      const depth = 1.15 + ratio * 14,
        polygons =
          item.feature.geometry.type === "MultiPolygon"
            ? item.feature.geometry.coordinates
            : [item.feature.geometry.coordinates];
      const shapes = [];
      for (const polygon of polygons) {
        const rings = polygon.map((ring) =>
          ring.map((point) => {
            const [x, y] = projection(point);
            return new THREE.Vector2(x, -y);
          }),
        );
        if (rings[0].length < 3) continue;
        const shape = new THREE.Shape(rings[0]);
        for (const hole of rings.slice(1))
          shape.holes.push(new THREE.Path(hole));
        shapes.push(shape);
      }
      if (!shapes.length) continue;
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.25,
        roughness: 0.38,
        emissive: color,
        emissiveIntensity: 0.025,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { item, color: color.clone() };
      group.add(mesh);
      meshes.push(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 35),
        new THREE.LineBasicMaterial({
          color:
            item.record?.code === r.code && r.level === "mu"
              ? "#ffffff"
              : "#b6eddf",
          transparent: true,
          opacity:
            item.record?.code === r.code && r.level === "mu" ? 0.95 : 0.28,
        }),
      );
      edges.position.y = 0.025;
      edges.userData.selected =
        item.record?.code === r.code && r.level === "mu";
      group.add(edges);
    }
    rebuildLabels(projection);
    const scope = r.uf + ":" + (window.atlasRegion?.id || ""),
      key = r.level + ":" + (r.code || r.uf);
    if (lastRecord !== key || lastScope !== scope) {
      yaw = 0;
      tilt = 0.82;
      const focused =
        r.level === "mu"
          ? meshes.filter((m) => m.userData.item.record?.code === r.code)
          : meshes;
      fitCamera(focused);
      lastRecord = key;
      lastScope = scope;
    }
    const mapped = features.filter((x) => x.record).length;
    if (active)
      $("map-loading").textContent =
        r.level === "mu"
          ? `1 município em foco · volte pelo caminho acima para comparar${renderer.software ? " · 3D compatível" : ""}`
          : `${mapped}/${window.atlasFocusCodes?.length || records.length} territórios · arraste para girar · toque para selecionar${renderer.software ? " · 3D compatível" : ""}`;
    if (active) {
      $("map-title").textContent =
        r.level === "mu"
          ? r.name + " · município"
          : municipal
            ? `${window.atlasRegion?.name || window.atlasData.states.find((s) => s.uf === r.uf).name} · municípios`
            : "Brasil · estados";
      $("map-min").textContent = value(diverging ? -max : 0);
      $("map-max").textContent = value(max);
      $("map-legend-bar").style.background = diverging
        ? "linear-gradient(90deg,#ed967f,#314650,#77dfc1)"
        : "linear-gradient(90deg,#203b47,#77dfc1)";
      $("map-detail").textContent =
        r.level === "mu"
          ? `${r.name} · ${value(measure(r))}`
          : "Arraste para girar. Selecione um território para abrir os resultados.";
      bindControls();
    }
    entrance = reduced ? 1 : 0;
    group.scale.y = reduced || renderer.software ? 1 : 0.001;
    request();
  } catch (e) {
    $("map-loading").textContent = e.message;
    switchView(false);
    toastFallback(
      "O mapa 3D não pôde ser carregado. A visão 2D está disponível.",
    );
  }
};
function bindControls() {
  $("map-plus").onclick = () => {
    flight = null;
    distance = Math.max(12, distance / 1.18);
    position();
    request();
  };
  $("map-minus").onclick = () => {
    flight = null;
    distance = Math.min(260, distance * 1.18);
    position();
    request();
  };
  $("map-reset").onclick = () => {
    yaw = 0;
    tilt = 0.72;
    fitCamera(meshes);
  };
  $("map-orbit").disabled = reduced;
  $("map-orbit").onclick = () => {
    auto = !auto;
    $("map-orbit").setAttribute("aria-pressed", String(auto));
    request();
  };
}
function switchView(is3d) {
  active = is3d && !!renderer;
  $("map-3d").hidden = !active;
  $("map-drawing").hidden = active;
  $("view-3d").setAttribute("aria-pressed", String(active));
  $("view-2d").setAttribute(
    "aria-pressed",
    String(!active && (!window.atlasMode || window.atlasMode === "2d")),
  );
  $("view-weight").setAttribute(
    "aria-pressed",
    String(window.atlasMode === "weight"),
  );
  $("map-labels").hidden = !active;
  $("view-local").setAttribute(
    "aria-pressed",
    String(window.atlasMode === "local"),
  );
  $("local-inspector").hidden = window.atlasMode !== "local";
  $("map-orbit").hidden = !active;
  $("height-caption").textContent = active
    ? "Altura = magnitude · relevo estatístico, não físico"
    : "Cor = indicador · área do território não representa eleitorado";
  if (active) {
    resize();
    if (record) window.drawAtlas(record);
    bindControls();
  } else if (window.atlasRecord) window.drawElectionMap(window.atlasRecord);
  $("map-tooltip").hidden = true;
  request();
}
function toastFallback(message) {
  $("status").textContent = message;
}
window.setAtlasView = (mode) => {
  window.atlasMode = mode;
  switchView(mode === "3d");
  window.persistAtlasURL?.();
  window.dispatchEvent(new Event("atlas:view"));
};
$("view-3d").onclick = () => window.setAtlasView("3d");
$("view-2d").onclick = () => window.setAtlasView("2d");
$("view-weight").onclick = () => window.setAtlasView("weight");
$("view-local").onclick = () => window.setAtlasView("local");
canvas.addEventListener("pointerdown", (e) => {
  flight = null;
  drag = { x: e.clientX, y: e.clientY, yaw, tilt, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    yaw = drag.yaw - dx * 0.006;
    tilt = Math.max(0.4, Math.min(1.45, drag.tilt + dy * 0.005));
    position();
    request();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(meshes)[0]?.object || null;
  if (hover !== hit) {
    if (hover) hover.material.emissiveIntensity = 0.025;
    hover = hit;
    if (hover) hover.material.emissiveIntensity = 0.28;
    request();
  }
  if (hit?.userData.item.record) {
    const r = hit.userData.item.record;
    const c = window.VoteAnalytics.candidate(r, $("map-candidate").value);
    $("map-tooltip").textContent =
      `${r.name} · ${value(measure(r))} · 2º turno: ${new Intl.NumberFormat("pt-BR").format(c.y)} votos · Δ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(c.p)} p.p.`;
    $("map-tooltip").hidden = false;
    const stageRect = stage.getBoundingClientRect();
    $("map-tooltip").style.left =
      Math.max(
        8,
        Math.min(e.clientX - stageRect.left + 14, stage.clientWidth - 240),
      ) + "px";
    $("map-tooltip").style.top =
      Math.max(
        70,
        Math.min(e.clientY - stageRect.top - 45, stage.clientHeight - 90),
      ) + "px";
    $("map-detail").textContent = `${r.name} · ${value(measure(r))}`;
  } else $("map-tooltip").hidden = true;
});
canvas.addEventListener("pointerup", (e) => {
  const moved = drag?.moved;
  drag = null;
  if (moved) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(meshes)[0];
  if (hit?.object.userData.item.record)
    window.chooseAtlasRecord(hit.object.userData.item.record);
});
canvas.addEventListener("pointercancel", () => (drag = null));
canvas.addEventListener("pointerleave", () => {
  $("map-tooltip").hidden = true;
  if (hover) {
    hover.material.emissiveIntensity = 0.025;
    hover = null;
    request();
  }
});
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    flight = null;
    distance = Math.max(12, Math.min(260, distance + e.deltaY * 0.1));
    position();
    request();
  },
  { passive: false },
);
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  switchView(false);
  toastFallback("O contexto 3D foi interrompido. Continue explorando em 2D.");
  $("view-3d").disabled = true;
});
async function captureMap() {
  if (active) {
    if (flight) {
      target.copy(flight.to);
      distance = flight.distance;
      flight = null;
      position();
    }
    group.scale.y = 1;
    entrance = 1;
    renderer.render(scene, camera);
    return { image: canvas, ratio: canvas.width / canvas.height };
  }
  const svg = $("election-map").cloneNode(true);
  const vb = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  svg.setAttribute("width", vb[2]);
  svg.setAttribute("height", vb[3]);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return { image, ratio: image.width / image.height || 2 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}
$("snapshot").onclick = async () => {
  if (!record) return;
  await window.atlasRenderReady;
  try {
    const vertical = $("export-format").value === "vertical",
      w = vertical ? 1080 : 1600,
      h = vertical ? 1920 : 1150,
      pad = vertical ? 80 : 65,
      out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#0b1722";
    ctx.fillRect(0, 0, w, h);
    const shot = await captureMap(),
      maxW = w - pad * 2,
      maxH = vertical ? 940 : 760,
      mapW = Math.min(maxW, maxH * shot.ratio),
      mapH = mapW / shot.ratio;
    ctx.drawImage(shot.image, (w - mapW) / 2, vertical ? 370 : 175, mapW, mapH);
    ctx.fillStyle = "#77dfc1";
    ctx.font = (vertical ? "24" : "20") + "px Arial";
    ctx.fillText(
      "VOTO EM DADOS / ATLAS ELEITORAL 2026",
      pad,
      vertical ? 135 : 60,
    );
    ctx.fillStyle = "#edf3f5";
    ctx.font = (vertical ? "bold 54" : "34") + "px Arial";
    wrap(ctx, record.name, pad, vertical ? 230 : 120, maxW, vertical ? 64 : 40);
    ctx.fillStyle = "#9db4bf";
    ctx.font = (vertical ? "26" : "18") + "px Arial";
    ctx.fillText(
      ["margin", "turnout"].includes($("map-metric").value)
        ? "Comparação territorial · 1º → 2º turno"
        : $("map-candidate").selectedOptions[0].text,
      pad,
      vertical ? 330 : 160,
    );
    const foot = vertical ? 1380 : 990;
    ctx.fillStyle = "#edf3f5";
    ctx.font = (vertical ? "32" : "24") + "px Arial";
    wrap(
      ctx,
      $("map-metric").selectedOptions[0].text + ": " + value(measure(record)),
      pad,
      foot,
      maxW,
      vertical ? 45 : 30,
    );
    const grad = ctx.createLinearGradient(pad, 0, w - pad, 0);
    grad.addColorStop(
      0,
      ["delta", "pp", "margin", "turnout"].includes($("map-metric").value)
        ? "#ed967f"
        : "#203b47",
    );
    grad.addColorStop(0.5, "#314650");
    grad.addColorStop(1, "#77dfc1");
    ctx.fillStyle = grad;
    ctx.fillRect(pad, foot + (vertical ? 110 : 40), maxW, 5);
    ctx.fillStyle = "#9db4bf";
    ctx.font = (vertical ? "23" : "14") + "px Arial";
    ctx.fillText($("map-min").textContent, pad, foot + (vertical ? 150 : 65));
    const right = $("map-max").textContent;
    ctx.fillText(
      right,
      w - pad - ctx.measureText(right).width,
      foot + (vertical ? 150 : 65),
    );
    ctx.font = (vertical ? "23" : "13") + "px Arial";
    wrap(
      ctx,
      ["weight", "local"].includes(window.atlasMode)
        ? $("height-caption").textContent
        : active
          ? "Altura = magnitude do indicador. Relevo estatístico. Escala relativa ao recorte."
          : "Mapa 2D · escala relativa ao recorte.",
      pad,
      foot + (vertical ? 205 : 88),
      maxW,
      vertical ? 32 : 18,
    );
    ctx.font = (vertical ? "21" : "12") + "px Arial";
    wrap(
      ctx,
      "Fonte: TSE · Geometria: BR GeoJSON / IBGE · Gabriel Ferreira",
      pad,
      vertical ? 1760 : 1115,
      maxW,
      28,
    );
    if (vertical) {
      ctx.font = "15px Arial";
      wrap(ctx, record.turns["2"].source, pad, 1825, maxW, 22);
    }
    if (!vertical) {
      ctx.font = "9px Arial";
      wrap(ctx, record.turns["2"].source, pad, 1140, maxW, 12);
    }
    out.toBlob((blob) => {
      if (!blob) return;
      const preview = $("export-preview"),
        previous = preview.getAttribute("src");
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(blob);
      preview.src = url;
      $("export-save").href = url;
      $("export-save").download =
        "atlas-eleitoral-" + record.uf + (vertical ? "-9x16" : "") + ".png";
      $("export-dialog").showModal();
    }, "image/png");
  } catch (e) {
    toastFallback("Não foi possível exportar a imagem neste navegador.");
  }
};

$("export-close").onclick = () => $("export-dialog").close();
try {
  init();
  distance = stage.clientWidth < 500 ? 174 : 144;
  position();
  bindControls();
  if (window.atlasRecord) window.drawAtlas(window.atlasRecord);
  if (window.pendingAtlasView) window.setAtlasView(window.pendingAtlasView);
} catch (e) {
  $("view-3d").disabled = true;
  switchView(false);
  toastFallback(
    "Seu navegador não disponibilizou WebGL. O atlas 2D preserva todos os dados.",
  );
}
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  request();
});
