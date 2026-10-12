# cadorange

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
