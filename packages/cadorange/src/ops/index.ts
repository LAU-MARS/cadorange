/**
 * Modeling operations, build123d algebra-mode names. Every op records through
 * the shared `record()` entry (docs/architecture.md §3.3).
 */

import type { Edge, Shape, ShapeList, Solid } from "../topo";
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

/** Equal-distance chamfer; asymmetric needs kernel support (R3). */
export function chamfer(
  s: Shape,
  edges: ShapeList<Edge> | readonly Edge[],
  distance: number,
): Solid {
  return s.chamfer(edges, distance);
}

export function translate(s: Shape, by: readonly [number, number, number]): Solid {
  return s.translate(by);
}

/** M1: extrude a 2D sketch into a solid. */
export function extrude(_sketch: unknown, _height: number): Solid {
  todo("extrude");
}

/** M1: revolve a 2D sketch around an axis. */
export function revolve(_sketch: unknown, _axis: unknown, _angle?: number): Solid {
  todo("revolve");
}
