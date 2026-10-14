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
  if (length <= 0) {
    return Circle(diameter / 2, opts); // zero-length slot degenerates to a circle
  }
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

/* --------------------- more curves & sketch objects --------------------- */

/** Triangle by three vertices (build123d `Triangle`). */
export function Triangle(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  opts?: SketchOpts,
): Wire {
  return Polygon([a, b, c], opts);
}

/**
 * Isosceles trapezoid (build123d `Trapezoid`): `width` base, `height` tall,
 * `interiorAngle` (degrees) tilts the sides — the top edge follows.
 */
export function Trapezoid(
  width: number,
  height: number,
  interiorAngle = 90,
  opts?: SketchOpts,
): Wire {
  const skew = height / Math.tan((interiorAngle * Math.PI) / 180);
  const half = width / 2;
  return Polygon(
    [
      [-half, 0],
      [half, 0],
      [half - skew, height],
      [-half + skew, height],
    ],
    opts,
  );
}

/** Rectangle with filleted corners (build123d `RectangleRounded`). */
export function RectangleRounded(
  width: number,
  height: number,
  radius: number,
  opts?: SketchOpts,
): Wire {
  const h = width / 2 - radius;
  const k = height / 2 - radius;
  if (h <= 0 || k <= 0) {
    throw new Error("RectangleRounded: radius must be smaller than half the side.");
  }
  const corner = (cx: number, cy: number, start: number): Wire =>
    CenterArc([cx, cy], radius, start, 90, opts);
  const seg = (p: readonly [number, number], q: readonly [number, number]): Wire =>
    Line(p, q, opts);
  return combineWires(
    corner(h, -k, -90),
    seg([h + radius, -k], [h + radius, k]),
    corner(h, k, 0),
    seg([h, k + radius], [-h, k + radius]),
    corner(-h, k, 90),
    seg([-h - radius, k], [-h - radius, -k]),
    corner(-h, -k, 180),
    seg([-h, -k - radius], [h, -k - radius]),
  );
}

/** Full ellipse (build123d `Ellipse`): major along local X, minor along Y. */
export function Ellipse(majorRadius: number, minorRadius: number, opts?: SketchOpts): Wire {
  const f = frameOf(opts);
  const origin = local(f, [0, 0], opts);
  return record("sketchEllipse", { majorRadius, minorRadius }, () =>
    wireFromKernel(
      getKernel().makeEllipse(majorRadius, minorRadius, origin, f.normal),
      planeOfFrame(f),
    ),
  );
}

/** Slot by center point and diameter, axis along local X (build123d `SlotCenterPoint`). */
export function SlotCenterPoint(
  center: readonly [number, number],
  diameter: number,
  opts?: SketchOpts,
): Wire {
  const _r = diameter / 2;
  return SlotCenterToCenter(0, diameter, { ...opts, at: center });
}

/** Slot by overall length and diameter (build123d `SlotOverall`). */
export function SlotOverall(length: number, diameter: number, opts?: SketchOpts): Wire {
  const centers = Math.max(0, length - diameter);
  return SlotCenterToCenter(centers, diameter, opts);
}

/**
 * Curved slot (build123d `SlotArc`): `diameter` wide, centered on an arc of
 * `radius` spanning `arcSize` degrees. Composed from outer/inner arcs and
 * two end caps.
 */
export function SlotArc(
  radius: number,
  arcSize: number,
  diameter: number,
  opts?: SketchOpts,
): Wire {
  const r = diameter / 2;
  const phi = ((arcSize / 2) * Math.PI) / 180;
  const deg = (a: number): number => (a * 180) / Math.PI;
  const outer = CenterArc([0, 0], radius + r, -deg(phi), arcSize, opts);
  const inner = CenterArc([0, 0], radius - r, deg(phi), 360 - arcSize, opts);
  // caps: half circles centered on the center-arc, joining outer and inner
  // endpoints exactly (tangent points lie radially at +/- phi)
  const capRight = CenterArc(
    [radius * Math.cos(phi), radius * Math.sin(phi)],
    r,
    deg(phi),
    180,
    opts,
  );
  const capLeft = CenterArc(
    [radius * Math.cos(-phi), radius * Math.sin(-phi)],
    r,
    180 - deg(phi),
    180,
    opts,
  );
  return combineWires(outer, capRight, inner, capLeft);
}

/** Line of `length` at `angleDegrees` CCW from +X (build123d `PolarLine`). */
export function PolarLine(length: number, angleDegrees: number, opts?: SketchOpts): Wire {
  const a = (angleDegrees * Math.PI) / 180;
  return Line([0, 0], [length * Math.cos(a), length * Math.sin(a)], opts);
}

/**
 * Line from `start` at `angleDegrees` to the reference direction
 * (build123d `IntersectingLine` with an explicit reference angle).
 */
