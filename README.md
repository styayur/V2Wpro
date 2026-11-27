<img src="web/logo.svg" width="54" alt="V2Wpro logo">

# V2Wpro · Kinetogenesis

**Video imagines. Algorithms expand. Engines realize.**

A video reviewer can describe a room as a reusable rule: stack shelves between uprights, repeat the assembly, and put the player's junction beside the landmark chair. V2Wpro compiles those choices into a bounded WorldIR program. Every emitted object links back to the claims that produced it.

[Play the eight worlds](https://styayur.github.io/V2Wpro/) · [简体中文](README.zh-CN.md) · [v0.2.0 release and recordings](https://github.com/styayur/V2Wpro/releases/tag/v0.2.0)

## Quick start

Install Node 24, clone the repository, then run from the checkout:

```sh
npm ci
node cli.js preview
```

Open the printed address. Select a world, change the seed and inspect its rules beside the playable view. Use the on-screen controls or keyboard to fly. The bundled website also runs offline from a static HTTP server. FFmpeg is needed to ingest new media; Blender is optional.

| Study | What to look for |
|---|---|
| Canopy · Reading Rooms | The chair becomes a landmark. Shelving becomes repeated bays in branching galleries. Compare the room with the supplied footage and review. |
| Caldera · Split Ascent | Terrain prototypes at different heights organize a climb and return route. The input is an authored brief. |
| Lattice · Relay Exchange | Repeated portals and a timed dash on two routes that rejoin. The motion reference is an original authored animation. |
| Architectural Flight, Floating Archipelago, Motion Playground | The 1.0 documents still use their original interpreter and retain their v0.1.0 geometry fingerprints. |

## Rebuild from a review

```sh
node cli.js verify examples/reviews/canopy.json clip examples/canopy-source.mp4
node cli.js compile examples/reviews/canopy.json .v2w/reading-rooms.json
node cli.js generate .v2w/reading-rooms.json
node cli.js preview .v2w/reading-rooms.json
```

For a new video, ingest local files and run `node cli.js analyze` to produce a timestamped review task. A coding agent or human supplies the interpretation and rule design. The compiler validates evidence bindings, expansion bounds, collision clearance and route connectivity. Seeded variants and revisions can be replayed without another inference. No commercial API key is required.

[Compilation, revisions and migration](docs/compiler.md) · [WorldIR 2.0 and generation semantics](docs/morphogenesis.md) · [Coding-agent skill](skills/v2wpro/SKILL.md) · [Video case study](docs/case-study.md) · [Controlled comparison](docs/experiment.md) · [Asset workflow](docs/assets-v2.md) · [Downstream exchange](docs/downstream.md)

## Development

Run `npm test` with FFmpeg on PATH (or set FFMPEG to its executable), then `npx playwright install chromium`. `npm run evaluate` plays the legacy studies; `node tools/morph-evaluate.js` exercises the spatial worlds. The release contains screenshots, recordings, draw statistics, return-trip and memory observations. Install the agent workflow by copying skills/v2wpro into the target project's .agents/skills/ directory.

Three.js is the shipped renderer. CPU realization and GPU streaming operate on a bounded finite scene. The source and original assets are MIT licensed. Preview and redistribution of third-party media follow the source-specific credits. [Credits](examples/CREDITS.md) · [MIT License](LICENSE) · [Historical WorldIR 1.0 specification](docs/worldir.md)

## Finite flight research

[Contact deck, Relay District and downstream flight qualification](docs/contact-study.md)
