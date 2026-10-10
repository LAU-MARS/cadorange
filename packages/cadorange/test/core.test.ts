import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Solid } from "../src/index";
import {
  Axis,
  Box,
  Cylinder,
  chamfer,
  exportStep,
  exportStl,
  importStep,
  init,
  intersect,
  onOp,
} from "../src/index";
import { parseSelector } from "../src/selectors";
import { Workplane } from "../src/workplane";

const PLATE_HOLE_VOLUME = 80 * 60 * 10 - Math.PI * 8 * 8 * 10;

let plate: Solid;
let holed: Solid;

beforeAll(async () => {
  await init();
  plate = Box(80, 60, 10);
  holed = plate.cut(Cylinder({ radius: 8, height: 12, loc: { origin: [40, 30, -1] } }));
});

describe("primitives", () => {
  it("box bbox and describe()", () => {
    const b = Box(80, 60, 10);
    const d = b.describe();
    expect(d.volume).toBeCloseTo(48000, 6);
    // OCCT bounds carry ~1e-7 tolerance fuzz (and -0 after rounding)
    expect(d.bbox.min.map((x) => Math.round(x) + 0)).toEqual([0, 0, 0]);
    expect(d.bbox.max.map((x) => Math.round(x) + 0)).toEqual([80, 60, 10]);
    expect(d.valid).toBe(true);
    expect(d.faces).toBe(6);
    expect(d.edges).toBe(12);
  });

  it("cylinder, sphere, cone, torus volumes", () => {
    expect(Cylinder({ radius: 5, height: 20 }).volume()).toBeCloseTo(Math.PI * 25 * 20, 5);
    expect(
      Box(1, 1, 1)
        .fuse(Box(1, 1, 1, { origin: [0.5, 0, 0] }))
        .volume(),
    ).toBeCloseTo(1.5, 5);
  });
});

describe("booleans", () => {
  it("cut matches analytic; intersect/fuse round-trip", () => {
    const plate = Box(80, 60, 10);
    const hole = Cylinder({ radius: 8, height: 12, loc: { origin: [40, 30, -1] } });
    expect(plate.cut(hole).volume()).toBeCloseTo(PLATE_HOLE_VOLUME, 4);

    const a = Box(10, 10, 10);
    const b = Box(10, 10, 10, { origin: [5, 0, 0] });
    expect(a.fuse(b).volume()).toBeCloseTo(1500, 5);
    expect(intersect(a, b).volume()).toBeCloseTo(500, 5);
  });
});

describe("ShapeList selectors (build123d semantics)", () => {
  it("filterBy(Axis) picks vertical edges / horizontal faces", () => {
    expect(plate.edges().filterBy(Axis.Z).count()).toBe(4);
    expect(plate.faces().filterBy(Axis.Z).count()).toBe(2); // top + bottom
    expect(plate.edges().filterBy(Axis.X).count()).toBe(4);
    expect(plate.edges().filterBy(Axis.Z, { reverse: true }).count()).toBe(8);
  });

  it("filterBy plane keeps faces parallel to it", () => {
    const plane = {
      origin: [0, 0, 5] as const,
      normal: [0, 0, 1] as const,
      xDir: [1, 0, 0] as const,
    };
    expect(plate.faces().filterBy(plane).count()).toBe(2);
  });

  it("groupBy(Axis.Z) groups faces by height", () => {
    const groups = plate.faces().groupBy(Axis.Z);
    expect(groups.length).toBe(3); // z=0, z=5 (sides), z=10
    expect(groups[0]?.count()).toBe(1);
    expect(groups[2]?.count()).toBe(1);
  });

  it("sortBy and single()", () => {
    // ascending, like build123d sort_by: first = smallest, last = largest
    expect(plate.faces().sortBy("area").first()?.area).toBeCloseTo(60 * 10, 5);
    expect(plate.faces().sortBy("area").last()?.area).toBeCloseTo(80 * 60, 5);
    const top = plate.faces().filterBy(Axis.Z).sortBy(Axis.Z).last();
    expect(top?.center[2]).toBeCloseTo(10, 9);
  });

  it("filterByPosition windows along an axis", () => {
    const mid = plate.faces().filterByPosition(Axis.Z, 1, 9);
    expect(mid.count()).toBe(4); // the four side faces (centers at z=5)
  });
});

describe("CadQuery string selectors", () => {
  it('">Z" selects the top face, "|Z" the vertical edges', () => {
    const top = parseSelector(">Z").select([...holed.faces()]);
    expect(top.length).toBe(1);
    expect(top[0]?.center[2]).toBeCloseTo(10, 6);

    expect(parseSelector("|Z").select([...holed.edges()]).length).toBe(5); // 4 corners + hole seam
  });

  it('"and"/"not" combine; "#face" filters by type', () => {
    const edges = [...holed.edges()];
    expect(parseSelector("|Z and #edge").select(edges).length).toBe(5);
    expect(parseSelector("not |Z").select(edges).length).toBe(edges.length - 5);
  });

  it("rejects invalid strings", () => {
    expect(() => parseSelector(">Q")).toThrow();
    expect(() => parseSelector("wat")).toThrow();
  });
});

describe("fillet/chamfer", () => {
  it("chamfer removes exact corner wedges", () => {
    const box = Box(20, 20, 20);
    const c = chamfer(box, box.edges().filterBy(Axis.Z), 2);
    // 4 wedges: (d²/2) × height
    expect(c.volume()).toBeCloseTo(8000 - 4 * 2 * 20, 4);
  });

  it("rejects edges from another shape", () => {
    const a = Box(20, 20, 20);
    const b = Box(5, 5, 5);
    expect(() => a.fillet(b.edges(), 1)).toThrow(/does not belong/);
  });
});

describe("Workplane facade (README example)", () => {
  it('box → faces(">Z") → workplane → hole → fillet', () => {
    const wp = new Workplane("XY")
      .box(80, 60, 10)
      .faces(">Z")
      .workplane()
      .hole(16)
      .edges("|Z")
      .fillet(3);
    const part = wp.val();
    expect(part).not.toBeNull();
    const cornerLoss = 4 * (9 - (Math.PI * 9) / 4) * 10;
    expect(part?.volume()).toBeCloseTo(PLATE_HOLE_VOLUME - cornerLoss, 2);
  });
});

describe("op recording", () => {
  it("every op flows through record()", () => {
    const events: string[] = [];
    const off = onOp((e) => events.push(`${e.op.type}:${e.status}`));
    Box(10, 10, 10);
    off();
    Box(5, 5, 5);
    expect(events).toEqual(["box:done"]);
    expect(events.length).toBe(1);
  });
});

describe("io", () => {
  it("STEP round-trips volume; STL is ascii text", async () => {
    const b = Box(30, 20, 10);
    const bytes = exportStep(b);
    expect(new TextDecoder().decode(bytes.slice(0, 10))).toBe("ISO-10303-");
    const back = await importStep(bytes);
    expect(back.volume()).toBeCloseTo(6000, 4);

    const stl = exportStl(b, 0.5);
    expect(stl.startsWith("solid")).toBe(true);

    const path = join(tmpdir(), `cadorange-test-${Date.now()}.step`);
    await b.export(path);
  });
});
