import { BoxGeometry, Color, IcosahedronGeometry, TorusGeometry } from "three";
import { contactDeck, deckCycles } from "./contact-deck.js";
import { inspectRoutes, realize } from "./morph.js";

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
    const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const padding = new Uint8Array((4 - data.length % 4) % 4);
    parts.push(data, padding);
    byteLength += data.length + padding.length;
    const bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: data.length }) - 1;
    const width = type === "SCALAR" ? 1 : 3;
    return gltf.accessors.push({ bufferView, componentType: width === 1 ? 5123 : 5126,
      count: array.length / width, type, ...bounds }) - 1;
  }
  const shapes = new Map(), meshes = new Map();
  function geometry(shape, cycles = 0) {
    if (shapes.has(shape)) return shapes.get(shape);
    const g = cycles ? contactDeck((shape === "deck-proxy" ? 24 : 64) * cycles, cycles)
      : shape === "rock" || shape === "mound" ? new IcosahedronGeometry(0.5, shape === "mound" ? 1 : 0)
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
    const cycles = solid && deckCycles(world, item);
    const shape = cycles ? "deck-skin" : solid || item.shape === "asset" ? "box" : item.shape;
    const { primitive, triangles } = geometry(shape, cycles);
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
      translation: item.position, scale: item.size, extras: { skimmerRole: solid && !cycles ? "SURFACE" : "DECORATION",
        shape: item.shape, evidence: item.evidence, asset: item.asset } });
    if (cycles) {
      const proxy = geometry("deck-proxy", cycles);
      triangleCount += proxy.triangles;
      const name = "contact-proxy";
      if (!meshes.has(name)) {
        const material = materials.push({ name, alphaMode:"MASK", alphaCutoff:0.5,
          pbrMetallicRoughness:{baseColorFactor:[0,0,0,0]} }) - 1;
        meshes.set(name,gltf.meshes.push({primitives:[{...proxy.primitive,material}]}) - 1);
      }
      gltf.scenes[0].nodes.push(gltf.nodes.length);
      gltf.nodes.push({mesh:meshes.get(name),name,translation:item.position,scale:item.size,
        extras:{skimmerRole:"SURFACE",collisionOnly:true,evidence:item.evidence}});
    }
  }
  if (gltf.nodes.length >= 2500) throw Error("Exchange exceeds 2499 mesh nodes");
  if (Math.max(...solidHigh.map((n,i) => n - solidLow[i])) < 0.05) throw Error("Collision scene too small for recipient");
  if (triangleCount > 1250000 || high.some((n,i) => n - low[i] > 12000)) throw Error("Exchange exceeds recipient geometry limits");
  gltf.buffers.push({ byteLength });
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const padded = Math.ceil(json.length / 4) * 4;
  const result = new Uint8Array(28 + padded + byteLength);
  const view = new DataView(result.buffer);
  const uint = (offset,n) => view.setUint32(offset,n,true);
  uint(0,0x46546c67);
  uint(4,2);
  uint(8,result.length);
  uint(12,padded);
  uint(16,0x4e4f534a);
  result.fill(32,20,20+padded);
  result.set(json,20);
  uint(20+padded,byteLength);
  uint(24+padded,0x004e4942);
  let offset = 28+padded;
  for (const part of parts) {
    result.set(part,offset);
    offset += part.length;
  }
  return result;
}
