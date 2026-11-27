import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildSite } from "./build.js";
import { serve } from "../src/server.js";

const viewport = { width: 800, height: 500 };
const bundled = ["canopy", "caldera", "lattice"];
const launchArgs = [
  "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader",
  "--enable-precise-memory-info",
];
const length = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

function walkGraph(topology) {
  const result = [],
    visited = new Set();
  function visit(id) {
    visited.add(id);
    for (const edge of topology.edges) {
      if (!edge.includes(id)) continue;
      const next = edge.find((n) => n !== id);
      if (!next || visited.has(next)) continue;
      result.push(next);
      visit(next);
      result.push(id);
    }
  }
  visit(topology.spawn);
  assert.equal(visited.size, topology.nodes.length);
  return result;
}

async function ready(page) {
  await page.waitForFunction(() => window.v2w?.stats.frames >= 5, null, {
    timeout: 60000,
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const { dt, ...stats } = window.v2w.stats;
    return { ...stats, heapBytes: performance.memory?.usedJSHeapSize ?? null };
  });
}

async function fly(page, target, speed) {
  const start = await snapshot(page);
  await page.evaluate((p) => window.v2w.flyToPoint(p), target);
  await page.waitForFunction(
    ({ target, hits }) => {
      const stats = window.v2w.stats;
      return (
        stats.hits > hits ||
        stats.position.every((v, i) => Math.abs(v - target[i]) < 1e-6)
      );
    },
    { target, hits: start.hits },
    {
      timeout: Math.max(
        30_000,
        (8000 * length(start.position, target)) / speed,
      ),
    },
  );
  const end = await snapshot(page);
  assert.equal(end.hits, start.hits, "Collision along a verified clear leg");
  return end;
}

// Search diagonals inside the same flight envelope as the pilot, checking the
// entire sweep. Prefer a shift on all three axes for the residency stress test.
async function excursion(page) {
  return page.evaluate(() => {
    const api = window.v2w,
      start = api.stats.position;
    const [lo, hi] = api.bounds;
    let best,
      score = -1;
    for (const scale of [1, 0.7, 0.45, 0.25])
      for (const x of [-1, 0, 1])
        for (const y of [-1, 0, 1])
          for (const z of [-1, 0, 1]) {
            const p = [x, y, z].map((sign, i) => {
              const span = sign < 0 ? start[i] - lo[i] : hi[i] - start[i];
              return (
                start[i] + sign * Math.min(span, 4.5 * api.cellSize) * scale
              );
            });
            const changes = p.map((v, i) =>
              Math.abs(
                Math.floor(v / api.cellSize) -
                  Math.floor(start[i] / api.cellSize),
              ),
            );
            const rank =
              changes.filter(Boolean).length * 100 +
              changes.reduce((a, b) => a + b, 0);
            if (rank > score && api.clearPath(start, p)) {
              score = rank;
              best = p;
            }
          }
    return best;
  });
}

async function keyboardFlight(page) {
  const start = await snapshot(page);
  for (const key of ["ArrowRight", "KeyI"]) await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      (heading) => {
        const h = window.v2w.stats.heading;
        return (
          Math.abs(h[0] - heading[0]) > 0.1 &&
          Math.abs(h[1] - heading[1]) > 0.08
        );
      },
      start.heading,
      { timeout: 5000 },
    );
  } finally {
    for (const key of ["ArrowRight", "KeyI"]) await page.keyboard.up(key);
  }
  const aimed = await snapshot(page);
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(
      (p) =>
        Math.hypot(...window.v2w.stats.position.map((v, i) => v - p[i])) > 0.3,
      aimed.position,
      { timeout: 5000 },
    );
  } finally {
    await page.keyboard.up("KeyW");
  }
  const moved = await snapshot(page);
  const delta = moved.position.map((v, i) => v - aimed.position[i]);
  const cosine =
    delta.reduce((sum, v, i) => sum + v * moved.heading[i], 0) /
    Math.hypot(...delta);
  assert.ok(
    cosine > 0.999,
    "Forward travel must follow pitched and yawed view",
  );
  await page.evaluate(() => window.v2w.reset());
  await page.waitForFunction(
    (p) => window.v2w.stats.position.every((v, i) => v === p[i]),
    start.position,
  );
  return { heading: moved.heading, displacement: delta, cosine };
}

