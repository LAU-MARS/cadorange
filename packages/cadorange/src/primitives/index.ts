import type { Loc } from "../geom";
import type { Solid } from "../topo";
import { todo } from "../util";

export function Box(_dx: number, _dy: number, _dz: number, _loc?: Loc): Solid {
  todo("Box");
}

export function Cylinder(_opts: { radius: number; height: number; loc?: Loc }): Solid {
  todo("Cylinder");
}

export function Sphere(_opts: { radius: number; loc?: Loc }): Solid {
  todo("Sphere");
}

export function Cone(_opts: {
  radius1: number;
  radius2: number;
  height: number;
  loc?: Loc;
}): Solid {
  todo("Cone");
}

export function Torus(_opts: { radius1: number; radius2: number; loc?: Loc }): Solid {
  todo("Torus");
}
