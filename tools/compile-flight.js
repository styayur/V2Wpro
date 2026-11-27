import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ingest, read, write } from "../src/media.js";
import { analyze } from "../src/provider.js";
import { validate } from "../src/validate.js";
// Compile the reviewed feature bindings against the actual source pixels.
export function compileFlight(video, analysis, design, out, root = ".v2w") {
  const media = ingest(video, root),
    task = analyze(root);
  if (media.sha256 !== analysis.source)
    throw Error("Review refers to another reference");
  const frame = media.frames.find((f) => f.seconds === analysis.frame);
  if (!frame) throw Error("Reviewed timestamp missing");
  let file = path.join(
    root,
    task.inputs.find((i) => i.sha256 === media.sha256).directory,
    frame.file,
  );
  // Verify the decoded frame before looking up the archived color transform.
  // Native YUV bytes are stable across ARM and x64; swscale's RGB rounding differs.
  if (analysis.nativeFrameSha256 !== undefined) {
    const yuv = execFileSync(process.env.FFMPEG || "ffmpeg", [
      "-v", "error", "-ss", String(frame.seconds), "-protocol_whitelist", "file",
      "-i", path.join(path.dirname(file), media.local), "-frames:v", "1",
      "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1"
    ], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    file = fileURLToPath(new URL("../examples/keyframe.png", import.meta.url));
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    if (hash(yuv) !== analysis.nativeFrameSha256 || hash(readFileSync(file)) !== analysis.reviewedPngSha256)
      throw Error("Legacy native frame or reviewed color frame differs from the recording");
  }
  const w = { ...structuredClone(design), prototype: analysis.grammar };
  w.evidence = w.evidence.filter(
    (e) => !["observation", "inference"].includes(e.kind),
  );
  const source = "sha256:" + media.sha256 + "#t=" + frame.seconds;
  for (const {
    feature,
    sample: [x, y],
    claim,
  } of analysis.observations) {
    if (
      !["sky", "stone", "accent"].includes(feature) ||
      ![x, y].every(Number.isSafeInteger)
    )
      throw Error("Invalid sample binding");
    const rgb = execFileSync(process.env.FFMPEG || "ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "format=rgb24,crop=1:1:" + x + ":" + y,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    if (rgb.length !== 3) throw Error("RGB sample missing");
    w.style[feature] = "#" + rgb.toString("hex");
    w.evidence.push({ kind: "observation", source, claim, confidence: 0.99 });
  }
  w.evidence.push({
    kind: "inference",
    source,
    claim: analysis.interpretation,
    confidence: 0.85,
  });
  write(out, validate(w));
  return w;
}
