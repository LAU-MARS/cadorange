import { beforeAll, describe, expect, it } from "vitest";
import {
  Axis,
  Box,
  Circle,
  extrude,
  faceOf,
  Polygon,
  RadiusArc,
  Rectangle,
  RegularPolygon,
  revolve,
  SlotCenterToCenter,
  ThreePointArc,
} from "../src/index";

beforeAll(async () => {
  const { init } = await import("../src/index");
  await init();
});

describe("sketch primitives", () => {
  it("circle extrudes to pi*r^2*h along its plane normal", () => {
    expect(extrude(Circle(5), 10).volume()).toBeCloseTo(Math.PI * 25 * 10, 4);
  });

  it("rectangle extrudes to w*h*t", () => {
    expect(extrude(Rectangle(8, 6), 3).volume()).toBeCloseTo(8 * 6 * 3, 5);
  });

  it("regular polygon area matches n/2 * r^2 * sin(2pi/n)", () => {
    const n = 6;
    const hex = extrude(RegularPolygon(8, n), 2);
    const area = (n / 2) * 64 * Math.sin((2 * Math.PI) / n);
    expect(hex.volume()).toBeCloseTo(area * 2, 3);
  });

  it("polygon through given points", () => {
    const tri = extrude(
      Polygon([
        [0, 0],
        [10, 0],
        [0, 6],
      ]),
      4,
    );
    expect(tri.volume()).toBeCloseTo(0.5 * 10 * 6 * 4, 4);
  });

  it("slot cross-section is stadium-shaped", () => {
    const d = 6;
    const l = 10; // center-to-center
    const slot = extrude(SlotCenterToCenter(l, d), 5);
    const area = l * d + Math.PI * (d / 2) ** 2;
    expect(slot.volume()).toBeCloseTo(area * 5, 3);
  });

  it("three-point arc hits its mid point", () => {
    // quarter-ish arc from (10,0) through (7.07,7.07) to (0,10): radius 10
    const wire = ThreePointArc([10, 0], [Math.SQRT1_2 * 10, Math.SQRT1_2 * 10], [0, 10]);
    const arc = wire.meta().edges.find((e) => e.curve === "circle");
    expect(arc?.radius).toBeCloseTo(10, 6);
    expect(wire.meta().edges.length).toBe(1);
  });

  it("radius arc connects the endpoints with the given radius", () => {
    const wire = RadiusArc([0, 0], [10, 0], 5); // semicircle
    const arc = wire.meta().edges.find((e) => e.curve === "circle");
    expect(arc?.radius).toBeCloseTo(5, 6);
    expect(wire.meta().edges[0]?.length).toBeCloseTo(Math.PI * 5, 4);
  });

  it("faceOf caps a wire and supports holes", () => {
    const plate = extrude(faceOf(Circle(10), [Circle(4)]), 2);
    expect(plate.volume()).toBeCloseTo((Math.PI * 100 - Math.PI * 16) * 2, 3);
  });

  it("revolve a rectangle into a tube", () => {
    // radial cross-section in the XZ plane (must contain the axis), revolved around Z
    const section = Rectangle(2, 4, {
      on: { origin: [0, 0, 0], normal: [0, -1, 0], xDir: [1, 0, 0] },
      at: [4, 0],
    });
    const tube = revolve(section, Axis.Z);
    expect(tube.volume()).toBeCloseTo(Math.PI * (25 - 9) * 4, 3);
  });

  it("sketch on a face of a solid (boxes_on_faces shape)", () => {
    // rect extruded and fused onto every face of a cube, like the build123d example
    const b = Box(3, 3, 3);
    const rectFace = faceOf(Rectangle(1, 2));
    const b2 = extrude(rectFace, 0.1);
    let part = b;
    for (const f of b.faces()) {
      if (!f.normal) continue;
      const onFace = extrude(faceOf(Rectangle(1, 2, { on: f })), 0.1, { dir: f.outerNormal() });
      part = part.fuse(onFace);
    }
    // 6 faces * 0.2 added (0.1 both sides of the plane)
    expect(part.volume()).toBeCloseTo(27 + 6 * 1 * 2 * 0.1, 2);
    void rectFace;
    void b2;
  });
});
