"""Compare stills in normalized image coordinates. Requires Pillow and FFmpeg.
Run: python tools/visual-review.py
"""
import hashlib
import io
import json
import os
from pathlib import Path
import statistics
import subprocess

from PIL import Image, ImageChops, ImageStat

root = Path(__file__).resolve().parents[1]
folder = root / "evidence/morph-case"
clip = root / "examples/canopy-source.mp4"

def reference_frame(seconds):
    data = subprocess.check_output([
        os.environ.get("FFMPEG", "ffmpeg"), "-v", "error", "-ss", str(seconds),
        "-i", str(clip), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"
    ], timeout=60)
    return Image.open(io.BytesIO(data)).convert("RGB")

def measure(img):
    # Apply the same vertical crop to remove the pilot HUD region, then map
    # normalized coordinates to a common grid. Perspective remains unmatched.
    img = img.convert("RGB").crop((0, 0, img.width, int(img.height*.86)))
    img = img.resize((128, 72), Image.Resampling.BOX)
    luminance = img.convert("L")
    pixels = luminance.tobytes()
    cols, rows = img.size
    dx, dy = [], []
    for y in range(1,rows):
        for x in range(1,cols):
            i = y*cols+x
            dx.append(abs(pixels[i]-pixels[i-1]))
            dy.append(abs(pixels[i]-pixels[i-cols]))
    bins = [0]*64
    for r,g,b in zip(*[iter(img.tobytes())]*3):
        bins[(r//64)*16+(g//64)*4+b//64] += 1
    layers = [ImageStat.Stat(luminance.crop((0,start,cols,start+24))).mean[0] for start in (0,24,48)]
    return {
        "meanRGB": ImageStat.Stat(img).mean, "meanLuma": statistics.mean(pixels),
        "lumaStd": statistics.pstdev(pixels), "lumaByVerticalThird": layers,
        "verticalEdgeFraction": sum(v>=18 for v in dx)/len(dx),
        "horizontalEdgeFraction": sum(v>=18 for v in dy)/len(dy),
        "histogram": [v/len(pixels) for v in bins],
    }

reference = measure(reference_frame(6))
stages = {}
for stage in ("before","after"):
    filename = folder / ("canopy-"+stage+".png")
    sample = measure(Image.open(filename))
    sample["screenshotSha256"] = hashlib.sha256(filename.read_bytes()).hexdigest()
    sample["rgbHistogramIntersection"] = sum(min(x,y) for x,y in zip(reference["histogram"], sample["histogram"]))
    stages[stage] = sample
frames = [reference_frame(t).resize((128,72),Image.Resampling.BOX) for t in (0,2,4,6)]
motion = [sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3 for a,b in zip(frames,frames[1:])]
report = {
    "reference": "examples/canopy-source.mp4#t=6", "referenceSha256":hashlib.sha256(clip.read_bytes()).hexdigest(),
    "sampling": "Upper 86% of each image, 128x72 box resample; neighbor luma threshold 18/255. Unregistered views.",
    "referenceFeatures": reference, "stages": stages, "sourceTimePairsSeconds": [[0,2],[2,4],[4,6]],
    "sourceFrameMeanAbsoluteRGBChange": motion
}
(folder/"visual-measurements.json").write_text(json.dumps(report,indent=2)+"\n", encoding="utf-8")
for name,s in stages.items():
    print(name, "mean luma",round(s["meanLuma"],2),"histogram overlap",round(s["rgbHistogramIntersection"],3),
          "vertical/horizontal edge fractions",round(s["verticalEdgeFraction"],3),round(s["horizontalEdgeFraction"],3))
