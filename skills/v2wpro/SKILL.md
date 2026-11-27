---
name: v2wpro
description: Translate a video, keyframe sequence or motion concept into an evidence-linked WorldIR and a playable procedural world using V2Wpro. Use for video-driven game prototyping and adapting an existing game from visual references.
---

## Start with a motion brief

For text input, write a shot specification the user can film, animate or give to a video model. Identify the player's verb, what changes on screen, camera relation to the player, a legible scale cue, palette, light direction and a complete action with visible feedback. Record duration, framing and what must remain consistent across cuts. Accept a local clip or stills directly. A text-only prototype keeps its claims labelled as design decisions until a reference exists.

## Read the footage

Run `v2w ingest FILE` for each local reference, then `v2w analyze`. Open the PNGs named in the task, ordered by presentation time. Compare adjacent frames to separate camera travel from object motion. Track silhouette, occlusion, terrain profile, repeating structural bays, material response, light and relative clearance. Mark ambiguous scale and surfaces hidden by the camera. For each core action identify input, anticipation, motion, recovery and observable feedback. Cite the reference SHA-256 and seconds for every observation. If you cannot see a frame, leave its interpretation pending.

For several clips, assign roles such as layout, palette or motion. State conflicting observations, their source times and which design choice resolves them. Preserve source manifests. Record the actual reviewer or model and provider; retain uncertainty.

## Compile and implement

Start from one of the checkout's full reviews in `examples/reviews/`. The canopy review ties a local clip to a branched survey route. Caldera and lattice exercise different topologies. Keep the source table, feature IDs, time intervals, confidence and unknowns alongside the authored design. For a shot with a declared digest, run `v2w verify REVIEW SOURCE_ID LOCAL_FILE`. For a brief-only prototype, use a brief source and label design decisions explicitly.

Map each reusable assembly to a prototype. Bind every group, placement and emission to its supporting feature ID. Pick metric dimensions and budget both instance count and operator expansion. Check each graph edge at the player's radius. Use `v2w asset FILE SOURCE LICENSE` to package a licensed local model and include its returned metadata under design.assets. Keep that assets directory beside the review.

```sh
v2w compile review.json world.json
v2w validate world.json
v2w generate world.json
v2w evidence world.json evidence.json
v2w preview world.json
# In another terminal
v2w evaluate world.json
```

For an authored revision, write a merge patch such as `{"design":{"motion":{"speed":8}}}`. Run `v2w revise review.json patch.json reviewed-r2.json`, then `v2w compile reviewed-r2.json world-r2.json`. Array edits require the complete replacement array. Compare at the original seed first, then run `v2w variant world-r2.json 42 world-s42.json` to test deterministic variation. Use fresh output filenames. Roll back by selecting the prior world and review. The checkout's docs/compiler.md describes source digests, local ingest bounds and CLI output paths.

For a v1 project, `v2w migrate world.json compat/world.json` preserves the legacy grammar and its assets. Use `v2w generate compat/world.json` to regenerate chunks or run `node tools/replay.js` from the checkout for the original arcade replay.

For an existing game, inspect its current scene entry point, input bindings and asset conventions. Stage the adaptation in a sibling scene or opt-in module on a branch, preserve original scenes and assets, and show a reversible integration diff. Keep existing controls and saved state unless the requested change requires migration.

## Play and compare

Use `v2w preview world.json` during iteration and `v2w evaluate world.json` for recorded Chromium input. Inspect the screenshot alongside the cited frame. Verify the action responds to input, every authored route clears the player sphere, and revisiting an unloaded area restores its seeded geometry. For a legacy corridor, inspect the centre route and chunk boundaries. Read console failures, frame times, geometry counts and draw calls. Explain intended visual differences. Change one rule or asset at a time, keep the seed fixed for comparison, then test a second seed. Attach the reviewed IR, report and footage with provenance.
