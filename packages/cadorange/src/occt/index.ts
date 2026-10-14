/**
 * `cadorange/occt` — the supported escape hatch to the raw kernel
 * (ADR-0001: the cadorange↔occt.ts relationship mirrors build123d↔OCP —
 * coexistence, not wrapping; users may dive down at any time).
 *
 * - `getOcc()` — the process-wide OccSession (after `init()`), including
 *   `occ.module` with the 152 raw OCCT classes (gp, Geom, TopTools,
 *   ShapeUpgrade, ...) registered by occt.ts.
 * - `shape.wrapped` / `asOccShape()` — the high-level kernel handle behind
 *   any cadorange Shape (lifecycle managed by cadorange; do not dispose).
 * - `toRaw(shape)` / `fromRaw(raw)` — bridge to `Raw_TopoDS_Shape`.
 *   RAW OBJECTS ARE JS-OWNED: call `.delete()` when done — that discipline
 *   is yours, not cadorange's.
 */

import type { OccSession, OccShape } from "occt.ts";
import { getKernel, getOccSession } from "../kernel/occt";
import type { Shape } from "../topo";
import { Solid } from "../topo";

export type { OccSession, OccShape };

/**
 * Structural stand-in for occt.ts's internal `Raw_TopoDS_Shape` (its
 * raw.generated module is not an exported subpath — tracked as occt.ts
 * requirement R16). The members below are the stable surface cadorange
 * relies on.
 */
export interface RawShape {
  /** Raw-layer members keep OCCT's PascalCase; booleans map to JS booleans. */
  IsNull(): boolean;
  ShapeType(): number;
  IsSame(other: RawShape): boolean;
  IsEqual(other: RawShape): boolean;
  delete(): void;
}

/** The live OccSession — `getOcc().module` reaches the raw OCCT classes. */
export function getOcc(): OccSession {
  return getOccSession();
}

/** Type-narrows `shape.wrapped` (typed `unknown` on the core side) to OccShape. */
export function asOccShape(wrapped: unknown): OccShape {
  return wrapped as OccShape;
}

/** Bridges a cadorange Shape down to a raw TopoDS_Shape. JS-owned — delete() it yourself. */
export function toRaw(shape: Shape): RawShape {
  return getOccSession().toRaw(asOccShape(shape.wrapped)) as unknown as RawShape;
}

/** Bridges a raw TopoDS_Shape back into a cadorange Solid (session-adopted copy). */
export function fromRaw(raw: RawShape): Solid {
  return new Solid(getKernel().adoptWrapped(getOccSession().fromRaw(raw as never) as OccShape));
}
