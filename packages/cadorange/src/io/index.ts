/**
 * Import/export. `exportShape(shape, path)` writes to disk in Node; in the
 * browser (or for in-memory pipelines) call the format functions directly.
 */

import { getKernel } from "../kernel/occt";
import { record } from "../record";
import type { Shape } from "../topo";
import { type Solid, solidFromKernel } from "../topo";

export type ExportFormat = "step" | "stl" | "glb";

export function exportStep(s: Shape): Uint8Array {
  return getKernel().exportStep(s.handle);
}

export function exportStl(s: Shape, tolerance?: number): string {
  return getKernel().exportStl(s.handle, tolerance);
}

export function exportGlb(s: Shape): Uint8Array {
  return getKernel().exportGlb(s.handle);
}

export function importStep(data: Uint8Array | string): Promise<Solid> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Promise.resolve(
    record("importStep", { bytes: bytes.length }, () =>
      solidFromKernel(getKernel().importStep(bytes)),
    ),
  );
}

function formatFor(path: string): ExportFormat {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "step" || ext === "stp" || ext === "stl" || ext === "glb") {
    return ext === "stp" ? "step" : (ext as ExportFormat);
  }
  throw new Error(
    `Unsupported export extension in ${JSON.stringify(path)} — use .step, .stl or .glb.`,
  );
}

/** Writes a shape to disk (Node). Extension picks the format. */
export async function exportShape(
  s: Shape,
  path: string,
  opts?: { tolerance?: number },
): Promise<void> {
  const format = formatFor(path);
  const payload =
    format === "step"
      ? exportStep(s)
      : format === "glb"
        ? exportGlb(s)
        : exportStl(s, opts?.tolerance);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, payload);
}
