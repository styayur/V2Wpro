"""Measure repeats of a projected post in the original clip; replay condition C."""
from hashlib import sha256
from itertools import groupby
import json
import math
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

directory = Path(__file__).resolve().parent
clip = directory.parents[1] / "examples/reference.mp4"
digest = sha256(clip.read_bytes()).hexdigest()
if digest != "91d375a5fdec44d0689158bb6acef486f2bb522c6301acc82a3a48ad39fc328f":
    raise ValueError("Unexpected reference clip")
frames = imageio_ffmpeg.read_frames(str(clip), pix_fmt="rgb24")
meta = next(frames)
assert meta["size"] == (480, 270)
hits = []
samples = []
for i, data in enumerate(frames):
    image = Image.frombytes("RGB", meta["size"], data)
    dark = [x for x in range(image.width) if max(image.getpixel((x, 140))) < 100]
    center = (max(x for x in dark if x < 240) + min(x for x in dark if x > 240)) // 2
    probe = center + 110
    if probe in dark:
        hits.append(i)
    samples.append({"frame": i, "seconds": i / meta["fps"], "centerX": center,
                    "probeX": probe, "rgb": image.getpixel((probe, 140))})
runs = []
for _, group in groupby(enumerate(hits), key=lambda pair: pair[1] - pair[0]):
    indices = [frame for _, frame in group]
    runs.append([indices[0], indices[-1]])
if len(runs) != 2:
    raise ValueError(f"Expected two visits to the probe, found {runs}")
period = (runs[1][0] - runs[0][0]) / meta["fps"]
world = json.loads((directory / "frame.json").read_text())
spacing = math.dist(world["prototypes"]["station"]["step"], [0, 0, 0])
world["motion"]["speed"] = spacing / period
world["evidence"].extend([
    dict(id="passageTiming", kind="observation", source="examples/reference.mp4, scanline y=140",
         claim=f"Dark post entries at frames {runs[0][0]} and {runs[1][0]} are {period:g} seconds apart.",
         confidence=1),
    dict(id="flightPace", kind="decision", source="experiments/morphogenesis/temporal-report.json",
         claim=f"Traverse one authored {spacing:g} metre row spacing per measured post interval.",
         confidence=1),
])
def save(name, value):
    (directory / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
save("video.json", world)
save("temporal-report.json", dict(sourceSha256=digest, decoder=meta, runsInclusive=runs,
                                 periodSeconds=period, spacingMeters=spacing,
                                 speedMetersPerSecond=world["motion"]["speed"], samples=samples))
