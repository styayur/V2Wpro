import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildSite } from "../../tools/build.js";
import { serve } from "../../src/server.js";
import { realize, inspectRoutes } from "../../src/morph.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), "v2w-motion-"));
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const server = await serve(scratch);
const report = { chromium: browser.version(), forwardMs: 2000, actionMs: 640, results: {} };
let baseline;
try {
  for (const id of ["frame", "video"]) {
    const file = path.join(directory, id + ".json");
    const world = JSON.parse(await readFile(file, "utf8"));
    const scene = realize(world);
    if (id === "frame") baseline = scene;
    else assert.deepEqual(scene, baseline);
    await buildSite(path.join(scratch, id), file);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
    await page.goto(server.url + "/" + id + "/index.html?world=custom");
    await page.waitForFunction(() => window.v2w?.stats.frames > 0);
    await page.clock.pauseAt(new Date("2025-01-01T01:00:00Z"));
    await page.locator("canvas").focus();
    const snapshot = () => page.evaluate(() => {
      const {position, actions, hits, frames} = window.v2w.stats;
      return {position, actions, hits, frames};
    });
    const start = await snapshot();
    await page.keyboard.down("w");
    await page.clock.runFor(report.forwardMs);
    await page.keyboard.up("w");
    const forward = await snapshot();
    await page.keyboard.press("Space");
    await page.clock.runFor(report.actionMs);
    const afterAction = await snapshot();
    const distance = start.position[2] - forward.position[2];
    assert(Math.abs(distance - world.motion.speed * report.forwardMs / 1000) < 0.02);
    assert(afterAction.actions === start.actions + 1 && afterAction.hits === start.hits);
    assert(afterAction.position[1] > forward.position[1]);
    report.results[id] = {speed: world.motion.speed, items: scene.items.length,
      solids: scene.solids.length, routes: inspectRoutes(world, scene),
      start, forward, afterAction, forwardMeters: distance,
      actionRiseMeters: afterAction.position[1] - forward.position[1]};
    await page.close();
  }
  await writeFile(path.join(directory,"play-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(report.results);
} finally {
  await browser.close();
  server.close();
  await rm(scratch, { recursive: true, force: true });
}
