/**
 * Modeling operations, build123d algebra-mode names. Every op records through
 * the shared `record()` entry (docs/architecture.md §3.3).
 */

import { getKernel } from "../kernel/occt";
import { record } from "../record";
import type { Edge, Shape, ShapeList, Solid } from "../topo";
import { solidFromKernel } from "../topo";
import { todo } from "../util";

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

/** M1: extrude a 2D sketch into a solid. */
export function extrude(_sketch: unknown, _height: number): Solid {
  todo("extrude");
}

/** M1: revolve a 2D sketch around an axis. */
export function revolve(_sketch: unknown, _axis: unknown, _angle?: number): Solid {
  todo("revolve");
}
