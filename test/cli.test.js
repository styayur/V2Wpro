import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("CLI initializes an isolated workspace, preserves existing files and generates portable chunks", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "v2w-workspace-"));
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  try {
    assert.equal(run("init", "island").status, 0);
    const before = readFileSync(path.join(cwd,"world.json"),"utf8");
    assert.equal(run("init", "gate").status, 1);
    assert.equal(readFileSync(path.join(cwd,"world.json"),"utf8"), before);
    assert.equal(run("validate").status, 0);
    assert.equal(run("generate").status, 0);
    const chunks = JSON.parse(readFileSync(path.join(cwd,".v2w/chunks.json"),"utf8"));
    assert.equal(chunks.length, JSON.parse(before).streaming.count);
    assert.ok(chunks[0].items.some(item => item.asset === "assets/beacon.glb"));
    assert.notEqual(run("validate","missing.json").status, 0);
  } finally {
    rmSync(cwd,{recursive:true,force:true});
  }
});
