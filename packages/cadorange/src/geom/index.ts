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

/** Placement data: origin plus optional local axis directions. */
export interface Placement {
  origin: Vec3;
  /** Local Z direction; defaults to the global +Z. */
  zDir?: Vec3;
  /** Local X direction; defaults to the global +X. */
  xDir?: Vec3;
}

/** Short alias used across the kernel and primitives. */
export type Loc = Placement;

/**
 * A composed placement (build123d `Location` algebra). `mul` composes like
 * build123d's `*` (this applied after `other`); `Shape.located()` bakes it
 * immediately — there is no lazy chain over the WASM kernel.
 */
export class Location {
  readonly origin: Vec3;
  readonly zDir: Vec3;
  readonly xDir: Vec3;

  constructor(origin: Vec3, zDir: Vec3 = [0, 0, 1], xDir: Vec3 = [1, 0, 0]) {
    this.origin = origin;
    this.zDir = v.normalize(zDir);
    this.xDir = v.normalize(xDir);
  }

  static identity(): Location {
    return new Location([0, 0, 0]);
  }

  /** Rotation matrix columns = (xDir, yDir, zDir). */
  rotation(): Mat3 {
    const y = v.cross(this.zDir, this.xDir);
    return [
      [this.xDir[0] ?? 0, y[0] ?? 0, this.zDir[0] ?? 0],
      [this.xDir[1] ?? 0, y[1] ?? 0, this.zDir[1] ?? 0],
      [this.xDir[2] ?? 0, y[2] ?? 0, this.zDir[2] ?? 0],
    ];
  }

  /** this ∘ other: apply `other` first, then `this` (build123d `this * other`). */
  mul(other: Location): Location {
    const ra = this.rotation();
    const rb = other.rotation();
    const r = mul3(ra, rb);
    const origin = m3apply(ra, other.origin);
    return new Location(
      v.add(this.origin, origin),
      [r[0][2], r[1][2], r[2][2]],
      [r[0][0], r[1][0], r[2][0]],
    );
  }

  inverse(): Location {
    const r = this.rotation();
    const rt = transpose3(r);
    const origin = m3apply(rt, v.scale(this.origin, -1));
    return new Location(origin, [rt[0][2], rt[1][2], rt[2][2]], [rt[0][0], rt[1][0], rt[2][0]]);
  }
}

/** `Pos(x, y, z)` — pure translation (build123d `Pos`). */
export function Pos(x: number, y: number, z: number): Location {
  return new Location([x, y, z]);
}

/** `Rot(xDeg, yDeg, zDeg)` — intrinsic XYZ Euler rotation (build123d `Rot`). */
export function Rot(xDeg: number, yDeg: number, zDeg: number): Location {
  const d = Math.PI / 180;
  const cx = Math.cos(xDeg * d);
  const sx = Math.sin(xDeg * d);
  const cy = Math.cos(yDeg * d);
  const sy = Math.sin(yDeg * d);
  const cz = Math.cos(zDeg * d);
  const sz = Math.sin(zDeg * d);
  const rx: Mat3 = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const ry: Mat3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rz: Mat3 = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];
  const r = mul3(rz, mul3(ry, rx));
  return new Location([0, 0, 0], [r[0][2], r[1][2], r[2][2]], [r[0][0], r[1][0], r[2][0]]);
}

/* ------------------------------ 3x3 matrices ----------------------------- */

export type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const out: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0);
      }
      const row = out[i];
      if (row) {
        row[j] = sum;
      }
    }
  }
  return out as unknown as Mat3;
}

export function transpose3(a: Mat3): Mat3 {
  return [
    [a[0][0], a[1][0], a[2][0]],
    [a[0][1], a[1][1], a[2][1]],
    [a[0][2], a[1][2], a[2][2]],
  ];
}

export function m3apply(a: Mat3, p: Vec3): Vec3 {
  return [
    a[0][0] * p[0] + a[0][1] * p[1] + a[0][2] * p[2],
    a[1][0] * p[0] + a[1][1] * p[1] + a[1][2] * p[2],
    a[2][0] * p[0] + a[2][1] * p[1] + a[2][2] * p[2],
  ];
}

/** Rotation matrix -> axis-angle (degrees) for kernel.rotate. */
export function mat3ToAxisAngle(a: Mat3): { axis: Vec3; angleDegrees: number } {
  const angle = Math.acos(Math.min(1, Math.max(-1, (a[0][0] + a[1][1] + a[2][2] - 1) / 2)));
  if (angle < 1e-9) {
    return { axis: [0, 0, 1], angleDegrees: 0 };
  }
  if (Math.PI - angle < 1e-6) {
    // near 180°: axis from the diagonal
    const x = Math.sqrt(Math.max(0, (a[0][0] + 1) / 2));
    const y = Math.sqrt(Math.max(0, (a[1][1] + 1) / 2));
    const z = Math.sqrt(Math.max(0, (a[2][2] + 1) / 2));
    return { axis: v.normalize([x, y, z]), angleDegrees: 180 };
  }
  const axis = v.normalize([
    (a[2][1] - a[1][2]) / 2,
    (a[0][2] - a[2][0]) / 2,
    (a[1][0] - a[0][1]) / 2,
  ]);
  return { axis, angleDegrees: (angle * 180) / Math.PI };
}

/* --------------------- 3x4 affine transforms (STEP) -------------------- */
/** Row-major 3x4: [r11,r12,r13,t1, r21,r22,r23,t2, r31,r32,r33,t3]. */
export type Mat34 = readonly number[];

export function identity34(): Mat34 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
}

export function mul34(a: Mat34, b: Mat34): Mat34 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += (a[r * 4 + k] ?? 0) * (b[k * 4 + c] ?? 0);
      }
      if (c === 3) {
        sum += a[r * 4 + 3] ?? 0;
      }
      out.push(sum);
    }
  }
  return out;
}

export function apply34(m: Mat34, p: Vec3): Vec3 {
  return [
    (m[0] ?? 0) * p[0] + (m[1] ?? 0) * p[1] + (m[2] ?? 0) * p[2] + (m[3] ?? 0),
    (m[4] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[6] ?? 0) * p[2] + (m[7] ?? 0),
    (m[8] ?? 0) * p[0] + (m[9] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[11] ?? 0),
  ];
}

/** Rotation part of a 3x4 as a Mat3 (for mat3ToAxisAngle baking). */
export function mat34Rotation(m: Mat34): Mat3 {
  return [
    [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0],
    [m[4] ?? 0, m[5] ?? 0, m[6] ?? 0],
    [m[8] ?? 0, m[9] ?? 0, m[10] ?? 0],
  ];
}

export function mat34Translation(m: Mat34): Vec3 {
  return [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0];
}

/** RGBA color value (build123d `Color` — a plain value here, no OCCT binding). */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export function color(hex: string, a?: number): Color {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
    ...(a !== undefined ? { a } : {}),
  };
}

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