export function IntersectingLine(
  start: readonly [number, number],
  referenceAngleDegrees: number,
  angleToReference: number,
  length: number,
  opts?: SketchOpts,
): Wire {
  const a = ((referenceAngleDegrees + angleToReference) * Math.PI) / 180;
  return Line(start, [start[0] + length * Math.cos(a), start[1] + length * Math.sin(a)], opts);
}

/** Arc by sagitta: the bump height above the chord (build123d `SagittaArc`). */
export function SagittaArc(
  start: readonly [number, number],
  end: readonly [number, number],
  sagitta: number,
  opts?: SketchOpts,
): Wire {
  const chord = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (sagitta <= 0) {
    throw new Error("SagittaArc: sagitta must be positive (use Line for flat).");
  }
  const radius = (sagitta * sagitta + (chord * chord) / 4) / (2 * sagitta);
  return RadiusArc(start, end, radius, opts);
}

/** Arc from `start` with the given tangent to `end` (build123d `TangentArc`). */
export function TangentArc(
  start: readonly [number, number],
  tangentDegrees: number,
  end: readonly [number, number],
  opts?: SketchOpts,
): Wire {
  // circle center lies on the line through start perpendicular to the tangent,
  // equidistant to start and end
  const t = (tangentDegrees * Math.PI) / 180;
  const tx = Math.cos(t);
  const ty = Math.sin(t);
  // center = start + s * (-ty, tx); solve |center - end| = |center - start|
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denom = -ty * dx + tx * dy;
  if (Math.abs(denom) < 1e-12) {
    throw new Error("TangentArc: end lies on the tangent line — no arc exists.");
  }
  const s = (dx * dx + dy * dy) / (2 * denom);
  const cx = start[0] - ty * s;
  const cy = start[1] + tx * s;
  const radius = Math.abs(s);
  const deg = (p: readonly [number, number]) => (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI;
  const a0 = deg(start);
  const sweep = (deg(end) - a0 + 360) % 360;
  void a0;
  return CenterArc([cx, cy], radius, a0, sweep, opts);
}

/** Arc from `start` along `tangentDegrees`, `radius`, spanning `arcSize` (build123d `JernArc`). */
export function JernArc(
  start: readonly [number, number],
  tangentDegrees: number,
  radius: number,
  arcSize: number,
  opts?: SketchOpts,
): Wire {
  const t = (tangentDegrees * Math.PI) / 180;
  const tx = Math.cos(t);
  const ty = Math.sin(t);
  // for a CCW arc the center is 90° left of the tangent
  const cx = start[0] - ty * radius;
  const cy = start[1] + tx * radius;
  const a0 = (Math.atan2(start[1] - cy, start[0] - cx) * 180) / Math.PI;
  return CenterArc([cx, cy], radius, a0, arcSize, opts);
}

/**
 * Polyline with filleted joints (build123d `FilletPolyline`): straight runs
 * of `radius`-arcs at every interior vertex.
 */
export function FilletPolyline(
  points: readonly (readonly [number, number])[],
  radius: number,
  opts?: SketchOpts,
): Wire {
  if (points.length < 3) {
    throw new Error("FilletPolyline: needs at least 3 points.");
  }
  const parts: Wire[] = [];
  const shrink = (
    a: readonly [number, number],
    b: readonly [number, number],
    t: number,
  ): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const len = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  // tangent points: radius/|tan(θ/2)| along each segment — approximate with
  // fixed trim distance r (exact for 90° corners, conservative otherwise)
  const trim = (
    p: readonly [number, number],
    q: readonly [number, number],
    back: boolean,
  ): [number, number] => {
    const d = len(p, q);
    const t = Math.min(radius, d / 2) / d;
    return back ? shrink(q, p, t) : shrink(p, q, t);
  };
  let prevEnd = trim(points[0] as [number, number], points[1] as [number, number], false);
  parts.push(Line(points[0] as [number, number], prevEnd, opts));
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as [number, number];
    const next = points[i + 1] as [number, number];
    const t1 = trim(points[i - 1] as [number, number], p, true);
    const t2 = trim(p, next, false);
    parts.push(Line(prevEnd, t1, opts));
    parts.push(ThreePointArc(t1, p, t2, opts));
    prevEnd = t2;
  }
  parts.push(Line(prevEnd, points[points.length - 1] as [number, number], opts));
  return combineWires(...parts);
}

/** Smooth spline interpolated THROUGH points (build123d `Spline`). */
export function Spline(
  points: readonly (readonly [number, number])[],
  opts?: { periodic?: boolean } & SketchOpts,
): Wire {
  const f = frameOf(opts);
  const world = points.map((pt) => local(f, pt, opts));
  return record("sketchSpline", { points: world.length }, () =>
    wireFromKernel(getKernel().makeBsplineThrough(world, opts?.periodic), planeOfFrame(f)),
  );
}

