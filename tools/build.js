import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { importAsset } from "../src/assets.js";
import { read } from "../src/media.js";
import { validate } from "../src/validate.js";
export const root = fileURLToPath(new URL("../", import.meta.url));
export async function buildSite(out = "dist", custom) {
  mkdirSync(out, { recursive: true });
  cpSync(path.join(root, "web"), out, {
    recursive: true,
    filter: (f) => !f.endsWith(".js"),
  });
  cpSync(path.join(root, "examples"), path.join(out, "examples"), {
    recursive: true,
  });
  cpSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
  for (const folder of ["schema","contracts"])
    cpSync(path.join(root,folder),path.join(out,folder),{recursive:true});
  const worlds = Object.fromEntries(
    ["arcade", "island", "gate", "canopy", "caldera", "lattice", "contact", "district", "s-curve-study", "topogenesis"].map((id) => [
      id,
      "./examples/" + id + ".json",
    ]),
  );
  worlds.topogenesis="./examples/switchyard.json";
  if (custom) {
    worlds.custom = "./custom/world.json";
    mkdirSync(path.join(out, "custom"), { recursive: true });
    const w = validate(read(custom));
    const base = realpathSync(path.dirname(path.resolve(custom)));
    for (const { uri, source, license } of w.assets) {
      const model = realpathSync(path.resolve(base, uri));
      const relative = path.relative(base, model);
      if (
        !relative ||
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
      )
        throw Error("Custom asset resolves outside the world directory");
      const staging = mkdtempSync(path.join(tmpdir(), "v2w-preview-"));
      try {
        const packed = importAsset(model, staging, source, license);
        const target = path.join(out, "custom", uri);
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(path.join(staging, packed.uri), target);
      } finally {
        rmSync(staging, { recursive: true, force: true });
      }
    }
    writeFileSync(path.join(out, worlds.custom), JSON.stringify(w));
  }
  writeFileSync(path.join(out, "worlds.json"), JSON.stringify(worlds));
  await build({
    entryPoints: [path.join(root, "web/app.js")],
    bundle: true,
    minify: true,
    legalComments: "eof",
    format: "esm",
    outfile: path.join(out, "app.js"),
  });
  const notices = [
    "three",
    "ajv",
    "fast-deep-equal",
    "fast-uri",
    "json-schema-traverse",
    "require-from-string",
  ].map((id) => {
    const dir = path.join(root, "node_modules", id);
    const f = ["LICENSE", "license", "LICENSE.md", "LICENSE.txt"].find((f) =>
      existsSync(path.join(dir, f)),
    );
    if (!f) throw Error("Missing license text for " + id);
    return id + "\n" + readFileSync(path.join(dir, f), "utf8");
  });
  writeFileSync(path.join(out, "THIRD-PARTY.txt"), notices.join("\n\n"));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildSite();
