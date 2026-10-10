/**
 * Topology: Shape (owns a kernel handle) plus sub-shape "views".
 *
 * Sub-shapes (Face/Edge) are parent+index views over the kernel's
 * `describe()` metadata, not independent shapes — that is the occt.ts
 * reality (see docs/occt-requirements.md R2). Consequence, stated as an M0
 * rule: edges/faces passed to fillet/chamfer must belong to the shape being
 * modified; cross-shape identity tracking needs kernel tag support (R7).
 *
 * ShapeList filter/group/sort semantics are ported from build123d's
 * `topology/shape_core.py` (Apache-2.0).
 */

import { Axis, type Plane as PlaneT, type Vec3, v } from "../geom";
import { getKernel } from "../kernel/occt";
import type { EdgeMeta, FaceMeta, ShapeHandle, ShapeMeta } from "../kernel/types";
import { record } from "../record";

/** Plain-JSON shape summary returned by `describe()`. */
export interface Describe {
  volume: number;
  area: number;
  bbox: { min: Vec3; max: Vec3 };
  center: Vec3;
  faces: number;
  edges: number;
  valid: boolean;
}

/** A shape owned by the kernel: solids, and later shells/wires/faces. */
export class Shape {
  readonly handle: ShapeHandle;
  #meta: ShapeMeta | null = null;

  constructor(handle: ShapeHandle) {
    this.handle = handle;
  }

  /** One kernel interrogation, cached per instance. */
  meta(): ShapeMeta {
    if (!this.#meta) {
      this.#meta = getKernel().meta(this.handle);
    }
    return this.#meta;
  }

  describe(): Describe {
    const m = this.meta();
    return {
      volume: m.volume,
      area: m.area,
      bbox: m.bbox,
      center: m.center,
      faces: m.faces.length,
      edges: m.edges.length,
      valid: m.valid,
    };
  }

  volume(): number {
    return this.meta().volume;
  }

  area(): number {
    return this.meta().area;
  }

  center(): Vec3 {
    return this.meta().center;
  }

  isValid(): boolean {
    return this.meta().valid;
  }

  hash(): string {
    return getKernel().hash(this.handle);
  }

  faces(): ShapeList<Face> {
    return new ShapeList(this.meta().faces.map((f) => new Face(this, f)));
  }

  edges(): ShapeList<Edge> {
    return new ShapeList(this.meta().edges.map((e) => new Edge(this, e)));
  }

  /**
   * Not available yet: the kernel's interrogation output carries no vertex
   * records (docs/occt-requirements.md R5). Will land with that kernel API.
   */
  vertices(): ShapeList<never> {
    throw new Error(
      "vertices() requires kernel support (occt.ts R5: describe() vertex records) — not available yet.",
    );
  }

  cut(b: Shape): Solid {
    return record("cut", { target: this.handle.id, tool: b.handle.id }, () =>
      solidFromKernel(getKernel().boolean("cut", this.handle, b.handle)),
    );
  }

  fuse(b: Shape): Solid {
    return record("fuse", { target: this.handle.id, tool: b.handle.id }, () =>
      solidFromKernel(getKernel().boolean("fuse", this.handle, b.handle)),
    );
  }

  /** build123d's `intersect` (OCCT `common`). */
  common(b: Shape): Solid {
    return record("common", { target: this.handle.id, tool: b.handle.id }, () =>
      solidFromKernel(getKernel().boolean("common", this.handle, b.handle)),
    );
  }

  /** Immediate-bake transform (occt.ts has no lazy location chain). */
  translate(by: Vec3): Solid {
    return record("translate", { target: this.handle.id, by }, () =>
      solidFromKernel(getKernel().translate(this.handle, by)),
    );
  }

  fillet(edges: ShapeList<Edge> | readonly Edge[], radius: number): Solid {
    return fillet(this, edges, radius);
  }

  chamfer(edges: ShapeList<Edge> | readonly Edge[], distance: number): Solid {
    return chamfer(this, edges, distance);
  }

  /** Export by file extension (.step/.stl/.glb). Node writes to disk. */
  async export(path: string, opts?: { tolerance?: number }): Promise<void> {
    const { exportShape } = await import("../io");
    await exportShape(this, path, opts);
  }

  dispose(): void {
    getKernel().dispose(this.handle);
  }
}

export class Solid extends Shape {}

export function solidFromKernel(handle: ShapeHandle): Solid {
  return new Solid(handle);
}

/** A face "view": kernel metadata plus the parent it was selected from. */
export class Face {
  constructor(
    readonly parent: Shape,
    readonly meta: FaceMeta,
  ) {}

