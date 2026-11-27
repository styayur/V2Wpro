import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { generateChunk, visibleChunks, blocked } from "../src/world.js";
import { validate } from "../src/validate.js";
import {
  realize,
  cellKeys,
  inspectRoutes,
  segmentClear,
} from "../src/morph.js";
import { aim, steer, direction, flightBounds } from "./flight.js";
import { setupPanel } from "./panel.js";
const el = (id) => document.getElementById(id);
const canvas = document.querySelector("canvas"),
  keys = new Set(),
  params = new URLSearchParams(location.search);
const id = params.get("world") || "canopy";
const fail = (err) => {
  el("hud").textContent = String(err);
  console.error(err);
};
async function boot() {
  const index = await (await fetch("./worlds.json")).json();
  if (!Object.hasOwn(index, id)) throw Error("Unknown example");
  const worldUrl = new URL(index[id], document.baseURI);
  const response = await fetch(worldUrl);
  if (!response.ok) throw Error("Cannot load " + worldUrl.pathname);
  const data = await response.json();
  if (params.has("seed")) {
    if (!/^\d{1,10}$/.test(params.get("seed"))) throw Error("Invalid seed");
    data.seed = Number(params.get("seed"));
  }
  const w = data.version === "2.0" ? data : validate(data);
  const spatial = w.version === "2.0";
  const realization = spatial ? realize(w) : null;
  const routes = spatial ? inspectRoutes(w, realization) : null;
  if (routes && (!routes.connected || routes.blockedEdges.length))
    throw Error("World contains unreachable nodes or a blocked flight route");
  setupPanel(w, id, worldUrl);
  const bounds = spatial ? flightBounds(w, realization) : null;
  const nodes = new Map(
    w.topology.nodes?.map((node) => [node.id, node.position]),
  );
  const spawn = spatial ? nodes.get(w.topology.spawn) : [0, 2, 0];
  const firstEdge = w.topology.edges?.find((edge) =>
    edge.includes(w.topology.spawn),
  );
  const facing =
    firstEdge && nodes.get(firstEdge.find((node) => node !== w.topology.spawn));
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, w.budget.pixelRatio ?? 1.5),
  );
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
  if (spatial)
    for (const geometry of Object.values(shapes)) {
      geometry.center();
      geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new T.Vector3());
      geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
    }
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
    const model = await new GLTFLoader().loadAsync(
      new URL(asset.uri, worldUrl).href,
    );
    const wrapper = new T.Group();
    wrapper.add(model.scene);
    if (spatial) {
      const box = new T.Box3().setFromObject(wrapper);
      const center = box.getCenter(new T.Vector3()),
        size = box.getSize(new T.Vector3());
      model.scene.position.sub(center);
      wrapper.scale.set(
        1 / (size.x || 1),
        1 / (size.y || 1),
        1 / (size.z || 1),
      );
    }
    models.set(asset.uri, wrapper);
  }
  if (!spatial && w.prototype !== "island") {
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
      batchesCreated: 0,
      batchesDisposed: 0,
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
  let previousCell;
  function stream() {
    const position = camera.position.toArray();
    const cell = spatial
      ? position.map((n) => Math.floor(n / w.streaming.cellSize)).join(",")
      : Math.floor(-position[2] / w.rules.length);
    if (cell === previousCell) return;
    previousCell = cell;
    const needed = spatial
      ? cellKeys(w, position).filter((key) => realization.cells[key]?.length)
      : visibleChunks(w, -position[2]);
    for (const [i, c] of active)
      if (!needed.includes(i)) {
        scene.remove(c.group);
        for (const child of c.group.children)
          if (child.isInstancedMesh) {
            child.dispose();
            stats.batchesDisposed++;
          }
        active.delete(i);
        stats.unloaded++;
      }
    for (const i of needed)
      if (!active.has(i)) {
        const c = spatial
            ? {
                items: realization.cells[i].map(
                  (index) => realization.items[index],
                ),
              }
            : generateChunk(w, i),
          group = new T.Group(),
          batches = new Map();
        for (const item of c.items) {
          if (item.asset) {
            const obj = new T.Group();
            obj.add(models.get(item.asset).clone());
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
          stats.batchesCreated++;
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
  let destination = null;
  function flyTo(nodeId) {
    if (!nodes.has(nodeId)) throw Error("Unknown destination");
    flyToPoint(nodes.get(nodeId));
  }
  function flyToPoint(point) {
    destination = new T.Vector3(...point).clamp(bounds.min, bounds.max);
    const delta = destination.clone().sub(camera.position);
    if (delta.lengthSq()) aim(camera, delta.toArray());
  }
  function reset() {
    camera.position.set(...spawn);
    camera.rotation.set(0, 0, 0, "YXZ");
    if (facing)
      aim(
        camera,
        facing.map((v, i) => v - spawn[i]),
      );
    destination = null;
    boost = 0;
    cooldown = 0;
    keys.clear();
    stream();
  }
  const capture = document.createElement("button");
  capture.textContent = "Save frame";
  capture.onclick = () => {
    renderer.render(scene, camera);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = id + "-" + w.seed + ".png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };
  el("buttons").append(capture);
  reset();
  el("reset").onclick = reset;
  function press(key) {
    destination = null;
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
    "ArrowLeft",
    "ArrowRight",
    "KeyI",
    "KeyK",
  ];
  onkeydown = (e) => {
    if (
      allowed.includes(e.code) &&
      !e.target.closest("select,input,summary,a") &&
      !(e.code === "Space" && e.target.closest("button"))
    ) {
      e.preventDefault();
      press(e.code);
    }
  };
  onkeyup = (e) => keys.delete(e.code);
  onblur = () => keys.clear();
  for (const b of document.querySelectorAll("[data-key]")) {
    b.onpointerdown = (e) => {
      e.preventDefault();
      canvas.focus();
      b.setPointerCapture(e.pointerId);
      press(b.dataset.key);
    };
    b.onlostpointercapture = () => keys.delete(b.dataset.key);
  }
  if (spatial) {
    canvas.onpointerdown = (e) => {
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        destination = null;
        steer(camera, -e.movementX * 0.004, -e.movementY * 0.004);
      }
    };
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
    if (spatial) {
      steer(
        camera,
        delta("ArrowLeft", "ArrowRight") * dt * 1.6,
        delta("KeyI", "KeyK") * dt * 1.2,
      );
      if (destination) {
        const leg = destination.clone().sub(v);
        if (leg.length() <= dt * w.motion.speed) {
          v.copy(destination);
          destination = null;
        } else
          v.addScaledVector(direction(camera, 1, 0, 0), dt * w.motion.speed);
      } else {
        const heading = direction(
          camera,
          forward,
          delta("KeyD", "KeyA"),
          climb,
        );
        v.addScaledVector(heading, dt * w.motion.speed * (dash ? 3 : 1));
      }
      v.clamp(bounds.min, bounds.max);
    } else {
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
    }
    if (spatial) {
      if (
        segmentClear(
          camera.position.toArray(),
          v.toArray(),
          w.physics.radius,
          realization.solids,
        )
      )
        camera.position.copy(v);
      else {
        stats.hits++;
        destination = null;
      }
    } else {
      const solids = [...active.values()].flatMap((c) => c.solids);
      {
        const nextChunk = Math.floor(-v.z / w.rules.length);
        if (!active.has(nextChunk))
          solids.push(...generateChunk(w, nextChunk).solids);
      }
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
      position: camera.position.toArray(),
      heading: camera.getWorldDirection(new T.Vector3()).toArray(),
      textures: renderer.info.memory.textures,
      distance: spatial
        ? Math.hypot(...camera.position.toArray().map((n, i) => n - spawn[i]))
        : -camera.position.z,
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
      (spatial ? " cells　·　" : " chunks　·　") +
      stats.triangles +
      " tris　·　" +
      stats.drawCalls +
      " calls";
    requestAnimationFrame(render);
  }
  window.v2w = { stats, seed: w.seed, version: w.version };
  if (spatial)
    Object.assign(window.v2w, {
      flyTo,
      flyToPoint,
      reset,
      bounds: [bounds.min.toArray(), bounds.max.toArray()],
      cellSize: w.streaming.cellSize,
      clearPath: (a, b) =>
        segmentClear(a, b, w.physics.radius, realization.solids),
      topology: w.topology,
      action: w.motion.action,
      speed: w.motion.speed,
      routes,
      async fingerprint() {
        const bytes = new TextEncoder().encode(JSON.stringify(realization));
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      },
    });
  requestAnimationFrame(render);
}
boot().catch(fail);
