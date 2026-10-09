/** Basic geometric value types shared across the modeling API. */

export type Vec3 = readonly [number, number, number];

/** Coordinate axis direction constants, e.g. `filterBy(Axis.Z)`. */
export const Axis = {
  X: [1, 0, 0] as const,
  Y: [0, 1, 0] as const,
  Z: [0, 0, 1] as const,
};

export type AxisName = keyof typeof Axis;

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

export interface BBox {
  min: Vec3;
  max: Vec3;
}

export interface Mesh {
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
}
