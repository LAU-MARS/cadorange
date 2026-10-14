/**
 * Translated from build123d's examples/lego_algebra.py
 * (Apache-2.0, Copyright (c) 2021 Roger Maitland) — the R14 showcase:
 * sketch-level `offset` (wall construction) is now available as
 * `offsetWire(wire, distance, { join })`.
 *
 * build123d form -> cadorange form:
 *   Rectangle(...)                  Rectangle(...)          (both centered)
 *   plan -= offset(plan, -t, INTERSECTION)   plan.cut(faceOf(offsetWire(..., { join: "intersection" })))
 *   locs * prim                     prim({ at: [u, v] }) for locs of gridLocations(...)
 *   Pos * Box (centered)            Box(..., { origin: [-l/2, -w/2, z] })  (corner-anchored)
 *   plane * loc * Cylinder          Cylinder({ loc: { origin } })
 */
import {
  Axis,
  Box,
  Circle,
  Cylinder,
  extrude,
  faceOf,
  gridLocations,
  offsetWire,
  Rectangle,
} from "cadorange";

export function buildLego() {
  const unit = 8; // mm per pip grid
  const pipCount = 6;
  const blockLength = unit * pipCount; // 48
  const blockWidth = 16;
  const wall = 1.2;
  const pipHeight = 1.8;
  const pipDiameter = 4.8;
  const supportOuter = 6.5;
  const supportInner = 4.8;
  const ridgeWidth = 0.6;
  const ridgeDepth = 0.3;
  const baseHeight = 9.6;

  // bottom sketch: outer wall ring (offset idiom) + ridge grid + hollow center + support rings
  let plan = faceOf(Rectangle(blockLength, blockWidth));
  plan = plan.cut(
    faceOf(offsetWire(Rectangle(blockLength, blockWidth), -wall, { join: "intersection" })),
  );
  for (const [x, y] of gridLocations(0, unit, 1, 2)) {
    plan = plan.fuse(faceOf(Rectangle(blockLength, ridgeWidth, { at: [x, y] })));
  }
  for (const [x, y] of gridLocations(unit, 0, pipCount, 1)) {
    plan = plan.fuse(faceOf(Rectangle(ridgeWidth, blockWidth, { at: [x, y] })));
  }
  plan = plan.cut(
    faceOf(Rectangle(blockLength - 2 * (wall + ridgeDepth), blockWidth - 2 * (wall + ridgeDepth))),
  );
  for (const [x, y] of gridLocations(unit, 0, pipCount - 1, 1)) {
    const ring = faceOf(Circle(supportOuter / 2, { at: [x, y] })).cut(
      faceOf(Circle(supportInner / 2, { at: [x, y] })),
    );
    plan = plan.fuse(ring);
  }

  // walls up, then a solid top plate — build123d centers the plate on the wall
  // top (it sinks wall/2 into the walls; the overlap fuses away)
  let lego = extrude(plan, baseHeight - wall);
  const wallTop = lego.vertices().sortBy(Axis.Z).last()?.center[2] ?? 0;
  lego = lego.fuse(
    Box(blockLength, blockWidth, wall, {
      origin: [-blockLength / 2, -blockWidth / 2, wallTop - wall / 2],
    }),
  );

  // pip grid on the top face (build123d places pips at z = baseHeight, per the original)
  const topZ = baseHeight;
  for (const [x, y] of gridLocations(unit, unit, pipCount, 2)) {
    lego = lego.fuse(
      Cylinder({
        radius: pipDiameter / 2,
        height: pipHeight,
        loc: { origin: [x, y, topZ] },
      }),
    );
  }
  return lego;
}

if (process.argv[1]?.endsWith("lego.ts")) {
  const { init } = await import("cadorange");
  await init();
  console.log(buildLego().describe());
}
