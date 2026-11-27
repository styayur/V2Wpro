import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { exportExchange } from "../tools/export-exchange.js";
import { realize } from "../src/morph.js";

for (const example of ["canopy","caldera","lattice"]) {
  test(example + " produces a self-contained GLB with one collision box per solid", async () => {
    const world = JSON.parse(readFileSync("examples/" + example + ".json"));
    const scene = realize(world);
    const bytes = exportExchange(world);
    assert.deepEqual(exportExchange(world), bytes);
    const { scene: loaded } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
    assert.equal(loaded.children.length, scene.items.length);
    const surfaces = loaded.children.filter(n => n.userData.skimmerRole === "SURFACE");
    const triangles = nodes => nodes.reduce((sum, node) => sum +
      (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3, 0);
    const measured = [1 + loaded.children.length, triangles(loaded.children), triangles(surfaces)];
    const row = readFileSync("docs/downstream.md", "utf8").split("\n").find(line => line.startsWith("| " + example + " |"));
    assert.deepEqual(row?.split("|").slice(2, 5).map(cell => Number(cell.replaceAll(",", "").trim())),
      measured, "Update the measured table after rerunning the recipient checker");
    assert.deepEqual(surfaces.map(s => [s.position.toArray(), s.scale.toArray()]).sort(),
      scene.solids.map(s => [s.center, s.extent.map(n => 2*n)]).sort());
    assert.deepEqual(loaded.userData.assets, world.assets.map(({ uri, source, license }) => ({ assetPath: uri, source, license })));
    assert.deepEqual(loaded.userData.topology, world.topology);
    assert.deepEqual(loaded.children.map(n => n.userData.evidence), scene.items.map(i => i.evidence));
  });
}
