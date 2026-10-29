/**
 * Import/export. `exportShape(shape, path)` writes to disk in Node; in the
 * browser (or for in-memory pipelines) call the format functions directly.
 */

import { getKernel } from "../kernel/occt";
import { record } from "../record";
import type { Shape } from "../topo";
import { Solid, solidFromKernel } from "../topo";

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

export function exportBrep(s: Shape): Uint8Array {
  return getKernel().exportBrep(s.handle);
}

export function exportObj(s: Shape): string {
  return getKernel().exportObj(s.handle);
}

/**
 * An assembly-tree node. The solid is in the NODE'S LOCAL coordinates and
 * `transform` is the instance placement relative to the PARENT node
 * (build123d `import_step`/`export_step` semantics; occt.ts 2.0.0 makes
 * `read(write(tree)) === tree` the kernel contract).
 */
export interface AssemblyNode {
  name: string | null;
  /** "#RRGGBB" or null. On export, group colors cascade to uncolored leaves. */
  color: string | null;
  /** 12 numbers, row-major 3x4 (rotation + translation); null = identity. */
  transform: readonly number[] | null;
  /** Leaf: the solid in node-local coordinates. */
  solid?: Solid;
  children?: AssemblyNode[];
}

export interface StepAssembly {
  tree: AssemblyNode[];
  /** All leaves, in document order — world-positioned, ready to model on. */
  shapes: Solid[];
}

/**
 * Imports a STEP file as an assembly document (names, colors, instance
 * transforms, nested structure). Leaves come back world-positioned and node
 * `transform`s are parent-relative (occt.ts 2.0.0). Use `importStep` for the
 * flattened single-shape view.
 */
export function importStepAssembly(data: Uint8Array | string): StepAssembly {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return record("importStepAssembly", { bytes: bytes.length }, () => {
    const doc = getKernel().readStepDocument(bytes);
    const shapes = doc.shapes.map((h) => new Solid(h));
    type RawNode = {
      name: string | null;
      color: string | null;
      transform: number[] | null;
      shape?: number;
      children?: RawNode[];
    };
    const build = (nodes: readonly RawNode[]): AssemblyNode[] =>
      nodes.map((n) => ({
        name: n.name ?? null,
        color: n.color ?? null,
        transform: n.transform ?? null,
        ...(n.shape !== undefined && shapes[n.shape] ? { solid: shapes[n.shape] as Solid } : {}),
        ...(n.children ? { children: build(n.children) } : {}),
      }));
    const tree = build(doc.tree);
    return { tree, shapes };
  });
}

/**
 * Writes an assembly STEP (build123d `export_step` semantics with
 * labels/colors). Node solids stay in local coordinates and every transform —
 * top-level included — is written as the STEP instance placement (occt.ts
 * 2.0.0 round-trips both). Colors live on shape nodes in STEP: a group's
 * color cascades down to its uncolored leaves.
 */
export function exportStepAssembly(nodes: readonly AssemblyNode[]): Uint8Array {
  const convert = (n: AssemblyNode, inherited: string | null): Record<string, unknown> => {
    const color = n.color ?? inherited;
    const out: Record<string, unknown> = {};
    if (n.name !== null) out.name = n.name;
    if (n.transform !== null) out.transform = [...n.transform];
    if (n.solid) {
      if (color !== null) out.color = color;
      out.shape = n.solid.handle;
    }
    if (n.children) out.children = n.children.map((c) => convert(c, color));
    return out;
  };
  return getKernel().writeStepDocument(nodes.map((n) => convert(n, null)) as never);
}

export function importBrep(data: Uint8Array | string): Promise<Solid> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Promise.resolve(
    record("importBrep", { bytes: bytes.length }, () =>
      solidFromKernel(getKernel().importBrep(bytes)),
    ),
  );
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
