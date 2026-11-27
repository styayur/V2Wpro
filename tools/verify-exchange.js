// Optional read-only check against a separately installed Skimmer-Scraper checkout.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { build } from "esbuild";
import { exportExchange } from "./export-exchange.js";
import { realize } from "../src/morph.js";
import { ingest } from "../src/media.js";

const [, , checkout, ...files] = process.argv;
if (!checkout || !files.length) throw Error("Usage: node tools/verify-exchange.js skimmer-checkout scene.glb [...] | --cases output-directory");
const compiled = await build({
  stdin: { resolveDir: path.resolve(checkout), contents: `
    import { inspectWorldGlb } from "./src/world/imports/worldGlbPreflight";
    import { analyzeWorldScene } from "./src/world/imports/sceneAnalyzer";
    import { defaultWorldImportOptions } from "./src/world/imports/worldManifest";
    import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
    export async function inspect(data) {
      inspectWorldGlb(data);
      const { scene } = await new GLTFLoader().parseAsync(data, "");
      const result = analyzeWorldScene(scene, defaultWorldImportOptions);
      const { nodes, triangles, collisionTriangles } = result;
      return { nodes, triangles, collisionTriangles, surfaceMeshes: result.meshRoles.filter(m => m.role === "SURFACE").length,
        offset: result.root.position.toArray() };
    }` },
  write: false, bundle: true, format: "esm", platform: "node",
});
const { inspect } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
async function check(file, bytes) {
  try {
    return await inspect(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  } catch (error) {
    throw Error(file + ": " + error.message);
  }
}
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
if (files[0] === "--cases") {
  const output = files[1];
  if (files.length !== 2) throw Error("Specify a directory for case evidence");
  mkdirSync(output, { recursive: true });
  const revision = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = { format: "v2w-exchange-check-1", recipient: "Skimmer-Scraper", revision,
    checks: ["inspectWorldGlb", "GLTFLoader.parseAsync", "analyzeWorldScene"], cases: [] };
  for (const id of ["canopy", "caldera", "lattice"]) {
    const worldPath = "examples/" + id + ".json";
    const worldBytes = readFileSync(worldPath);
    const world = JSON.parse(worldBytes);
    const bytes = exportExchange(world);
    const file = id + ".glb";
    const measured = await check(file, bytes);
    const scene = realize(world);
    if (measured.nodes !== scene.items.length + 1 || measured.surfaceMeshes !== scene.solids.length ||
        measured.collisionTriangles !== scene.solids.length * 12) throw Error("Collision or node mismatch for " + id);
    const reviewPath = "examples/reviews/" + id + ".json";
    const reviewBytes = readFileSync(reviewPath);
    const sources = JSON.parse(reviewBytes).sources.map(({ kind, locator, sha256: expected }) => {
      const source = realpathSync(locator);
      if (!source.startsWith(realpathSync("examples") + path.sep)) throw Error("Source outside examples");
      const content = readFileSync(source);
      const hash = sha256(content);
      if (expected && expected !== hash) throw Error("Reference digest mismatch in " + reviewPath);
      let frames;
      if (kind === "video") {
        const manifest = ingest(source, output);
        if (manifest.sha256 !== hash) throw Error("Decoded clip differs from reviewed source");
        frames = { manifest: "references/" + hash + "/manifest.json", seconds: manifest.frames.map(f => f.seconds),
          sceneCuts: manifest.sceneCuts };
        writeFileSync(path.join(output, path.basename(source)), content);
      }
      return { kind, locator, bytes: content.length, sha256: hash,
        ...(frames ? { file: path.basename(source), frames } : {}) };
    });
    writeFileSync(path.join(output, file), bytes);
    report.cases.push({ id, seed: world.seed, worldPath, worldSha256: sha256(worldBytes), reviewPath,
      reviewSha256: sha256(reviewBytes), sources, file, bytes: bytes.length, sha256: sha256(bytes), ...measured });
  }
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const file of files) console.log(JSON.stringify({ file, ...await check(file, readFileSync(file)) }));
}
