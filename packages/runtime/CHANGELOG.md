# @cadorange/runtime

## 0.1.0

### Minor Changes

- First public release (0.1.0) — M0 core vertical slice.
  
  **cadorange** (core): agent-native CAD runtime in TypeScript over the occt.ts OCCT/WASM kernel. build123d-style algebra API (Box/Cylinder/Sphere/Cone/Torus, booleans, fillet/chamfer, ShapeList filterBy/groupBy/sortBy), CadQuery-style workplane facade with string selectors (">Z", "|Z"), STEP/STL/GLB export, STEP import, describe() introspection, deterministic shape hashes, and a record() hook for op-log replay. Verified against Python build123d by the parity harness (10/10 cases, volumes/areas matching).
  
  **@cadorange/runtime, @cadorange/render, @cadorange/mcp**: interface-only skeletons — Session/op-log/snapshots, headless rendering and the MCP server land in upcoming milestones.

### Patch Changes

- Updated dependencies
  - cadorange@0.1.0
