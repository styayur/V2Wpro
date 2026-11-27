# Finite flight qualification

The contact study extends the original Lattice launch production. The input recording, observation IDs and third-party notices are inherited unchanged. The roof is an original design decision by V2Wpro contributors, released under MIT. Its dimensions come from a downstream flight experiment. The Relay District is an independent original design with no video-derived claims.

## Reproduction

Use Node 24, install the lockfile and run from the repository root. Choose an unused output prefix. The checked-in examples are playable in the preview's world selector. Save GLB downloads the active seed and applied rules. Save WorldIR preserves the editable document.

```sh
node tools/export-exchange.js examples/lattice.json original.glb
node tools/generate-contact-study.js examples/lattice.json examples/profiles/skimmer-cruise.json 8131 cruise
node tools/generate-contact-study.js examples/lattice.json examples/profiles/skimmer-boost.json 8132 boost
node tools/build-flight-district.js 8131 district
node tools/read-flight-diagnostic.js cruise.glb flight-report.json
```

Run the downstream test against the corresponding GLB in Skimmer-Scraper. The diagnostic reader verifies its SHA-256 and saved identity before computing contact distance and duration. Distances sum chords between adjacent GLIDING samples. A sampled minimum clearance can exceed the minimum between frames.

## Movement profile v1

A profile is an optional JSON document in SI units. The example IDs identify study presets. Speed is the design entry speed. Hull radius bounds the vehicle, clearance is the desired distance from its centre to a solid, and contactSeconds sets the intended reserve of supporting surface. Lateral acceleration and braking deceleration are positive design assumptions. They are editable independently of the WorldIR generator and the flight controller.

The minimum turn radius is speed squared divided by lateral acceleration. The longitudinal braking reserve is speed squared divided by twice the deceleration. The roof length covers one contact interval and two braking reserves. The exit radius also accounts for departure along a tangent. Over a braking distance, the parabolic upper bound on the rise relative to the tangent must fit within clearance minus hull radius. The editor's route report sweeps the profile clearance against the WorldIR solid envelopes. The original central walk-through graph and the roof contact run have different trajectories.

## Geometry and exchange

A WorldIR 2.0 document may carry a contactDeck extension with version 1, an evidence ID and one to eight cycles. A solid box emitted under that evidence reserves the whole envelope. The preview and exporter interpret its top as a cosine along local negative Z. The top height ranges from -0.45 to +0.45 of the full Y dimension about the box centre. End profiles share elevation and horizontal tangent. The render skin has 64 longitudinal segments per cycle. The closed collision mesh has 24. The transparent masked proxy uses the existing SURFACE role, and the visible skin uses DECORATION. Legacy WorldIR consumers retain the conservative box. Original examples keep their original GLB bytes.

An optional scene extra named flightEntry carries version 1 and two scene-local XYZ points, position and toward, defining a level launch. Importers transform both using the same normalization as the collision geometry. Manual spawn, transformed layouts and collision clearance take precedence. Original topology nodes are local metre coordinates. They may guide nearby forward searches for companions. Observation and mission acceptance still require collision queries. The two projects share no runtime imports.

## Experiments

At V2Wpro commit `778b00d`, regenerate seed 8131 using the cruise profile at that commit to reproduce the first continuous roof. Its GLB digest starts with `5d288fff`. After the game accelerated along that surface, releasing on its descending tangent led to a shield impact. The revised exit radius produces the checked-in `examples/contact.glb` with digest `243949bbceae959ee58da971859bd5f614bf4b2f30ae7e5cf711fb3f597d89f3`.

The original game build and both rule revisions were flown with an emulated standard gamepad, the stock world library, exact-layout save/reopen and the normal 120 Hz simulation. At seed 8131 the corrected roof produced 148.0 m of sampled continuous contact, 2.24 seconds and 6.00 m minimum sampled clearance, followed by a deliberate release with zero shield impacts. Using the cruise-designed roof under boost at seed 8132 produced an impact after release. Use the separate boost report to evaluate that profile.

[Consumer qualification and raw reports](https://github.com/styayur/Skimmer-Scraper/issues/84) · [Producer tracking](https://github.com/styayur/V2Wpro/issues/2)

