# Development workflows

This guide describes the 1.0 corridor workflow retained for compatibility. For reviewed rule programs use the [2.0 compiler](compiler.md), [spatial engine](morphogenesis.md) and [asset pipeline](assets-v2.md).

## Video to playable world

Use Node 24 LTS, npm, and FFmpeg on PATH (or set FFMPEG to an executable path). Install development dependencies with `npm ci`. Once dependencies and Chromium are cached, local generation, preview and evaluation run offline. Prebuilt Pages files require only a static HTTP server.

```sh
node cli.js ingest examples/reference.mp4
node cli.js analyze
node tools/replay.js
node cli.js validate .v2w/replayed.json
node cli.js generate .v2w/replayed.json
node cli.js preview .v2w/replayed.json
# In another terminal
node cli.js evaluate .v2w/replayed.json
node cli.js report
```

Ingest keeps a content-addressed copy, original filename, selected frame times and detected hard cuts. It decodes stills too. The selector keeps the first frame, roughly one sample per second and scene-score crossings over 0.32, up to 256 frames. Long clips should be trimmed before review. Similar frames and continuous motion may have zero cuts.

Analyze emits a multi-reference review packet. The agent or human opens the frames, reconciles their roles and writes the interpretation. The arcade replay joins the actual clip digest, measured pixels, a saved agent review and authored gameplay constraints. Its output can be reproduced without repeating model inference. Other examples are authored procedural design studies.

## Skill installation

Copy the complete skills/v2wpro folder into ~/.agents/skills/ for personal discovery, or .agents/skills/ in the target project. Open the project with a coding agent and request “Use $v2wpro to adapt this clip into a playable corridor.” Other agents can read SKILL.md directly. Keep the V2Wpro checkout available for the CLI.

## Components and providers

src/media.js owns local decoding and evidence. src/provider.js batches references into a review task. src/validate.js enforces WorldIR. src/world.js is pure and has no renderer imports. web/app.js owns resources, input, streaming and rendering. tools/evaluate.js drives an actual browser and emits recordings and JSON.

A provider supplies an id, capabilities and an asynchronous run method. Call dispatch(adapter, capability, inputs, brief); capabilities are video, image, understanding and model3d. The caller selects the adapter. Return artifact locations or typed observations plus model/version, time, input digest, license and any uncertainty. Read credentials from environment in server-side adapters. Use explicit user-selected inputs for remote jobs. The core ships the local review workflow; commercial connectors are extension work.

## Assets and Blender

Run `v2w asset input.gltf "Original model by creator" MIT` from your world directory. It embeds local glTF buffers and textures, saves a portable asset, and prints the metadata entry to add to WorldIR. It also accepts packed GLB files.

The simplest path uses procedural meshes only. Place a self-contained glTF or GLB in an assets directory next to world.json and add its relative URI, source and license to assets. Embed glTF buffers/textures or pack them into GLB. Supply trusted files. The adapter caches the loaded model across chunks and shares primitive geometry and material slots across instanced batches. Visual assets can be replaced independently of the corridor's collision boxes.

```sh
blender -b --python-exit-code 1 -P tools/blender.py -- pillar beacon.glb
blender -b --python-exit-code 1 -P tools/blender.py -- input.gltf packed.glb
```

Both commands require a fresh output path. The script imports or models a mesh, validates mesh data, preserves material assignments and exports binary glTF. The bundled example was built with Blender 5.2.4. Blender is optional.

## New engines and grammars

The split between reusable geometry and per-placement transforms follows a familiar procedural modelling pattern. [Houdini Copy to Points](https://www.sidefx.com/docs/houdini/nodes/sop/copytopoints.html) describes variation through point attributes and sharing packed source geometry. Here each row emits plain JSON transforms and the renderer batches compatible placements.

Implement validated document loading, metric axis conversion, deterministic chunk materialization, input to movement conversion, collider queries, resource disposal, and a metrics snapshot. Use generateChunk and visibleChunks as executable references. Verify a fixed-seed fingerprint, central path sweep, unload/revisit and one gameplay action. Godot and Unity are prospective adapters.

The reference grammar expands a corridor into rows, mirrored lots, per-row seeded dimensions and shape assemblies. It borrows the repeated production idea from shape grammars and separates prototype geometry from transforms as in instancing workflows. It implements a bounded set of productions. To add a grammar, update schema, cost model, generator, visuals and progression tests together.

## Evaluation

Chromium records each viewport while Playwright sends real key events. The suite checks motion-specific state, sustained travel, unload counters, deterministic serialized geometry and an unobstructed central route. The report includes a rolling frame-time sample, p95, derived FPS, draw calls, triangles, resident geometry count, Chromium's optional JS heap estimate and browser errors. JS heap and geometry counts are proxies for memory use. Compare timings only on equivalent hardware and rendering backends.

For the arcade, the intersection of two 64-bin RGB histograms measures palette overlap on downsampled frames. Inspect both images to judge depth, silhouette and motion. The reference clip has no physical scale or shading model. Dynamic lighting, lateral masses and bridges deliberately change the image.
