"""Capture spawn views. Run from repository root with Chromium and Playwright installed."""
import argparse
import hashlib
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
from threading import Thread

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stage", choices=("before", "after"))
options = parser.parse_args()
out = Path(__file__).resolve().parent
root = out.parents[1]
site = root / ".v2w" / "case-study-site"
worlds = ["canopy", "caldera", "lattice"]
os.chdir(root)
subprocess.run(["node", "--input-type=module", "-e",
                "import {buildSite} from './tools/build.js'; await buildSite(process.argv[1])",
                str(site)], check=True)
records = []
for world in worlds:
    review = (out / f"{world}-before.review.json" if options.stage == "before"
              else root / "examples" / "reviews" / f"{world}.json")
    target = site / "examples" / f"{world}.json"
    target.unlink()
    subprocess.run(["node", "cli.js", "compile", str(review), str(target)], check=True)
    records.append({"id": world, "review": review.relative_to(root).as_posix(),
                    "reviewSha256": hashlib.sha256(review.read_bytes()).hexdigest()})

with ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=site)) as server:
    Thread(target=server.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.getenv("CHROMIUM"), args=["--enable-unsafe-swiftshader"])
        for record in records:
            world = record["id"]
            page = browser.new_page(viewport={"width": 960, "height": 720}, device_scale_factor=1)
            page.goto(f"http://127.0.0.1:{server.server_port}/?world={world}")
            page.wait_for_function("window.v2w?.stats.frames > 4")
            frame = page.evaluate("() => { window.v2w.reset(); return window.v2w.stats.frames }")
            page.wait_for_function("frame => window.v2w.stats.frames >= frame + 2", arg=frame)
            canvas = page.locator("canvas")
            canvas.screenshot(path=out / f"{world}-{options.stage}.png")
            record.update(page.evaluate("""() => {
              const {stats, seed, routes} = window.v2w;
              const gl = document.querySelector('canvas').getContext('webgl2');
              const ext = gl.getExtension('WEBGL_debug_renderer_info');
              return {seed, routes, triangles: stats.triangles, drawCalls: stats.drawCalls,
                position: stats.position, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)};
            }"""))
            assert record["routes"]["connected"] and not record["routes"]["blockedEdges"]
            page.close()
        report = {"browser": browser.version, "viewport": [960, 720], "camera": "spawn", "worlds": records}
        (out / f"{options.stage}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        browser.close()
    server.shutdown()
