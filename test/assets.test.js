import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { read } from "../src/media.js";
import { importAsset } from "../src/assets.js";
test("import glTF embeds buffers, preserves GLB and refuses overwrite", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "v2w-assets-"));
  try {
    const file = path.join(dir, "part.gltf");
    writeFileSync(path.join(dir, "mesh.bin"), Buffer.from([1, 2, 3]));
    writeFileSync(
      file,
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ byteLength: 3, uri: "mesh.bin" }],
      }),
    );
    const asset = importAsset(file, dir, "original fixture", "MIT");
    assert.equal(
      read(path.join(dir, asset.uri)).buffers[0].uri,
      "data:application/octet-stream;base64,AQID",
    );
    assert.throws(() => importAsset(file, dir, "fixture", "MIT"), /EEXIST/);
    assert.equal(
      importAsset("examples/assets/beacon.glb", dir, "original", "MIT").uri,
      "assets/beacon.glb",
    );
    writeFileSync(
      file,
      JSON.stringify({
        asset: { version: "2.0" },
        images: [{ uri: "https://example.org/textures.png" }],
      }),
    );
    assert.throws(
      () => importAsset(file, dir, "fixture", "MIT"),
      /local relative/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
