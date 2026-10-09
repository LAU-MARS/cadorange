import type { Edge, ShapeList, Solid } from "../topo";
import { todo } from "../util";

export type BooleanOp = "fuse" | "cut" | "common";

export function fuse(_a: Solid, _b: Solid): Solid {
  todo("fuse");
}

export function cut(_a: Solid, _b: Solid): Solid {
  todo("cut");
}

export function common(_a: Solid, _b: Solid): Solid {
  todo("common");
}

export function fillet(_s: Solid, _edges: ShapeList<Edge> | Edge[], _radius: number): Solid {
  todo("fillet");
}

export function chamfer(_s: Solid, _edges: ShapeList<Edge> | Edge[], _distance: number): Solid {
  todo("chamfer");
}

/** M1: extrude a 2D sketch into a solid. */
export function extrude(_sketch: unknown, _height: number): Solid {
  todo("extrude");
}

/** M1: revolve a 2D sketch around an axis. */
export function revolve(_sketch: unknown, _axis: unknown, _angle?: number): Solid {
  todo("revolve");
}
