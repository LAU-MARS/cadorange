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

import { Axis, type Location, mat3ToAxisAngle, type Plane as PlaneT, type Vec3, v } from "../geom";
import { getKernel } from "../kernel/occt";
import type { EdgeMeta, FaceMeta, ShapeHandle, ShapeMeta, VertexMeta } from "../kernel/types";
import { record } from "../record";

/** Plain-JSON shape summary returned by `describe()`. */
export interface Describe {
  volume: number;
  area: number;
  bbox: { min: Vec3; max: Vec3 };
  center: Vec3;
  faces: number;
  edges: number;
  vertices: number;
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
      vertices: m.vertices.length,
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

  vertices(): ShapeList<Vertex> {
    return new ShapeList(this.meta().vertices.map((v) => new Vertex(this, v)));
  }

  /* Singular selectors (build123d `faces().first()` assertion sugar). */
  face(): Face {
    return this.faces().single("face");
  }

  edge(): Edge {
    return this.edges().single("edge");
  }

  vertex(): Vertex {
    return this.vertices().single("vertex");
  }

  /** Sub-solids of a (possibly compound) shape. */
  solids(): Solid[] {
    return getKernel()
      .subShapes(this.handle, "Solid")
      .map((h) => new Solid(h));
  }

  /** Sub-wires (sketch profiles, face boundaries). */
  wires(): Wire[] {
    return getKernel()
      .subShapes(this.handle, "Wire")
      .map((h) => new Wire(h));
  }

  boundingBox(): { min: Vec3; max: Vec3 } {
    return this.meta().bbox;
  }

  /** Minimum distance to another shape (build123d `topo_distance_to`). */
  distanceTo(other: Shape): number {
    return getKernel().distance(this.handle, other.handle);
  }

  /** Rotate `angleDegrees` about the axis through the origin. */
  rotate(axis: Axis, angleDegrees: number): Solid {
    return record("rotate", { angleDegrees }, () =>
      solidFromKernel(getKernel().rotate(this.handle, axis.direction, angleDegrees)),
    );
  }

  scale(factor: number): Solid {
    return record("scale", { factor }, () =>
      solidFromKernel(getKernel().scale(this.handle, factor)),
    );
  }