async function actionCheck(page, action) {
  const start = await snapshot(page);
  await page.keyboard.down("Space");
  try {
    await page.waitForFunction(
      ({ action, start }) => {
        const s = window.v2w.stats;
        if (s.actions !== start.actions + 1) return false;
        if (action === "survey") return s.fov > start.fov;
        if (action === "flight") return s.altitude > start.altitude;
        return (
          s.position.reduce(
            (dot, v, i) => dot + (v - start.position[i]) * start.heading[i],
            0,
          ) > 0
        );
      },
      { action, start },
      { timeout: 5000 },
    );
    return { action, before: start, after: await snapshot(page) };
  } finally {
    await page.keyboard.up("Space");
    await page.evaluate(() => window.v2w.reset());
  }
}

async function runWorld(browser, base, id, out, custom, durationMs) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(out, "recordings"), size: viewport },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(response.status() + " " + response.url());
  });
  const url = new URL(base);
  url.searchParams.set("world", id);
  try {
    await page.goto(url.href);
    await ready(page);
    const { seed, fingerprint } = await page.evaluate(async () => ({
      seed: window.v2w.seed,
      fingerprint: await window.v2w.fingerprint(),
    }));
    url.searchParams.set("seed", seed);
    await page.goto(url.href);
    await ready(page);
    assert.equal(
      await page.evaluate(() => window.v2w.fingerprint()),
      fingerprint,
    );
    const { routes, topology, speed, action, renderer, cellSize } =
      await page.evaluate(() => {
        const { routes, topology, speed, action, cellSize } = window.v2w;
        const gl = document.querySelector("canvas").getContext("webgl2");
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          routes,
          topology,
          speed,
          action,
          cellSize,
          renderer: gl.getParameter(
            ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
          ),
        };
      });
    assert.ok(routes.connected);
    assert.deepEqual(routes.blockedEdges, []);
    await page.locator("canvas").screenshot({
      path: path.join(out, id + ".png"),
      style: "#hud{visibility:hidden}",
    });
    const pilot = custom ? null : await keyboardFlight(page);
    const actionResult = await actionCheck(page, action);
    const positions = new Map(topology.nodes.map((n) => [n.id, n.position]));
    const spawn = positions.get(topology.spawn);
    const walk = walkGraph(topology);
    for (const node of walk) await fly(page, positions.get(node), speed);
    const target = await excursion(page);
    assert.ok(target && length(spawn, target) > 0, "No open stress-flight leg");
    const axes = target.map(
      (v, i) => Math.floor(v / cellSize) !== Math.floor(spawn[i] / cellSize),
    );
    if (!custom)
      assert.ok(axes.every(Boolean), "Expected X, Y and Z cell crossings");
    const cdp = await context.newCDPSession(page);
    async function memory() {
      await cdp.send("HeapProfiler.collectGarbage");
      return (await cdp.send("Runtime.getHeapUsage")).usedSize;
    }
    // Warm shaders and lazy geometry uploads before comparing return samples.
    await fly(page, target, speed);
    const warm = await fly(page, spawn, speed);
    const heapBefore = await memory();
    await page.evaluate(() => {
      const m = (window.flightSamples = {
        frameMs: [],
        peakDrawCalls: 0,
        peakTriangles: 0,
        peakGeometries: 0,
        peakLiveBatches: 0,
        peakHeapBytes: 0,
      });
      function sample() {
        if (window.flightSamples !== m) return;
        const s = window.v2w.stats;
        m.frameMs.push(s.frameMs);
        m.peakDrawCalls = Math.max(m.peakDrawCalls, s.drawCalls);
        m.peakTriangles = Math.max(m.peakTriangles, s.triangles);
        m.peakGeometries = Math.max(m.peakGeometries, s.geometries);
        m.peakLiveBatches = Math.max(
          m.peakLiveBatches,
          s.batchesCreated - s.batchesDisposed,
        );
        m.peakHeapBytes = Math.max(
          m.peakHeapBytes,
          performance.memory?.usedJSHeapSize ?? 0,
        );
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const trips = [],
      started = performance.now();
    do {
      // Include visible authored geometry in the timed flight as well as the
      // empty-cell boundary excursion.
      if (walk.length) {
        await fly(page, positions.get(walk[0]), speed);
        await fly(page, spawn, speed);
      }
      const away = await fly(page, target, speed);
      const home = await fly(page, spawn, speed);
      assert.deepEqual(home.chunks, warm.chunks);
      assert.equal(
        home.batchesCreated - home.batchesDisposed,
        warm.batchesCreated - warm.batchesDisposed,
      );
      assert.equal(home.geometries, warm.geometries);
      assert.equal(home.textures, warm.textures);
      if (!custom)
        assert.ok(
          home.batchesDisposed > (trips.at(-1)?.home ?? warm).batchesDisposed,
        );
      trips.push({ away, home });
    } while (trips.length < 2 || performance.now() - started < durationMs);
    const elapsedMs = performance.now() - started;
    const { frameMs, ...peaks } = await page.evaluate(() => {
      const result = window.flightSamples;
      delete window.flightSamples;
      return result;
    });
    const heapAfter = await memory();
    assert.ok(frameMs.length);
    frameMs.sort((a, b) => a - b);
    const meanFrameMs = frameMs.reduce((sum, n) => sum + n, 0) / frameMs.length;
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(out, "recordings", id + ".webm"));
    await video.delete();
    return {
      id,
      url: url.href,
      seed,
      fingerprint,
      renderer,
      routes,
      walk,
      action: actionResult,
      keyboardFlight: pilot,
      screenshot: id + ".png",
      recording: "recordings/" + id + ".webm",
      target,
      axes,
      elapsedMs,
      samples: frameMs.length,
      meanFrameMs,
      p95FrameMs: frameMs[Math.ceil(frameMs.length * 0.95) - 1],
      fps: 1000 / meanFrameMs,
      ...peaks,
      heapBefore,
      heapAfter,
      heapDeltaBytes: heapAfter - heapBefore,
      warm,
      trips,
      errors,
    };
  } finally {
    await context.close();
  }
}

