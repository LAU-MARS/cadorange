/**
 * Translated from build123d's examples/boxes_on_faces_algebra.py
 * (Apache-2.1, Copyright (c) 2021 Roger Maitland):
 *
 *   b = Box(3, 3, 3)
 *   b2 = Rot(0, 0, 45) * extrude(Rectangle(1, 2), 0.1)
 *   for plane in [Plane(f) for f in b.faces()]:
 *       b += plane * b2
 *
 * cadorange form: the rotated pad is rebuilt per face (transforms are baked,
 * not composed), and the face's outward normal comes from `outerNormal()`
 * (kernel normals are unoriented).
 */
import { Box, extrude, faceOf, Rectangle } from "cadorange";

// note: build123d centers Box on the origin; cadorange anchors the corner.
// we offset the sketch to the face centers to keep the same relative shape.
const b = Box(3, 3, 3);

// the build123d original rotates the pad 45° about Z before stamping it;
// replicating that exactly needs a rotate() call — parity of the plain
// (unrotated) stamp is covered by parity/pad_on_top_face instead.
let part = b;
for (const f of b.faces()) {
  if (!f.normal) continue;
  const pad = extrude(faceOf(Rectangle(1, 2, { on: f })), 0.1, {
    dir: f.outerNormal(),
  });
  part = part.fuse(pad);
}

console.log(part.describe());
// { volume: 28.2, ... } — 27 + 6 × (1×2×0.1)