  /**
   * Bakes a composed `Location` onto this shape (build123d `Loc * shape`):
   * rotate to the location frame, then translate — immediately evaluated.
   */
  located(loc: Location): Solid {
    return record("located", {}, () => {
      const { axis, angleDegrees } = mat3ToAxisAngle(loc.rotation());
      let out = this.handle;
      if (Math.abs(angleDegrees) > 1e-9) {
        out = getKernel().rotate(out, axis, angleDegrees);
      }
      const o = loc.origin;
      if (Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) > 1e-12) {
        out = getKernel().translate(out, [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0]);
      }
      return solidFromKernel(out);
    });
  }

  /**
   * Drills a hole (build123d `Hole`, algebra form): `face` defaults to the
   * topmost planar face (">Z"), `depth` defaults to through.
   */
  hole(diameter: number, opts?: { face?: Face; at?: Vec3; depth?: number }): Solid {
    return this.cut(this.#holeTool(diameter, 0, 0, opts));
  }

  /** Counterbore (build123d `CounterBoreHole`). */
  counterBoreHole(
    diameter: number,
    cbDiameter: number,
    cbDepth: number,
    opts?: { face?: Face; at?: Vec3 },
  ): Solid {
    return this.cut(this.#holeTool(diameter, cbDiameter, cbDepth, opts));
  }

  /** Countersink (build123d `CounterSinkHole`): cone mouth of `csDiameter`. */
  counterSinkHole(
    diameter: number,
    csDiameter: number,
    csAngle = 90,
    opts?: { face?: Face; at?: Vec3 },
  ): Solid {
    const f = opts?.face ?? this.#topFace();
    const anchor = opts?.at ?? f.center;
    const n = f.outerNormal();
    const depth = (csDiameter - diameter) / 2 / Math.tan(((csAngle / 2) * Math.PI) / 180);
    const bb = this.meta().bbox;
    const through = v.length(v.sub(bb.max, bb.min));
    const main = getKernel().makeCylinder(
      diameter / 2,
      through + 2,
      [anchor[0] ?? 0, anchor[1] ?? 0, anchor[2] ?? 0],
      v.scale(n, -1) as Vec3,
    );
    const sink = getKernel().makeCone(diameter / 2, csDiameter / 2, depth, [
      anchor[0] ?? 0,
      anchor[1] ?? 0,
      anchor[2] ?? 0,
    ]);
    return this.cut(
      solidFromKernel(
        getKernel().boolean("fuse", solidFromKernel(main).handle, solidFromKernel(sink).handle),
      ),
    );
  }

  /** The cutting tool for hole/counterBoreHole. */
  #holeTool(
    diameter: number,
    cbDiameter: number,
    cbDepth: number,
    opts: { face?: Face; at?: Vec3; depth?: number } | undefined,
  ): Solid {
    const f = opts?.face ?? this.#topFace();
    const anchor = opts?.at ?? f.center;
    const n = f.outerNormal();
    const bb = this.meta().bbox;
    const through = opts?.depth ?? v.length(v.sub(bb.max, bb.min)) + 2;
    let tool = solidFromKernel(
      getKernel().makeCylinder(
        diameter / 2,
        through,
        [anchor[0] ?? 0, anchor[1] ?? 0, anchor[2] ?? 0],
        v.scale(n, -1) as Vec3,
      ),
    );
    if (cbDiameter > diameter) {
      const cb = solidFromKernel(
        getKernel().makeCylinder(
          cbDiameter / 2,
          cbDepth,
          [anchor[0] ?? 0, anchor[1] ?? 0, anchor[2] ?? 0],
          v.scale(n, -1) as Vec3,
        ),
      );
      tool = solidFromKernel(getKernel().boolean("fuse", tool.handle, cb.handle));
    }
    return tool;
  }

  #topFace(): Face {
    const top = this.faces().filterBy(Axis.Z).sortBy(Axis.Z).last();
    if (!top) {
      throw new Error("hole: no planar top face found — pass one explicitly via { face }.");
    }
    return top;
  }

  /** See `Kernel.boolean` — cleaned by default (UnifySameDomain). */
  cut(b: Shape, opts?: { clean?: boolean }): Solid {
    return record("cut", { target: this.handle.id, tool: b.handle.id, ...opts }, () =>
      solidFromKernel(getKernel().boolean("cut", this.handle, b.handle, opts)),
    );
  }

  fuse(b: Shape, opts?: { clean?: boolean }): Solid {
    return record("fuse", { target: this.handle.id, tool: b.handle.id, ...opts }, () =>
      solidFromKernel(getKernel().boolean("fuse", this.handle, b.handle, opts)),
    );
  }

  /** build123d's `intersect` (OCCT `common`). */
  common(b: Shape, opts?: { clean?: boolean }): Solid {
    return record("common", { target: this.handle.id, tool: b.handle.id, ...opts }, () =>
      solidFromKernel(getKernel().boolean("common", this.handle, b.handle, opts)),
    );
  }

  /** Immediate-bake transform (occt.ts has no lazy location chain). */
  translate(by: Vec3): Solid {
    return record("translate", { target: this.handle.id, by }, () =>
      solidFromKernel(getKernel().translate(this.handle, by)),
    );
  }

  /** Mirror across a plane or about an axis (build123d `mirror()`). */
  mirror(opts: {
    plane?: { origin?: Vec3; normal: Vec3 };
    axis?: { origin?: Vec3; direction: Vec3 };
  }): Solid {
    return record("mirror", { target: this.handle.id, ...opts }, () =>
      solidFromKernel(getKernel().mirror(this.handle, opts)),
    );
  }

  fillet(edges: ShapeList<Edge> | readonly Edge[], radius: number): Solid {
    return fillet(this, edges, radius);
  }

  chamfer(edges: ShapeList<Edge> | readonly Edge[], distance: number, length2?: number): Solid {
    return chamfer(this, edges, distance, length2);
  }

  /**
   * The high-level kernel handle behind this shape (ADR-0001, mirroring
   * build123d's `Shape.wrapped`). Lifecycle is managed by cadorange —
   * don't dispose; use `cadorange/occt` to dive further.
   */
  get wrapped(): unknown {
    return getKernel().wrapped(this.handle);
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

/**
 * A wire (open or closed profile). Sketch primitives record the plane a wire
 * was drawn on, so `extrude` knows which way is "up" without asking.
 */
export class Wire extends Shape {
  constructor(
    handle: ShapeHandle,
    readonly plane?: PlaneT,
  ) {
    super(handle);
  }
}

export function wireFromKernel(handle: ShapeHandle, plane?: PlaneT): Wire {
  return new Wire(handle, plane);
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

  #outerNormal?: Vec3;

  /**
   * The face's OUTWARD normal. `normal` is the kernel's unoriented
   * geometric normal (either side) — this calibrates the direction against
   * the solid with a point-classification probe and caches it. Everything
   * that grows geometry off a face (sketch-on-face, workplanes, extrude
   * direction) must use this, not `normal`.
   */
  outerNormal(): Vec3 {
    if (this.#outerNormal) {
      return this.#outerNormal;
    }
    const n: Vec3 = this.normal ?? [0, 0, 1];
    const bbox = this.parent.meta().bbox;
    const eps =
      1e-3 *
      Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]);
    const probe = getKernel().classifyPoint(
      this.parent.handle,
      v.add(this.center, v.scale(n, eps)),
    );
    this.#outerNormal = probe === "in" ? (v.scale(n, -1) as Vec3) : n;
    return this.#outerNormal;
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

  /**
   * Dihedral classification vs the solid (build123d `Convexity`) — computed
   * lazily (probe rings are expensive) and cached per shape by the kernel.
   */
  get convexity(): "convex" | "concave" | "smooth" | undefined {
    return getKernel().edgeConvexities(this.parent.handle).get(this.index);
  }
}

