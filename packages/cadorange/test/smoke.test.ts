import { beforeAll, describe, expect, it } from "vitest";
import { Axis } from "../src/geom";
import { Box, Cylinder, fillet, init } from "../src/index";

beforeAll(async () => {
  await init();
});

describe("cadorange core (README quick-start example)", () => {
  it("plate with hole and fillet matches analytic volumes", () => {
    const plate = Box(80, 60, 10);
    expect(plate.volume()).toBeCloseTo(80 * 60 * 10, 6);

    const hole = Cylinder({ radius: 8, height: 12, loc: { origin: [40, 30, -1] } });
    let part = plate.cut(hole);
    // cylinder overlaps the plate for z in [0, 10] only
    expect(part.volume()).toBeCloseTo(80 * 60 * 10 - Math.PI * 8 * 8 * 10, 4);

    part = fillet(part, part.edges().filterBy(Axis.Z), 3);
    // four corner prisms: (r² − πr²/4) × height each; the hole's seam edge is a no-op
    const cornerLoss = 4 * (9 - (Math.PI * 9) / 4) * 10;
    expect(part.volume()).toBeCloseTo(80 * 60 * 10 - Math.PI * 8 * 8 * 10 - cornerLoss, 2);
  });
});
