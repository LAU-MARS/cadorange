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
import {
  Axis,
  Box,
  Circle,
  Cone,
  Cylinder,
  chamfer,
  compound,
  Ellipse,
  exportStepAssembly,
  extrude,
  faceOf,
  fillet,
  importStepAssembly,
  init,
  loft,
  mirror,
  offset,
  Rectangle,
  RegularPolygon,
  revolve,
  SlotCenterToCenter,
  Sphere,
  shell,
  Torus,
  Wedge,
} from "../src/index";

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
  verticesTolerance?: number;
  volumeTolerance?: number;
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
    vertices: number;
    concaveEdges?: number;
    convexEdges?: number;
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
        shapes.set(
          o.id,
          chamfer(
            part,
            part.edges().filterBy(Axis.Z),
            o.distance as number,
            o.length2 as number | undefined,
          ),
        );
        break;
      }
      case "polygonR": {
        shapes.set(o.id, RegularPolygon(o.radius as number, o.sides as number));
        break;
      }
      case "sketchSlot": {
        shapes.set(o.id, SlotCenterToCenter(o.length as number, o.diameter as number));
        break;
      }
      case "rectOnXZ": {
        const [u, vv] = (o.at as [number, number] | undefined) ?? [0, 0];
        shapes.set(
          o.id,
          Rectangle(o.width as number, o.height as number, {
            on: { origin: [0, 0, 0], normal: [0, -1, 0], xDir: [1, 0, 0] },
            at: [u, vv],
          }),
        );
        break;
      }
      case "extrudeSketch": {
        shapes.set(o.id, extrude(shapes.get(o.target as string) as Solid, o.amount as number));
        break;
      }
      case "revolveSketch": {
        shapes.set(
          o.id,
          revolve(
            shapes.get(o.target as string) as Solid,
            Axis.Z,
            (o.angle as number | undefined) ?? 360,
          ),
        );
        break;
      }
      case "padOnFace": {
        const base = shapes.get(o.target as string) as Solid;
        const top = base.faces().filterBy(Axis.Z).sortBy(Axis.Z).last();
        if (!top) throw new Error("padOnFace: no top face");
        const pad = extrude(
          faceOf(Rectangle(o.width as number, o.height as number, { on: top })),
          o.amount as number,
          {
            dir: top.outerNormal(),
          },
        );
        shapes.set(o.id, base.fuse(pad));
        break;
      }
      case "assemblyRoundtrip": {
        const plate = Box(80, 60, 10);
        const pin = Cylinder({ radius: 4, height: 30, loc: { origin: [40, 30, 10] } });
        const bytes = exportStepAssembly([
          { name: "plate", color: null, transform: null, solid: plate },
          {
            name: "pins",
            color: null,
            transform: null,
            children: [{ name: "pin-1", color: null, transform: null, solid: pin }],
          },
        ]);
        const doc = importStepAssembly(bytes);
        shapes.set(o.id, compound(doc.shapes));
        break;
      }
      case "offsetSolid": {
        shapes.set(o.id, offset(shapes.get(o.target as string) as Solid, o.distance as number));
        break;
      }
      case "sketchCircle": {
        shapes.set(o.id, Circle(o.radius as number));
        break;
      }
      case "sketchCircleAt": {
        shapes.set(
          o.id,
          Circle(o.radius as number, {
            on: {
              origin: o.origin as [number, number, number],
              normal: [0, 0, 1],
              xDir: [1, 0, 0],
            },
          }),
        );
        break;
      }
      case "loftSketch": {
        const parts = (o.parts as string[]).map((id) => shapes.get(id) as Solid);
        shapes.set(o.id, loft(parts));
        break;
      }
      case "shellOp": {
        shapes.set(o.id, shell(shapes.get(o.target as string) as Solid, o.thickness as number));
        break;
      }
      case "holeOp": {
        shapes.set(o.id, (shapes.get(o.target as string) as Solid).hole(o.diameter as number));
        break;
      }
      case "wedge": {
        shapes.set(o.id, Wedge({ dx: o.dx as number, dy: o.dy as number, dz: o.dz as number }));
        break;
      }
      case "sketchEllipse": {
        shapes.set(o.id, Ellipse(o.major as number, o.minor as number));
        break;
      }
      case "mirror": {
        const [ox, oy, oz, nx, ny, nz] = o.plane as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        shapes.set(
          o.id,
          mirror(shapes.get(o.target as string) as Solid, {
            plane: { origin: [ox, oy, oz], normal: [nx, ny, nz] },
          }),
        );
        break;
      }
      case "compound": {
        const parts = (o.parts as string[]).map((id) => shapes.get(id) as Solid);
        shapes.set(o.id, compound(parts));
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
      const volTol = c.volumeTolerance ?? relTol * Math.abs(m.volume);
      expect(Math.abs(d.volume - m.volume)).toBeLessThan(volTol);
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
      expect(Math.abs(d.vertices - m.vertices)).toBeLessThanOrEqual(c.verticesTolerance ?? 0);
      if (m.concaveEdges !== undefined) {
        expect(part.edges().filterBy("concave").count()).toBe(m.concaveEdges);
      }
      if (m.convexEdges !== undefined) {
        expect(part.edges().filterBy("convex").count()).toBe(m.convexEdges);
      }
      expect(d.valid).toBe(m.valid);
    });
  }
});
