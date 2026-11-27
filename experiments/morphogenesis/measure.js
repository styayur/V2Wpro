import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { inspectRoutes, realize } from "../../src/morph.js";
import { validate } from "../../src/validate.js";

const local = path => new URL(path, import.meta.url);
const hash = data => createHash("sha256").update(data).digest("hex");
const conditions = ["text", "frame"];
const worlds = Object.fromEntries(conditions.map(id =>
  [id, JSON.parse(readFileSync(local(id + ".json"), "utf8"))]));
const scenes = {};
const results = {};

function countRules(rule, counts) {
  counts[rule.op] = (counts[rule.op] ?? 0) + 1;
  if (rule.child) countRules(rule.child, counts);
  for (const child of rule.children ?? []) countRules(child, counts);
}
for (const id of conditions) {
  const w = worlds[id];
  validate(w);
  const scene = scenes[id] = realize(w);
  const routes = inspectRoutes(w, scene);
  assert(routes.connected && routes.blockedEdges.length === 0);
  const rules = {};
  for (const rule of Object.values(w.prototypes)) countRules(rule, rules);
  const shapes = {};
  for (const {shape} of scene.items) shapes[shape] = (shapes[shape] ?? 0) + 1;
  results[id] = {
    prototypes: Object.keys(w.prototypes).length, rules, shapes, items: scene.items.length,
    solids: scene.solids.length, cells: Object.keys(scene.cells).length,
    nodes: w.topology.nodes.length, edges: w.topology.edges.length, routes,
    sceneSha256: hash(JSON.stringify(scene)), batchMsPerRealization: []
  };
}

for (const key of ["seed", "topology", "motion", "physics", "streaming", "budget", "assets"])
  assert.deepEqual(worlds.text[key], worlds.frame[key]);
assert.deepEqual(scenes.text.items, scenes.frame.items.filter(item => item.shape === "box"));
assert.deepEqual(scenes.text.solids, scenes.frame.solids);

const warmup = 50, batches = 20, perBatch = 100;
for (let i = 0; i < warmup; i++) for (const id of conditions) realize(worlds[id]);
for (let batch = 0; batch < batches; batch++) {
  for (const id of batch % 2 ? ["frame", "text"] : conditions) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < perBatch; i++) realize(worlds[id]);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    results[id].batchMsPerRealization.push(elapsed / perBatch);
  }
}
for (const result of Object.values(results)) {
  const sorted = result.batchMsPerRealization.toSorted((a,b) => a-b);
  result.medianMs = (sorted[9] + sorted[10]) / 2;
}

const files = ["brief.txt", "text.json", "frame.json", "frame.py",
  "../../examples/keyframe.png", "../../examples/reference.mp4",
  "../../src/morph.js", "../../src/validate.js", "../../schema/worldir-2.0.json"];
const report = {
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model,
  warmup, batches, perBatch, results,
  sha256: Object.fromEntries(files.map(path => [path, hash(readFileSync(local(path)))]))
};
writeFileSync(local("report.json"), JSON.stringify(report, null, 2) + "\n");
console.table(conditions.map(id => ({id, ...Object.fromEntries(
  ["items","solids","cells","medianMs"].map(k => [k, results[id][k]]))})));
