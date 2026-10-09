import { todo } from "../util";

export type PlaneName = "XY" | "YZ" | "XZ" | "front" | "back" | "left" | "right" | "top" | "bottom";

export type Selector = string;

/**
 * CadQuery-style fluent facade over the explicit core API.
 *
 * Thin by design: every method maps 1:1 onto a core op so the op log records
 * the same operations regardless of which style the caller used.
 */
export class Workplane {
  /** The plane this workplane is anchored to. */
  readonly plane: PlaneName | Selector;

  constructor(plane: PlaneName | Selector = "XY") {
    this.plane = plane;
  }

  box(_dx: number, _dy: number, _dz: number): this {
    return todo("Workplane.box");
  }

  cylinder(_radius: number, _height: number): this {
    return todo("Workplane.cylinder");
  }

  faces(_selector: Selector): this {
    return todo("Workplane.faces");
  }

  edges(_selector: Selector): this {
    return todo("Workplane.edges");
  }

  workplane(): this {
    return todo("Workplane.workplane");
  }

  hole(_diameter: number): this {
    return todo("Workplane.hole");
  }

  fillet(_radius: number): this {
    return todo("Workplane.fillet");
  }

  extrude(_height: number): this {
    return todo("Workplane.extrude");
  }

  /** Returns the underlying core-API shape. */
  val(): unknown {
    return todo("Workplane.val");
  }
}
