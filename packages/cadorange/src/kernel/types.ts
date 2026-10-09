import type { BBox, Loc, Mesh, Vec3 } from "../geom";

/** Opaque handle to a shape owned by the Kernel (WASM memory). Never construct one. */
export interface ShapeHandle {
  readonly id: number;
}

/**
 * The only surface allowed to touch occt.ts.
 *
 * All modeling code goes through this interface, so the kernel can be
 * upgraded, mocked in tests or swapped entirely without touching callers.
 * Anything occt.ts cannot express shows up here as a missing method.
 */
export interface Kernel {
  makeBox(dx: number, dy: number, dz: number, loc?: Loc): ShapeHandle;
  makeCylinder(r: number, h: number, loc?: Loc): ShapeHandle;
  boolean(op: "fuse" | "cut" | "common", a: ShapeHandle, b: ShapeHandle): ShapeHandle;
  fillet(s: ShapeHandle, edges: ShapeHandle[], r: number): ShapeHandle;
  explore(s: ShapeHandle, kind: "face" | "edge" | "vertex"): ShapeHandle[];
  props(s: ShapeHandle): { volume: number; area: number; bbox: BBox; center: Vec3 };
  isValid(s: ShapeHandle): boolean;
  tessellate(s: ShapeHandle, tol: number): Mesh;
  exportStep(s: ShapeHandle): Uint8Array;
  /** Deterministic checksum, used for caching and eval/RL replay checks. */
  hash(s: ShapeHandle): string;
  /** WASM memory is not GC'd — dispose explicitly. */
  dispose(s: ShapeHandle): void;
}