  get index(): number {
    return this.meta.index;
  }

  get surface(): FaceMeta["surface"] {
    return this.meta.surface;
  }

  get area(): number {
    return this.meta.area;
  }

  get center(): Vec3 {
    return this.meta.center;
  }

  get normal(): Vec3 | undefined {
    return this.meta.normal;
  }

  get axis(): Axis | undefined {
    return this.meta.axis ? new Axis(this.meta.center, this.meta.axis) : undefined;
  }

  get radius(): number | undefined {
    return this.meta.radius;
  }
}

/** An edge "view". `index` is the kernel's fillet/chamfer selection index. */
export class Edge {
  constructor(
    readonly parent: Shape,
    readonly meta: EdgeMeta,
  ) {}

  get index(): number {
    return this.meta.index;
  }

  get curve(): EdgeMeta["curve"] {
    return this.meta.curve;
  }

  get length(): number {
    return this.meta.length;
  }

  get center(): Vec3 {
    return this.meta.center;
  }

  get direction(): Vec3 | undefined {
    return this.meta.direction;
  }

  get axis(): Axis | undefined {
    return this.meta.axis ? new Axis(this.meta.center, this.meta.axis) : undefined;
  }

  get radius(): number | undefined {
    return this.meta.radius;
  }
}

/* ----------------------------- ShapeList -------------------------------- */

export type FilterBy<T> = Axis | PlaneT | string | ((item: T) => boolean);

/**
 * A typed, chainable collection of sub-shapes, build123d-style.
 *
 * - `filterBy(Axis)`: planar faces with parallel normal, line edges with
 *   parallel tangent; everything else drops out.
 * - `filterBy(Plane)`: faces parallel to the plane; circle/ellipse edges
 *   lying in the plane; line edges with center in plane and tangent ⊥ normal.
 * - `filterBy("cylinder" | "line" | ...)`: geometry-type equality.
 * - `filterBy(fn)`: custom predicate.
 */
export class ShapeList<T extends Face | Edge> implements Iterable<T> {
  constructor(readonly items: readonly T[]) {}

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  count(): number {
    return this.items.length;
  }

  first(): T | undefined {
    return this.items[0];
  }

  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /** Exactly one, else a structured error (build123d raises on ambiguity). */
  single(what = "element"): T {
    if (this.items.length !== 1) {
      throw new Error(
        `Expected exactly one ${what}, found ${this.items.length}. Refine the selection first.`,
      );
    }
    return this.items[0] as T;
  }

  filterBy(filter: FilterBy<T>, opts?: { reverse?: boolean }): ShapeList<T> {
    let predicate: (item: T) => boolean;
    if (filter instanceof Axis) {
      predicate = (item) => {
        if (item instanceof Face) {
          return item.meta.surface === "plane" && item.meta.normal !== undefined
            ? filter.isParallel(new Axis(item.meta.center, item.meta.normal))
            : false;
        }
        return item.meta.curve === "line" && item.meta.direction !== undefined
          ? filter.isParallel(new Axis(item.meta.center, item.meta.direction))
          : false;
      };
    } else if (typeof filter === "object" && filter !== null && "normal" in filter) {
      const plane = filter as PlaneT;
      const planeAxis = new Axis(plane.origin, plane.normal);
      predicate = (item) => {
        if (item instanceof Face) {
          return (
            item.meta.surface === "plane" &&
            item.meta.normal !== undefined &&
            planeAxis.isParallel(new Axis(item.meta.center, item.meta.normal))
          );
        }
        const { center } = item.meta;
        const inPlane = Math.abs(v.dot(v.sub(center, plane.origin), planeAxis.direction)) <= 1e-7;
        if (!inPlane) {
          return false;
        }
        if (item.meta.curve === "line") {
          return (
            item.meta.direction !== undefined &&
            Math.abs(v.dot(item.meta.direction, planeAxis.direction)) < 1e-9
          );
        }
        if (item.meta.curve === "circle" || item.meta.curve === "ellipse") {
          return (
            item.meta.axis !== undefined && planeAxis.isParallel(new Axis(center, item.meta.axis))
          );
        }
        return false;
      };
    } else if (typeof filter === "string") {
      predicate = (item) =>
        item instanceof Face ? item.meta.surface === filter : item.meta.curve === filter;
    } else {
      predicate = filter;
    }
    if (opts?.reverse) {
      const inner = predicate;
      predicate = (item) => !inner(item);
    }
    return new ShapeList(this.items.filter(predicate));
  }

