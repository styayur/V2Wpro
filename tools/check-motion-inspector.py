"""Exercise the shipped inspector and optional local Skimmer replay in Chromium."""
import argparse
from contextlib import ExitStack
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("site", help="Built site directory or running preview URL")
parser.add_argument("output", type=Path)
parser.add_argument("--report", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
rows = []
with ExitStack() as stack:
    if args.site.startswith(("https://","http://")):
        url = args.site.rstrip("/")
    else:
        server = stack.enter_context(ThreadingHTTPServer(("127.0.0.1",0),
            partial(SimpleHTTPRequestHandler,directory=Path(args.site).resolve(strict=True))))
        Thread(target=server.serve_forever, daemon=True).start()
        stack.callback(server.shutdown)
        url = f"http://127.0.0.1:{server.server_port}"
    client = stack.enter_context(sync_playwright())
    browser = client.chromium.launch(args=["--enable-unsafe-swiftshader"])
    for label, width, height in [("desktop", 1360, 940), ("mobile", 390, 844)]:
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url+"/?world=topogenesis", wait_until="networkidle")
        page.locator("#motion-inspector").wait_for(state="visible", timeout=60000)
        page.wait_for_function("window.v2w?.stats.frames > 2")
        options = page.locator("#motion-edge option")
        assert options.count() >= 3
        page.locator("#layer-proxy").check()
        page.locator("#layer-zone").check()
        page.locator("#motion-edge").select_option(index=2)
        page.locator("#motion-station").fill("465")
        station = page.locator("#station-values").inner_text()
        assert "m/s" in station and page.locator("#launches tbody tr").count() == 3
        page.screenshot(path=str(args.output / (label+"-inspector.png")), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.locator("#overview").click()
        page.locator("#stage canvas").focus()
        page.keyboard.down("w")
        page.wait_for_function("window.v2w.stats.distance > 1")
        page.keyboard.up("w")
        page.locator("#overview").click()
        page.locator("#exchange-panel summary").click()
        page.wait_for_function("document.querySelector('#fly-skimmer').href.endsWith('?catalog=switchyard')")
        with page.expect_download() as dl:
            page.locator("#save-glb").click()
        glb = dl.value.path().read_bytes()
        receipt = {"viewport":[width,height], "routes":options.count(), "station":station,
                   "glbSha256":hashlib.sha256(glb).hexdigest()}
        if args.report and label == "desktop":
            page.locator("#flight-report").set_input_files(args.report)
            page.wait_for_function("document.querySelector('#report-result').textContent.includes('mismatch')")
            page.goto(url+"/?world=s-curve-study", wait_until="networkidle")
            page.locator("#exchange-panel summary").click()
            page.locator("#flight-report").set_input_files(args.report)
            page.wait_for_function("document.querySelector('#report-result').textContent.includes('continuous glide')")
            receipt["downstream"] = page.locator("#report-result").inner_text()
        assert not errors, errors
        rows.append(receipt)
        page.close()
    browser.close()
(args.output/"inspector.json").write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
