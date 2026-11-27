import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { buildSite, root } from "../tools/build.js";
import { PerspectiveCamera, Vector3 } from "three";
import { aim, direction } from "../web/flight.js";

test("forward flight follows the view on all axes and strafing is perpendicular", () => {
  const camera = new PerspectiveCamera();
  for (const heading of [
    [3, 2, -1],
    [-1, -4, 3],
    [0, 1, 0],
  ]) {
    aim(camera, heading);
    const expected = new Vector3(...heading).normalize();
    assert.ok(direction(camera, 1, 0, 0).distanceTo(expected) < 1e-10);
    assert.ok(Math.abs(direction(camera, 0, 1, 0).dot(expected)) < 1e-10);
  }
});

test("custom preview packages audited assets and confines model resolution", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "v2w-browser-test-"));
  try {
    const project = path.join(temp, "project"),
      site = path.join(temp, "site");
    const fixtures = path.join(root, "examples"),
      assets = path.join(project, "assets");
    await mkdir(project);
    const world = JSON.parse(
      await readFile(path.join(fixtures, "canopy.json"), "utf8"),
    );
    world.assets = [
      { uri: "assets/beacon.glb", source: "tools/blender.py", license: "MIT" },
    ];
    const worldFile = path.join(project, "world.json");
    await writeFile(worldFile, JSON.stringify(world));
    await symlink(
      path.join(fixtures, "assets"),
      assets,
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      buildSite(site, worldFile),
      /outside the world directory/,
    );
    await rm(assets);
    await mkdir(assets);
    const model = path.join(assets, "beacon.glb");
    await writeFile(model, "invalid GLB bytes");
    await assert.rejects(buildSite(site, worldFile), /GLB/);
    await cp(path.join(fixtures, world.assets[0].uri), model);
    await buildSite(site, worldFile);
    const index = JSON.parse(
      await readFile(path.join(site, "worlds.json"), "utf8"),
    );
    const packaged = path.resolve(site, index.custom);
    assert.deepEqual(JSON.parse(await readFile(packaged, "utf8")), world);
    assert.deepEqual(
      await readFile(path.join(path.dirname(packaged), world.assets[0].uri)),
      await readFile(model),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
