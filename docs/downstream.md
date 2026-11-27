# Exchanging a static world with Skimmer-Scraper

From the repository root, export a WorldIR 2.0 example to a fresh GLB. In Skimmer-Scraper, open **World → Local GLB worlds**, choose that file and analyze it. The default axis is Y, scale is 1, and yaw is 0. The importer checks the first 22 metres at takeoff when enabling the world. [Skimmer-Scraper local world interface at the verified revision](https://github.com/styayur/Skimmer-Scraper/blob/93c0d092f58de4a90e420abcd0202149b5e817f3/docs/WORLD-IMPORT.md)

```sh
node tools/export-exchange.js examples/canopy.json canopy.glb
node tools/export-exchange.js examples/caldera.json caldera.glb
node tools/export-exchange.js examples/lattice.json lattice.glb
node --test test/exchange.test.js
```

The exporter realizes the seed, checks all physical edges and spawn connectivity, and bakes one node per item. Each solid becomes a box with its original center and XYZ collision extents. The receiving engine collides with its triangles. Decorative rocks, mounds, arches and rings use static meshes. Asset items use bounding-box proxies and retain their original URI in node extras. Stone and accent swatches become linear PBR base colors. Geometry and materials are shared within the file. A device can open the GLB offline.

Node extras carry the original shape and evidence ID and the recipient's `skimmerRole`. Solids have role `SURFACE`; visual-only nodes have role `DECORATION`. Scene extras retain the seed, topology, evidence records, asset credits and unknowns. The recipient interprets the roles, recenters solid bounds in X/Z, and places the lowest solid point at Y=0. For manual placement, add the reported verification offset to a source topology position. Launch orientation, controller, clearance, scoring and proximity behavior belong to Skimmer-Scraper. The seed is baked and the scene loads as a finite world. [Recipient scene analysis](https://github.com/styayur/Skimmer-Scraper/blob/93c0d092f58de4a90e420abcd0202149b5e817f3/src/world/imports/sceneAnalyzer.ts)

## Reproducing the interoperability proof

Install the V2Wpro dependencies and use a separate, trusted Skimmer-Scraper checkout with its normal dependencies installed. The optional checker loads the checkout's preflight and scene-analysis entry points, parses the exported bytes with that checkout's Three.js GLTFLoader, and prints measured node counts, triangle totals, collider triangles and the origin offset. The checker compiles in memory and only reads the checkout. The exporter has no Skimmer-Scraper runtime dependency. [Recipient preflight](https://github.com/styayur/Skimmer-Scraper/blob/93c0d092f58de4a90e420abcd0202149b5e817f3/src/world/imports/worldGlbPreflight.ts)

```sh
node tools/verify-exchange.js ../Skimmer-Scraper canopy.glb caldera.glb lattice.glb
```

Measured against revision `93c0d092f58de4a90e420abcd0202149b5e817f3`, with the example seeds as authored:

| Scene | Loaded nodes, including root | Rendered triangles | Collision triangles |
| --- | ---: | ---: | ---: |
| canopy | 50 | 588 | 588 |
| caldera | 58 | 684 | 684 |
| lattice | 69 | 8,980 | 660 |

The headless proof covers file acceptance, mesh instantiation, role recognition, and collision geometry construction. Browser activation, takeoff, gameplay and save/reload require a separate end-to-end run. Export limits reserve one recipient node for the scene root, cap rendered triangles at 1,250,000, and require collision geometry spanning at least 0.05 m. The whole exported scene must span at most 12,000 m on each axis. [Recipient limits and options](https://github.com/styayur/Skimmer-Scraper/blob/93c0d092f58de4a90e420abcd0202149b5e817f3/src/world/imports/worldManifest.ts)
