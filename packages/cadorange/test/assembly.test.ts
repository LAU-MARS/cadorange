import { beforeAll, describe, expect, it } from "vitest";
import {
  Box,
  Cylinder,
  compound,
  exportStepAssembly,
  importStepAssembly,
  init,
} from "../src/index";

beforeAll(async () => {
  await init();
});

describe("STEP assembly round-trip (build123d import_step/export_step semantics)", () => {
  it("writes and reads back an assembly with names, colors and transforms", () => {
    const plate = Box(80, 60, 10);
    const pin = Cylinder({ radius: 4, height: 30, loc: { origin: [40, 30, 10] } });

    // kernel rule: a node carries EITHER a shape OR children (assembly vs leaf)
    const bytes = exportStepAssembly([
      { name: "plate", color: "#f97316", transform: null, solid: plate },
      {
        name: "pins",
        color: null,
        transform: null,
        children: [{ name: "pin-1", color: "#22c55e", transform: null, solid: pin }],
      },
    ]);

    const doc = importStepAssembly(bytes);
    expect(doc.shapes.length).toBe(2);
    expect(doc.shapes[0]?.volume()).toBeCloseTo(80 * 60 * 10, 3);
    expect(doc.shapes[1]?.volume()).toBeCloseTo(Math.PI * 16 * 30, 3);

    expect(doc.tree[0]?.name).toBe("plate");
    expect(doc.tree[0]?.color?.toLowerCase()).toBe("#f97316"); // STEP normalizes hex to uppercase
    const pinsNode = doc.tree[1];
    expect(pinsNode?.name).toBe("pins");
    const pinNode = pinsNode?.children?.[0];
    expect(pinNode?.name).toBe("pin-1");
    expect(pinNode?.solid?.volume()).toBeCloseTo(Math.PI * 16 * 30, 3);
  });

  it("world positions survive the instance transforms", () => {
    const pin = Cylinder({ radius: 4, height: 30, loc: { origin: [0, 0, 0] } });
    const bytes = exportStepAssembly([
      {
        name: "a",
        color: null,
        // translate by (40, 30, 10): identity rotation, row-major 3x4
        transform: [1, 0, 0, 40, 0, 1, 0, 30, 0, 0, 1, 10],
        solid: pin,
      },
    ]);
    const doc = importStepAssembly(bytes);
    const solid = doc.shapes[0];
    expect(solid?.meta().bbox.min[0]).toBeCloseTo(-4 + 40, 3);
    expect(solid?.meta().bbox.min[2]).toBeCloseTo(10, 3);
  });

  it("leaves of a second read stay valid (adopted eagerly)", () => {
    const a = importStepAssembly(
      exportStepAssembly([{ name: "x", color: null, transform: null, solid: Box(5, 5, 5) }]),
    );
    const b = importStepAssembly(
      exportStepAssembly([{ name: "y", color: null, transform: null, solid: Box(6, 6, 6) }]),
    );
    // first document's adopted solids must still work after the second read
    expect(a.shapes[0]?.volume()).toBeCloseTo(125, 4);
    expect(b.shapes[0]?.volume()).toBeCloseTo(216, 4);
    void compound;
  });
});
