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

Inspect the checkout's schema/worldir-1.0.json and examples. Turn repeated features into prototypes, parameters and constraints. Choose metric scale, player radius, traversable corridor, bounds, seed, chunk radius and per-chunk budget. Separate observation, inference, decision and extension in evidence. Write a short implementation plan mapping each gameplay verb to a measurable test. Validate the world before generating chunks.

Use a licensed GLB or a primitive when its silhouette carries the design. Author detailed meshes once and instance them. Keep collision geometry simple and independent. For the shipped arcade workflow, tools/replay.js reconstructs the IR from the clip, review and metric design. A new grammar requires generator and adapter work.

For an existing game, inspect its current scene entry point, input bindings and asset conventions. Stage the adaptation in a sibling scene or opt-in module on a branch, preserve original scenes and assets, and show a reversible integration diff. Keep existing controls and saved state unless the requested change requires migration.

## Play and compare

Use `v2w preview world.json` during iteration and `v2w evaluate world.json` for recorded Chromium input. Inspect the screenshot alongside the cited frame. Verify input produces the intended state change, the centre route is traversable, chunks unload and revisiting a chunk regenerates identical geometry. Read console failures, frame times, geometry counts and draw calls. Explain intended visual differences. Change one rule or asset at a time, keep the seed fixed for comparison, then test a second seed. Attach the reviewed IR, report and footage with provenance.
