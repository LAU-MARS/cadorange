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
  /** Circle only — the arc's mid-point ON the curve (unlike `center`, the
   *  circle origin). Probing/anchoring must use this, not `center`. */
  readonly arcPoint?: Vec3;
  /** Circle only — parameter range in radians. */
  readonly uRange?: readonly [number, number];
  /** Line only — unit direction (start → end). */
  readonly direction?: Vec3;
  /** Circle/ellipse — unit axis. */
  readonly axis?: Vec3;
  /** Circle only. */
  readonly radius?: number;
  /**
   * Dihedral classification vs the solid (build123d `Convexity`): convex,
   * concave, or smooth (tangent blend). Undefined for seam/free edges and
   * when the adjacent faces are not analytically classifiable.
   */
  readonly convexity?: "convex" | "concave" | "smooth";
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
  readonly vertices: readonly VertexMeta[];
  readonly holes: readonly HoleMeta[];
}

/** STEP assembly-tree node as read by the kernel (build123d `import_step` semantics). */
export interface DocNode {
  name: string | null;
  /** "#RRGGBB" or null. */
  color: string | null;
  /** 12 numbers, row-major 3x4 (rotation + translation); null = identity. */
  transform: number[] | null;
  /** Leaf: index into the document's shape list. */
  shape?: number;
  children?: DocNode[];
}

/** Mirror for writing an assembly STEP (build123d `export_step` semantics). */
export interface ExportDocNode {
  name?: string;
  color?: string;
  shape?: ShapeHandle;
  children?: readonly ExportDocNode[];
  transform?: readonly number[];
}

/** Metadata for one vertex. `index` is 1-based, like faces/edges. */
export interface VertexMeta {
  readonly index: number;
  readonly position: Vec3;
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

