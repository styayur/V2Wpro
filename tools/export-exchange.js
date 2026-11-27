import { readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { BoxGeometry, Color, IcosahedronGeometry, TorusGeometry } from "three";
import { inspectRoutes, realize } from "../src/morph.js";

// Bake an independently readable, static local-world GLB. Collision meshes use
// the WorldIR solid extents because the recipient collides with triangles.
export function exportExchange(world) {
  const scene = realize(world);
  if (scene.items.length >= 2500) throw Error("Exchange exceeds 2499 mesh nodes");
  const routes = inspectRoutes(world, scene);
  if (!routes.connected || routes.blockedEdges.length) throw Error("Exchange requires clear physical routes");
  if (!scene.solids.length) throw Error("Recipient requires collision geometry");
  const solidCounts = new Map();
  const boundsKey = (center, size) => JSON.stringify([center, size]);
  for (const {center, extent} of scene.solids) {
    const key = boundsKey(center, extent.map(v => v * 2));
    solidCounts.set(key, (solidCounts.get(key) ?? 0) + 1);
  }
  const materials = ["stone", "accent"].map(slot => ({
    name: slot, pbrMetallicRoughness: {
      baseColorFactor: [...new Color(world.style[slot]).toArray(), 1], metallicFactor: 0, roughnessFactor: 1
    }
  }));
  const gltf = { asset: { version: "2.0", generator: "V2Wpro exchange" }, scene: 0,
    scenes: [{ name: world.name, nodes: [], extras: { seed: world.seed, topology: world.topology,
      assets: world.assets.map(({ uri, source, license }) => ({ assetPath: uri, source, license })),
      evidence: world.evidence, unknowns: world.unknowns } }],
    nodes: [], meshes: [], materials, buffers: [], bufferViews: [], accessors: [] };
  const parts = [];
  let byteLength = 0, triangleCount = 0;
  function accessor(array, type, bounds) {
    const start = byteLength;
    const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = Buffer.alloc((4 - data.length % 4) % 4);
    parts.push(data, padding);
    byteLength += data.length + padding.length;
    const bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length }) - 1;
    const width = type === "SCALAR" ? 1 : 3;
    return gltf.accessors.push({ bufferView, componentType: width === 1 ? 5123 : 5126,
      count: array.length / width, type, ...bounds }) - 1;
  }
  const shapes = new Map(), meshes = new Map();
  function geometry(shape) {
    if (shapes.has(shape)) return shapes.get(shape);
    const g = shape === "rock" || shape === "mound" ? new IcosahedronGeometry(0.5, shape === "mound" ? 1 : 0)
      : shape === "arch" || shape === "ring" ? new TorusGeometry(0.5, 0.045, 8, 40, shape === "arch" ? Math.PI : 2 * Math.PI)
      : new BoxGeometry();
    g.computeBoundingBox();
    const bounds = { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() };
    const attributes = { POSITION: accessor(g.attributes.position.array, "VEC3", bounds),
      NORMAL: accessor(g.attributes.normal.array, "VEC3") };
    const primitive = { attributes };
    if (g.index) primitive.indices = accessor(g.index.array, "SCALAR");
    const result = { primitive, triangles: (g.index?.count ?? g.attributes.position.count) / 3 };
    shapes.set(shape, result);
    return result;
  }
  const solidLow = [Infinity, Infinity, Infinity], solidHigh = [-Infinity, -Infinity, -Infinity];
  const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
  for (const item of scene.items) {
    const boundsId = boundsKey(item.position, item.size);
    const remaining = solidCounts.get(boundsId) ?? 0;
    const solid = remaining > 0;
    if (solid) solidCounts.set(boundsId, remaining - 1);
    const shape = solid || item.shape === "asset" ? "box" : item.shape;
    const { primitive, triangles } = geometry(shape);
    triangleCount += triangles;
    const key = shape + "/" + item.material;
    if (!meshes.has(key)) meshes.set(key, gltf.meshes.push({ primitives: [
      { ...primitive, material: item.material === "accent" ? 1 : 0 }
    ] }) - 1);
    const bounds = gltf.accessors[primitive.attributes.POSITION];
    item.position.forEach((p,i) => {
      if (solid) {
        solidLow[i] = Math.min(solidLow[i], p - item.size[i] / 2);
        solidHigh[i] = Math.max(solidHigh[i], p + item.size[i] / 2);
      }
      low[i] = Math.min(low[i], p + item.size[i] * bounds.min[i]);
      high[i] = Math.max(high[i], p + item.size[i] * bounds.max[i]);
    });
    gltf.scenes[0].nodes.push(gltf.nodes.length);
    gltf.nodes.push({ mesh: meshes.get(key), name: item.shape + "-" + gltf.nodes.length,
      translation: item.position, scale: item.size, extras: { skimmerRole: solid ? "SURFACE" : "DECORATION",
        shape: item.shape, evidence: item.evidence, asset: item.asset } });
  }
  if (Math.max(...solidHigh.map((n,i) => n - solidLow[i])) < 0.05) throw Error("Collision scene too small for recipient");
  if (triangleCount > 1250000 || high.some((n,i) => n - low[i] > 12000)) throw Error("Exchange exceeds recipient geometry limits");
  gltf.buffers.push({ byteLength });
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + byteLength, 8);
  header.writeUInt32LE(padded.length, 12);
  header.write("JSON", 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(byteLength);
  binHeader.write("BIN\0", 4);
  return Buffer.concat([header, padded, binHeader, ...parts]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw Error("Usage: node tools/export-exchange.js world.json output.glb");
  if (statSync(input).size > 8 * 1024 * 1024) throw Error("World document exceeds limit");
  writeFileSync(output, exportExchange(JSON.parse(readFileSync(input, "utf8"))), {flag:"wx"});
}