export async function evaluateMorph(
  custom,
  remote,
  out = "playtest/morph",
  { world, soakSeconds = 30 } = {},
) {
  if (world !== undefined && (custom || !bundled.includes(world)))
    throw Error("Select one bundled world or a custom file");
  if (
    !Number.isSafeInteger(soakSeconds) ||
    soakSeconds < 30 ||
    !Number.isSafeInteger(soakSeconds * 1000)
  )
    throw Error("Expected --soak-seconds to be an integer of at least 30");
  const durationMs = soakSeconds * 1000;
  const selected = custom ? ["custom"] : world ? [world] : bundled;
  await mkdir(path.join(out, "recordings"), { recursive: true });
  let server, browser;
  try {
    if (!remote) {
      const site = path.join(out, "site");
      await buildSite(site, custom);
      server = await serve(site);
    }
    browser = await chromium.launch({ args: launchArgs });
    const report = {
      date: new Date().toISOString(),
      browser: browser.version(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model,
      viewport,
      deviceScaleFactor: 1,
      launchArgs,
      minimumFlightMs: durationMs,
      minimumRoundTrips: 2,
      worlds: [],
    };
    for (const id of selected) {
      report.worlds.push(
        await runWorld(
          browser,
          remote || server.url,
          id,
          out,
          Boolean(custom),
          durationMs,
        ),
      );
      console.log("Verified " + id);
    }
    await writeFile(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  } finally {
    await browser?.close();
    server?.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      out: { type: "string" },
      custom: { type: "string" },
      world: { type: "string" },
      "soak-seconds": { type: "string" },
    },
  });
  await evaluateMorph(values.custom, values.url, values.out, {
    world: values.world,
    soakSeconds: Number(values["soak-seconds"] ?? 30),
  });
}
