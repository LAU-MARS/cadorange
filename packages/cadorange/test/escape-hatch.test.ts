import { beforeAll, describe, expect, it } from "vitest";
import { Box, init } from "../src/index";
import { asOccShape, fromRaw, getOcc, toRaw } from "../src/occt";

beforeAll(async () => {
  await init();
});

describe("cadorange/occt escape hatch (ADR-0001)", () => {
  it("wrapped exposes the kernel handle", () => {
    const b = Box(10, 10, 10);
    expect(asOccShape(b.wrapped).volume()).toBeCloseTo(1000, 4);
  });

  it("getOcc() reaches the session and the raw module classes", () => {
    const occ = getOcc();
    expect(occ.occtVersion).toBeTruthy();
    const XY = (occ.module as unknown as Record<string, { new (x: number, y: number): unknown }>)
      .gp_XY;
    expect(XY).toBeTruthy();
    if (XY) {
      const p = new XY(3, 4);
      expect(p).toBeTruthy();
    }
  });

  it("toRaw/fromRaw round-trips geometry", () => {
    const b = Box(6, 7, 8);
    const raw = toRaw(b);
    expect(raw.IsNull()).toBe(false);
    const back = fromRaw(raw);
    expect(back.volume()).toBeCloseTo(6 * 7 * 8, 5);
    raw.delete();
  });

  it("raw isSame is topological identity (same TShape)", () => {
    const b1 = Box(5, 5, 5);
    const a = toRaw(b1);
    const again = toRaw(b1); // same underlying shape
    const other = toRaw(Box(5, 5, 5)); // independently built
    expect(a.IsSame(again)).toBe(true);
    expect(a.IsSame(other)).toBe(false);
    a.delete();
    again.delete();
    other.delete();
  });
});
