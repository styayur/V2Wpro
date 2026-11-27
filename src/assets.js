import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";

// Package local glTF buffers and images so a project can be moved offline.
export function importAsset(input, directory, source, license) {
  if (!source?.trim() || !license?.trim())
    throw Error("Supply source credit and license");
  const ext = path.extname(input).toLowerCase();
  const name = path.basename(input, ext);
  if (![".glb", ".gltf"].includes(ext) || !/^[a-zA-Z0-9_-]+$/.test(name))
    throw Error("Expected a named GLB or glTF file");
  const bytes = readFileSync(input);
  let data, packed;
  if (ext === ".glb") {
    if (
      bytes.length < 20 ||
      bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length ||
      bytes.toString("ascii", 16, 20) !== "JSON"
    )
      throw Error("Invalid GLB 2 header");
    data = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    packed = bytes;
  } else data = JSON.parse(bytes.toString("utf8"));
  if (data.asset?.version !== "2.0") throw Error("Expected glTF 2.0");
  const base = realpathSync(path.dirname(input));
  for (const resource of [...(data.buffers || []), ...(data.images || [])]) {
    if (!resource.uri || resource.uri.startsWith("data:")) continue;
    if (ext === ".glb")
      throw Error("Pack external GLB resources in Blender first");
    const uri = decodeURIComponent(resource.uri);
    if (/[:?#\\]/.test(uri) || path.isAbsolute(uri))
      throw Error("Expected local relative resource");
    const file = realpathSync(path.resolve(base, uri));
    if (!file.startsWith(base + path.sep))
      throw Error("Resource escapes asset directory");
    const type =
      {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      }[path.extname(file).toLowerCase()] || "application/octet-stream";
    resource.uri =
      "data:" + type + ";base64," + readFileSync(file).toString("base64");
  }
  const uri = "assets/" + name + ext;
  mkdirSync(path.join(directory, "assets"), { recursive: true });
  writeFileSync(path.join(directory, uri), packed || JSON.stringify(data), {
    flag: "wx",
  });
  return { uri, source, license };
}
