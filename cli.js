#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  constants,
  realpathSync,
} from "node:fs";
import { importAsset } from "./src/assets.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { read, write, writeNew, ingest, fileDigest } from "./src/media.js";
import { analyze } from "./src/provider.js";
import {
  checkWorld,
  checkedScene,
  compile,
  revise,
  variant,
  evidenceReport,
} from "./src/compiler.js";
import { generateChunk } from "./src/world.js";
const examples = fileURLToPath(new URL("./examples/", import.meta.url));
const [cmd, arg, next, last] = process.argv.slice(2);
function contained(directory, candidate) {
  const relative = path.relative(
    realpathSync(directory),
    realpathSync(candidate),
  );
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function saveProjectFile(file, document, sourceDirectory) {
  if (existsSync(file)) throw Error("Output already exists: " + file);
  const directory = path.dirname(path.resolve(file));
  mkdirSync(directory, { recursive: true });
  for (const { uri } of (document.design ?? document).assets) {
    const source = realpathSync(path.join(sourceDirectory, uri));
    if (!contained(sourceDirectory, source))
      throw Error("Asset escapes source directory");
    const destination = path.join(directory, uri);
    mkdirSync(path.dirname(destination), { recursive: true });
    if (!contained(directory, path.dirname(destination)))
      throw Error("Asset escapes output directory");
    if (existsSync(destination)) {
      const resolved = realpathSync(destination);
      if (
        !contained(directory, resolved) ||
        (resolved !== source && fileDigest(resolved) !== fileDigest(source))
      )
        throw Error("Conflicting destination asset: " + uri);
    } else copyFileSync(source, destination, constants.COPYFILE_EXCL);
  }
  writeNew(file, document);
  return file;
}
async function main() {
  const file = arg || "world.json";
  switch (cmd) {
    case "init":
      if (existsSync("world.json")) throw Error("world.json already exists");
      if (
        !["arcade", "gate", "island", "canopy", "caldera", "lattice"].includes(
          arg || "arcade",
        )
      )
        throw Error("Unknown example");
      const template = read(path.join(examples, (arg || "arcade") + ".json"));
      for (const { uri } of template.assets) {
        if (existsSync(uri)) throw Error("Asset already exists: " + uri);
      }
      saveProjectFile("world.json", template, examples);
      return;
    case "asset":
      return importAsset(arg, ".", process.argv[4], process.argv[5]);
    case "ingest":
      return ingest(arg);
    case "analyze":
      return analyze(".v2w", process.argv.slice(3));
    case "compile":
      if (!arg) throw Error("Usage: compile REVIEW [WORLD]");
      return saveProjectFile(
        next || "world.json",
        compile(read(arg)),
        path.dirname(arg),
      );
    case "verify": {
      if (!last) throw Error("Usage: verify REVIEW SOURCE_ID LOCAL_FILE");
      const review = read(arg);
      compile(review);
      const source = review.sources.find((s) => s.id === next);
      if (!source?.sha256) throw Error("Source has no declared SHA-256");
      if (fileDigest(last) !== source.sha256.toLowerCase())
        throw Error("Reference digest mismatch");
      return "Verified " + next;
    }
    case "revise":
      if (!last) throw Error("Usage: revise REVIEW PATCH REVISED_REVIEW");
      return saveProjectFile(
        last,
        revise(read(arg), read(next)),
        path.dirname(arg),
      );
    case "variant":
      if (!last || !/^\d+$/.test(next))
        throw Error("Usage: variant WORLD SEED OUTPUT");
      return saveProjectFile(
        last,
        variant(read(arg), Number(next)),
        path.dirname(arg),
      );
    case "evidence": {
      const report = evidenceReport(read(file));
      if (!next) return report;
      writeNew(next, report);
      return next;
    }
    case "migrate": {
      if (!next)
        throw Error("Usage: migrate LEGACY_WORLD COMPATIBILITY_OUTPUT");
      const legacy = checkWorld(read(arg));
      if (legacy.version !== "1.0") throw Error("Expected WorldIR 1.0");
      saveProjectFile(next, legacy, path.dirname(arg));
      return "Preserved WorldIR 1.0 compatibility copy at " + next;
    }
    case "validate":
      return "Valid WorldIR " + checkWorld(read(file)).version;
    case "generate": {
      const w = read(file);
      if (w.version === "2.0") {
        const scene = checkedScene(w);
        mkdirSync(".v2w", { recursive: true });
        write(".v2w/scene.json", scene);
        return scene.items.length + " items";
      }
      checkWorld(w);
      const chunks = Array.from({ length: w.streaming.count }, (_, i) =>
        generateChunk(w, i),
      );
      mkdirSync(".v2w", { recursive: true });
      write(".v2w/chunks.json", chunks);
      return chunks.length + " chunks";
    }
    case "preview": {
      const { buildSite } = await import("./tools/build.js"),
        { serve } = await import("./src/server.js");
      const custom =
        arg || (existsSync("world.json") ? "world.json" : undefined);
      await buildSite(".v2w/site", custom);
      const server = await serve(".v2w/site", Number(process.env.PORT || 4173));
      return server.url + (custom ? "/?world=custom" : "/");
    }
    case "evaluate": {
      const custom =
        arg || (existsSync("world.json") ? "world.json" : undefined);
      if (custom && read(custom).version === "2.0")
        return (await import("./tools/morph-evaluate.js")).evaluateMorph(
          custom,
        );
      return (await import("./tools/evaluate.js")).evaluate(custom);
    }
    case "report":
      return read(arg || "playtest/report.json");
    default:
      if (cmd && !["help", "--help", "-h"].includes(cmd))
        throw Error("Unknown command " + cmd);
      return "v2w init [arcade|island|gate|canopy|caldera|lattice] | asset FILE SOURCE LICENSE | ingest FILE | analyze [DIGEST ...] | compile REVIEW [WORLD] | verify REVIEW SOURCE_ID LOCAL_FILE | revise REVIEW PATCH REVISED_REVIEW | variant WORLD SEED OUTPUT | evidence [WORLD] [OUTPUT] | migrate LEGACY COMPATIBILITY_OUTPUT | validate [WORLD] | generate [WORLD] | preview [WORLD] | evaluate [WORLD] | report [REPORT]";
  }
}
try {
  const result = await main();
  if (result !== undefined)
    console.log(
      typeof result === "string" ? result : JSON.stringify(result, null, 2),
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
