import { type MeshData, meshToAsciiStl, type OccSession, type OccShape } from "occt.ts";
import { type Vec3, v } from "../geom";
import type {
  CurveKind,
  EdgeMeta,
  FaceMeta,
  Kernel,
  ShapeHandle,
  ShapeMeta,
  SurfaceKind,
} from "./types";

export interface InitOptions {
  /** Explicit URL or path to the OCCT WASM binary (file, http(s) or data:). */
  wasmUrl?: string;
}

/**
 * The single OCCT import site. Everything above `kernel/` speaks the
 * `Kernel` interface only.
 */
let session: OccSession | null = null;
let kernel: Kernel | null = null;

/** Loads the OCCT WASM kernel exactly once per process (idempotent). */
export async function init(opts: InitOptions = {}): Promise<void> {
  if (session) {
    return;
  }
  const { OccSession: Ctor } = await import("occt.ts");
  session = await Ctor.create(opts.wasmUrl ? { wasmUrl: opts.wasmUrl } : undefined);
  kernel = new OcctKernel(session);
}

/** The process-wide kernel. Throws a structured error before `init()`. */
export function getKernel(): Kernel {
  if (!kernel) {
    throw new Error(
      "cadorange is not initialized — await init() (loads the OCCT WASM kernel) before modeling.",
    );
  }
  return kernel;
}

/** Test hook: drop the session so a fresh `init()` builds a new one. */
export function resetKernel(): void {
  session?.dispose();
  session = null;
  kernel = null;
}

export function createOcctKernel(): Kernel {
  if (!kernel) {
    throw new Error("createOcctKernel: call init() first.");
  }
  return kernel;
}

interface Registry {
  byId: Map<number, OccShape>;
  nextId: number;
  finalizer: FinalizationRegistry<number>;
}

function makeRegistry(): Registry {
  const byId = new Map<number, OccShape>();
  const nextId = 1;
  // WASM memory is not GC'd; this is the last-resort fallback when a Shape
  // object is dropped without dispose(). Batches (Session/OpLog) dispose
  // eagerly — see docs/architecture.md §3.2.
  const finalizer = new FinalizationRegistry<number>((id) => {
    const shape = byId.get(id);
    if (shape) {
      shape.dispose();
      byId.delete(id);
    }
  });
  return { byId, nextId, finalizer };
}

const SURFACE_KINDS: ReadonlySet<string> = new Set([
  "plane",
  "cylinder",
  "cone",
  "sphere",
  "torus",
  "bspline-surface",
]);
const CURVE_KINDS: ReadonlySet<string> = new Set(["line", "circle", "ellipse", "bspline"]);

class OcctKernel implements Kernel {
  readonly #occ: OccSession;
  readonly #reg = makeRegistry();
  readonly #metaCache = new WeakMap<ShapeHandle, ShapeMeta>();

  constructor(occ: OccSession) {
    this.#occ = occ;
  }

