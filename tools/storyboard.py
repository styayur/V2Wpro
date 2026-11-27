"""Original independent 2D motion study. Requires Pillow and an FFmpeg executable."""
import math
import os
import subprocess
from PIL import Image, ImageDraw

cmd = [os.environ.get("FFMPEG", "ffmpeg"), "-y", "-loglevel", "error", "-f", "rawvideo",
       "-pix_fmt", "rgb24", "-s", "480x270", "-r", "24", "-i", "-", "-an", "-c:v",
       "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "examples/reference.mp4"]
with subprocess.Popen(cmd, stdin=subprocess.PIPE) as proc:
    for frame in range(96):
        img = Image.new("RGB", (480, 270), "#b6cdc8")
        draw = ImageDraw.Draw(img)
        draw.polygon([(0,270),(0,159),(240,128),(480,159),(480,270)], fill="#596d72")
        for depth in range(9, 0, -1):
            scale = 1 / (depth - (frame % 48) / 48 + .28)
            dx, height = int(192*scale), int(184*scale)
            cx = 240 + int(math.sin(frame/18)*7)
            bounds = [cx-dx, 133-height, cx+dx, 133+height]
            draw.arc(bounds,180,360, fill="#c96440", width=max(2,int(17*scale)))
            for side in [-1,1]:
                x = cx+dx*side
                draw.line((x,133,x,133+height), fill="#354c54", width=max(2,int(16*scale)))
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit(proc.returncode)
