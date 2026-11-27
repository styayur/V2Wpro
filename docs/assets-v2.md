# Measuring and reusing local assets

From the repository root, print an analysis or write it to a fresh JSON file.

```sh
node tools/analyze-asset.js examples/assets/beacon.glb
node tools/analyze-asset.js examples/assets/beacon.glb beacon-analysis.json
node --test test/assets.test.js test/asset-analysis.test.js
```

The original beacon contains one mesh node, 28 triangles, and a 1 × 2 × 1 metre bounding box. Its Blender source recipe is reproducible with `blender -b -P tools/blender.py -- pillar new-beacon.glb`. The original asset, credits, reusable prototypes and connector coordinates are available in the [beacon kit](../examples/assets/beacon.unit.json).

## Geometry

`analyzeAsset(input)` reads the selected scene (scene zero by default), follows child nodes and composes parent matrices with local column-major matrices or translation, quaternion rotation and scale. For each triangle-list primitive it reads float32 POSITION triples from the buffer. Indexed geometry uses the referenced vertices; duplicate mesh instances count once per placement. The reader respects buffer-view offsets, accessor offsets and interleaved strides. Declared min/max values do not determine the measured result. Units are metres in glTF's right-handed Y-up coordinates. [Khronos glTF 2.0 specification, scenes, accessors and geometry](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

The report includes the triangle count, scene bounds and one unit record per mesh node with its node index, mesh index, display name, triangle count and transformed bounds. The box proxy uses the midpoint and full XYZ dimensions. The generated base and cap connectors lie at the centers of the bottom and top bounding faces. These are proposed alignment points. Curved, sloped and disconnected geometry needs an author to check contact before using them.

## Using the beacon kit in WorldIR

Append the kit's `asset` and `evidence` records to the corresponding world arrays, then merge its `prototypes` into the world's prototype dictionary. The URI resolves relative to the world JSON. For a world in `examples/`, the shipped URI resolves directly. Use a transform to place the beacon away from the flight route. A prototype has no implicit base offset.

| Prototype | Placement and rendered size |
| --- | --- |
| `beacon` | Single solid pillar, centered at the current origin, 1 × 2 × 1 m. |
| `beaconPair` | Two copies. A 2 m Y step brings the second base to the first cap. |
| `beaconTall` | One pillar scaled to 1 × 3 × 1 m. Its cap is 1.5 m above the origin. |
| `beaconProxy` | Box with the original pillar's dimensions and solid bounds. |

The evidence ID `beaconMeasure` is shared by the kit operators. Resolve ID collisions when merging independently authored kits. For other assets, the browser centers and normalizes imported geometry before applying the emit size. Convert each native connector coordinate to centered local coordinates by subtracting the measured proxy center, then scale each component by the corresponding emitted dimension divided by the measured dimension. A flat dimension requires an authored thickness or placement convention.

## Input profile and limits

The packager accepts a single static core glTF scene with triangle lists, float32 positions, unsigned 8/16/32-bit indices and dense scalar/vector accessors. Use Blender to bake animation, triangulate faces, and export without compression or extension-dependent materials before import. The analysis command can select the default scene of a multi-scene source. Binary chunks must have valid ordering, types, lengths and padding alignment.

Each input or packaged file is capped at 16 MiB, with an 8 MiB JSON cap and a 32 MiB decoded URI-resource budget. Analysis accepts up to 2,500 nodes, 64 hierarchy levels below the root, 16 million declared accessor components and one million triangle corners across instances. Position components must be finite and within ±1 billion metres after transformation. Index and byte ranges are checked before reads.

Text glTF can embed local .bin buffers and PNG, JPEG or simple WebP images. Canonical paths must remain under the input directory. GLB resources must already be embedded. The importer checks image headers and enforces a maximum of 8,192 pixels per side and 32 megapixels (33,554,432 pixels) in total. Header checks bound dimensions; full image decoding remains the renderer's responsibility. Unsupported sparse accessors, extension objects, skins, animations and morph targets produce errors. A successful import returns the existing WorldIR asset record with URI, source and license. Writes require a fresh destination filename.
