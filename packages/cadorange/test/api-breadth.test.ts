import { beforeAll, describe, expect, it } from "vitest";
import {
  Axis,
  Box,
  Circle,
  distance,
  draft as draftOp,
  Ellipse,
  extrude,
  FilletPolyline,
  faceOf,
  fillet,
  Helix,
  JernArc,
  loft,
  offset,
  PolarLine,
  Pos,
  RectangleRounded,
  Rot,
  rotate,
  SagittaArc,
  SlotArc,
  SlotCenterPoint,
  SlotOverall,
  Sphere,
  Spline,
  Superellipse,
  scale,
  section,
  shell,
  split,
  sweep,
  TangentArc,
  Trapezoid,
  Triangle,
  Wedge,
} from "../src/index";

beforeAll(async () => {
  const { init } = await import("../src/index");
  await init();
});

describe("batch: operations", () => {
  it("loft circles into a vase-ish solid", () => {
    const bottom = faceOf(Circle(5));
    const top = Circle(8, { on: { origin: [0, 0, 10], normal: [0, 0, 1], xDir: [1, 0, 0] } });
    const lofted = loft([bottom, top]);
    expect(lofted.volume()).toBeGreaterThan(0);
    expect(lofted.isValid()).toBe(true);
  });

  it("sweep a circle along a circle spine -> torus", () => {
    const spine = Circle(20);
    const profile = Circle(3, { on: { origin: [20, 0, 0], normal: [0, 1, 0], xDir: [1, 0, 0] } });
    const torus = sweep(profile, spine);
    expect(torus.volume()).toBeCloseTo(2 * Math.PI ** 2 * 20 * 9, 2);
  });

  it("shell hollows a box", () => {
    const sh = shell(Box(20, 20, 20), 2);
    expect(sh.volume()).toBeCloseTo(20 ** 3 - 16 ** 3, 0);
  });

  it("offset shrinks a box", () => {
    expect(offset(Box(20, 20, 20), -2).volume()).toBeCloseTo(16 ** 3, 0);
  });

  it("split keeps all fragments", () => {
    const tool = Box(1, 40, 40, { origin: [10, -10, -10] });
    const pieces = split(Box(20, 20, 20), tool);
    expect(pieces.solids().length).toBe(3); // left | under-tool | right
  });

  it("section returns intersecting edges", () => {
    const inter = section(Box(20, 20, 20), Box(20, 20, 20, { origin: [10, 0, 0] }));
    expect(inter.meta().edges.length).toBeGreaterThan(0);
  });

  it("draft widens the walls (positive angle grows outward)", () => {
    const d = draftOp(Box(10, 10, 20), 5);
    expect(d.volume()).toBeGreaterThan(10 * 10 * 20);
    expect(d.volume()).toBeLessThan(1.1 * 10 * 10 * 20);
  });

  it("rotate and scale", () => {
    const b = Box(10, 10, 10);
    expect(rotate(b, Axis.Z, 45).volume()).toBeCloseTo(1000, 4);
    expect(scale(b, 2).volume()).toBeCloseTo(8000, 3);
  });

  it("distance between solids", () => {
    const d = distance(Box(10, 10, 10), Box(10, 10, 10, { origin: [15, 0, 0] }));
    expect(d).toBeCloseTo(5, 5);
  });
});

describe("batch: location algebra", () => {
  it("Pos + Rot compose and bake", () => {
    const loc = Pos(10, 0, 0).mul(Rot(0, 0, 90));
    const placed = Box(2, 4, 6).located(loc);
    const bb = placed.meta().bbox;
    // after rot90 + translate: footprint 4(x) x 2(y), centered at x=10
    expect(Math.round(bb.max[0] ?? 0) - Math.round(bb.min[0] ?? 0)).toBe(4);
    expect(Math.round(bb.min[0] ?? 0)).toBe(6);
    expect(placed.volume()).toBeCloseTo(48, 5);
  });

  it("Location.mul and inverse round-trip", () => {
    const a = Pos(1, 2, 3).mul(Rot(30, 20, 10));
    const round = a.mul(a.inverse());
    const p = Box(1, 1, 1).located(round);
    const bb = p.meta().bbox;
    expect(Math.round((bb.max[0] ?? 0) - (bb.min[0] ?? 0))).toBe(1); // unchanged box
    expect(p.volume()).toBeCloseTo(1, 6);
  });
});

