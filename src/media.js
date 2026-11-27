import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
export const read = (file) => JSON.parse(readFileSync(file, "utf8"));
export const write = (file, value) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
export function ingest(file, root = ".v2w") {
  const ext = path.extname(file).toLowerCase();
  if (
    ![
      ".mp4",
      ".mov",
      ".mkv",
      ".webm",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
    ].includes(ext)
  )
    throw Error("Unsupported reference format");
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  const target = path.join(root, "references", hash);
  if (existsSync(path.join(target, "manifest.json")))
    return read(path.join(target, "manifest.json"));
  mkdirSync(path.dirname(target), { recursive: true });
  const temp = mkdtempSync(path.join(path.dirname(target), "pending-"));
  try {
    const local = "source" + ext;
    copyFileSync(file, path.join(temp, local));

    // showinfo reports original presentation timestamps after the selector.
    const log = runLog([
      "-vf",
      "select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)+gt(scene,0.32)',scale=480:-2,showinfo",
      "-fps_mode",
      "vfr",
      "-frames:v",
      "256",
      "frame-%03d.png",
    ]);
    function runLog(args) {
      // Redirect diagnostic stream via spawnSync without invoking a shell.
      const result = spawnSync(
        process.env.FFMPEG || "ffmpeg",
        [
          "-nostdin",
          "-hide_banner",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          local,
          ...args,
        ],
        { cwd: temp, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      if (result.error || result.status !== 0)
        throw result.error || Error(result.stderr.slice(-1000));
      return result.stderr;
    }
    const times = Array.from(
      log.matchAll(/showinfo[^\n]*?pts_time:\s*([-+.\deE]+)/g),
      (m) => Number(m[1]),
    ).slice(0, 256);
    if (!times.length) throw Error("No decodable frames");
    const cuts = runLog([
      "-vf",
      "select='gt(scene,0.32)',showinfo",
      "-an",
      "-f",
      "null",
      "-",
    ]);
    const manifest = {
      sha256: hash,
      original: path.basename(file),
      local,
      sceneCuts: Array.from(
        cuts.matchAll(/showinfo[^\n]*?pts_time:\s*([-+.\deE]+)/g),
        (m) => +m[1],
      ),
      frames: times.map((seconds, i) => ({
        seconds,
        file: "frame-" + String(i + 1).padStart(3, "0") + ".png",
      })),
    };
    write(path.join(temp, "manifest.json"), manifest);
    renameSync(temp, target);
    return manifest;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