  #adopt(shape: OccShape): ShapeHandle {
    const id = this.#reg.nextId++;
    this.#reg.byId.set(id, shape);
    this.#reg.finalizer.register(shape, id, shape);
    return { id };
  }

  #raw(handle: ShapeHandle): OccShape {
    const shape = this.#reg.byId.get(handle.id);
    if (!shape) {
      throw new Error(`Unknown or disposed shape handle #${handle.id}.`);
    }
    return shape;
  }

  makeBox(dx: number, dy: number, dz: number, at?: Vec3, dir?: Vec3): ShapeHandle {
    let s = this.#occ.makeBox(dx, dy, dz);
    if (dir) {
      s = this.#rotateZTo(s, dir);
    }
    return this.#adopt(at ? this.#occ.translate(s, at) : s);
  }

  /** Rotates a +Z-axis-aligned shape so its local +Z points along `dir`. */
  #rotateZTo(shape: OccShape, dir: Vec3): OccShape {
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    const z = len === 0 ? 1 : dir[2] / len;
    if (z > 1 - 1e-12) {
      return shape; // already +Z
    }
    if (z < -1 + 1e-12) {
      return this.#occ.rotate(shape, [1, 0, 0], 180); // antiparallel
    }
    const axis: [number, number, number] = [-dir[1] / len, dir[0] / len, 0]; // Z × dir
    const angle = (Math.acos(Math.min(1, Math.max(-1, z))) * 180) / Math.PI;
    return this.#occ.rotate(shape, axis, angle);
  }

  makeCylinder(radius: number, height: number, at?: Vec3, dir?: Vec3): ShapeHandle {
    const s = this.#occ.makeCylinder(radius, height, {
      origin: at ?? [0, 0, 0],
      ...(dir ? { direction: dir } : {}),
    });
    return this.#adopt(s);
  }

  makeSphere(radius: number, at?: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.makeSphere(radius, at ?? [0, 0, 0]));
  }

  makeCone(radius1: number, radius2: number, height: number, at?: Vec3): ShapeHandle {
    const s = this.#occ.makeCone(radius1, radius2, height, { origin: at ?? [0, 0, 0] });
    return this.#adopt(s);
  }

  makeTorus(radius1: number, radius2: number, at?: Vec3): ShapeHandle {
    const s = this.#occ.makeTorus(radius1, radius2);
    return this.#adopt(at ? this.#occ.translate(s, at) : s);
  }

  makeCircle(radius: number, origin: Vec3, normal: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.makeCircle(radius, { origin, normal }));
  }

  makePolygon(points: readonly Vec3[], close: boolean): ShapeHandle {
    return this.#adopt(this.#occ.makePolygon(points, { close }));
  }

  makeLine(start: Vec3, end: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.makeLine(start, end));
  }

  makeArc(
    radius: number,
    origin: Vec3,
    normal: Vec3,
    startDegrees: number,
    endDegrees: number,
  ): ShapeHandle {
    return this.#adopt(this.#occ.makeArc(radius, { origin, normal, startDegrees, endDegrees }));
  }

  makeWire(parts: readonly ShapeHandle[]): ShapeHandle {
    return this.#adopt(this.#occ.makeWire(parts.map((h) => this.#raw(h))));
  }

  makeFace(outer: ShapeHandle, holes: readonly ShapeHandle[]): ShapeHandle {
    return this.#adopt(
      this.#occ.makeFace(
        this.#raw(outer),
        holes.map((h) => this.#raw(h)),
      ),
    );
  }

  extrude(profile: ShapeHandle, vector: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.extrude(this.#raw(profile), vector));
  }

  revolve(profile: ShapeHandle, origin: Vec3, direction: Vec3, angleDegrees: number): ShapeHandle {
    return this.#adopt(
      this.#occ.revolve(this.#raw(profile), {
        origin,
        direction,
        angleDegrees,
      }),
    );
  }

  boolean(
    op: "fuse" | "cut" | "common",
    a: ShapeHandle,
    b: ShapeHandle,
    opts?: { clean?: boolean },
  ): ShapeHandle {
    const ra = this.#raw(a);
    const rb = this.#raw(b);
    const result =
      op === "fuse"
        ? this.#occ.fuse(ra, rb, opts)
        : op === "cut"
          ? this.#occ.cut(ra, rb, opts)
          : this.#occ.common(ra, rb, opts);
    return this.#adopt(result);
  }

  fillet(s: ShapeHandle, radius: number, edgeIndices: number[]): ShapeHandle {
    // Omitted `edges` = all edges in occt.ts; an explicitly empty selection is
    // meaningless, so we forward it as "all" too (documented kernel rule).
    const opts = edgeIndices.length > 0 ? { edges: edgeIndices } : undefined;
    return this.#adopt(this.#occ.fillet(this.#raw(s), radius, opts));
  }

  chamfer(s: ShapeHandle, distance: number, edgeIndices: number[], length2?: number): ShapeHandle {
    const opts =
      edgeIndices.length > 0
        ? { edges: edgeIndices, ...(length2 !== undefined ? { length2 } : {}) }
        : length2 !== undefined
          ? { length2 }
          : undefined;
    return this.#adopt(this.#occ.chamfer(this.#raw(s), distance, opts));
  }

  translate(s: ShapeHandle, by: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.translate(this.#raw(s), by));
  }

  rotate(s: ShapeHandle, axisDir: Vec3, angleDegrees: number): ShapeHandle {
    return this.#adopt(this.#occ.rotate(this.#raw(s), axisDir, angleDegrees));
  }

  mirror(
    s: ShapeHandle,
    opts: {
      plane?: { origin?: Vec3; normal: Vec3 };
      axis?: { origin?: Vec3; direction: Vec3 };
    },
  ): ShapeHandle {
    return this.#adopt(this.#occ.mirror(this.#raw(s), opts));
  }

  compound(shapes: readonly ShapeHandle[]): ShapeHandle {
    const raws = shapes.map((h) => this.#raw(h));
    return this.#adopt(this.#occ.compound(raws));
  }

  meta(s: ShapeHandle): ShapeMeta {
    const cached = this.#metaCache.get(s);
    if (cached) {
      return cached;
    }
    const raw = this.#raw(s);
    const d = this.#occ.describe(raw);
    const bbox = raw.bounds();

    const edges: EdgeMeta[] = d.edges.map((e) => {
      const curve = (CURVE_KINDS.has(e.curve) ? e.curve : "other") as CurveKind;
      if (e.curve === "line") {
        return {
          index: e.index,
          curve,
          length: e.length,
          center: e.center,
          direction: e.direction,
        };
      }
      if (e.curve === "circle") {
        // axisPoint (the underlying circle's center), NOT the integral
        // centroid — arc centroids would drift off-center and break
        // selection semantics (occt.ts ≥0.10.0 reports both).
        // arcPoint: a point ON the arc at the mid parameter, for probing.
        const helper: Vec3 = Math.abs(e.axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const b1 = v.normalize(v.cross(e.axis, helper));
        const b2 = v.cross(e.axis, b1);
        const uMid = (e.uRange[0] + e.uRange[1]) / 2;
        const arcPoint: Vec3 = v.add(
          e.axisPoint,
          v.add(v.scale(b1, e.radius * Math.cos(uMid)), v.scale(b2, e.radius * Math.sin(uMid))),
        );
        return {
          index: e.index,
          curve,
          length: e.length,
          center: e.axisPoint,
          arcPoint,
          uRange: e.uRange,
          axis: e.axis,
          radius: e.radius,
        };
      }
      if (e.curve === "ellipse") {
        return { index: e.index, curve, length: e.length, center: e.axisPoint, axis: e.axis };
      }
      return { index: e.index, curve, length: e.length, center: e.center };
    });

    const faces: FaceMeta[] = d.faces.map((f) => {
      const surface = (SURFACE_KINDS.has(f.surface) ? f.surface : "other") as SurfaceKind;
      if (f.surface === "plane") {
        return { index: f.index, surface, area: f.area, center: f.center, normal: f.normal };
      }
      if (f.surface === "cylinder") {
        return {
          index: f.index,
          surface,
          area: f.area,
          center: f.axisPoint,
          axis: f.axis,
          radius: f.radius,
        };
      }
      if (f.surface === "cone") {
        return { index: f.index, surface, area: f.area, center: f.axisPoint, axis: f.axis };
      }
      if (f.surface === "sphere") {
        return {
          index: f.index,
          surface,
          area: f.area,
          center: f.axisPoint,
          radius: f.radius,
        };
      }
      if (f.surface === "torus") {
        return {
          index: f.index,
          surface,
          area: f.area,
          center: f.axisPoint,
          axis: f.axis,
          radius: f.majorRadius,
        };
      }
      return { index: f.index, surface, area: f.area, center: f.center };
    });

    const meta: ShapeMeta = {
      shapeType: raw.shapeType(),
      volume: raw.volume(),
      area: raw.area(),
      bbox: { min: bbox.min, max: bbox.max },
      center: raw.centroid(),
      valid: raw.isValid(),
      faces,
      edges,
      vertices: d.vertices,
      holes: d.holes,
    };
    this.#metaCache.set(s, meta);
    return meta;
  }

  /**
   * Dihedral classification per edge (build123d `Convexity`), by probing:
   * around each edge midpoint, 16 point-classification probes in the plane
   * perpendicular to the edge count the material wedge angle — under 180°
   * the edge is convex (a ridge), over 180° concave (a valley), at 180° the
   * faces are tangent (a smooth blend). Orientation-free and surface-type
   * free: works for cone/torus faces too, no analytic normals needed.
   * Seam/free edges (adjacent-face count != 2) stay unclassified.
   */
  #convexityCache = new WeakMap<
    ShapeHandle,
    ReadonlyMap<number, "convex" | "concave" | "smooth">
  >();

  /**
   * Lazy dihedral classification: computed on first `convexity` access
   * (probe rings are point-classification heavy — eager meta() made
   * boolean chains crawl).
   */
  edgeConvexities(s: ShapeHandle): ReadonlyMap<number, "convex" | "concave" | "smooth"> {
    const cached = this.#convexityCache.get(s);
    if (cached) {
      return cached;
    }
    const meta = this.meta(s);
    const bb = meta.bbox;
    const diagonal = Math.hypot(
      bb.max[0] - bb.min[0],
      bb.max[1] - bb.min[1],
      bb.max[2] - bb.min[2],
    );
    const result = this.#classifyEdges(
      this.#raw(s),
      meta.faces.map((f) => f.index),
      meta.edges,
      1e-4 * diagonal,
    );
    this.#convexityCache.set(s, result);
    return result;
  }

  #classifyEdges(
    raw: OccShape,
    faceIndices: readonly number[],
    edgeMetas: readonly EdgeMeta[],
    epsilon: number,
  ): ReadonlyMap<number, "convex" | "concave" | "smooth"> {
    const empty: ReadonlyMap<number, "convex" | "concave" | "smooth"> = new Map();
    if (faceIndices.length === 0 || edgeMetas.length === 0 || epsilon <= 0) {
      return empty;
    }
    const faceShapes = this.#occ.subShapes(raw, "Face");
    const edgeShapes = this.#occ.subShapes(raw, "Edge");
    const edgeFaces: number[][] = edgeMetas.map(() => []);
    try {
      for (let j = 0; j < faceShapes.length && j < faceIndices.length; j++) {
        const faceShape = faceShapes[j];
        if (!faceShape) {
          continue;
        }
        const own = this.#occ.subShapes(faceShape, "Edge");
        try {
          for (const es of own) {
            const i = edgeShapes.findIndex((g) => g !== undefined && es && g.raw.isSame(es.raw));
            if (i >= 0 && !(edgeFaces[i] ?? []).includes(j)) {
              edgeFaces[i]?.push(j);
            }
          }
        } finally {
          for (const es of own) {
            es.dispose();
          }
        }
      }
    } finally {
      for (const f of faceShapes) {
        f?.dispose();
      }
      for (const e of edgeShapes) {
        e?.dispose();
      }
    }

    const result = new Map<number, "convex" | "concave" | "smooth">();
    edgeMetas.forEach((edge, i) => {
      if ((edgeFaces[i] ?? []).length !== 2) {
        return; // seam (same face twice), free edge
      }
      const tangent = this.#edgeTangent(edge);
      if (!tangent) {
        return;
      }
      const anchor = edge.arcPoint ?? edge.center;
      // orthonormal basis perpendicular to the edge
      const helper: Vec3 = Math.abs(tangent[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = v.normalize(v.cross(tangent, helper));
      const w = v.cross(tangent, u);
      const clsAt = (angle: number): "in" | "out" | "on" => {
        const cls = this.#occ.classifyPoint(
          raw,
          v.add(
            anchor,
            v.scale(v.add(v.scale(u, Math.cos(angle)), v.scale(w, Math.sin(angle))), epsilon),
          ),
        );
        return cls as "in" | "out" | "on";
      };
      const coarse: Array<"in" | "out" | "on"> = [];
      let decisive = 0;
      for (let k = 0; k < 16; k++) {
        const cls = clsAt((k * Math.PI) / 8);
        coarse.push(cls);
        if (cls !== "on") {
          decisive++;
        }
      }
      if (decisive < 8) {
        return; // too many ambiguous probes — stay unclassified
      }
      const wedge = this.#materialWedge(coarse, clsAt);
      if (wedge === undefined) {
        return;
      }
      // wedge is the material angle in radians; smooth = tangent faces (~π)
      const SMOOTH_TOL = Math.PI / 36; // 5°
      if (wedge < Math.PI - SMOOTH_TOL) {
        result.set(edge.index, "convex");
      } else if (wedge > Math.PI + SMOOTH_TOL) {
        result.set(edge.index, "concave");
      } else {
        result.set(edge.index, "smooth");
      }
    });
    return result;
  }

  /**
   * Material wedge angle around the edge, by bisecting the coarse probe
   * ring's in/out transitions to sub-degree precision (a 16-probe count
   * alone misclassifies 180° tangent-blend edges by phase luck).
   */
  #materialWedge(
    coarse: Array<"in" | "out" | "on">,
    clsAt: (angle: number) => "in" | "out" | "on",
  ): number | undefined {
    const bisect = (a: number, b: number): number => {
      const startCls = clsAt(a);
      let lo = a;
      let hi = b;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        const cls = clsAt(mid);
        if (cls === "on") {
          return mid; // on the boundary already
        }
        if (cls === startCls) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return (lo + hi) / 2;
    };
    // dissolve on-probes into their nearest decisive neighbor so the ring is
    // a pure in/out cycle (on-probes sit exactly on face planes)
    const ring: Array<"in" | "out"> = coarse.map((c, k) => {
      if (c !== "on") {
        return c;
      }
      for (let d = 1; d < 16; d++) {
        const prev = coarse[(k - d + 16) % 16] ?? "on";
        const next = coarse[(k + d) % 16] ?? "on";
        if (prev !== "on" && prev === next) {
          return prev;
        }
        if (prev !== "on") {
          return prev;
        }
        if (next !== "on") {
          return next;
        }
      }
      return "in" as const;
    });
    const boundaries: number[] = [];
    for (let k = 0; k < 16; k++) {
      if (ring[k] !== ring[(k + 1) % 16]) {
        boundaries.push(bisect((k * Math.PI) / 8, ((k + 1) * Math.PI) / 8));
      }
    }
    if (boundaries.length !== 2) {
      return undefined;
    }
    const first = boundaries[0] ?? 0;
    const second = boundaries[1] ?? 0;
    const [b1, b2] = first < second ? [first, second] : [second, first];
    // material is the arc that contains a known "in" probe
    const firstIn = ring.findIndex((c) => c === "in");
    if (firstIn < 0) {
      return undefined;
    }
    const inAngle = (firstIn * Math.PI) / 8;
    const between = inAngle > b1 && inAngle < b2;
    return between ? b2 - b1 : 2 * Math.PI - (b2 - b1);
  }

  /** Unit tangent at the probe anchor (line: direction; circle: axis x radial). */
  #edgeTangent(edge: EdgeMeta): Vec3 | undefined {
    if (edge.curve === "line" && edge.direction) {
      return edge.direction;
    }
    if (edge.curve === "circle" && edge.axis && edge.arcPoint) {
      const radial = v.sub(edge.arcPoint, edge.center);
      const len = v.length(radial);
      if (len < 1e-9) {
        return undefined;
      }
      return v.normalize(v.cross(edge.axis, v.scale(radial, 1 / len)));
    }
    return undefined;
  }

  isValid(s: ShapeHandle): boolean {
    return this.#raw(s).isValid();
  }

  classifyPoint(s: ShapeHandle, point: Vec3): "in" | "out" | "on" | "unknown" {
    return this.#occ.classifyPoint(this.#raw(s), point);
  }

  exportStep(s: ShapeHandle): Uint8Array {
    return this.#occ.writeStep(this.#raw(s));
  }

  exportStl(s: ShapeHandle, tolerance = 0.1): string {
    const mesh = this.#occ.tessellate(this.#raw(s), { linearDeflection: tolerance });
    return meshToAsciiStl(mesh satisfies MeshData);
  }

  exportGlb(s: ShapeHandle): Uint8Array {
    return this.#occ.writeGltf(this.#raw(s));
  }

  importStep(data: Uint8Array): ShapeHandle {
    return this.#adopt(this.#occ.readStep(data));
  }

  hash(s: ShapeHandle): string {
    // BRep serialization is deterministic for identical topology; two FNV-1a
    // lanes give a stable 64-bit-ish digest without BigInt overhead.
    const bytes = this.#occ.writeBrep(this.#raw(s));
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] ?? 0;
      h1 = (h1 ^ byte) * 0x01000193;
      h2 = (h2 + byte) * 0x85ebca6b;
      h1 >>>= 0;
      h2 >>>= 0;
    }
    return `brep-${bytes.length.toString(16)}-${h1.toString(16)}${h2.toString(16).padStart(8, "0")}`;
  }

  dispose(s: ShapeHandle): void {
    const shape = this.#reg.byId.get(s.id);
    if (shape) {
      this.#reg.finalizer.unregister(shape);
      shape.dispose();
      this.#reg.byId.delete(s.id);
    }
  }
}

export { OcctKernel };