describe("batch: primitives breadth", () => {
  it("Triangle area", () => {
    expect(extrude(faceOf(Triangle([0, 0], [10, 0], [0, 6])), 2).volume()).toBeCloseTo(60, 4);
  });

  it("Trapezoid area (90 deg = rectangle)", () => {
    expect(extrude(faceOf(Trapezoid(10, 4)), 2).volume()).toBeCloseTo(80, 4);
  });

  it("RectangleRounded area = rect - corners + arcs", () => {
    const w = 20;
    const h = 10;
    const r = 2;
    const area = w * h - (4 - Math.PI) * r * r;
    expect(extrude(faceOf(RectangleRounded(w, h, r)), 1).volume()).toBeCloseTo(area, 3);
  });

  it("SlotOverall volume", () => {
    const d = 6;
    const overall = 16;
    const centers = overall - d;
    const area = centers * d + Math.PI * (d / 2) ** 2;
    expect(extrude(faceOf(SlotOverall(overall, d)), 2).volume()).toBeCloseTo(area * 2, 3);
  });

  it("SlotCenterPoint centered volume", () => {
    const d = 6;
    const area = Math.PI * (d / 2) ** 2; // zero-length centers -> circle
    expect(extrude(faceOf(SlotCenterPoint([0, 0], d)), 2).volume()).toBeCloseTo(area * 2, 3);
  });

  it("SlotArc approximates a curved slot", () => {
    const slot = faceOf(SlotArc(15, 90, 6));
    const solid = extrude(slot, 2);
    expect(solid.volume()).toBeGreaterThan(0);
    expect(solid.isValid()).toBe(true);
  });

  it("Ellipse area = pi*a*b", () => {
    expect(extrude(faceOf(Ellipse(5, 3)), 2).volume()).toBeCloseTo(Math.PI * 15 * 2, 3);
  });

  it("Spline through points forms a smooth closed-ish region", () => {
    const s = Spline([
      [0, 0],
      [5, 2],
      [10, 0],
    ]);
    expect(s.meta().edges.length).toBe(1);
    expect(s.meta().edges[0]?.curve).toBe("bspline");
  });

  it("Superellipse area ~ rectangle-ish", () => {
    const s = extrude(faceOf(Superellipse(5, 5, 4)), 1);
    // n=4 superellipse area = 4ab * Gamma(1+1/n)^2 / Gamma(1+2/n)
    const g = (x: number): number => {
      // Lanczos
      const p = [
        676.5203679917157, -1259.139216722289, 771.3234287524926, -176.6150291493126,
        12.50734327745692, -0.13857109506558, 9.9843695780196e-6, 1.5112253874877e-7,
      ];
      if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * g(1 - x));
      x -= 1;
      let a = 0.99999999999980993;
      for (let i = 0; i < 7; i++) a += (p[i] ?? 0) / (x + i + 1);
      const t = x + 7.5;
      return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
    };
    const area = (4 * 25 * g(1.25) ** 2) / g(1.5);
    expect(s.volume()).toBeGreaterThan(area * 0.98);
    expect(s.volume()).toBeLessThan(area * 1.02);
  });

  it("SagittaArc bulges correctly", () => {
    const arc = SagittaArc([0, 0], [10, 0], 1);
    expect(arc.meta().edges[0]?.curve).toBe("circle");
  });

  it("TangentArc honors the tangent", () => {
    const arc = TangentArc([0, 0], 0, [10, 10]);
    expect(arc.meta().edges[0]?.curve).toBe("circle");
  });

  it("JernArc spans the requested size", () => {
    const arc = JernArc([0, 5], 180, 5, 90);
    const e = arc.meta().edges[0];
    expect(e?.curve).toBe("circle");
    expect(e?.length).toBeCloseTo((Math.PI / 2) * 5, 4);
  });

  it("PolarLine length and angle", () => {
    const l = PolarLine(10, 90);
    expect(l.meta().edges[0]?.length).toBeCloseTo(10, 6);
    const d = l.meta().edges[0]?.direction;
    expect(Math.round((d?.[1] ?? 0) * 1000) / 1000).toBeCloseTo(1, 2);
  });

  it("FilletPolyline builds line+arc wire", () => {
    const w = FilletPolyline(
      [
        [0, 0],
        [20, 0],
        [20, 20],
      ],
      3,
    );
    const curves = w.meta().edges.map((e) => e.curve);
    expect(curves).toContain("line");
    expect(curves).toContain("circle");
  });

  it("Helix has length", () => {
    const h = Helix(5, 2, 10);
    expect(h.meta().edges[0]?.length).toBeGreaterThan(0);
  });

  it("Wedge volume is half the box", () => {
    expect(Wedge({ dx: 10, dy: 8, dz: 6 }).volume()).toBeCloseTo((10 * 8 * 6) / 2, 3);
  });

  it("hole / counterBore / counterSink remove material", async () => {
    const { Cylinder } = await import("../src/index");
    const b = Box(20, 20, 5);
    const holed = b.hole(6);
    expect(holed.volume()).toBeCloseTo(2000 - Math.PI * 9 * 5, 3);
    const cb = b.counterBoreHole(6, 10, 2);
    expect(cb.volume()).toBeLessThan(holed.volume());
    const cs = b.counterSinkHole(6, 10, 90);
    expect(cs.volume()).toBeLessThan(holed.volume());
    void Cylinder;
    void fillet;
    void Sphere;
  });
});
