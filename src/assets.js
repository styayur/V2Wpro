import { closeSync, constants, fstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Matrix4, Quaternion, Vector3 } from "three";

const fileLimit = 16 * 1024 * 1024;
const resourceLimit = 32 * 1024 * 1024;
function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
function integer(value, min, max, label) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max, "Invalid " + label);
  return value;
}
function entry(list, index, label) {
  return list[integer(index, 0, list.length - 1, label)];
}
function boundedRead(file, cap) {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    requireValue(stat.isFile() && stat.size <= cap, "File exceeds resource limit or is not regular");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      requireValue(count > 0, "File changed during read");
      offset += count;
    }
    return bytes;
  } finally { closeSync(fd); }
}
function inside(base, file) {
  const relative = path.relative(base, file);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
function unpack(bytes) {
  requireValue(bytes.length >= 20 && bytes.toString("latin1", 0, 4) === "glTF" &&
    bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, "Invalid GLB 2 header");
  const chunks = [];
  for (let at = 12; at < bytes.length;) {
    requireValue(chunks.length < 2 && at + 8 <= bytes.length, "Invalid GLB chunks");
    const length = bytes.readUInt32LE(at);
    const kind = bytes.readUInt32LE(at + 4);
    requireValue(kind === [0x4e4f534a, 0x004e4942][chunks.length] &&
      length > 0 && length % 4 === 0 && at + 8 + length <= bytes.length, "Invalid GLB chunk");
    chunks.push(bytes.subarray(at + 8, at + 8 + length));
    at += 8 + length;
  }
  return chunks;
}
function vector(value, length) {
  requireValue(Array.isArray(value) && value.length === length && value.every(Number.isFinite), "Invalid transform");
  return value;
}
function imageDimensions(bytes, mime) {
  if (mime === "image/png" && bytes.length >= 33 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
      bytes.readUInt32BE(8) === 13 && bytes.toString("latin1", 12, 16) === "IHDR") {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (mime === "image/jpeg" && bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let at = 2;
    while (at + 4 <= bytes.length && bytes[at++] === 0xff) {
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (at + 2 > bytes.length || marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        return [bytes.readUInt16BE(at + 5), bytes.readUInt16BE(at + 3)];
      }
      at += length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 25 && bytes.toString("latin1", 0, 4) === "RIFF" &&
      bytes.toString("latin1", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const kind = bytes.toString("latin1", 12, 16);
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (kind === "VP8 " && bytes.length >= 30 && bytes.readUIntLE(23, 3) === 0x2a019d) {
      return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    }
  }
  throw Error("Invalid or unsupported image header");
}
function readAsset(input) {
  const ext = path.extname(input).toLowerCase();
  requireValue([".glb", ".gltf"].includes(ext), "Expected GLB or glTF");
  const bytes = boundedRead(input, fileLimit);
  const [json, binary] = ext === ".glb" ? unpack(bytes) : [bytes];
  requireValue(json.length <= 8 * 1024 * 1024, "JSON exceeds limit");
  const doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  requireValue(doc?.asset?.version === "2.0", "Expected glTF 2.0");
  for (const [key, limit] of Object.entries({ buffers: 64, images: 64, nodes: 2500, meshes: 2500,
    bufferViews: 16384, accessors: 16384, scenes: 64, materials: 256, textures: 128 })) {
    const list = doc[key] ?? [];
    requireValue(Array.isArray(list) && list.length <= limit, "Invalid or oversized " + key);
  }
  // Limit the importer to core static geometry and known resource locations.
  const scan = (object, depth) => {
    if (object === null || typeof object !== "object") return;
    requireValue(depth <= 64, "JSON nesting exceeds limit");
    requireValue(!Object.hasOwn(object, "extensions") && !Object.hasOwn(object, "__proto__"), "Unsupported glTF extension or property");
    for (const child of Object.values(object)) scan(child, depth + 1);
  };
  scan(doc, 0);
  requireValue(!doc.extensionsRequired?.length && !doc.animations?.length && !doc.skins?.length, "Expected static core glTF");
  const base = realpathSync(path.dirname(input));
  let total = 0;
  function resource(record, isImage) {
    requireValue(typeof record.uri === "string", "Missing resource URI");
    let raw, mime;
    if (record.uri.startsWith("data:")) {
      const comma = record.uri.indexOf(",");
      const header = record.uri.slice(0, comma);
      const body = record.uri.slice(comma + 1);
      requireValue(/^data:(image\/(png|jpeg|webp)|application\/(octet-stream|gltf-buffer));base64$/.test(header) &&
        body.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body), "Invalid embedded resource");
      mime = header.slice(5, -7);
      raw = Buffer.from(body, "base64");
    } else {
      const uri = decodeURIComponent(record.uri);
      requireValue(ext !== ".glb" && !/[:?#\\%\x00-\x1f]/.test(uri) && !path.isAbsolute(uri) &&
        uri.split("/").every(part => part === "." || (part && !/[. ]$/.test(part) &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))), "Expected local relative resource");
      const file = realpathSync(path.resolve(base, uri));
      requireValue(inside(base, file), "Resource escapes asset directory");
      const suffix = path.extname(file).toLowerCase();
      mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".bin": "application/octet-stream" }[suffix];
      requireValue(mime, "Unsupported local resource type");
      raw = boundedRead(file, Math.min(fileLimit, resourceLimit - total));
      record.uri = "data:" + mime + ";base64," + raw.toString("base64");
    }
    requireValue(isImage === mime.startsWith("image/"), "Resource MIME mismatch");
    total += raw.length;
    requireValue(total <= resourceLimit, "Resource budget exceeded");
    return { raw, mime };
  }
  const buffers = (doc.buffers ?? []).map((record, i) => {
    const size = integer(record.byteLength, 1, fileLimit, "buffer length");
    if (record.uri !== undefined) {
      const { raw } = resource(record, false);
      requireValue(raw.length === size, "Buffer length mismatch");
      return raw;
    }
    requireValue(i === 0 && binary && binary.length >= size && binary.length <= size + 3, "Missing or invalid BIN chunk");
    return binary.subarray(0, size);
  });
  requireValue(!binary || (buffers.length && doc.buffers[0].uri === undefined), "Unexpected BIN chunk");
  const views = (doc.bufferViews ?? []).map(v => {
    const buf = entry(buffers, v.buffer, "buffer index");
    const start = integer(v.byteOffset ?? 0, 0, buf.length, "view offset");
    const length = integer(v.byteLength, 1, buf.length - start, "view length");
    if (v.byteStride !== undefined) requireValue(integer(v.byteStride, 4, 252, "stride") % 4 === 0, "Invalid stride");
    return buf.subarray(start, start + length);
  });
  let pixels = 0;
  for (const img of doc.images ?? []) {
    requireValue((img.uri === undefined) !== (img.bufferView === undefined), "Expected one image source");
    const { raw, mime } = img.uri !== undefined ? resource(img, true) :
      { raw: entry(views, img.bufferView, "image view"), mime: img.mimeType };
    const [width, height] = imageDimensions(raw, mime);
    pixels += width * height;
    requireValue(width > 0 && height > 0 && width <= 8192 && height <= 8192 && pixels <= 32 * 1024 * 1024, "Image exceeds pixel budget");
  }
  let components = 0;
  for (const a of doc.accessors ?? []) {
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const component = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    requireValue(!a.sparse && Number.isInteger(width) && Number.isInteger(component), "Unsupported accessor");
    const view = entry(views, a.bufferView, "accessor view");
    const start = integer(a.byteOffset ?? 0, 0, view.length, "accessor offset");
    const stride = doc.bufferViews[a.bufferView].byteStride ?? width * component;
    const count = integer(a.count, 1, 1000000, "accessor count");
    components += width * count;
    requireValue(components <= 16000000, "Accessor component budget exceeded");
    requireValue(stride >= width * component && start % component === 0 &&
      (start + (doc.bufferViews[a.bufferView].byteOffset ?? 0)) % component === 0 &&
      start + (count - 1) * stride + width * component <= view.length, "Accessor exceeds view or misaligned");
  }
  return { doc, views, packed: ext === ".glb" ? bytes : undefined };
}

function measure({ doc, views }) {
  const units = [];
  const visited = new Set();
  let samples = 0, triangles = 0;
  function reader(index, position) {
    const a = entry(doc.accessors ?? [], index, "accessor");
    requireValue(position ? a.type === "VEC3" && a.componentType === 5126 :
      a.type === "SCALAR" && [5121, 5123, 5125].includes(a.componentType), "Invalid position or index format");
    const data = views[a.bufferView];
    const width = position ? 12 : {5121: 1, 5123: 2, 5125: 4}[a.componentType];
    const stride = doc.bufferViews[a.bufferView].byteStride ?? width;
    return { count: a.count, read(i) {
      const offset = (a.byteOffset ?? 0) + i * stride;
      return position ? new Vector3(data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8))
        : data.readUIntLE(offset, width);
    } };
  }
  const bounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const sceneBounds = bounds();
  function include(b, point) {
    point.forEach((n, i) => {
      requireValue(Number.isFinite(n) && Math.abs(n) <= 1e9, "Invalid transformed vertex");
      b.min[i] = Math.min(b.min[i], n);
      b.max[i] = Math.max(b.max[i], n);
    });
  }
  function visit(id, parent, depth) {
    const node = entry(doc.nodes ?? [], id, "node");
    requireValue(depth <= 64 && !visited.has(id), "Repeated node or depth limit");
    visited.add(id);
    let local = new Matrix4();
    if (node.matrix) {
      const m = vector(node.matrix, 16);
      requireValue(!node.translation && !node.scale && !node.rotation && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1, "Invalid affine matrix");
      local.fromArray(m);
    } else {
      const rotation = new Quaternion(...vector(node.rotation ?? [0,0,0,1], 4));
      requireValue(Math.abs(rotation.length() - 1) < 0.0001, "Invalid quaternion");
      local.compose(new Vector3(...vector(node.translation ?? [0,0,0], 3)), rotation,
        new Vector3(...vector(node.scale ?? [1,1,1], 3)));
    }
    const matrix = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const mesh = entry(doc.meshes ?? [], node.mesh, "mesh");
      const b = bounds();
      let faces = 0;
      requireValue(Array.isArray(mesh.primitives) && mesh.primitives.length > 0, "Empty mesh");
      for (const p of mesh.primitives) {
        requireValue((p.mode ?? 4) === 4 && !p.targets, "Expected static triangle list");
        const vertices = reader(p.attributes.POSITION, true);
        const indices = p.indices === undefined ? undefined : reader(p.indices, false);
        const count = indices?.count ?? vertices.count;
        samples += count;
        requireValue(samples <= 1000000 && count % 3 === 0, "Triangle sample budget or count invalid");
        faces += count / 3;
        for (let j = 0; j < count; j++) {
          const index = indices ? integer(indices.read(j), 0, vertices.count - 1, "vertex index") : j;
          include(b, vertices.read(index).applyMatrix4(matrix).toArray());
        }
      }
      triangles += faces;
      include(sceneBounds, b.min);
      include(sceneBounds, b.max);
      units.push({ node: id, mesh: node.mesh, name: node.name ?? mesh.name ?? "mesh", triangles: faces, bounds: b });
    }
    for (const child of node.children ?? []) visit(child, matrix, depth + 1);
  }
  if (doc.scenes?.length) {
    const scene = entry(doc.scenes, doc.scene ?? 0, "scene");
    for (const root of scene.nodes ?? []) visit(root, new Matrix4(), 0);
  }
  return { triangles, bounds: units.length ? sceneBounds : null, units };
}

