import type { BBox, Vec3 } from "../geom";

/** Opaque handle to a shape owned by the Kernel (WASM memory). Never construct one. */
export interface ShapeHandle {
  readonly id: number;
}

/** Surface geometry kinds, mirroring OCCT analytic surfaces (build123d `GeomType`). */
export type SurfaceKind =
  | "plane"
  | "cylinder"
  | "cone"
  | "sphere"
  | "torus"
  | "bspline-surface"
  | "other";

/** Curve geometry kinds (build123d `GeomType`). */
export type CurveKind = "line" | "circle" | "ellipse" | "bspline" | "other";

/**
 * Metadata for one face, normalized from the kernel's interrogation output.
 * `index` is the kernel's 1-based selection index (fillet/draft/shell targets).
 *
 * `center` is a reference point on the face's axis of symmetry where one
 * exists (kernel `axisPoint` — cylinder/cone/sphere/torus), the integral
 * centroid for planes and generic surfaces. Selection semantics key on it;
 * occt.ts ≥0.10.0 reports both, we keep the axis-stable one.
 */
export interface FaceMeta {
  readonly index: number;
  readonly surface: SurfaceKind;
  readonly area: number;
  readonly center: Vec3;
  /** Plane only — unit normal. */
  readonly normal?: Vec3;
  /** Cylinder/cone/torus — unit axis. */
  readonly axis?: Vec3;
  /** Cylinder/sphere/torus. */
  readonly radius?: number;
}

/** Metadata for one edge. `index` is the kernel's 1-based fillet/chamfer index. */
export interface EdgeMeta {
  readonly index: number;
  readonly curve: CurveKind;
  readonly length: number;
  /**
   * Line: midpoint. Circle/ellipse: the underlying circle/ellipse center
   * (kernel `axisPoint`, not the arc's integral centroid — matches
   * build123d selector semantics). Others: integral centroid.
   */
  readonly center: Vec3;
  /** Line only — unit direction (start → end). */
  readonly direction?: Vec3;
  /** Circle/ellipse — unit axis. */
  readonly axis?: Vec3;
  /** Circle only. */
  readonly radius?: number;
}

/** A through-cylindrical-feature heuristic hit (bore/hole/boss). */
export interface HoleMeta {
  readonly radius: number;
  readonly axis: Vec3;
  readonly center: Vec3;
  readonly length: number | null;
}

/**
 * Everything the kernel can tell us about a shape in one interrogation call.
 * Sub-shape metadata (not handles) is the foundation selectors stand on.
 */
export interface ShapeMeta {
  readonly shapeType: string;
  readonly volume: number;
  readonly area: number;
  readonly bbox: BBox;
  readonly center: Vec3;
  readonly valid: boolean;
  readonly faces: readonly FaceMeta[];
  readonly edges: readonly EdgeMeta[];
  readonly holes: readonly HoleMeta[];
}

/**
 * The only surface allowed to touch occt.ts.
 *
 * Revised for occt.ts reality (it is a high-level API, not an OCP-style class
 * mirror): sub-shapes are addressed by 1-based `index` into `meta()`, never by
 * handles; there are no lazily-composed locations — transforms execute
 * immediately. Anything occt.ts cannot express shows up here as a missing
 * method (see docs/occt-requirements.md before adding workarounds below this
 * interface).
 */
export interface Kernel {
  makeBox(dx: number, dy: number, dz: number, at?: Vec3, dir?: Vec3): ShapeHandle;
  makeCylinder(radius: number, height: number, at?: Vec3, dir?: Vec3): ShapeHandle;
  makeSphere(radius: number, at?: Vec3): ShapeHandle;
  makeCone(radius1: number, radius2: number, height: number, at?: Vec3): ShapeHandle;
  makeTorus(radius1: number, radius2: number, at?: Vec3): ShapeHandle;

  /**
   * Booleans clean by default (UnifySameDomain — same as build123d/CadQuery):
   * coplanar faces merge, collinear edges join. `clean: false` keeps raw
   * fragment topology for callers that count fragments.
   */
  boolean(
    op: "fuse" | "cut" | "common",
    a: ShapeHandle,
    b: ShapeHandle,
    opts?: { clean?: boolean },
  ): ShapeHandle;

  /** `edgeIndices` are 1-based indices into `meta(s).edges`. Empty = all edges. */
  fillet(s: ShapeHandle, radius: number, edgeIndices: number[]): ShapeHandle;
  chamfer(s: ShapeHandle, distance: number, edgeIndices: number[]): ShapeHandle;

  translate(s: ShapeHandle, by: Vec3): ShapeHandle;
  rotate(s: ShapeHandle, axisDir: Vec3, angleDegrees: number): ShapeHandle;

  /** One interrogation call; implementations cache per handle. */
  meta(s: ShapeHandle): ShapeMeta;
  isValid(s: ShapeHandle): boolean;

  exportStep(s: ShapeHandle): Uint8Array;
  /** Ascii STL. */
  exportStl(s: ShapeHandle, tolerance?: number): string;
  exportGlb(s: ShapeHandle): Uint8Array;
  importStep(data: Uint8Array): ShapeHandle;

  /** Deterministic checksum (BRep serialization hash), for caching and eval replay. */
  hash(s: ShapeHandle): string;

  /** WASM memory is not GC'd — dispose explicitly. */
  dispose(s: ShapeHandle): void;
}