/** A vertex "view" over kernel metadata (a corner point). */
export class Vertex {
  constructor(
    readonly parent: Shape,
    readonly meta: VertexMeta,
  ) {}

  get index(): number {
    return this.meta.index;
  }

  get center(): Vec3 {
    return this.meta.position;
  }

  get position(): Vec3 {
    return this.meta.position;
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
 * - `filterBy("cylinder" | "line" | ... | "vertex")`: geometry-type equality.
 * - `filterBy("convex" | "concave" | "smooth")`: edge dihedral classification
 *   (build123d `filterBy(Convexity)`).
 * - `filterBy(fn)`: custom predicate.
 */
export class ShapeList<T extends Face | Edge | Vertex> implements Iterable<T> {
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
        if (item instanceof Vertex) {
          return false; // a point has no direction
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
        if (item instanceof Vertex) {
          return false; // build123d's plane filter applies to faces/edges only
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
      if (filter === "convex" || filter === "concave" || filter === "smooth") {
        predicate = (item) => item instanceof Edge && item.convexity === filter;
      } else {
        predicate = (item) =>
          item instanceof Face
            ? item.meta.surface === filter
            : item instanceof Edge
              ? item.meta.curve === filter
              : filter === "vertex";
      }
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
        return (item) => (item instanceof Vertex ? Number.NaN : (item.meta.radius ?? Number.NaN));
      case "volume":
        return (item) => item.parent.meta().volume;
      default:
        return key as (item: T) => number | string;
    }
  }
}

/* ------------------------- fillet/chamfer helpers ------------------------ */

function badSortKey(key: string, item: Face | Edge | Vertex): never {
  throw new Error(
    `sortBy("${key}") is not defined for ${
      item instanceof Face ? "faces" : item instanceof Edge ? "edges" : "vertices"
    }.`,
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

function chamfer(
  s: Shape,
  edges: ShapeList<Edge> | readonly Edge[],
  distance: number,
  length2?: number,
): Solid {
  const indices = resolveEdgeIndices(s, edges);
  return record(
    "chamfer",
    {
      target: s.handle.id,
      edges: indices,
      distance,
      ...(length2 !== undefined ? { length2 } : {}),
    },
    () => solidFromKernel(getKernel().chamfer(s.handle, distance, indices, length2)),
  );
}
