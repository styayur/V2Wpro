import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { generateChunk, visibleChunks, blocked } from "../src/world.js";
import { validate } from "../src/validate.js";
const el = (id) => document.getElementById(id);
const canvas = document.querySelector("canvas"),
  keys = new Set(),
  params = new URLSearchParams(location.search);
const id = params.get("world") || "arcade";
el("world").value = id;
el("world").onchange = (e) =>
  (location.search = new URLSearchParams({ world: e.target.value }));
const fail = (err) => {
  el("hud").textContent = String(err);
  console.error(err);
};
async function boot() {
  if (!["arcade", "island", "gate", "custom"].includes(id))
    throw Error("Unknown example");
  const w = validate(await (await fetch("./examples/" + id + ".json")).json());
  el("title").textContent = w.name;
  if(id === "custom") el("world").add(new Option(w.name,"custom",true,true));
  el("reference").hidden = id !== "arcade" && id !== "gate";
  if (id === "gate") {
    const section = el("reference");
    section.querySelector("video").src = "./examples/dash.mp4";
    section.querySelector("h2").textContent = "Ring acceleration study";
    section.querySelector("p").textContent =
      "A brief burst of forward travel becomes a player-triggered dash through repeated rings.";
    section.querySelector("a").href = "./examples/gate.json";
  }
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, w.budget.pixelRatio));
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(64, 1, 0.12, 220);
  scene.background = new T.Color(w.style.sky);
  scene.fog = new T.FogExp2(w.style.sky, 0.009);
  scene.add(new T.HemisphereLight(0xfff1d7, 0x78949a, w.style.light));
  const sun = new T.DirectionalLight(0xffe6c4, 2);
  sun.position.set(-15, 25, 8);
  scene.add(sun);
  const shapes = {
    box: new T.BoxGeometry(),
    rock: new T.IcosahedronGeometry(0.5, 0),
    mound: new T.IcosahedronGeometry(0.5, 1),
    arch: new T.TorusGeometry(0.5, 0.045, 8, 40, Math.PI),
    ring: new T.TorusGeometry(0.5, 0.045, 8, 40),
  };
  const materials = Object.fromEntries(
    ["stone", "accent"].map((k) => [
      k,
      new T.MeshStandardMaterial({
        color: w.style[k],
        roughness: 0.86,
        flatShading: true,
      }),
    ]),
  );
  const models = new Map();
  for (const asset of w.assets) {
    const model = await new GLTFLoader().loadAsync("./examples/" + asset.uri);
    models.set(asset.uri, model.scene);
  }
  if (w.prototype !== "island") {
    const floor = new T.Mesh(shapes.box, materials.stone);
    floor.scale.set(
      w.topology.halfWidth * 2,
      0.5,
      w.streaming.count * w.rules.length,
    );
    floor.position.set(0, -2.35, -floor.scale.z / 2);
    scene.add(floor);
  }
  const active = new Map(),
    stats = {
      loaded: 0,
      unloaded: 0,
      actions: 0,
      hits: 0,
      frames: 0,
      frameMs: 0,
      dt: [],
      distance: 0,
      chunks: [],
      triangles: 0,
      drawCalls: 0,
      geometries: 0,
    };
  function stream() {
    const needed = visibleChunks(w, -camera.position.z);
    for (const [i, c] of active)
      if (!needed.includes(i)) {
        scene.remove(c.group);
        for (const child of c.group.children)
          if (child.isInstancedMesh) child.dispose();
        active.delete(i);
        stats.unloaded++;
      }
    for (const i of needed)
      if (!active.has(i)) {
        const c = generateChunk(w, i),
          group = new T.Group(),
          batches = new Map();
        for (const item of c.items) {
          if (item.asset) {
            const obj = models.get(item.asset).clone();
            obj.position.fromArray(item.position);
            obj.scale.fromArray(item.size);
            group.add(obj);
            continue;
          }
          const key = item.shape + "/" + item.material;
          if (!batches.has(key)) batches.set(key, []);
          batches.get(key).push(item);
        }
        for (const items of batches.values()) {
          const first = items[0],
            mesh = new T.InstancedMesh(
              shapes[first.shape],
              materials[first.material],
              items.length,
            );
          items.forEach((v, j) =>
            mesh.setMatrixAt(
              j,
              new T.Matrix4().makeScale(...v.size).setPosition(...v.position),
            ),
          );
          group.add(mesh);
        }
        scene.add(group);
        active.set(i, { group, solids: c.solids });
        stats.loaded++;
      }
    stats.chunks = needed;
  }
  let boost = 0,
    last = performance.now(),
    cooldown = 0;
  function reset() {
    camera.position.set(0, 2, 0);
    boost = 0;
    cooldown = 0;
    keys.clear();
    stream();
  }
  reset();
  el("reset").onclick = reset;
  function press(key) {
    if (key === "Space" && !keys.has(key) && cooldown <= 0) {
      boost = 0.55;
      cooldown = 1;
      stats.actions++;
    }
    keys.add(key);
  }
  const allowed = [
    "Space",
    "KeyW",
    "KeyS",
    "KeyA",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
  ];
  onkeydown = (e) => {
    if (allowed.includes(e.code) && e.target.tagName !== "SELECT") {
      e.preventDefault();
      press(e.code);
    }
  };
  onkeyup = (e) => keys.delete(e.code);
  onblur = () => keys.clear();
  for (const b of document.querySelectorAll("[data-key]")) {
    b.onpointerdown = (e) => {
      b.setPointerCapture(e.pointerId);
      press(b.dataset.key);
    };
    b.onlostpointercapture = () => keys.delete(b.dataset.key);
  }
  function render(now) {
    const ms = now - last;
    last = now;
    const dt = Math.min(0.08, ms / 1000);
    boost = Math.max(0, boost - dt);
    cooldown = Math.max(0, cooldown - dt);
    const delta = (a, b) => Number(keys.has(a)) - Number(keys.has(b));
    const dash = w.motion.action === "dash" && boost > 0;
    const forward = dash ? 3 : delta("KeyW", "KeyS");
    const climb =
      delta("ArrowUp", "ArrowDown") +
      (boost > 0 && w.motion.action === "flight" ? 1 : 0);
    const v = camera.position.clone();
    v.x = T.MathUtils.clamp(
      v.x + delta("KeyD", "KeyA") * dt * 9,
      -w.topology.halfWidth,
      w.topology.halfWidth,
    );
    v.y = T.MathUtils.clamp(v.y + climb * dt * 8, -1, 12);
    v.z = T.MathUtils.clamp(
      v.z - forward * dt * w.motion.speed,
      -w.rules.length * w.streaming.count + 0.1,
      0,
    );
    const solids = [...active.values()].flatMap((c) => c.solids);
    const nextChunk = Math.floor(-v.z / w.rules.length);
    if (!active.has(nextChunk)) solids.push(...generateChunk(w,nextChunk).solids);
    // Substeps prevent crossing thin bridge and pillar colliders during a dash.
    const start = camera.position.clone(),
      steps = Math.max(1, Math.ceil(v.distanceTo(start) / w.physics.radius));
    for (let j = 1; j <= steps; j++) {
      const p = start.clone().lerp(v, j / steps);
      if (blocked(solids, p.toArray(), w.physics.radius)) {
        stats.hits++;
        break;
      }
      camera.position.copy(p);
    }
    camera.fov = w.motion.action === "survey" && boost > 0 ? 88 : 64;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (
      canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
      canvas.height !== Math.floor(height * renderer.getPixelRatio())
    )
      renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    stream();
    renderer.render(scene, camera);
    Object.assign(stats, {
      frames: stats.frames + 1,
      distance: -camera.position.z,
      altitude: camera.position.y,
      fov: camera.fov,
      frameMs: ms,
      triangles: renderer.info.render.triangles,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
    });
    stats.dt.push(ms);
    if (stats.dt.length > 180) stats.dt.shift();
    el("hud").textContent =
      Math.round(stats.distance) +
      " m　·　" +
      stats.chunks.length +
      " chunks　·　" +
      stats.triangles +
      " tris　·　" +
      stats.drawCalls +
      " calls";
    requestAnimationFrame(render);
  }
  window.v2w = { stats, seed: w.seed };
  requestAnimationFrame(render);
}
boot().catch(fail);
