"""Render the original acceleration study. Requires Pillow and FFmpeg."""
import math
import os
import subprocess
from PIL import Image, ImageDraw

cmd = [os.environ.get("FFMPEG", "ffmpeg"), "-y", "-loglevel", "error", "-f", "rawvideo",
       "-pix_fmt", "rgb24", "-s", "480x270", "-r", "24", "-i", "-", "-c:v",
       "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "examples/dash.mp4"]
with subprocess.Popen(cmd, stdin=subprocess.PIPE) as proc:
    for frame in range(72):
        t = frame / 24
        # Acceleration between 1.00 s and 1.55 s then return to cruising speed.
        distance = 12 * t + 24 * max(0, min(.55, t - 1))
        img = Image.new("RGB", (480, 270), "#252d4c")
        pen = ImageDraw.Draw(img)
        for gate in range(12, 0, -1):
            depth = 12 * gate - distance
            if depth <= 1:
                continue
            radius = round(1200 / depth)
            pen.ellipse((240-radius, 135-radius, 240+radius, 135+radius),
                        outline="#ffb773", width=max(1, round(radius*.065)))
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit(proc.returncode)
