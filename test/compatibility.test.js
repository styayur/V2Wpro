import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compile } from "../src/compiler.js";
import { read } from "../src/media.js";
import { realize, inspectRoutes } from "../src/morph.js";
import { generateChunk } from "../src/world.js";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("published 1.0 worlds retain the release geometry fingerprints", () => {
  for (const { id, hash } of read("evidence/report.json").worlds) {
    const w = read("examples/" + id + ".json");
    const all = Array.from({ length: w.streaming.count }, (_, i) =>
      generateChunk(w, i),
    );
    assert.equal(digest(JSON.stringify(all)), hash, id);
  }
});
for (const id of ["canopy", "caldera", "lattice"]) {
  test(
    id +
      " recompiles from the review and admits distinct, traversable seeded variants",
    () => {
      const review = read("examples/reviews/" + id + ".json");
      for (const src of review.sources)
        if (src.sha256)
          assert.equal(digest(readFileSync(src.locator)), src.sha256);
      const expected = read("examples/" + id + ".json"),
        w = compile(review);
      assert.deepEqual(JSON.parse(JSON.stringify(w)), expected);
      const results = new Set();
      for (const seed of [expected.seed, 3, 77]) {
        const variant = { ...w, seed };
        const scene = realize(variant),
          route = inspectRoutes(variant, scene);
        assert.ok(route.connected);
        assert.deepEqual(route.blockedEdges, []);
        assert.equal(
          scene.items.length,
          Object.values(scene.cells).flat().length,
        );
        const signature = digest(JSON.stringify(scene.items));
        assert.equal(digest(JSON.stringify(realize(variant).items)), signature);
        results.add(signature);
      }
      assert.ok(results.size > 1);
    },
  );
}
