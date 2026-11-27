# WorldIR 1.0

A UTF-8 JSON document describes a finite, right-handed world in metres. The normative shape and numeric limits are in [the draft-07 schema](../schema/worldir-1.0.json). Run `v2w validate file.json` for structural and cross-field validation. The adapter rejects unknown versions. Runtime engine names and GPU handles never appear in the document.

| Field | Meaning |
|---|---|
| version, name, theme | Format dispatch, public title and aesthetic intent. |
| coordinates | Positive Y is up. Travel starts at (0,2,0) towards negative Z. |
| seed | Unsigned 32-bit variation key shared by every chunk. |
| prototype | arcade generates load-bearing masses, curved spans and decks. island stacks rock and cap primitives. gate repeats portals along a dash lane. |
| style | Three sRGB hex swatches for sky, structure and accent, plus light intensity. Matte stone and accent are the two reference material slots. |
| rules | Chunk length in metres, rows per chunk, minimum central clearance and lateral size variation. |
| topology | A connected linear corridor bounded laterally by halfWidth. Depth runs from zero to count × length. |
| streaming | Integer count and inclusive neighbour radius. A radius of one retains up to three chunks. |
| budget | Maximum visual instances per chunk and device pixel ratio cap. Imported meshes have independent triangle costs. |
| motion | First-person camera, metres per second and action. Flight gives lift, survey briefly widens the FOV, dash advances under a short boost. |
| physics | Player sphere radius and separate axis-aligned solid boxes. The visible arches and portals are decorative. |
| assets | Relative asset URI, credit/source and license. Rows cycle through the palette in document order. |
| evidence | A claim, source locator, kind and reviewer confidence from zero to one. Confidence expresses judgment, not calibration. |
| unknowns | Open questions retained for downstream reviewers. |
| extensions | Optional namespaced metadata. Adapters may ignore it. |

Observation records directly visible features. Inference explains what could produce them. Decision sets design values. Extension specifies how repetition or variation extrapolates beyond the shot. Evidence is descriptive; executable generation consumes the typed parameters.

Loading checks corridor width against radius and projected instance cost against budget. Each chunk emits items with shape, centre, XYZ dimensions, material slot and optional asset URI. Solids carry centre and half extents in world coordinates. Engine adapters consume these separately. The centre-line sweep verifies one continuous flight path at Y=2, with secondary routes left to the designer.

## Evolution

Keep published schemas immutable. New optional metadata belongs in extensions. Incompatible geometry semantics or required fields need a new format version, a documented conversion and fixture comparisons for both input and output. Preserve seed, evidence, asset license and unknowns during migration. Materialize changed defaults explicitly. Version 1.0 is the first format and has no predecessor.
