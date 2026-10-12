/**
 * Modeling operations, build123d algebra-mode names. Every op records through
 * the shared `record()` entry (docs/architecture.md §3.3).
 */

import { Axis, type Vec3, v } from "../geom";
import { getKernel } from "../kernel/occt";
import { record } from "../record";
import type { Edge, Face, Shape, ShapeList } from "../topo";
import { Shape as ShapeValue, type Solid, solidFromKernel, Wire } from "../topo";

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

/** Rotate `angleDegrees` around the axis (through the origin by default). */
export function rotate(s: Shape, axis: Axis, angleDegrees: number): Solid {
  return record("rotate", { angleDegrees }, () =>
    solidFromKernel(getKernel().rotate(s.handle, axis.direction, angleDegrees)),
  );
}

export function scale(s: Shape, factor: number): Solid {
  return record("scale", { factor }, () => solidFromKernel(getKernel().scale(s.handle, factor)));
}

/** Uniform 3D offset — grow (>0) / shrink (<0) the whole solid. */
export function offset(s: Shape, distance: number): Solid {
  return record("offset", { distance }, () =>
    solidFromKernel(getKernel().offsetSolid(s.handle, distance)),
  );
}

/** Skin sections (wires or faces) into one solid; `ruled` = straight ribs. */
export function loft(sections: readonly Shape[], opts?: { ruled?: boolean }): Solid {
  return record("loft", { sections: sections.length, ...opts }, () =>
    solidFromKernel(
      getKernel().loft(
        sections.map((x) => x.handle),
        opts?.ruled ?? false,
      ),
    ),
  );
}

/** Sweep a planar profile along a spine wire (circle on circle -> torus). */
export function sweep(profile: Shape, spine: Shape): Solid {
  return record("sweep", {}, () =>
    solidFromKernel(getKernel().sweep(profile.handle, spine.handle)),
  );
}

/** Split by tools, keeping every fragment (reassembles to the original). */
export function split(s: Shape, tools: readonly Shape[] | Shape): Solid {
  const list = tools instanceof ShapeValue ? [tools] : tools;
  return record("split", { tools: list.length }, () =>
    solidFromKernel(
      getKernel().split(
        s.handle,
        list.map((t) => t.handle),
      ),
    ),
  );
}

/** Intersection curves of two shapes' surfaces — an edge/compound shape. */
export function section(a: Shape, b: Shape): Shape {
  return record("section", {}, () => new ShapeValue(getKernel().section(a.handle, b.handle)));
}

/** Hollow into a shell of `thickness` (build123d `thicken`/wall pattern). */
export function shell(s: Shape, thickness: number, opts?: { open?: readonly Face[] }): Solid {
  const openFaces = opts?.open?.map((f) => f.index) ?? [];
  return record("shell", { thickness, openFaces }, () =>
    solidFromKernel(getKernel().shell(s.handle, thickness, openFaces)),
  );
}

/** Tilt faces by `angleDegrees` for mold release (build123d `draft`). */
export function draft(
  s: Shape,
  angleDegrees: number,
  opts?: { direction?: Vec3; faces?: readonly Face[] },
): Solid {
  return record("draft", { angleDegrees }, () =>
    solidFromKernel(
      getKernel().draft(
        s.handle,
        angleDegrees,
        opts?.direction ?? [0, 0, 1],
        opts?.faces?.map((f) => f.index) ?? [],
      ),
    ),
  );
}

/** Minimum distance between two shapes (build123d `topo_distance_to`). */
export function distance(a: Shape, b: Shape): number {
  return getKernel().distance(a.handle, b.handle);
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
