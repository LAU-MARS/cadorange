# cadorange

## 0.7.0

### Minor Changes

- Core-API alignment sweep — build123d coverage grows from ~55 to ~91 of 126 core exports.
  
  - **Operations**: `loft`, `sweep`, `split` (all fragments), `section`, `shell` (hollow with optional open faces), `draft`, `offset` (uniform 3D grow/shrink), `rotate`, `scale`, `distance`
  - **Sketch/curve primitives (31 total)**: Triangle, Trapezoid, RectangleRounded, Ellipse, SlotArc/SlotCenterPoint/SlotOverall, PolarLine, IntersectingLine, SagittaArc, TangentArc, JernArc, FilletPolyline, Spline, BSpline, Superellipse (sampled), ConicArc (parabola/hyperbola, sampled), Helix
  - **3D**: `Wedge`; hole family as shape methods — `hole(d, {face, at, depth})`, `counterBoreHole`, `counterSinkHole` (face defaults to topmost, drills along the calibrated outer normal)
  - **Selection/inspection**: singular selectors `face()/edge()/vertex()`, `solids()`, `wires()`, `boundingBox()`, `distanceTo()`
  - **Location algebra**: `Location` class with `mul`/`inverse`, `Pos(x,y,z)`, `Rot(x,y,z)`, and `shape.located(loc)` (baked immediately — no lazy chains over WASM); `Mat3` matrix math; `Color` value type
  - **IO**: `importBrep`, `exportBrep`, `exportObj`
  - Parity 22/22 (new cases: loft, uniform offset, hole, wedge, ellipse); remaining 35 core items triaged in docs/api-map.md (not-applicable / kernel-gated R14-R15 / solver-bound / next batch)

## 0.6.0

### Minor Changes

- Sketch chain — build123d objects_sketch/objects_curve in algebra form, corpus translation begins.
  
  - Primitives returning `Wire` (recorded on their sketch plane): `Circle`, `Rectangle`, `RegularPolygon`, `Polygon`, `Line`, `Polyline`, `ThreePointArc`, `RadiusArc`, `CenterArc`, `SlotCenterToCenter`
  - Placement: `at: [u, v]` local offset and `on: Face | Plane` sketch-on-face — the `Plane * Pos * prim` pattern; `faceOf(outer, holes)` caps profiles for 2D booleans; `gridLocations` matches `GridLocations`
  - `extrude(profile, amount)` extrudes along the wire's remembered plane normal (`dir` override); `revolve(profile, axis, angle?)` — both replaced the M1 stubs
  - `Face.outerNormal()`: kernel normals are unoriented; outward direction is probe-calibrated and cached. All face-growing paths (sketch-on-face, workplanes) use it
  - Edge convexity is now lazy (probe rings were the meta() hot path — boolean chains timed out; now computed on first `convexity` access, cached per shape)
  - Parity 17/17 including hex nut (polygon + bore + chamfer), pad-on-face, slot extrude and tube revolve against Python build123d; first corpus translation: `examples/boxes_on_faces.ts`
  - New kernel requirement R14: 2D wire offset (blocks lego-style wall construction)

## 0.5.0

### Minor Changes

- Edge convexity classification — the last build123d selector semantic (`filterBy(Convexity)`).
  
  - `Edge.convexity` and `filterBy("convex" | "concave" | "smooth")` — the classic "chamfer only convex edges, find concave edges for mating" workflow
  - Implementation is orientation-free and surface-type-free: a 16-direction point-classification probe ring around each edge (anchored on the arc mid-point for circle edges), with in/out transitions bisected to sub-degree precision — the material wedge angle decides convex (<180°), concave (>180°) or smooth (~180°, tangent blends)
  - Edge adjacency (edge → adjacent faces) built in the kernel layer via subShapes order alignment + `isSame` matching — seam/free edges stay unclassified
  - Circle edges now carry `arcPoint` (a point on the arc) and `uRange` metadata
  - Parity: L-bracket case matches build123d exactly (1 concave / 17 convex edges); all-fillet box yields 23 smooth tangent edges

## 0.4.0

### Minor Changes

- build123d behavior alignment: vertices, mirror, asymmetric chamfer, compound (kernel: occt.ts 1.0.0).
  
  - `.vertices()` — Vertex sub-shape views with position-based selection (`filterByPosition`, `sortBy(Axis)`), `#vertex` in the string selector DSL; `describe()` now reports a `vertices` count
  - `mirror({ plane | axis })` — across a plane or about an axis line, build123d `mirror()` semantics
  - `chamfer(part, edges, distance, length2?)` — asymmetric bevels (`length2` on the second adjacent face)
  - `compound(shapes)` — multi-body container for disjoint parts; volume reports the sum of children (build123d's `Compound.volume` reports one child only — documented divergence)
  - Parity grows to 12/12 with the strictest tolerances, including exact vertex counts against Python build123d

## 0.3.0

### Minor Changes

- Consolidate to a single npm package (like build123d).
  
  `cadorange` now ships everything via subpath exports: `cadorange/workplane` (shipped), `cadorange/runtime`, `cadorange/render` and `cadorange/mcp` (interface skeletons, landing with M0.5/M2), plus the `cado` CLI as the package bin (`npx -y cadorange ...`). The former separate workspace packages are merged in — no version-skew matrix, one install, one release train.

## 0.2.0

### Minor Changes

- Upgrade to occt.ts 0.10.0 (OCCT kernel bump) — geometry parity now exact.
  
  - Booleans clean by default (UnifySameDomain, like build123d/CadQuery): fused parts select like build123d, no phantom fragment faces. Pass `{ clean: false }` to cut/fuse/intersect to keep raw fragment topology.
  - Face/edge centers now come from kernel-reported data: planes use the true integral centroid (replacing the in-plane-edge-midpoint approximation); circle/ellipse edges and sphere/torus faces use the analytic axis point (`axisPoint`), keeping selector semantics stable.
  - Parity harness tightened to exact face/edge counts and default bbox tolerance — 10/10 against Python build123d on the strictest settings.

## 0.1.0

### Minor Changes

- First public release (0.1.0) — M0 core vertical slice.
  
  **cadorange** (core): agent-native CAD runtime in TypeScript over the occt.ts OCCT/WASM kernel. build123d-style algebra API (Box/Cylinder/Sphere/Cone/Torus, booleans, fillet/chamfer, ShapeList filterBy/groupBy/sortBy), CadQuery-style workplane facade with string selectors (">Z", "|Z"), STEP/STL/GLB export, STEP import, describe() introspection, deterministic shape hashes, and a record() hook for op-log replay. Verified against Python build123d by the parity harness (10/10 cases, volumes/areas matching).
  
  **cadorange-runtime, cadorange-render, cadorange-mcp**: interface-only skeletons — Session/op-log/snapshots, headless rendering and the MCP server land in upcoming milestones.
