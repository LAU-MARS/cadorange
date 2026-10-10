/**
 * Geometric value types and pure vector math.
 *
 * Ported from build123d's geometry semantics (Apache-2.0): `Axis` with
 * `isParallel` (angle tolerance), vector ops as pure functions over `Vec3`.
 */

export type Vec3 = readonly [number, number, number];

/* ---------------------------- vector helpers ---------------------------- */

export const v = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  distance: (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize: (a: Vec3): Vec3 => {
    const len = Math.hypot(a[0], a[1], a[2]);
    return len === 0 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
  },
  /** Componentwise closeness. */
  eq: (a: Vec3, b: Vec3, tol = 1e-7): boolean =>
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol,
};

/**
 * An oriented axis (origin + direction), build123d-style. Used by selectors:
 * `part.edges().filterBy(Axis.Z)` keeps edges parallel to Z.
 */
export class Axis {
  static readonly X = new Axis([0, 0, 0], [1, 0, 0]);
  static readonly Y = new Axis([0, 0, 0], [0, 1, 0]);
  static readonly Z = new Axis([0, 0, 0], [0, 0, 1]);

  readonly direction: Vec3;

  constructor(
    readonly origin: Vec3,
    direction: Vec3,
  ) {
    this.direction = v.normalize(direction);
  }

  /**
   * True when this axis and `other` point the same or opposite way, within an
   * angle of `toleranceDegrees` (build123d: `Axis.is_parallel`, default 1e-2°).
   */
  isParallel(other: Axis, toleranceDegrees = 1e-2): boolean {
    const cos = v.dot(this.direction, other.direction);
    return Math.abs(cos) >= Math.cos((toleranceDegrees * Math.PI) / 180);
  }
}

export type AxisName = "X" | "Y" | "Z";

export function axisByName(name: AxisName): Axis {
  return name === "X" ? Axis.X : name === "Y" ? Axis.Y : Axis.Z;
}

/** Placement: origin plus optional local axis directions. */
export interface Location {
  origin: Vec3;
  /** Local Z direction; defaults to the global +Z. */
  zDir?: Vec3;
  /** Local X direction; defaults to the global +X. */
  xDir?: Vec3;
}

/** Short alias used by the kernel interface. */
export type Loc = Location;

export interface Axis3 {
  origin: Vec3;
  dir: Vec3;
}

export interface Plane {
  origin: Vec3;
  normal: Vec3;
  xDir: Vec3;
}

/** A plane from just origin + normal (xDir derived deterministically). */
export function planeFrom(origin: Vec3, normal: Vec3): Plane {
  const n = v.normalize(normal);
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return { origin, normal: n, xDir: v.normalize(v.cross(helper, n)) };
}

export interface BBox {
  min: Vec3;
  max: Vec3;
}

export interface Mesh {
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
}