  /* ----------------------------- sketch layer ---------------------------- */
  /** Circle wire of `radius` centered at `origin`, plane normal `normal`. */
  makeCircle(radius: number, origin: Vec3, normal: Vec3): ShapeHandle;
  /** Closed (default) or open polygon wire through world-space `points`. */
  makePolygon(points: readonly Vec3[], close: boolean): ShapeHandle;
  /** Line-segment wire from `start` to `end`. */
  makeLine(start: Vec3, end: Vec3): ShapeHandle;
  /**
   * Circular-arc wire of `radius` around `origin`/`normal` (right-hand rule),
   * from `startDegrees` to `endDegrees` (CCW, span < 360°).
   */
  makeArc(
    radius: number,
    origin: Vec3,
    normal: Vec3,
    startDegrees: number,
    endDegrees: number,
  ): ShapeHandle;
  /** Concatenate connected wires/edges into one wire, in order. */
  makeWire(parts: readonly ShapeHandle[]): ShapeHandle;
  makeEllipse(majorRadius: number, minorRadius: number, origin: Vec3, normal: Vec3): ShapeHandle;
  /** B-spline through control points (poles), clamped uniform knots. */
  makeBspline(poles: readonly Vec3[], degree?: number): ShapeHandle;
  /** Smooth B-spline interpolated THROUGH every point. */
  makeBsplineThrough(points: readonly Vec3[], periodic?: boolean): ShapeHandle;
  /** Helix wire of `radius`, climbing `pitch` per turn up to `height`. */
  makeHelix(radius: number, pitch: number, height: number): ShapeHandle;
  /** Cap a planar outer wire into a face, with optional inner hole wires. */
  makeFace(outer: ShapeHandle, holes: readonly ShapeHandle[]): ShapeHandle;
  /** Extrude a planar profile (wire or face) along `vector` into a solid. */
  extrude(profile: ShapeHandle, vector: Vec3): ShapeHandle;
  /** Revolve a planar profile around the axis `origin → origin+direction`. */
  revolve(profile: ShapeHandle, origin: Vec3, direction: Vec3, angleDegrees: number): ShapeHandle;
  /** Skin sections (wires/faces) into one solid; `ruled` = straight sections. */
  loft(sections: readonly ShapeHandle[], ruled: boolean): ShapeHandle;
  /** Sweep a planar profile along a spine wire. */
  sweep(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle;
  /** Split by tools, keeping every fragment. */
  split(s: ShapeHandle, tools: readonly ShapeHandle[]): ShapeHandle;
  /** Intersection curves of two shapes' surfaces (an edge/compound). */
  section(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
  /** Hollow into a shell of `thickness`; `openFaces` are 1-based openings. */
  shell(s: ShapeHandle, thickness: number, openFaces: number[]): ShapeHandle;
  /** Draft faces by `angleDegrees` (mold release). */
  draft(s: ShapeHandle, angleDegrees: number, direction: Vec3, faces: number[]): ShapeHandle;
  /** Uniform 3D offset: grow (>0) / shrink (<0) the whole solid. */
  offsetSolid(s: ShapeHandle, distance: number): ShapeHandle;
  scale(s: ShapeHandle, factor: number): ShapeHandle;
  /** Minimum distance between two shapes. */
  distance(a: ShapeHandle, b: ShapeHandle): number;
  /** Sub-shape handles by type (order matches describe for Face/Edge/Vertex). */
  subShapes(s: ShapeHandle, type: "Solid" | "Shell" | "Wire" | "Face"): ShapeHandle[];

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
  /** Asymmetric bevel when `length2` is given (distance/length2 on the two adjacent faces). */
  chamfer(s: ShapeHandle, distance: number, edgeIndices: number[], length2?: number): ShapeHandle;

  translate(s: ShapeHandle, by: Vec3): ShapeHandle;
  rotate(s: ShapeHandle, axisDir: Vec3, angleDegrees: number): ShapeHandle;
  /** Mirror across a plane (3D) or about an axis line (2D flip) — build123d `mirror()`. */
  mirror(
    s: ShapeHandle,
    opts: {
      plane?: { origin?: Vec3; normal: Vec3 };
      axis?: { origin?: Vec3; direction: Vec3 };
    },
  ): ShapeHandle;
  /** Multi-body container for disjoint parts (build123d `Compound`). */
  compound(shapes: readonly ShapeHandle[]): ShapeHandle;

  /** One interrogation call; implementations cache per handle. */
  meta(s: ShapeHandle): ShapeMeta;
  isValid(s: ShapeHandle): boolean;
  classifyPoint(s: ShapeHandle, point: Vec3): "in" | "out" | "on" | "unknown";
  /**
   * Lazy dihedral classification: edge index -> convex/concave/smooth.
   * Probe-ring based (expensive) — computed on demand, cached per handle.
   */
  edgeConvexities(s: ShapeHandle): ReadonlyMap<number, "convex" | "concave" | "smooth">;

  exportStep(s: ShapeHandle): Uint8Array;
  /** Ascii STL. */
  exportStl(s: ShapeHandle, tolerance?: number): string;
  exportGlb(s: ShapeHandle): Uint8Array;
  importStep(data: Uint8Array): ShapeHandle;
  /**
   * Reads a STEP assembly document: the JSON tree (names/colors/instance
   * transforms) plus every leaf adopted as a handle immediately — leaf
   * lookups are session-scoped, so we resolve them all in one go.
   */
  readStepDocument(data: Uint8Array): { tree: DocNode[]; shapes: ShapeHandle[] };
  /** Writes an assembly STEP document back. */
  writeStepDocument(nodes: readonly ExportDocNode[]): Uint8Array;
  importBrep(data: Uint8Array): ShapeHandle;
  exportBrep(s: ShapeHandle): Uint8Array;
  /** Wavefront OBJ text. */
  exportObj(s: ShapeHandle): string;

  /** Deterministic checksum (BRep serialization hash), for caching and eval replay. */
  hash(s: ShapeHandle): string;

  /** The high-level OccShape behind a handle (ADR-0001 escape hatch). */
  wrapped(s: ShapeHandle): unknown;
  /** Adopts an external high-level OccShape into the registry. */
  adoptWrapped(o: unknown): ShapeHandle;
  /** WASM memory is not GC'd — dispose explicitly. */
  dispose(s: ShapeHandle): void;
}
