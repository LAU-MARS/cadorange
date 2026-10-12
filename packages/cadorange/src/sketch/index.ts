/**
 * Sketch primitives — build123d `objects_sketch`/`objects_curve` names,
 * algebra form. Every primitive returns a `Wire` recorded on a plane:
 * the default XY plane (origin [0,0,0], +Z normal), or the plane of the
 * face/Plane passed as `on`. `at: [u, v]` offsets in the plane's local
 * coordinates (build123d `Pos(u, v) * prim`).
 *
 * 2D booleans: `faceOf(wire)` caps a profile into a face, and faces compose
 * with the regular boolean ops (`.cut/.fuse/.common`). `extrude`/`revolve`
 * live in ops/ and extrude along the wire's recorded plane normal.
 */

import { type Plane, planeFrom, type Vec3, v } from "../geom";
import { getKernel } from "../kernel/occt";
import { record } from "../record";
import { Face, Shape, type Wire, wireFromKernel } from "../topo";

/** Options shared by every sketch primitive. */
export interface SketchOpts {
  /** In-plane offset (local u, v). */
  at?: readonly [number, number];
  /** Sketch on this plane, or on the plane of this face. */
  on?: Plane | Face;
}

type Frame = { origin: Vec3; xDir: Vec3; yDir: Vec3; normal: Vec3 };

function frameOf(opts?: SketchOpts): Frame {
  const plane: Plane =
    opts?.on instanceof Face
      ? planeFrom(opts.on.center, opts.on.outerNormal())
      : (opts?.on ?? { origin: [0, 0, 0], normal: [0, 0, 1], xDir: [1, 0, 0] });
  const normal = v.normalize(plane.normal);
  const xDir = v.normalize(plane.xDir);
  const yDir = v.cross(normal, xDir);
  return { origin: plane.origin, xDir, yDir, normal };
}

function toWorld(f: Frame, u: number, vv: number): Vec3 {
  return v.add(f.origin, v.add(v.scale(f.xDir, u), v.scale(f.yDir, vv)));
}

function planeOfFrame(f: Frame): Plane {
  return { origin: f.origin, normal: f.normal, xDir: f.xDir };
}

function local(f: Frame, p: readonly [number, number], opts?: SketchOpts): Vec3 {
  const at = opts?.at;
  return at ? toWorld(f, p[0] + at[0], p[1] + at[1]) : toWorld(f, p[0], p[1]);
}

/* ----------------------------- primitives ------------------------------- */

export function Circle(radius: number, opts?: SketchOpts): Wire {
  const f = frameOf(opts);
  const origin = local(f, [0, 0], opts);
  return record("sketchCircle", { radius, origin }, () =>
    wireFromKernel(getKernel().makeCircle(radius, origin, f.normal), planeOfFrame(f)),
  );
}

/** Centered rectangle, `width` along local X (build123d `Rectangle`). */
export function Rectangle(width: number, height: number, opts?: SketchOpts): Wire {
  const h = width / 2;
  const k = height / 2;
  return Polygon(
    [
      [-h, -k],
      [h, -k],
      [h, k],
      [-h, k],
    ],
    opts,
  );
}

/**
 * Regular polygon by circumscribed-circle `radius`, centered (build123d
 * `RegularPolygon`): first vertex on local +X, counterclockwise.
 */
export function RegularPolygon(radius: number, sideCount: number, opts?: SketchOpts): Wire {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < sideCount; i++) {
    const a = (2 * Math.PI * i) / sideCount;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return Polygon(pts, opts);
}

export function Polygon(points: readonly (readonly [number, number])[], opts?: SketchOpts): Wire {
  const f = frameOf(opts);
  const world = points.map((p) => local(f, p, opts));
  return record("sketchPolygon", { count: world.length }, () =>
    wireFromKernel(getKernel().makePolygon(world, true), planeOfFrame(f)),
  );
}

export function Line(
  start: readonly [number, number],
  end: readonly [number, number],
  opts?: SketchOpts,
): Wire {
  const f = frameOf(opts);
  return record("sketchLine", {}, () =>
    wireFromKernel(
      getKernel().makeLine(local(f, start, opts), local(f, end, opts)),
      planeOfFrame(f),
    ),
  );
}

export function Polyline(
  points: readonly (readonly [number, number])[],
  opts?: { close?: boolean } & SketchOpts,
): Wire {
  const f = frameOf(opts);
  const world = points.map((p) => local(f, p, opts));
  return record("sketchPolyline", { count: world.length }, () =>
    wireFromKernel(getKernel().makePolygon(world, opts?.close ?? false), planeOfFrame(f)),
  );
}

