/**
 * Import/export. `exportShape(shape, path)` writes to disk in Node; in the
 * browser (or for in-memory pipelines) call the format functions directly.
 */

import {
  identity34,
  type Mat34,
  mat3ToAxisAngle,
  mat34Rotation,
  mat34Translation,
  mul34,
} from "../geom";
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
 * An assembly-tree node (build123d `import_step` semantics: names, colors
 * and instance transforms survive the round-trip). Leaves carry the
 * world-positioned solid directly — walk the tree and model on.
 */
export interface AssemblyNode {
  name: string | null;
  /** "#RRGGBB" or null. */
  color: string | null;
  /** 12 numbers, row-major 3x4 (rotation + translation); null = identity. */
  transform: readonly number[] | null;
  /** Leaf: the world-positioned solid. */
  solid?: Solid;
  children?: AssemblyNode[];
}

export interface StepAssembly {
  tree: AssemblyNode[];
  /** All leaves, in document order (same solids referenced by the tree). */
  shapes: Solid[];
}

/**
 * Imports a STEP file as an assembly document (names, colors, instance
 * transforms, nested structure). Use `importStep` for the flattened
 * single-shape view.
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
    // bake accumulated instance transforms onto leaves (R17 workaround): the
    // kernel's documentShape claims world-positioning but drops instance
    // transforms — build123d's import_step applies them, so we do too
    const bake = (solid: Solid, m: Mat34): Solid => {
      if (m.every((x, i) => x === identity34()[i])) {
        return solid;
      }
      const { axis, angleDegrees } = mat3ToAxisAngle(mat34Rotation(m));
      let handle = solid.handle;
      if (Math.abs(angleDegrees) > 1e-9) {
        handle = getKernel().rotate(handle, axis, angleDegrees);
      }
      const t = mat34Translation(m);
      if (t.some((x) => Math.abs(x) > 1e-12)) {
        handle = getKernel().translate(handle, t);
      }
      return new Solid(handle);
    };
    const build = (nodes: readonly RawNode[], parent: Mat34): AssemblyNode[] =>
      nodes.map((n) => {
        const m = n.transform ? mul34(parent, n.transform) : parent;
        return {
          name: n.name,
          color: n.color,
          transform: n.transform,
          ...(n.shape !== undefined && shapes[n.shape]
            ? { solid: bake(shapes[n.shape] as Solid, m) }
            : {}),
          ...(n.children ? { children: build(n.children, m) } : {}),
        };
      });
    const tree = build(doc.tree, identity34());
    return { tree, shapes };
  });
}

/**
 * Writes an assembly STEP (build123d `export_step` semantics with
 * labels/colors). Instance transforms are BAKED into the leaves before
 * writing (rotate + translate), matching what importStepAssembly reads back
 * (see R17) — leaf solids stay untouched; baked copies are written.
 */
export function exportStepAssembly(nodes: readonly AssemblyNode[]): Uint8Array {
  const bake = (solid: Solid, m: Mat34): Solid => {
    if (
      !m ||
      m.every((x) => Math.abs(x) < 1e-12) ||
      (m.length === 12 &&
        m[0] === 1 &&
        m[5] === 1 &&
        m[10] === 1 &&
        m[1] === 0 &&
        m[2] === 0 &&
        m[3] === 0 &&
        m[4] === 0 &&
        m[6] === 0 &&
        m[7] === 0 &&
        m[8] === 0 &&
        m[9] === 0 &&
        m[11] === 0)
    ) {
      return solid;
    }
    const { axis, angleDegrees } = mat3ToAxisAngle(mat34Rotation(m));
    let handle = solid.handle;
    if (Math.abs(angleDegrees) > 1e-9) {
      handle = getKernel().rotate(handle, axis, angleDegrees);
    }
    const t = mat34Translation(m);
    if (t.some((x) => Math.abs(x) > 1e-12)) {
      handle = getKernel().translate(handle, t);
    }
    return new Solid(handle);
  };
  const convert = (n: AssemblyNode): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (n.name !== null) out.name = n.name;
    if (n.color !== null) out.color = n.color;
    if (n.solid) out.shape = bake(n.solid, (n.transform ?? identity34()) as Mat34).handle;
    if (n.children) out.children = n.children.map(convert);
    return out;
  };
  return getKernel().writeStepDocument(nodes.map(convert) as never);
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
