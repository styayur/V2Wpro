// Stamp the exact artifact uploaded to Pages. Hash the shipped bytes, including media.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const dir = process.argv[2] || "dist";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit)
  throw Error("Checkout SHA differs from Actions SHA");
const files = {};
function visit(relative) {
  for (const entry of readdirSync(path.join(dir, relative), {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) visit(name);
    else if (entry.isFile() && name !== "build-manifest.json")
      files[name] = createHash("sha256")
        .update(readFileSync(path.join(dir, name)))
        .digest("hex");
    else if (!entry.isFile()) throw Error("Unexpected non-file in site");
  }
}
visit("");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(
  path.join(dir, "build-manifest.json"),
  JSON.stringify({ version: pkg.version, commit, files }, null, 2) + "\n",
);
