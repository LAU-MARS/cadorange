# cadorange

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
  
  **@cadorange/runtime, @cadorange/render, @cadorange/mcp**: interface-only skeletons — Session/op-log/snapshots, headless rendering and the MCP server land in upcoming milestones.
