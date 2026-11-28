import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
const [base, out] = process.argv.slice(2);
if (!base || !out)
  throw Error("Usage: node tools/verify-deployment.js SITE_URL OUTPUT_DIR");
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
async function download(name) {
  const url = new URL(name, base.endsWith("/") ? base : base + "/");
  url.searchParams.set("v", sha);
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw Error(name + " returned " + response.status);
  return Buffer.from(await response.arrayBuffer());
}
const manifestBytes = await download("build-manifest.json");
const manifest = JSON.parse(manifestBytes);
if (manifest.commit !== sha || manifest.version !== pkg.version)
  throw Error("Pages has a different release");
for (const name of [
  "app.js",
  "index.html",
  "guide.html",
  "contracts/manifest.json",
  "examples/switchyard.glb",
  "examples/kinetic-flight-modules.json",
  "schema/flight-diagnostic-2.json",
  "examples/contact.glb",
  "examples/district.glb",
  "examples/canopy.json",
  "examples/lattice.json",
  "examples/caldera.json",
])
  if (!Object.hasOwn(manifest.files, name)) throw Error("Missing " + name);
const entries = Object.entries(manifest.files);
for (let start = 0; start < entries.length; start += 4) {
  await Promise.all(
    entries.slice(start, start + 4).map(async ([name, digest]) => {
      if (
        !/^[A-Za-z0-9_./ -]+$/.test(name) ||
        name.split("/").some((p) => p === ".." || !p) ||
        !/^[a-f0-9]{64}$/.test(digest)
      )
        throw Error("Invalid manifest entry");
      const data = await download(name);
      if (createHash("sha256").update(data).digest("hex") !== digest)
        throw Error("Deployed file mismatch: " + name);
      const file = path.join(out, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data);
    }),
  );
}
writeFileSync(path.join(out, "build-manifest.json"), manifestBytes);
console.log("Verified " + entries.length + " public files at " + sha);
