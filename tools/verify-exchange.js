// Optional read-only check against a separately installed Skimmer-Scraper checkout.
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const [, , checkout, ...files] = process.argv;
if (!checkout || !files.length) throw Error("Usage: node tools/verify-exchange.js skimmer-checkout scene.glb [...]");
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
      return { nodes, triangles, collisionTriangles, offset: result.root.position.toArray() };
    }` },
  write: false, bundle: true, format: "esm", platform: "node",
});
const { inspect } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
for (const file of files) {
  const bytes = readFileSync(file);
  try {
    console.log(JSON.stringify({ file, ...await inspect(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) }));
  } catch (error) {
    throw Error(file + ": " + error.message);
  }
}
