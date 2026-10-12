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

/**
 * Right wedge over a `dx x dy` base, `dz` tall, sloped from the +X edge down
 * to zero at x=0 (build123d `Wedge`, simplified corner variant): composed as
 * a box minus a sloped triangular prism.
 */
export function Wedge(opts: { dx: number; dy: number; dz: number; loc?: Loc }): Solid {
  return record("wedge", { ...opts }, () => {
    const k = getKernel();
    const o = at(opts.loc) ?? [0, 0, 0];
    const box = k.makeBox(opts.dx, opts.dy, opts.dz, o);
    // triangular prism in the XZ plane extruded along Y
    const tri = k.extrude(
      k.makePolygon(
        [
          [o[0] ?? 0, (o[1] ?? 0) - 1, (o[2] ?? 0) + opts.dz],
          [(o[0] ?? 0) + opts.dx, (o[1] ?? 0) - 1, (o[2] ?? 0) + opts.dz],
          [(o[0] ?? 0) + opts.dx, (o[1] ?? 0) - 1, o[2] ?? 0],
        ],
        true,
      ),
      [0, opts.dy + 2, 0],
    );
    return solidFromKernel(k.boolean("cut", box, tri));
  });
}
