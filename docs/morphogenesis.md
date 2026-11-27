# WorldIR 2.0 and Morphogenesis Engine

Version 1.0 programs select one of three built-in corridor productions. Version 2.0 documents contain their own production trees and node placement graph. Both travel through version dispatch. Keep old worlds in the 1.0 interpreter when their original fingerprints matter. The published 1.0 schema stays immutable.

## Coordinates and composition

All quantities are metres, right-handed XYZ with positive Y up. A topology node binds a named production to a position. Edges are undirected, straight flight segments connecting node centres. They define intended routes and are tested after geometry generation. An author can route an edge around an obstacle by introducing another node. Branches, cycles and vertical returns arise from graph data.

| Operator | Meaning |
|---|---|
| group | Evaluate children in array order under the current transform. An empty group is a waypoint. |
| use | Expand another named prototype here. Cycles are rejected. |
| transform | Apply componentwise scale and local XYZ translation. Optional jitter gives the maximum seeded displacement per axis. Parent scale applies to local offsets. |
| repeat | Place count copies along a local XYZ step. Index zero is the origin. Nest to form a grid or stacked assembly. |
| radial | Place copies on an XZ circle around the origin. Index zero lies on positive X. Children keep their orientation. |
| emit | Emit a primitive or asset in its material slot. The separate solid switch emits a conservative axis-aligned box with the specified centre and dimensions. |

Every operator references an evidence ID. Each placement retains the IDs visited during expansion, in ancestral order with duplicates removed. An asset's visual size describes its transform; authors should normalize the model and choose independent proxy emissions where its source bounds need a different collider. Ring holes and curved surfaces have no special collision treatment. A decorative ring plus two solid piers allows traversal through its centre.

A seed controls bounded jitter through a 32-bit integer hash keyed by node ID, production reference, child index and repetition index. Revisiting or materializing nodes in a different order leaves their local placements stable. Reordering group children changes their variation keys. The code rounds no geometry for export. Cross-platform checks compare results under the recorded Node/browser toolchain.

## Limits and execution

The [normative JSON Schema](../schema/worldir-2.0.json) defines allowed fields, numeric ranges, arrays and enumerations. Keep experimental metadata under extensions. Validation rejects nonfinite numbers, dangling rules/evidence/assets/edges, duplicate IDs/edges, reserved keys, excessive nesting, recursive uses and out-of-range transformed geometry. Structural bounds apply before recursive schema evaluation. Memoized production costs bound expanded node visits and leaf allocations before scene construction. Limits include 128 topology nodes, 256 edges, depth 24, 4,096 visuals and 65,536 operator visits per world. Validation includes referenced productions even when currently unused.

The engine realizes the bounded scene on CPU. It indexes placements by the cell containing their centres, with floor division on all three axes, including negative coordinates. The adapter streams the Chebyshev neighborhood around the player. Resource tests distinguish renderer resources from CPU descriptors. Large visuals centred outside the active window may disappear early; set cell size and radius to the scale of the design.

For each intended edge, intersect a swept player sphere with the collision representation. The squared distance from the line segment to an axis-aligned box is piecewise quadratic. Minimize it on the intervals between crossings of box faces, testing endpoints and the stationary point. Contact blocks traversal. Breadth-first search from spawn then reports reachable nodes and blocked edges separately. A graph may remain connected through an alternate path. These checks certify the specified straight routes for a spherical flyer; they do not cover walking, turning radius or arbitrary free-space path planning.

## Design research

- The original agent workflow connects a studied shot to a playable and recorded result. This version externalizes the interpretation and spatial rules so both can be replayed and revised. [video-to-game](https://github.com/lovisdotio/video-to-game)
- Attribute-driven placement and shared prototypes fit lightweight scene descriptions. Copy-to-points and Geometry Nodes informed the separation of transforms and geometry. [SideFX](https://www.sidefx.com/docs/houdini/nodes/sop/copytopoints.html) · [Blender Manual](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/instance_on_points.html)
- Hierarchical productions and repeated developmental steps can encode large structures compactly. Acyclic bounded expansion gives predictable costs and auditable evidence paths. [The Algorithmic Beauty of Plants](https://algorithmicbotany.org/papers/abop/abop.pdf) · [Procedural Modeling of Buildings](https://doi.org/10.1145/1179352.1141931)
- Wave Function Collapse uses local compatibility and propagation. This release uses authored graph constraints and physical edge checks because a locally compatible arrangement alone does not certify a flight route. [Original WFC implementation](https://github.com/mxgmn/WaveFunctionCollapse)
- GPU resources have explicit lifetimes. The streaming adapter owns per-cell render state and shares source geometry across placements. [Three.js cleanup guide](https://threejs.org/manual/en/cleanup.html)
