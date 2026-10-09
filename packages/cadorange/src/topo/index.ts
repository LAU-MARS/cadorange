import type { AxisName, BBox, Vec3 } from "../geom";
import type { ShapeHandle } from "../kernel";

/** Plain-JSON shape summary returned by `describe()`. */
export interface Describe {
  volume: number;
  area: number;
  bbox: BBox;
  center: Vec3;
  faces: number;
  edges: number;
  valid: boolean;
}

export interface Shape {
  readonly handle: ShapeHandle;
  describe(): Describe;
  faces(): ShapeList<Face>;
  edges(): ShapeList<Edge>;
  vertices(): ShapeList<Vertex>;
  isValid(): boolean;
  volume(): number;
  cut(b: Shape): Solid;
  fuse(b: Shape): Solid;
  common(b: Shape): Solid;
  export(path: string, opts?: { tolerance?: number }): Promise<void>;
}

export type Solid = Shape;
export type Face = Shape;
export type Edge = Shape;
export type Vertex = Shape;

/** A typed, chainable collection of subshapes (build123d-style). */
export interface ShapeList<T extends Shape> extends Iterable<T> {
  filterBy(axis: Vec3 | AxisName): ShapeList<T>;
  groupBy(kind: "face" | "edge" | "vertex" | "axis" | "type"): ShapeList<T>[];
  sortBy(key: "area" | "length" | "volume" | "distance" | "radius"): ShapeList<T>;
  count(): number;
}
