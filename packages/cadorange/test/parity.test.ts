/**
 * Parity: every case in parity/cases.json runs against cadorange and is
 * compared with the Python build123d golden (parity/golden/*.json, produced by
 * parity/gen_golden.py). "对标" is measured here — a case passes when both
 * kernels agree within tolerance.
 *
 * Cases without a golden file are skipped (goldens regenerate on a machine
 * with build123d installed; CI runs parity as a manual job).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Solid } from "../src/index";
import { Axis, Box, Cone, Cylinder, chamfer, fillet, init, Sphere, Torus } from "../src/index";

const PARITY_DIR = join(import.meta.dirname, "..", "..", "..", "parity");

interface CaseOp {
  op: string;
  id: string;
  target?: string;
  tool?: string;
  origin?: [number, number, number];
  [k: string]: unknown;
}

interface Case {
  name: string;
  ops: CaseOp[];
  result: string;
  /** Per-case tolerance overrides for known kernel behavior differences
   *  (each points at a docs/occt-requirements.md R-number). */
  bboxTolerance?: number;
  facesTolerance?: number;
  edgesTolerance?: number;
}

interface Golden {
  name: string;
  metrics: {
    volume: number;
    area: number;
    bboxMin: number[];
    bboxMax: number[];
    faces: number;
    edges: number;
    valid: boolean;
  };
}

function runCase(c: Case): Solid {
  const shapes = new Map<string, Solid>();
  for (const o of c.ops) {
    const origin = o.origin as [number, number, number] | undefined;
    const loc = origin ? { origin } : undefined;
    switch (o.op) {
      case "box":
        shapes.set(o.id, Box(o.dx as number, o.dy as number, o.dz as number, loc));
        break;
      case "cylinder":
        shapes.set(o.id, Cylinder({ radius: o.radius as number, height: o.height as number, loc }));
        break;
      case "sphere":
        shapes.set(o.id, Sphere({ radius: o.radius as number, loc }));
        break;
      case "cone":
        shapes.set(
          o.id,
          Cone({
            radius1: o.radius1 as number,
            radius2: o.radius2 as number,
            height: o.height as number,
            loc,
          }),
        );
        break;
      case "torus":
        shapes.set(
          o.id,
          Torus({ radius1: o.radius1 as number, radius2: o.radius2 as number, loc }),
        );
        break;
      case "cut":
      case "fuse":
      case "common": {
        const a = shapes.get(o.target as string) as Solid;
        const b = shapes.get(o.tool as string) as Solid;
        shapes.set(o.id, o.op === "cut" ? a.cut(b) : o.op === "fuse" ? a.fuse(b) : a.common(b));
        break;
      }
      case "filletZ": {
        const part = shapes.get(o.target as string) as Solid;
        shapes.set(o.id, fillet(part, part.edges().filterBy(Axis.Z), o.radius as number));
        break;
      }
      case "chamferZ": {
        const part = shapes.get(o.target as string) as Solid;
        shapes.set(o.id, chamfer(part, part.edges().filterBy(Axis.Z), o.distance as number));
        break;
      }
      default:
        throw new Error(`parity: unknown op ${o.op}`);
    }
  }
  return shapes.get(c.result) as Solid;
}

const cases: Case[] = JSON.parse(readFileSync(join(PARITY_DIR, "cases.json"), "utf8")).cases;

beforeAll(async () => {
  await init();
});

describe("parity vs build123d", () => {
  for (const c of cases) {
    it(c.name, () => {
      const goldenPath = join(PARITY_DIR, "golden", `${c.name}.json`);
      if (!existsSync(goldenPath)) {
        return; // goldens regenerate only where build123d is installed
      }
      const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Golden;
      const part = runCase(c);
      const d = part.describe();
      const m = golden.metrics;

      // analytic surfaces agree to floating-point noise; blends (fillet/chamfer)
      // may differ slightly across OCCT builds
      const relTol = /fillet|chamfer/.test(c.name) ? 1e-3 : 1e-4;
      expect(Math.abs(d.volume - m.volume) / Math.abs(m.volume)).toBeLessThan(relTol);
      expect(Math.abs(d.area - m.area) / Math.abs(m.area)).toBeLessThan(relTol);

      const bboxTol = c.bboxTolerance ?? 1e-4;
      for (let i = 0; i < 3; i++) {
        expect(Math.abs((d.bbox.min[i] ?? 0) - (m.bboxMin[i] ?? 0))).toBeLessThan(bboxTol);
        expect(Math.abs((d.bbox.max[i] ?? 0) - (m.bboxMax[i] ?? 0))).toBeLessThan(bboxTol);
      }

      // sub-shape counting must agree exactly now that booleans unify and
      // describe() enumeration is TopExp-aligned (occt.ts >= 0.10.0)
      expect(Math.abs(d.faces - m.faces)).toBeLessThanOrEqual(c.facesTolerance ?? 0);
      expect(Math.abs(d.edges - m.edges)).toBeLessThanOrEqual(c.edgesTolerance ?? 0);
      expect(d.valid).toBe(m.valid);
    });
  }
});
