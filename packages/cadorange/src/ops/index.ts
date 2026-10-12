/**
 * Modeling operations, build123d algebra-mode names. Every op records through
 * the shared `record()` entry (docs/architecture.md §3.3).
 */

import { Axis, type Vec3, v } from "../geom";
import { getKernel } from "../kernel/occt";
import { record } from "../record";
import type { Edge, Shape, ShapeList } from "../topo";
import { type Solid, solidFromKernel, Wire } from "../topo";

export type BooleanOp = "fuse" | "cut" | "common";

export function fuse(a: Solid, b: Shape, opts?: { clean?: boolean }): Solid {
  return a.fuse(b, opts);
}

export function cut(a: Solid, b: Shape, opts?: { clean?: boolean }): Solid {
  return a.cut(b, opts);
}

/** build123d `intersect` — OCCT `common`. */
export function intersect(a: Solid, b: Shape, opts?: { clean?: boolean }): Solid {
  return a.common(b, opts);
}

/** Keep the OCCT name for code translated from CadQuery. */
export const common = intersect;

export function fillet(s: Shape, edges: ShapeList<Edge> | readonly Edge[], radius: number): Solid {
  return s.fillet(edges, radius);
}

/** Chamfer; `length2` makes the bevel asymmetric (build123d `length2`). */
export function chamfer(
  s: Shape,
  edges: ShapeList<Edge> | readonly Edge[],
  distance: number,
  length2?: number,
): Solid {
  return s.chamfer(edges, distance, length2);
}

export function translate(s: Shape, by: readonly [number, number, number]): Solid {
  return s.translate(by);
}

/** Mirror across a plane or about an axis (build123d `mirror()`). */
export function mirror(
  s: Shape,
  opts: {
    plane?: {
      origin?: readonly [number, number, number];
      normal: readonly [number, number, number];
    };
    axis?: {
      origin?: readonly [number, number, number];
      direction: readonly [number, number, number];
    };
  },
): Solid {
  return s.mirror(opts);
}

/** Multi-body container for disjoint parts (build123d `Compound`). */
export function compound(shapes: readonly Shape[]): Solid {
  return record("compound", { parts: shapes.map((s) => s.handle.id) }, () =>
    solidFromKernel(getKernel().compound(shapes.map((s) => s.handle))),
  );
}

/**
 * Extrudes a planar profile (wire or face) by `amount` along its plane normal
 * (wires remember their sketch plane; override with `dir`).
 */
export function extrude(profile: Shape | Wire, amount: number, opts?: { dir?: Vec3 }): Solid {
  const dir =
    opts?.dir ??
    (profile instanceof Wire ? profile.plane?.normal : undefined) ??
    ([0, 0, 1] as Vec3);
  return record("extrude", { amount, dir }, () =>
    solidFromKernel(getKernel().extrude(profile.handle, v.scale(dir, amount))),
  );
}

/** Revolves a planar profile around `axis` by `angleDegrees` (default 360). */
export function revolve(
  profile: Shape | Wire,
  axis: Axis | { origin?: Vec3; direction: Vec3 },
  angleDegrees = 360,
): Solid {
  const origin = axis instanceof Axis ? axis.origin : (axis.origin ?? [0, 0, 0]);
  const direction = axis instanceof Axis ? axis.direction : axis.direction;
  return record("revolve", { angleDegrees }, () =>
    solidFromKernel(getKernel().revolve(profile.handle, origin, direction, angleDegrees)),
  );
}
