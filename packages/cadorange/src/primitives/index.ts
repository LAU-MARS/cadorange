/**
 * 3D primitives, build123d names over the kernel. Placement is immediate
 * (baked): pass `loc` to position at creation — mirrors build123d's
 * `Location(...) * Box(...)`, since occt.ts has no lazy location chain.
 */

import type { Loc } from "../geom";
import { getKernel } from "../kernel/occt";
import { record } from "../record";
import { type Solid, solidFromKernel } from "../topo";

function at(loc?: Loc): readonly [number, number, number] | undefined {
  return loc?.origin;
}

export function Box(dx: number, dy: number, dz: number, loc?: Loc): Solid {
  return record("box", { dx, dy, dz, loc }, () =>
    solidFromKernel(getKernel().makeBox(dx, dy, dz, at(loc), loc?.zDir)),
  );
}

export function Cylinder(opts: { radius: number; height: number; loc?: Loc }): Solid {
  return record("cylinder", { ...opts }, () =>
    solidFromKernel(
      getKernel().makeCylinder(opts.radius, opts.height, at(opts.loc), opts.loc?.zDir),
    ),
  );
}

export function Sphere(opts: { radius: number; loc?: Loc }): Solid {
  return record("sphere", { ...opts }, () =>
    solidFromKernel(getKernel().makeSphere(opts.radius, at(opts.loc))),
  );
}

export function Cone(opts: { radius1: number; radius2: number; height: number; loc?: Loc }): Solid {
  return record("cone", { ...opts }, () =>
    solidFromKernel(getKernel().makeCone(opts.radius1, opts.radius2, opts.height, at(opts.loc))),
  );
}

export function Torus(opts: { radius1: number; radius2: number; loc?: Loc }): Solid {
  return record("torus", { ...opts }, () =>
    solidFromKernel(getKernel().makeTorus(opts.radius1, opts.radius2, at(opts.loc))),
  );
}
