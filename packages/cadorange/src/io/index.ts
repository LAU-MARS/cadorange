import type { Shape } from "../topo";
import { todo } from "../util";

export type ExportFormat = "step" | "stl" | "glb" | "brep";

/** Writes a shape to disk. Extension picks the format; `part.export(...)` delegates here. */
export async function exportShape(
  _s: Shape,
  _path: string,
  _opts?: { tolerance?: number },
): Promise<void> {
  todo("exportShape");
}

export async function importStep(_data: Uint8Array | string): Promise<Shape> {
  todo("importStep");
}
