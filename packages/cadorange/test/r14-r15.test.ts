import { beforeAll, describe, expect, it } from "vitest";
import {
  Axis,
  Bezier,
  Box,
  Circle,
  combineWires,
  EllipticalCenterArc,
  EllipticalStartArc,
  extrude,
  faceOf,
  init,
  Line,
  offsetWire,
  project,
  Rectangle,
} from "../src/index";

beforeAll(async () => {
  await init();
});

describe("R14: 2D wire offset", () => {
  it("inset rectangle loses exactly 2*t per side", () => {
    const inner = offsetWire(Rectangle(20, 10), -1, { join: "intersection" });
    const solid = extrude(faceOf(inner), 1);
    expect(solid.volume()).toBeCloseTo(18 * 8, 3);
  });

  it("the wall idiom: outer minus offset inner (build123d lego pattern)", () => {
    const outer = faceOf(Rectangle(48, 16));
    const walls = outer.cut(faceOf(offsetWire(Rectangle(48, 16), -1.2, { join: "intersection" })));
    // wall area = outer - inner rectangle
    expect(walls.area()).toBeCloseTo(48 * 16 - 45.6 * 13.6, 2);
  });

  it("arc join keeps the inset area within rounding of the sharp corner", () => {
    const inner = offsetWire(Rectangle(20, 10), -1, { join: "arc" });
    const solid = extrude(faceOf(inner), 1);
    // sharp-corner inset = 18*8 = 144; rounded corners shave (4 - pi)*r^2 ~ 0.86
    expect(solid.volume()).toBeGreaterThan(143);
    expect(solid.volume()).toBeLessThan(144.01);
  });
});

describe("R15: ellipse arcs, bezier, project", () => {
  it("ellipse arc spans the requested quarter", () => {
    const arc = EllipticalCenterArc([0, 0], 10, 5, 0, 90);
    const e = arc.meta().edges[0];
    expect(e?.curve).toBe("ellipse");
    // a=10 b=5: chord = hypot(10,5) ~ 11.18; quarter perimeter ~ 12.1
    expect(e?.length).toBeGreaterThan(11.1);
    expect(e?.length).toBeLessThan(12.5);
  });

  it("half ellipse + chord closes into the exact half-ellipse area", () => {
    const arc = EllipticalCenterArc([0, 0], 10, 5, 0, 180);
    const profile = faceOf(combineWires(arc, Line([-10, 0], [10, 0])));
    const solid = extrude(profile, 2);
    expect(solid.volume()).toBeCloseTo(((Math.PI * 10 * 5) / 2) * 2, 2);
  });

  it("EllipticalStartArc derives angles from points", () => {
    const arc = EllipticalStartArc([10, 0], [0, 5], 10, 5);
    const e = arc.meta().edges[0];
    expect(e?.curve === "ellipse" || e?.curve === "other").toBe(true);
    expect(e?.length).toBeGreaterThan(11.1); // same quarter span as above
    expect(e?.length).toBeLessThan(12.5);
  });

  it("bezier quad stays inside its hull", () => {
    const b = Bezier([
      [0, 0],
      [5, 8],
      [10, 0],
    ]);
    const e = b.meta().edges[0];
    // kernel may classify bezier edges as "other" — length bounds are the contract
    expect(e?.length).toBeGreaterThan(10.05); // above the chord
    expect(e?.length).toBeLessThan(2 * Math.hypot(5, 8));
  });

  it("project drops a wire onto a face along a direction", () => {
    const target = Box(30, 30, 5);
    const top = target.faces().filterBy(Axis.Z).sortBy(Axis.Z).last();
    if (!top) throw new Error("no top face");
    const projected = project(Circle(8), top, { direction: [0, 0, 1] });
    expect(projected.meta().edges.length).toBeGreaterThan(0);
  });
});
