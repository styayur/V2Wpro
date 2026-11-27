import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { read, write } from "./media.js";
// An adapter implements {id, capabilities, run({capability, inputs, brief})}.
export async function dispatch(
  adapter,
  capability,
  inputs,
  brief,
  { allowUpload = false } = {},
) {
  if (
    !["video", "image", "understanding", "model3d"].includes(capability) ||
    !adapter.capabilities.includes(capability)
  )
    throw Error("Unsupported provider capability");
  if (!Array.isArray(inputs)) throw Error("Expected selected input array");
  if (
    (inputs.length || adapter.remote === true) &&
    adapter.remote !== false &&
    allowUpload !== true
  )
    throw Error("Explicit upload permission required for this adapter");
  return {
    provider: adapter.id,
    capability,
    result: await adapter.run({ capability, inputs, brief }),
  };
}
export function analyze(root = ".v2w", selected = []) {
  const dir = path.join(root, "references");
  const ids = selected.length
    ? selected
    : (existsSync(dir) ? readdirSync(dir) : [])
        .filter((id) => /^[0-9a-f]{64}$/.test(id))
        .sort();
  if (ids.length > 128 || new Set(ids).size !== ids.length)
    throw Error("Select up to 128 distinct references");
  const inputs = ids.map((id) => {
    if (!/^[0-9a-f]{64}$/.test(id)) throw Error("Invalid selected digest");
    const manifest = read(path.join(dir, id, "manifest.json"));
    if (
      manifest.sha256 !== id ||
      !/^source\.(mp4|mov|mkv|webm|jpg|jpeg|png|webp)$/.test(manifest.local) ||
      !Array.isArray(manifest.frames) ||
      !manifest.frames.length ||
      manifest.frames.length > 256 ||
      !manifest.frames.every(
        (f) => /^frame-\d{3}\.png$/.test(f.file) && Number.isFinite(f.seconds),
      )
    )
      throw Error("Invalid reference manifest " + id);
    return { ...manifest, directory: "references/" + id };
  });
  if (!inputs.length) throw Error("Ingest a reference first");
  const task = {
    status: "awaiting-review",
    inputs,
    brief:
      "Inspect frames in time order. Attribute observations to digest and seconds. Compare agreement and conflicts across clips. Choose rules explicitly and validate world.json.",
    sources: inputs.map((input, i) => ({
      id: "ref" + (i + 1),
      kind: /\.(png|jpe?g|webp)$/i.test(input.local) ? "image" : "video",
      locator: input.directory + "/" + input.local,
      sha256: input.sha256,
    })),
    reviewFormat: "v2w-review-1",
    reviewOutput: "review.json",
    output: "world.json",
  };
  write(path.join(root, "analysis-task.json"), task);
  return task;
}