export function analyzeAsset(input) {
  const result = measure(readAsset(input));
  requireValue(result.bounds, "Selected scene has no geometry");
  const { min, max } = result.bounds;
  const center = min.map((v, i) => (v + max[i]) / 2);
  const size = max.map((v, i) => v - min[i]);
  return { ...result, proxy: { shape: "box", center, size },
    connectors: ["base", "cap"].map((id, i) => ({ id,
      position: [center[0], i ? max[1] : min[1], center[2]], normal: [0, i ? 1 : -1, 0] })) };
}

export function importAsset(input, directory, source, license) {
  requireValue(source?.trim() && license?.trim(), "Supply source credit and license");
  const ext = path.extname(input).toLowerCase();
  const name = path.basename(input, path.extname(input));
  requireValue(/^[a-zA-Z0-9_-]{1,64}$/.test(name), "Expected a named GLB or glTF file");
  const asset = readAsset(input);
  requireValue((asset.doc.scenes?.length ?? 0) <= 1, "Package one static scene per asset");
  measure(asset);
  const uri = "assets/" + name + ext;
  mkdirSync(path.join(directory, "assets"), { recursive: true });
  requireValue(inside(realpathSync(directory), realpathSync(path.join(directory, "assets"))), "Destination escapes project");
  const output = asset.packed ?? JSON.stringify(asset.doc);
  requireValue(Buffer.byteLength(output) <= (asset.packed ? fileLimit : 8 * 1024 * 1024), "Packaged file exceeds limit");
  writeFileSync(path.join(directory, uri), output, { flag: "wx" });
  return { uri, source, license };
}
