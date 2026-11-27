import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeAsset, importAsset } from "../src/assets.js";
import { realize } from "../src/morph.js";

function temporary(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "v2w-asset-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function triangle() {
  const bytes = Buffer.alloc(72);
  // Interleaved XYZ with four bytes of leading offset, an unused outlier,
  // and unsigned byte indices in a second view.
  [[0,0,0], [2,0,0], [0,3,0], [100,100,100]].forEach((p,i) =>
    p.forEach((n,j) => bytes.writeFloatLE(n, 4 + 16*i + 4*j)));
  bytes.set([2,0,1], 69);
  return {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ translation: [5,7,11], children: [1,2] },
      { mesh: 0, rotation: [0,0,1,0], scale: [2,1,1] },
      { mesh: 0, matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,4,0,1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bytes.length, uri: "data:application/gltf-buffer;base64," + bytes.toString("base64") }],
    bufferViews: [{buffer:0, byteOffset:4, byteLength:60, byteStride:16}, {buffer:0, byteOffset:68, byteLength:4}],
    accessors: [{bufferView:0, componentType:5126, type:"VEC3", count:4, min:[-999,-999,-999], max:[999,999,999]},
      {bufferView:1, byteOffset:1, componentType:5121, type:"SCALAR", count:3}]
  };
}
test("analysis transforms indexed vertices of each selected mesh instance", t => {
  const input = path.join(temporary(t), "tri.gltf");
  const doc = triangle();
  doc.scenes.push({nodes: [1]});
  writeFileSync(input, JSON.stringify(doc));
  const report = analyzeAsset(input);
  assert.deepEqual(report.units.map(u => u.bounds), [
    { min:[1,4,11], max:[5,7,11] }, { min:[5,11,11], max:[7,14,11] }
  ]);
  assert.equal(report.triangles, 2);
  assert.deepEqual(report.proxy, { shape:"box", center:[4,9,11], size:[6,10,0] });
});
test("beacon kit matches measured bounds and fits connector-to-connector", () => {
  const kit = JSON.parse(readFileSync("examples/assets/beacon.unit.json"));
  const report = analyzeAsset("examples/" + kit.asset.uri);
  assert.equal(report.triangles, 28);
  assert.deepEqual(report.connectors, kit.connectors);
  assert.deepEqual(report.proxy, kit.proxy);
  const world = JSON.parse(readFileSync("examples/canopy.json"));
  world.assets = [kit.asset];
  world.evidence = [kit.evidence];
  world.prototypes = kit.prototypes;
  world.topology = { spawn:"unit", nodes:[{id:"unit", position:[0,0,0], rule:"beaconPair"}], edges:[] };
  const pair = realize(world).items;
  assert.equal(pair.length, 2);
  assert.deepEqual(pair[1].position.map((v,i) => v + kit.connectors[0].position[i]), kit.connectors[1].position);
  world.topology.nodes[0].rule = "beaconTall";
  assert.deepEqual(realize(world).items[0].size, [1,3,1]);
  world.topology.nodes[0].rule = "beaconProxy";
  assert.deepEqual(realize(world).items[0].size, report.proxy.size);
});
test("malformed containers and unsafe geometry are rejected before packaging", t => {
  const dir = temporary(t);
  const file = path.join(dir, "bad.gltf");
  for (const [change, reason] of [
    [d => d.accessors[0].count++, /view/],
    [d => d.accessors[0].sparse = {}, /accessor/],
    [d => d.accessors[1].byteOffset = -1, /offset/],
    [d => d.bufferViews[0].byteStride = 3, /stride/],
    [d => d.buffers[0].byteLength--, /length/],
    [d => d.nodes[1].children = [0], /Repeated/],
    [d => d.meshes[0].primitives[0].extensions = {}, /extension/],
    [d => d.nodes[0].translation = [0,null,0], /transform/],
    [d => {
      const bytes = Buffer.from(d.buffers[0].uri.split(",")[1], "base64");
      bytes[70] = 4;
      d.buffers[0].uri = "data:application/octet-stream;base64," + bytes.toString("base64");
    }, /vertex index/]
  ]) {
    const doc = triangle(); change(doc); writeFileSync(file, JSON.stringify(doc));
    assert.throws(() => importAsset(file, dir, "fixture", "MIT"), reason);
  }
  const glb = readFileSync("examples/assets/beacon.glb");
  const jsonLength = glb.readUInt32LE(12);
  for (const [at,value] of [[8,9], [12,0xffffffff], [20+jsonLength,4]]) {
    const bad = Buffer.from(glb); bad.writeUInt32LE(value, at);
    writeFileSync(path.join(dir,"bad.glb"), bad);
    assert.throws(() => analyzeAsset(path.join(dir,"bad.glb")), /GLB/);
  }
});
test("resource namespaces, pixel limits, file sizes and canonical containment", t => {
  const root = temporary(t);
  const dir = path.join(root,"src"); mkdirSync(dir);
  const file = path.join(dir,"asset.gltf");
  for (const uri of ["https://invalid.test/img.png", "//server/s.png", "%2e%2e/out.bin", "C%3a/x.bin",
    "test%5cmesh.bin", "con.bin", "data:text/html;base64,QQ==", "data:application/octet-stream;base64,A=== "]) {
    writeFileSync(file, JSON.stringify({asset:{version:"2.0"},buffers:[{uri,byteLength:1}]}));
    assert.throws(() => importAsset(file, dir, "fixture", "MIT"), /resource/);
  }
  const png = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452","hex").copy(png);
  png.writeUInt32BE(9000,16); png.writeUInt32BE(1,20);
  writeFileSync(file, JSON.stringify({asset:{version:"2.0"},images:[{uri:"data:image/png;base64,"+png.toString("base64")}]}));
  assert.throws(() => importAsset(file,dir,"fixture","MIT"), /pixel/);
  writeFileSync(path.join(root,"outside.bin"), "A");
  symlinkSync(root, path.join(dir,"link"), "junction");
  writeFileSync(file, JSON.stringify({asset:{version:"2.0"},buffers:[{uri:"link/outside.bin",byteLength:1}]}));
  assert.throws(() => importAsset(file,dir,"fixture","MIT"), /escapes/);
  truncateSync(file, 16 * 1024 * 1024 + 1);
  assert.throws(() => analyzeAsset(file), /limit/);
});
