import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
  readSync,
  fstatSync,
  linkSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
function boundedRead(file, limit) {
  const fd = openSync(file, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || !stat.size || stat.size > limit)
      throw Error(
        "Expected a non-empty regular file up to " + limit + " bytes",
      );
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset);
      if (!count) throw Error("Input changed during read");
      offset += count;
    }
    if (fstatSync(fd).size !== stat.size)
      throw Error("Input changed during read");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export const read = (file) =>
  JSON.parse(boundedRead(file, 16 * 1024 * 1024).toString("utf8"));
export const write = (file, value) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// Publish a complete JSON file only if the requested destination is free.
export function writeNew(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = mkdtempSync(path.join(path.dirname(file), ".v2w-output-"));
  try {
    const staged = path.join(temp, "output.json");
    write(staged, value);
    linkSync(staged, file);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export const fileDigest = (file) =>
  createHash("sha256")
    .update(boundedRead(file, 128 * 1024 * 1024))
    .digest("hex");

const formats = new Map(
  Object.entries({
    ".mp4": "mov",
    ".mov": "mov",
    ".mkv": "matroska",
    ".webm": "matroska",
    ".jpg": "jpeg_pipe",
    ".jpeg": "jpeg_pipe",
    ".png": "png_pipe",
    ".webp": "webp_pipe",
  }),
);
export function ingest(file, root = ".v2w") {
  const ext = path.extname(file).toLowerCase();
  if (!formats.has(ext)) throw Error("Unsupported reference format");
  const bytes = boundedRead(file, 128 * 1024 * 1024);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const target = path.join(root, "references", hash);
  if (existsSync(path.join(target, "manifest.json")))
    return read(path.join(target, "manifest.json"));
  mkdirSync(path.dirname(target), { recursive: true });
  const temp = mkdtempSync(path.join(path.dirname(target), "pending-"));
  try {
    const local = "source" + ext;
    writeFileSync(path.join(temp, local), bytes);

    // showinfo reports original presentation timestamps after the selector.
    const log = runLog([
      "-vf",
      "select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)+gt(scene,0.32)',scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,showinfo",
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
          "file",
          "-f",
          formats.get(ext),
          "-max_pixels",
          "16777216",
          "-threads",
          "2",
          "-t",
          "256",
          "-i",
          local,
          "-map",
          "0:v:0",
          ...args,
        ],
        {
          cwd: temp,
          encoding: "utf8",
          timeout: 60000,
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        },
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
    try {
      renameSync(temp, target);
    } catch (err) {
      if (existsSync(path.join(target, "manifest.json")))
        return read(path.join(target, "manifest.json"));
      throw err;
    }
    return manifest;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
