<img src="web/logo.svg" width="55" alt="V2Wpro logo">

# V2Wpro

**Video imagines. Algorithms expand. Engines realize.**

Turn a motion study into an evidence-linked WorldIR, expand it with seeded rules, then fly through the result in Three.js. Local video, images and reviewed keyframes work without a provider account.

[Play the worlds](https://styayur.github.io/V2Wpro/) · [简体中文](README.zh-CN.md) · [Release](https://github.com/styayur/V2Wpro/releases/tag/v0.1.0)

## Quick start

Install Node 24 LTS and clone this repository. From the checkout:

```sh
npm ci
node cli.js preview
```

Open the printed local URL. Choose Architectural Flight, Floating Archipelago or Motion Playground. W/S moves along the course, A/D strafes, arrows change altitude and Space performs the world's action. The first world is compiled from an original motion study. The other two are seeded design examples.

Install FFmpeg for ingestion and replay. For automated evaluation, install Chromium with `npx playwright install chromium`, then run `npm test` and `npm run evaluate`. Use `npm link` from the checkout for the v2w command. From a fresh directory, `v2w init island` creates a working document and its asset. Edit it, then run `v2w validate`, `v2w generate` and `v2w preview`.

[Video replay, skill installation, providers, Blender and engine development](docs/workflows.md) · [WorldIR specification](docs/worldir.md) · [Evaluation evidence](evidence/README.md) · [Asset credits](examples/CREDITS.md)

Three.js is the implemented adapter. The agent interprets footage; the CLI performs local sampling, validation, generation and evaluation. No service keys, uploads or telemetry are used by the reference pipeline.

Design references include [video-to-game](https://github.com/lovisdotio/video-to-game) for shot-to-playtest iteration and [Skimmer-Scraper](https://github.com/styayur/Skimmer-Scraper) for movement-led spatial design. V2Wpro is independently implemented and MIT licensed.
