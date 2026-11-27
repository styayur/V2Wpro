"""Replay the authored edit using actual RGB values from the archived frame."""
import json
from hashlib import sha256
from pathlib import Path

from PIL import Image

directory = Path(__file__).resolve().parent
examples = directory.parents[1] / "examples"
frame = examples / "keyframe.png"
if sha256(frame.read_bytes()).hexdigest() != "fb4d4a0892e384354bbd5ea7db149bab8b29fe0fefdc89cdf33f2a31b3d7eb27":
    raise ValueError("Unexpected keyframe")

world = json.loads((directory / "text.json").read_text())
source = "examples/keyframe.png (examples/reference.mp4 at 1 s)"
with Image.open(frame) as image:
    pixels = image.convert("RGB")
    for slot, xy in {"sky": (100, 12), "stone": (139, 150), "accent": (47, 10)}.items():
        world["style"][slot] = "#%02x%02x%02x" % pixels.getpixel(xy)
world["evidence"].extend([
    dict(id="curve", kind="observation", source=source,
         claim="Orange curves join the tops of paired dark posts.", confidence=0.98),
    dict(id="span", kind="inference", source=source,
         claim="Represent each curve as an accent arch spanning the post centres.", confidence=0.9),
])
world["prototypes"]["row"]["children"].append(dict(
    op="transform", evidence="span", offset=[0, 2, 0],
    child=dict(op="emit", evidence="span", shape="arch", size=[10, 10, 0.6],
               material="accent", solid=False)))
(directory / "frame.json").write_text(json.dumps(world, indent=2) + "\n", encoding="utf-8")
