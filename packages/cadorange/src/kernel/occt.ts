import { type MeshData, meshToAsciiStl, type OccSession, type OccShape } from "occt.ts";
import type { Vec3 } from "../geom";
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

  chamfer(s: ShapeHandle, distance: number, edgeIndices: number[]): ShapeHandle {
    const opts = edgeIndices.length > 0 ? { edges: edgeIndices } : undefined;
    return this.#adopt(this.#occ.chamfer(this.#raw(s), distance, opts));
  }

  translate(s: ShapeHandle, by: Vec3): ShapeHandle {
    return this.#adopt(this.#occ.translate(this.#raw(s), by));
  }

  rotate(s: ShapeHandle, axisDir: Vec3, angleDegrees: number): ShapeHandle {
    return this.#adopt(this.#occ.rotate(this.#raw(s), axisDir, angleDegrees));
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
        return {
          index: e.index,
          curve,
          length: e.length,
          center: e.axisPoint,
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
      holes: d.holes,
    };
    this.#metaCache.set(s, meta);
    return meta;
  }

  isValid(s: ShapeHandle): boolean {
    return this.#raw(s).isValid();
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
