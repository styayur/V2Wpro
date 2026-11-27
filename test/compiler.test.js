import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  truncateSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compile, revise, variant, evidenceReport } from "../src/compiler.js";
import { read, write, ingest } from "../src/media.js";
import { analyze, dispatch } from "../src/provider.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = "a".repeat(64);
function review() {
  return {
    format: "v2w-review-1",
    sources: [
      { id: "clip", kind: "video", locator: "shot.mp4", sha256: digest },
    ],
    features: [
      {
        id: "tone",
        kind: "observation",
        source: "clip",
        claim: "Blue floor",
        time: [0, 1.5],
        confidence: 0.9,
      },
    ],
    design: {
      name: "Floor study",
      seed: 1,
      style: { sky: "#ffffff", stone: "#222222", accent: "#0000ff", light: 1 },
      motion: { speed: 5, action: "survey" },
      physics: { radius: 0.5 },
      streaming: { cellSize: 8, radius: 1 },
      budget: { operations: 8, instances: 4 },
      assets: [],
      unknowns: ["Depth under the floor"],
      extensions: {},
      topology: {
        spawn: "A",
        nodes: [{ id: "A", position: [0, 0, 0], rule: "tile" }],
        edges: [],
      },
      prototypes: {
        tile: {
          op: "emit",
          evidence: "tone",
          shape: "box",
          size: [1, 1, 1],
          material: "accent",
          solid: false,
        },
      },
    },
  };
}

test("compile joins timestamps and digests and preserves the reviewed design", () => {
  const input = review(),
    before = structuredClone(input);
  const world = compile(input),
    report = evidenceReport(world);
  assert.equal(report.evidence[0].source, "shot.mp4#t=0,1.5");
  assert.equal(report.sources[0].sha256, digest);
  assert.equal(report.bindings.tone, "clip");
  assert.deepEqual(input, before);
  assert.deepEqual(variant(world, 4294967295), { ...world, seed: 4294967295 });
  assert.throws(() => variant(world, -1));
  const patched = revise(input, {
    design: { style: { light: 2 }, extensions: { comment: "change" } },
  });
  assert.deepEqual(compile(patched).style, { ...world.style, light: 2 });
  assert.equal(
    revise(patched, { design: { extensions: { comment: null } } }).design
      .extensions.comment,
    undefined,
  );
  assert.deepEqual(input, before);
});

test("rejects dangling IDs, malformed references, invalid patches and obstructed spawn", () => {
  for (const mutate of [
    (r) => r.sources.push(r.sources[0]),
    (r) => r.features.push(r.features[0]),
    (r) => (r.sources[0].sha256 = "oops"),
    (r) => (r.features[0].source = "missing"),
    (r) => r.features[0].time.reverse(),
    (r) => (r.features[0].confidence = -1),
    (r) => (r.features[0].id = "non ASCII"),
    (r) => (r.sources[0].kind = "image"),
    (r) => (r.design.prototypes.tile.evidence = "unbound"),
    (r) => (r.design.evidence = []),
    (r) => (r.design.prototypes.tile.solid = true),
  ]) {
    const input = review();
    mutate(input);
    assert.throws(() => compile(input));
  }
  assert.throws(() => revise(review(), { design: { motion: null } }));
});

test("media cap is checked before decoding and dispatch requires selected upload permission", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "v2w-cap-"));
  try {
    const file = path.join(dir, "large.mp4");
    writeFileSync(file, "");
    truncateSync(file, 128 * 1024 * 1024 + 1);
    assert.throws(() => ingest(file, dir), /regular file/);
    assert.equal(existsSync(path.join(dir, "references")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  let calls = 0;
  const adapter = {
    remote: true,
    id: "fake",
    capabilities: ["image"],
    run: () => ++calls,
  };
  await assert.rejects(
    dispatch(adapter, "image", ["selected.png"], "test"),
    /permission/,
  );
  assert.equal(calls, 0);
  await dispatch(adapter, "image", ["selected.png"], "test", {
    allowUpload: true,
  });
  assert.equal(calls, 1);
});

test("review packet respects selected digests and rejects a mismatched manifest", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "v2w-references-"));
  try {
    const manifest = {
      sha256: digest,
      local: "source.png",
      frames: [{ seconds: 0, file: "frame-001.png" }],
    };
    const folder = path.join(dir, "references", digest);
    mkdirSync(folder, { recursive: true });
    write(path.join(folder, "manifest.json"), manifest);
    const packet = analyze(dir, [digest]);
    assert.equal(packet.sources[0].sha256, digest);
    assert.equal(packet.sources[0].kind, "image");
    assert.throws(() => analyze(dir, [digest, digest]));
    write(path.join(folder, "manifest.json"), {
      ...manifest,
      sha256: "b".repeat(64),
    });
    assert.throws(() => analyze(dir, [digest]), /Invalid reference manifest/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI compiles, revises, exports evidence, realizes, varies and preserves legacy assets", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "v2w-compile-"));
  const call = (...args) =>
    spawnSync(process.execPath, [path.join(root, "cli.js"), ...args], {
      cwd: dir,
      encoding: "utf8",
    });
  const run = (...args) => {
    const result = call(...args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const json = (file) => read(path.join(dir, file));
  try {
    write(path.join(dir, "review.json"), review());
    const shipped = path.join(root, "examples/reviews/canopy.json");
    run(
      "verify",
      shipped,
      "clip",
      path.join(root, "examples/canopy-source.mp4"),
    );
    assert.match(
      call("verify", shipped, "clip", "review.json").stderr,
      /digest mismatch/,
    );
    run("compile", "review.json");
    assert.equal(call("compile", "review.json").status, 1);
    run("generate");
    assert.equal(json(".v2w/scene.json").items.length, 1);
    run("evidence", "world.json", "evidence.json");
    assert.equal(json("evidence.json").sources[0].sha256, digest);
    run("variant", "world.json", "45", "alt.json");
    assert.equal(json("alt.json").seed, 45);
    write(path.join(dir, "patch.json"), { design: { name: "Floor v2" } });
    run("revise", "review.json", "patch.json", "next.json");
    run("compile", "next.json", "v2.json");
    assert.equal(json("v2.json").name, "Floor v2");
    const legacy = path.join(root, "examples/island.json");
    run("migrate", legacy, "archive/compat.json");
    assert.deepEqual(json("archive/compat.json"), read(legacy));
    assert.ok(existsSync(path.join(dir, "archive/assets/beacon.glb")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
