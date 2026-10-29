---
"cadorange": minor
---

Runtime assembly model, the build123d joint family, and occt.ts 2.0.0.

- `Assembly` — a placed part tree mirroring build123d's Compound-as-assembly: a node carries either a solid or children, placements compose as `Location` algebra. `add` wraps bare solids, `worldLoc`/`worldSolid`/`solids`/`bbox` evaluate world placements, `toNodes`/`toStep`/`Assembly.fromStep` bridge to STEP assembly documents, and `explode(factor)` returns an exploded-view copy (leaves pushed radially from the assembly center).
- Joints, as pure placement data on assembly nodes: `RigidJoint`, `RevoluteJoint`, `LinearJoint`, `CylindricalJoint`, `BallJoint`, `PlanarJoint`, `PolarJoint` — each with a frame in owner-local coordinates, an optional zero-position `xDir` (build123d's `angle_reference`) and range validation. `assembly.connectTo(child, parentLabel, childLabel, value?)` repositions the child so the joint frames coincide (build123d `connect_to` semantics: parent side fixed, pairing table enforced, `linear→revolute` carries both values). Connections are recorded: set `joint.angle`/`joint.linear` and call `solve()` to replay them — motion studies.
- geom additions: `rotationAbout(axis, angle)`, `mat3ToLocation`, `locationToMat34`, `mat34ToLocation`.
- Adopt occt.ts 2.0.0 — R17 is resolved (`read(write(tree)) === tree` is now the kernel contract: parent-relative transforms at every depth, top-level included; TopLoc-carrying shapes fold into node transforms instead of spawning SOLID children). The io layer drops all 1.1.0 compensation (root-relative normalization, single-shape STEP bake, top-level folding) and `exportStepAssembly` passes local solids + parent-relative transforms straight through; `importStepAssembly` returns read-back values as-is (undefined normalized to null). geom's `inv34` is removed with the compensation code.
- New kernel behavior adopted (R18): a color on an assembly (group) node throws in occt.ts 2.0.0, so `exportStepAssembly` cascades group colors down to uncolored leaves (a leaf's own color wins); STEP colors live on shape nodes, and round-trips return them there.
