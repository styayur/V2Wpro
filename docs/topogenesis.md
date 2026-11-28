# Topogenesis

A WorldIR 2.0 document can select the version 1 kinetic region recipe in its extensions. The original WorldIR schemas, Lattice, Contact Deck and Relay District continue to reproduce their published geometry. All geometry in the new module library was authored for V2Wpro under MIT.

## Generate a study

From a checkout with its lockfile installed, use an unused output prefix. Each study writes an editable WorldIR and a self-contained GLB. The inspector command measures the actual collision triangles.

```sh
node tools/topogenesis.js fixture s-curve 8131 cruise 0 s-8131
node tools/topogenesis.js inspect s-8131.json s-8131-motion.json
node tools/topogenesis.js district ribbon-bridge 8131 boost 0 district-8131
node tools/topogenesis.js library modules.json
```

## Coordinates and connections

The module library uses right-handed XYZ metres, +Y up and local travel towards +Z. Each of the six modules includes a section, ordered render stations, independent collision stations, two oriented sockets, source and license. The angular and positional subdivision limits select different station counts for a straight run, a trough and a helix. A station carries a normalized parameter, center, right and up. Each section point is a pair of distances along right and up. A station may override the section to form a loft. Tunnel includes a separate closed vault around the deck. Cap triangulation supports nonconvex sections. Cross-section polygons specify the actual transverse surface.

Both sockets present a 32 m deck at the same elevation and tangent, 220 m apart. The helix turns a complete revolution in XZ and gains height. Its Z coordinate can reverse inside the module. Order samples by parameter. Cross-stream adapters may deform the module to meet two assigned sockets and must validate the deformed geometry. Source module measurements apply to the undeformed mesh.

The finite district first creates a directed graph with two longitudinal corridors and three crossovers. It assigns module shapes after it fixes the ports. Boundary coordinates, module choice and shape variation have independent deterministic seed keys. Positive and negative region coordinates use the same derivation. Region coordinates in this finite GLB exporter are bounded by the recipient's metric scene limits. The game manages its own streaming and residency.

## Flight envelope

Movement Profile 2 adds a minimum supported speed, forward acceleration, departure duration and departure pitch to the published v1 fields. Speeds are metres per second, accelerations are metres per second squared and angles are radians. Cruise and boost are design entry speeds. An optional explicit movement profile overrides the study preset. The departure model ramps pitch under the lateral acceleration bound and sweeps the hull through sixteen chords. Its path is one specified control assumption.

The analysis derives curvature from successive contact-offset centerline points. A forward pass bounds achievable speed under acceleration. A backward pass reserves distance to brake for each bend. The analyzer sweeps each directed segment against the exported collision surfaces, including neighbouring modules and WorldIR solids. It checks the hull margin and minimum speed. Port entry speeds that require earlier braking appear as a reason. The three departure locations use fractions of travelled arc length. Distances in open space are capped at 40 m. Capture, glide, release and escape zones are candidate arc-length intervals.

| Level | Evidence |
| --- | --- |
| authored | Exported stations, sockets, zones and capabilities from the generator |
| geometry-verified | Swept collision geometry admits the specified hull and proxy margin |
| motion-verified | Sampled curvature, longitudinal envelope and at least one tested departure pass for the given profile |
| engine-replayed | A separate game run with an identified asset, saved layout, consumer build, inputs and measured trace |

The finite sampler retains blocked edges in the report. An author can see the actual conflict and revise the recipe. A route marked motion-verified still needs the game run to establish that its contact controller can acquire and hold it. Hardware input and foreground GPU measurements carry separate receipts.

## GLB exchange

The visible skin uses the existing DECORATION role and the independent collider uses SURFACE with a masked material. The scene carries flightEntry and motionTopology. Surface and socket nodes can expose the bounded motionSemantic vocabulary. Semantic records identify an observation candidate. The consuming game resolves the current world epoch and checks local geometry before accepting a mission.