/** B-spline by control points/poles (build123d `BSpline`). */
export function BSpline(
  poles: readonly (readonly [number, number])[],
  opts?: { degree?: number } & SketchOpts,
): Wire {
  const f = frameOf(opts);
  const world = poles.map((pt) => local(f, pt, opts));
  return record("sketchBspline", { poles: world.length }, () =>
    wireFromKernel(getKernel().makeBspline(world, opts?.degree), planeOfFrame(f)),
  );
}

/**
 * Superellipse (build123d `Superellipse`): |x/a|^n + |y/b|^n = 1, sampled
 * and interpolated as a periodic spline (no analytic OCCT superellipse).
 */
export function Superellipse(a: number, b: number, n: number, opts?: SketchOpts): Wire {
  const pts: Array<[number, number]> = [];
  const samples = 64;
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = a * Math.sign(ct) * Math.abs(ct) ** (2 / n);
    const y = b * Math.sign(st) * Math.abs(st) ** (2 / n);
    pts.push([x, y]);
  }
  return Spline(pts, { periodic: true, ...opts });
}

/**
 * Conic section arc — parabola/hyperbola (build123d
 * `ParabolicCenterArc`/`HyperbolicCenterArc`): sampled-spline approximation
 * (the kernel carries no analytic conic arc).
 */
export function ConicArc(
  kind: "parabola" | "hyperbola",
  focal: number,
  tStart: number,
  tEnd: number,
  opts?: SketchOpts,
): Wire {
  const pts: Array<[number, number]> = [];
  const samples = 24;
  for (let i = 0; i <= samples; i++) {
    const t = tStart + ((tEnd - tStart) * i) / samples;
    const x = kind === "parabola" ? focal * t * t : focal * Math.cosh(t);
    const y = kind === "parabola" ? 2 * focal * t : focal * Math.sinh(t);
    pts.push([x, y]);
  }
  return Spline(pts, opts);
}

/** Ellipse arc around `center` from `startAngle` CCW by `arcSize` degrees (build123d `EllipticalCenterArc`). */
export function EllipticalCenterArc(
  center: readonly [number, number],
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  arcSize: number,
  opts?: SketchOpts,
): Wire {
  const f = frameOf(opts);
  const origin = local(f, center, opts);
  return record("sketchEllipseArc", { majorRadius, minorRadius, arcSize }, () =>
    wireFromKernel(
      getKernel().makeEllipseArc(
        majorRadius,
        minorRadius,
        origin,
        f.normal,
        startAngle,
        startAngle + arcSize,
      ),
      planeOfFrame(f),
    ),
  );
}

/**
 * Ellipse arc through two points on an ellipse centered at `center`
 * (build123d `EllipticalStartArc`; angles derived from the points).
 */
export function EllipticalStartArc(
  start: readonly [number, number],
  end: readonly [number, number],
  majorRadius: number,
  minorRadius: number,
  opts?: { center?: readonly [number, number] } & SketchOpts,
): Wire {
  const c = opts?.center ?? [0, 0];
  const at = (p: readonly [number, number]): number => {
    const a = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
    return a;
  };
  const startAngle = at(start);
  const sweep = (at(end) - startAngle + 360) % 360;
  return EllipticalCenterArc(c, majorRadius, minorRadius, startAngle, sweep, opts);
}

/** Bezier through control poles (build123d `Bezier`); weights make it rational (exact conic arcs). */
export function Bezier(
  poles: readonly (readonly [number, number])[],
  opts?: { weights?: readonly number[] } & SketchOpts,
): Wire {
  const f = frameOf(opts);
  const world = poles.map((p) => local(f, p, opts));
  return record("sketchBezier", { poles: world.length }, () =>
    wireFromKernel(getKernel().makeBezier(world, opts?.weights), planeOfFrame(f)),
  );
}

/**
 * 2D sketch offset of a planar profile (build123d sketch `offset`, the
 * wall-thickness idiom `plan -= offset(plan, -t)`); 3D solids use
 * `offset(shape, distance)` instead. Corners resolve by `join`.
 */
export function offsetWire(
  profile: Wire,
  distance: number,
  opts?: { join?: "arc" | "tangent" | "intersection" } & SketchOpts,
): Wire {
  const plane = profile.plane;
  return record("sketchOffset", { distance, join: opts?.join ?? "arc" }, () =>
    wireFromKernel(getKernel().offsetWire(profile.handle, distance, opts?.join ?? "arc"), plane),
  );
}

/** Helix wire (build123d `Helix`) — 3D, around the +Z axis. */
export function Helix(radius: number, pitch: number, height: number): Wire {
  return record("sketchHelix", { radius, pitch, height }, () =>
    wireFromKernel(getKernel().makeHelix(radius, pitch, height)),
  );
}
