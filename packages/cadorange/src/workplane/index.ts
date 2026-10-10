/**
 * CadQuery-style fluent facade over the explicit core API.
 *
 * Thin by design: every method maps onto a core op so the op log records the
 * same operations regardless of which style the caller used. Placement
 * follows CadQuery semantics — primitives are centered on the current plane
 * in-plane and extrude along the plane normal (the core API, by contrast, is
 * corner/base-anchored; see docs/api-map.md "已知语义差异").
 *
 * Named planes use CadQuery's orientation table (front = +Z normal — note
 * build123d's own `front` is −Y; this facade follows CadQuery).
 */

import { type Plane, planeFrom, type Vec3, v } from "../geom";
import { Box, Cylinder } from "../primitives";
import { parseSelector } from "../selectors";
import type { Edge, Face, Solid } from "../topo";

export type PlaneName = "XY" | "YZ" | "XZ" | "front" | "back" | "left" | "right" | "top" | "bottom";

export type Selector = string;

/** CadQuery named-plane orientations: [xDir, normal]. */
const NAMED_PLANES: Record<PlaneName, readonly [Vec3, Vec3]> = {
  XY: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  YZ: [
    [0, 1, 0],
    [1, 0, 0],
  ],
  XZ: [
    [1, 0, 0],
    [0, -1, 0],
  ],
  front: [
    [1, 0, 0],
    [0, 0, 1],
  ],
  back: [
    [1, 0, 0],
    [0, 0, -1],
  ],
  left: [
    [0, 1, 0],
    [-1, 0, 0],
  ],
  right: [
    [0, 1, 0],
    [1, 0, 0],
  ],
  top: [
    [1, 0, 0],
    [0, 1, 0],
  ],
  bottom: [
    [1, 0, 0],
    [0, -1, 0],
  ],
};

export class Workplane {
  #solid: Solid | null = null;
  #plane: Plane;
  #pendingFaces: Face[] = [];
  #pendingEdges: Edge[] = [];

  constructor(plane: PlaneName = "XY") {
    const [xDir, normal] = NAMED_PLANES[plane] ?? NAMED_PLANES.XY;
    this.#plane = { origin: [0, 0, 0], normal, xDir };
  }

  /** The current placement plane. */
  get plane(): Plane {
    return this.#plane;
  }

  #requireSolid(action: string): Solid {
    if (!this.#solid) {
      throw new Error(
        `Workplane.${action}: no solid yet — create a primitive (box/cylinder) first.`,
      );
    }
    return this.#solid;
  }

  #basis(): { u: Vec3; w: Vec3 } {
    const w = v.normalize(this.#plane.normal);
    const u = v.normalize(this.#plane.xDir);
    return { u, w };
  }

  /** Centered on the current plane, extruding along its normal. */
  box(dx: number, dy: number, dz: number): this {
    const { u, w } = this.#basis();
    const nu = v.cross(w, u); // in-plane second axis (right-handed)
    const origin = v.add(this.#plane.origin, v.add(v.scale(u, -dx / 2), v.scale(nu, -dy / 2)));
    this.#solid = Box(dx, dy, dz, { origin, zDir: w });
    return this;
  }

  /** Centered on the current plane, extruding along its normal. */
  cylinder(radius: number, height: number): this {
    this.#solid = Cylinder({
      radius,
      height,
      loc: { origin: this.#plane.origin, zDir: this.#plane.normal },
    });
    return this;
  }

  faces(selector: Selector): this {
    const solid = this.#requireSolid("faces");
    this.#pendingFaces = parseSelector(selector).select([...solid.faces()]) as Face[];
    this.#pendingEdges = [];
    return this;
  }

  edges(selector: Selector): this {
    const solid = this.#requireSolid("edges");
    this.#pendingEdges = parseSelector(selector).select([...solid.edges()]) as Edge[];
    this.#pendingFaces = [];
    return this;
  }

  /** Re-anchors the plane on the selected face (single face). */
  workplane(): this {
    const face = this.#pendingFaces[0];
    if (!face || face.normal === undefined) {
      throw new Error(
        'Workplane.workplane: select exactly one planar face first, e.g. .faces(">Z").',
      );
    }
    this.#plane = planeFrom(face.center, face.normal);
    return this;
  }

  /** Drills a hole at the plane origin, through the part (or `depth`). */
  hole(diameter: number, depth?: number): this {
    const solid = this.#requireSolid("hole");
    const { w } = this.#basis();
    const bbox = solid.meta().bbox;
    const diagonal = v.length(v.sub(bbox.max, bbox.min));
    const through = depth ?? diagonal;
    // start one unit before the face so the drill cap never leaves a sliver,
    // and end one unit past the far side (or the requested depth)
    const start = v.add(this.#plane.origin, v.scale(w, -(through + 1)));
    const drill = Cylinder({
      radius: diameter / 2,
      height: through + 2,
      loc: { origin: start, zDir: w },
    });
    this.#solid = solid.cut(drill);
    return this;
  }

  /** Fillets the pending edge selection (all edges if none selected). */
  fillet(radius: number): this {
    const solid = this.#requireSolid("fillet");
    this.#solid =
      this.#pendingEdges.length > 0
        ? solid.fillet(this.#pendingEdges, radius)
        : solid.fillet([], radius);
    return this;
  }

  /** M1: extrude a pending sketch. */
  extrude(_height: number): this {
    throw new Error("Workplane.extrude lands with M1 sketches.");
  }

  /** The underlying core-API shape. */
  val(): Solid | null {
    return this.#solid;
  }
}