/** Arc through three points: start, mid-arc point, end (build123d `ThreePointArc`). */
export function ThreePointArc(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  opts?: SketchOpts,
): Wire {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) {
    throw new Error("ThreePointArc: the three points are collinear.");
  }
  const sq = (p: readonly [number, number]) => p[0] * p[0] + p[1] * p[1];
  const ux = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const uy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  const radius = Math.hypot(a[0] - ux, a[1] - uy);
  const deg = (p: readonly [number, number]) => (Math.atan2(p[1] - uy, p[0] - ux) * 180) / Math.PI;
  const start = deg(a);
  let sweep = (deg(c) - start + 360) % 360;
  const mid = (deg(b) - start + 360) % 360;
  if (mid > sweep) {
    // b is on the complementary arc — take the long way around
    sweep = 360 - sweep;
  }
  return CenterArc([ux, uy], radius, start, sweep, opts);
}

/**
 * Arc of `radius` from `start` to `end` (build123d `RadiusArc`): picks the
 * minor arc solution of the two possible circle centers.
 */
export function RadiusArc(
  start: readonly [number, number],
  end: readonly [number, number],
  radius: number,
  opts?: SketchOpts,
): Wire {
  const half = Math.hypot(end[0] - start[0], end[1] - start[1]) / 2;
  if (radius < half - 1e-12) {
    throw new Error(`RadiusArc: radius ${radius} is smaller than half the chord ${half}.`);
  }
  const h = Math.sqrt(Math.max(0, radius * radius - half * half));
  const mx = (start[0] + end[0]) / 2;
  const my = (start[1] + end[1]) / 2;
  const dx = (end[0] - start[0]) / (2 * half);
  const dy = (end[1] - start[1]) / (2 * half);
  // two candidate centers on the perpendicular bisector; pick the minor arc
  const deg = (cx: number, cy: number, p: readonly [number, number]) =>
    (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI;
  const sweepOf = (cx: number, cy: number) => {
    const s = deg(cx, cy, start);
    return (deg(cx, cy, end) - s + 360) % 360;
  };
  const c1 = [mx - dy * h, my + dx * h] as const;
  const c2 = [mx + dy * h, my - dx * h] as const;
  const center = sweepOf(c1[0], c1[1]) <= sweepOf(c2[0], c2[1]) ? c1 : c2;
  const s0 = deg(center[0], center[1], start);
  const sweep = sweepOf(center[0], center[1]);
  return CenterArc(center, radius, s0, sweep, opts);
}

/** Arc around `center` from `startAngle` CCW by `arcSize` degrees (build123d `CenterArc`). */
export function CenterArc(
  center: readonly [number, number],
  radius: number,
  startAngle: number,
  arcSize: number,
  opts?: SketchOpts,
): Wire {
  const f = frameOf(opts);
  const origin = local(f, center, opts);
  return record("sketchArc", { radius, startAngle, arcSize }, () =>
    wireFromKernel(
      getKernel().makeArc(radius, origin, f.normal, startAngle, startAngle + arcSize),
      planeOfFrame(f),
    ),
  );
}

/**
 * Slot with circle centers `length` apart, `diameter` wide, along local X,
 * centered at `at` (build123d `SlotCenterToCenter`).
 */
export function SlotCenterToCenter(length: number, diameter: number, opts?: SketchOpts): Wire {
  const r = diameter / 2;
  const half = length / 2;
  // two half-circles plus two closing lines, CCW from the right cap
  const right = CenterArc([half, 0], r, -90, 180, opts);
  const top = Line([half, r], [-half, r], opts);
  const left = CenterArc([-half, 0], r, 90, 180, opts);
  const bottom = Line([-half, -r], [half, -r], opts);
  return record("sketchSlot", { length, diameter }, () => combineWires(right, top, left, bottom));
}

/* ------------------------------- helpers -------------------------------- */

/** Caps a planar outer wire into a face shape, with optional hole wires. */
export function faceOf(outer: Wire, holes: readonly Wire[] = []): Shape {
  return record(
    "sketchFace",
    { holes: holes.length },
    () =>
      new Shape(
        getKernel().makeFace(
          outer.handle,
          holes.map((h) => h.handle),
        ),
      ),
  );
}

/** Concatenates wires into one (profile assembly). */
export function combineWires(...parts: Wire[]): Wire {
  if (parts.length === 0) {
    throw new Error("combineWires: no parts.");
  }
  const plane = parts[0]?.plane;
  return record("sketchWire", { parts: parts.length }, () =>
    wireFromKernel(getKernel().makeWire(parts.map((p) => p.handle)), plane),
  );
}

/**
 * Grid of in-plane locations centered on the origin (build123d
 * `GridLocations`): xCount × yCount points with the given spacings.
 */
export function gridLocations(
  xSpacing: number,
  ySpacing: number,
  xCount: number,
  yCount: number,
): Array<readonly [number, number]> {
  const xs = Array.from({ length: xCount }, (_, i) => (i - (xCount - 1) / 2) * xSpacing);
  const ys = Array.from({ length: yCount }, (_, j) => (j - (yCount - 1) / 2) * ySpacing);
  const out: Array<readonly [number, number]> = [];
  for (const y of ys) {
    for (const x of xs) {
      out.push([x, y]);
    }
  }
  return out;
}