  /**
   * Filter and sort by sub-shape center projected on `axis`
   * (build123d `filter_by_position`).
   */
  filterByPosition(
    axis: Axis,
    minimum: number,
    maximum: number,
    inclusive: [boolean, boolean] = [true, true],
  ): ShapeList<T> {
    const projection = (item: T) => v.dot(item.center, axis.direction);
    const lo = inclusive[0] ? (x: number) => x >= minimum : (x: number) => x > minimum;
    const hi = inclusive[1] ? (x: number) => x <= maximum : (x: number) => x < maximum;
    return new ShapeList(
      this.items.filter((item) => {
        const p = projection(item);
        return lo(p) && hi(p);
      }),
    ).sortByKey(projection);
  }

  /**
   * Group by a key then return the groups sorted by that key
   * (build123d `group_by`; Axis keys project centers, rounded to 6 digits).
   */
  groupBy(
    key: Axis | "length" | "radius" | "area" | "volume" | ((item: T) => number | string),
  ): ShapeList<T>[] {
    const keyFn = this.#keyFn(key);
    const groups = new Map<string, { raw: number | string; items: T[] }>();
    for (const item of this.items) {
      const raw = keyFn(item);
      const k = String(raw);
      const bucket = groups.get(k);
      if (bucket) {
        bucket.items.push(item);
      } else {
        groups.set(k, { raw, items: [item] });
      }
    }
    return [...groups.values()]
      .sort((a, b) =>
        typeof a.raw === "number" && typeof b.raw === "number"
          ? a.raw - b.raw
          : a.raw < b.raw
            ? -1
            : a.raw > b.raw
              ? 1
              : 0,
      )
      .map(({ items }) => new ShapeList(items));
  }

  /** Sort (build123d `sort_by`); Axis keys project centers on the axis). */
  sortBy(
    key: Axis | "length" | "radius" | "area" | "volume" | ((item: T) => number),
    reverse = false,
  ): ShapeList<T> {
    const keyFn = this.#keyFn(key);
    return this.sortByKey(keyFn, reverse);
  }

  sortByKey(keyFn: (item: T) => number | string, reverse = false): ShapeList<T> {
    const compare = (a: T, b: T): number => {
      const ka = keyFn(a);
      const kb = keyFn(b);
      return typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : ka < kb
          ? -1
          : ka > kb
            ? 1
            : 0;
    };
    const sorted = [...this.items].sort(compare);
    return new ShapeList(reverse ? sorted.reverse() : sorted);
  }

  #keyFn(key: Axis | string | ((item: T) => number | string)): (item: T) => number | string {
    if (key instanceof Axis) {
      return (item) => Math.round(v.dot(item.center, key.direction) * 1e6) / 1e6;
    }
    switch (key) {
      case "length":
        return (item) => (item instanceof Edge ? item.length : badSortKey("length", item));
      case "area":
        return (item) => (item instanceof Face ? item.area : badSortKey("area", item));
      case "radius":
        return (item) => item.meta.radius ?? Number.NaN;
      case "volume":
        return (item) => item.parent.meta().volume;
      default:
        return key as (item: T) => number | string;
    }
  }
}

/* ------------------------- fillet/chamfer helpers ------------------------ */

function badSortKey(key: string, item: Face | Edge): never {
  throw new Error(
    `sortBy("${key}") is not defined for ${item instanceof Face ? "faces" : "edges"}.`,
  );
}

/** Resolves an edge selection to kernel indices, enforcing the M0 ownership rule. */
export function resolveEdgeIndices(
  target: Shape,
  edges: ShapeList<Edge> | readonly Edge[],
): number[] {
  const list = edges instanceof ShapeList ? edges.items : [...edges];
  if (list.length === 0) {
    return [];
  }
  for (const e of list) {
    if (e.parent.handle.id !== target.handle.id) {
      throw new Error(
        `Edge #${e.index} does not belong to shape #${target.handle.id} (owner #${e.parent.handle.id}). ` +
          "Select edges from the shape being modified: part.edges().filterBy(Axis.Z).",
      );
    }
  }
  return list.map((e) => e.index);
}

function fillet(s: Shape, edges: ShapeList<Edge> | readonly Edge[], radius: number): Solid {
  const indices = resolveEdgeIndices(s, edges);
  return record("fillet", { target: s.handle.id, edges: indices, radius }, () =>
    solidFromKernel(getKernel().fillet(s.handle, radius, indices)),
  );
}

function chamfer(s: Shape, edges: ShapeList<Edge> | readonly Edge[], distance: number): Solid {
  const indices = resolveEdgeIndices(s, edges);
  return record("chamfer", { target: s.handle.id, edges: indices, distance }, () =>
    solidFromKernel(getKernel().chamfer(s.handle, distance, indices)),
  );
}
