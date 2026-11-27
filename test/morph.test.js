import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  realize,
  inspectRoutes,
  segmentClear,
  cellKeys,
} from "../src/morph.js";
import { validate } from "../src/validate.js";

const emit = {
  op: "emit",
  evidence: "obs",
  shape: "box",
  material: "stone",
  size: [1, 1, 1],
  solid: true,
};
function world() {
  return {
    version: "2.0",
    name: "Bridge fixture",
    seed: 45,
    style: { sky: "#aaaaaa", stone: "#123456", accent: "#d04020", light: 1 },
    motion: { action: "flight", speed: 8 },
    physics: { radius: 0.4 },
    streaming: { radius: 1, cellSize: 8 },
    budget: { instances: 64, operations: 256 },
    assets: [],
    unknowns: [],
    extensions: {},
    evidence: [
      {
        id: "obs",
        kind: "observation",
        source: "fixture",
        claim: "a row of pylons",
        confidence: 1,
      },
    ],
    topology: {
      spawn: "A",
      nodes: [
        { id: "A", position: [0, 0, 0], rule: "lot" },
        { id: "B", position: [10, 5, 0], rule: "lot" },
        { id: "C", position: [10, 5, 10], rule: "lot" },
      ],
      edges: [
        ["A", "B"],
        ["B", "C"],
        ["C", "A"],
      ],
    },
    prototypes: {
      lot: {
        op: "repeat",
        count: 2,
        step: [0, 2, 0],
        evidence: "obs",
        child: {
          op: "transform",
          offset: [0, 8, 0],
          jitter: [0.5, 0, 0.5],
          evidence: "obs",
          child: { op: "use", ref: "pillar", evidence: "obs" },
        },
      },
      pillar: structuredClone(emit),
    },
  };
}
test("nested productions retain evidence; local perturbations preserve other nodes", () => {
  const w = world();
  const a = realize(validate(w)),
    b = realize(w);
  assert.deepEqual(a, b);
  assert.equal(a.items.length, 6);
  assert.deepEqual(a.items[0].trace, ["obs"]);
  const hash = (x) =>
    createHash("sha256").update(JSON.stringify(x)).digest("hex");
  assert.notEqual(hash(a), hash(realize({ ...w, seed: 46 })));
  w.topology.nodes[0].position[0] = 3;
  assert.deepEqual(realize(w).items.slice(2), a.items.slice(2));
  assert.equal(inspectRoutes(w).connected, true);
});
test("swept sphere tests the whole edge, including corners and point contacts", () => {
  const solids = [{ center: [0, 0, 0], extent: [1, 1, 1] }];
  assert.equal(segmentClear([-8, 0, 0], [8, 0, 0], 0.25, solids), false);
  assert.equal(segmentClear([-8, 1.2, 1.2], [8, 1.2, 1.2], 0.25, solids), true);
  assert.equal(segmentClear([-8, 1.2, 1.2], [8, 1.2, 1.2], 0.3, solids), false);
  assert.equal(segmentClear([0, 0, 0], [0, 0, 0], 0.25, solids), false);
  const w = world();
  const scene = realize(w);
  scene.solids.push({ center: [5, 2.5, 0], extent: [0.1, 0.5, 0.5] });
  const route = inspectRoutes(w, scene);
  assert.deepEqual(route.blockedEdges, [["A", "B"]]);
  assert.ok(route.connected);
  w.topology.edges.pop();
  assert.equal(inspectRoutes(w, scene).connected, false);
});
test("cell neighborhoods include negative coordinates, vertical neighbors and reversible returns", () => {
  const w = world();
  const home = cellKeys(w, [-0.1, 0, 0]);
  assert.equal(home.length, 27);
  assert.ok(home.includes("-2,1,1"));
  assert.deepEqual(cellKeys(w, [-0.1, 0, 0]), home);
  assert.equal(
    cellKeys(w, [24, 32, 48]).some((k) => home.includes(k)),
    false,
  );
});
test("invalid references, cycles, exponential programs and invalid numeric geometry fail closed", () => {
  for (const change of [
    (w) => {
      w.prototypes.pillar = { op: "use", ref: "lot", evidence: "obs" };
    },
    (w) => {
      w.prototypes.pillar.evidence = "missing";
    },
    (w) => {
      w.prototypes.pillar = {
        op: "emit",
        ...emit,
        shape: "asset",
        asset: "assets/x.glb",
      };
    },
    (w) => {
      w.prototypes.lot.child.scale = [4096, 4096, 4096];
      w.prototypes.pillar.size = [20, 1, 1];
    },
    (w) => {
      w.prototypes.pillar.op = "script";
    },
    (w) => {
      w.prototypes.lot.count = 128;
    },
    (w) => {
      w.prototypes.pillar.size[0] = NaN;
    },
    (w) => {
      w.topology.edges[0][0] = "missing";
    },
    (w) => {
      w.topology.edges.push(["B", "A"]);
    },
    (w) => {
      w.budget.operations = 1;
    },
    (w) => {
      for (let i = 0; i < 26; i++)
        w.prototypes.lot = {
          op: "group",
          evidence: "obs",
          children: [w.prototypes.lot],
        };
    },
    (w) => {
      w.extensions = JSON.parse('{"__proto__":{"x":1}}');
    },
  ]) {
    const w = world();
    change(w);
    assert.throws(() => validate(w));
  }
});
