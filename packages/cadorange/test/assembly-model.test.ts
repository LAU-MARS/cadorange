import { beforeAll, describe, expect, it } from "vitest";
import {
  Assembly,
  type AssemblyNode,
  Box,
  Cylinder,
  exportStepAssembly,
  importStepAssembly,
  init,
  Pos,
} from "../src/index";

beforeAll(async () => {
  await init();
});

describe("Assembly runtime model", () => {
  it("composes placements down the tree (worldLoc / worldSolid)", () => {
    const leaf = new Assembly({ solid: Box(5, 5, 5), loc: Pos(0, 0, 5) });
    const sub = new Assembly({ name: "sub", loc: Pos(10, 0, 0), children: [leaf] });
    new Assembly({ children: [sub] });

    expect([...leaf.worldLoc().origin]).toEqual([10, 0, 5]);
    const b = leaf.worldSolid()?.meta().bbox;
    expect(b?.min[0]).toBeCloseTo(10, 3);
    expect(b?.min[2]).toBeCloseTo(5, 3);
    expect(b?.max[0]).toBeCloseTo(15, 3);

    // identity placements skip the kernel round-trip and share the solid
    const plain = new Assembly({ solid: Box(5, 5, 5) });
    expect(plain.worldSolid()).toBe(plain.solid);
  });

  it("bbox unions every leaf's world placement; solids() bakes every leaf", () => {
    const asm = new Assembly({
      children: [
        new Assembly({ solid: Box(10, 10, 10), loc: Pos(0, 0, 0) }),
        new Assembly({
          name: "group",
          children: [new Assembly({ solid: Box(4, 4, 4), loc: Pos(20, 0, 0) })],
        }),
      ],
    });
    const bb = asm.bbox();
    expect(bb.min[0]).toBeCloseTo(0, 3);
    expect(bb.max[0]).toBeCloseTo(24, 3);
    const solids = asm.solids();
    expect(solids.length).toBe(2);
    expect(solids[1]?.volume()).toBeCloseTo(64, 3);
    expect(solids[1]?.meta().bbox.min[0]).toBeCloseTo(20, 3);
  });

  it("rejects a node carrying both a solid and children", () => {
    expect(() => new Assembly({ solid: Box(1, 1, 1), children: [new Assembly()] })).toThrow(
      /either a solid or children/,
    );
    const leaf = new Assembly({ solid: Box(1, 1, 1) });
    expect(() => leaf.add(Box(1, 1, 1))).toThrow(/cannot take children/);
  });
});

describe("explode", () => {
  const build = (): Assembly =>
    new Assembly({
      children: [
        // Box corner sits at its loc, so offset by half to center each leaf on ±50
        new Assembly({ solid: Box(10, 10, 10), loc: Pos(-55, -5, -5), name: "left" }),
        new Assembly({ solid: Box(10, 10, 10), loc: Pos(45, -5, -5), name: "right" }),
      ],
    });

  const centerX = (node: Assembly): number => node.worldSolid()?.meta().center[0] ?? Number.NaN;

  it("pushes leaves radially away from the assembly center", () => {
    const asm = build();
    const exploded = asm.explode(1);
    expect(centerX(exploded.children[0] as Assembly)).toBeCloseTo(-100, 3);
    expect(centerX(exploded.children[1] as Assembly)).toBeCloseTo(100, 3);
    // volumes survive; structure is copied, solids shared
    expect(exploded.solids()[0]?.volume()).toBeCloseTo(1000, 3);
    expect(exploded.children.length).toBe(2);
    expect((exploded.children[0] as Assembly).solid).toBe(asm.children[0]?.solid);
  });

  it("factor 0 keeps placements; the original assembly is untouched", () => {
    const asm = build();
    const frozen = asm.explode(0);
    expect(centerX(frozen.children[0] as Assembly)).toBeCloseTo(-50, 3);
    expect(centerX(asm.children[0] as Assembly)).toBeCloseTo(-50, 3);
    expect(centerX(asm.explode(1).children[0] as Assembly)).toBeCloseTo(-100, 3);
    expect(centerX(asm.children[0] as Assembly)).toBeCloseTo(-50, 3);
  });
});

describe("STEP bridge (toNodes / toStep / fromStep)", () => {
  const build = (): Assembly =>
    new Assembly({
      children: [
        new Assembly({ solid: Box(80, 60, 10), name: "plate", color: "#f97316" }),
        new Assembly({
          name: "pins",
          children: [
            new Assembly({
              solid: Cylinder({ radius: 4, height: 30 }),
              name: "pin-1",
              loc: Pos(40, 30, 10),
            }),
          ],
        }),
      ],
    });

  it("toNodes emits local placements, identity hidden as null", () => {
    const nodes: AssemblyNode[] = build().toNodes();
    expect(nodes.map((n) => n.name)).toEqual(["plate", "pins"]);
    expect(nodes[0]?.transform).toBeNull();
    const pin = nodes[1]?.children?.[0];
    expect(pin?.name).toBe("pin-1");
    const t = pin?.transform;
    expect(t?.[3]).toBeCloseTo(40, 6);
    expect(t?.[11]).toBeCloseTo(10, 6);
  });

  it("round-trips names, colors, nesting and world positions through STEP", () => {
    const asm = build();
    const doc = importStepAssembly(asm.toStep());

    expect(doc.shapes.length).toBe(2);
    expect(doc.shapes[0]?.volume()).toBeCloseTo(80 * 60 * 10, 3);
    expect(doc.shapes[1]?.volume()).toBeCloseTo(Math.PI * 16 * 30, 3);
    expect(doc.tree.map((n) => n.name)).toEqual(["plate", "pins"]);
    expect(doc.tree[0]?.color?.toLowerCase()).toBe("#f97316");
    expect(doc.tree[1]?.children?.[0]?.name).toBe("pin-1");
    // occt.ts 2.0.0 contract: read(write(tree)) === tree — parent-relative
    // transforms come back exactly as written
    const t = doc.tree[1]?.children?.[0]?.transform;
    expect(t).toEqual([1, 0, 0, 40, 0, 1, 0, 30, 0, 0, 1, 10]);
    const pinBbox = doc.tree[1]?.children?.[0]?.solid?.meta().bbox;
    expect(pinBbox?.min[2]).toBeCloseTo(10, 3);
    expect(pinBbox?.max[2]).toBeCloseTo(40, 3);
  });

  it("cascades group colors to uncolored leaves (colors live on shape nodes)", () => {
    const asm = new Assembly({
      children: [
        new Assembly({
          name: "group",
          color: "#f97316",
          children: [
            new Assembly({ solid: Box(4, 4, 4), name: "inherits" }),
            new Assembly({ solid: Box(4, 4, 4), name: "own", color: "#22c55e" }),
          ],
        }),
      ],
    });
    const doc = importStepAssembly(asm.toStep());
    expect(doc.tree[0]?.color).toBeNull(); // group color moved off the node
    expect(doc.tree[0]?.children?.[0]?.color?.toLowerCase()).toBe("#f97316");
    expect(doc.tree[0]?.children?.[1]?.color?.toLowerCase()).toBe("#22c55e");
  });

  it("fromStep rebuilds a runtime assembly with the same world positions", () => {
    const asm = build();
    const rt = Assembly.fromStep(importStepAssembly(asm.toStep()));

    const leaves = rt.leafNodes();
    expect(leaves.length).toBe(2);
    expect(leaves[1]?.worldSolid()?.volume()).toBeCloseTo(Math.PI * 16 * 30, 3);
    const pinBbox = leaves[1]?.worldSolid()?.meta().bbox;
    expect(pinBbox?.min[2]).toBeCloseTo(10, 3);
    expect(pinBbox?.max[2]).toBeCloseTo(40, 3);
    expect(pinBbox?.min[0]).toBeCloseTo(36, 3);
  });

  it("a root leaf assembly exports itself as a single node", () => {
    const asm = new Assembly({ solid: Box(5, 5, 5), name: "only" });
    const nodes = asm.toNodes();
    expect(nodes.length).toBe(1);
    expect(nodes[0]?.name).toBe("only");
    const doc = importStepAssembly(exportStepAssembly(nodes));
    expect(doc.shapes[0]?.volume()).toBeCloseTo(125, 3);
  });

  it("deep chains keep world positions (transforms survive at every depth)", () => {
    const asm = new Assembly({
      children: [
        new Assembly({
          name: "groupA",
          loc: Pos(10, 0, 0),
          children: [new Assembly({ solid: Box(4, 4, 4), loc: Pos(0, 10, 0) })],
        }),
      ],
    });
    const doc = importStepAssembly(asm.toStep());
    // the top-level group's own transform survives natively (occt.ts 2.0.0)
    expect(doc.tree[0]?.transform).toEqual([1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0]);
    // world = groupA ∘ leaf = (10, 10, 0)
    const leafBbox = doc.tree[0]?.children?.[0]?.solid?.meta().bbox;
    expect(leafBbox?.min[0]).toBeCloseTo(10, 3);
    expect(leafBbox?.min[1]).toBeCloseTo(10, 3);
    expect(leafBbox?.max[0]).toBeCloseTo(14, 3);

    const rt = Assembly.fromStep(doc);
    const leaf = rt.leafNodes()[0];
    const rtBbox = leaf?.worldSolid()?.meta().bbox;
    expect(rtBbox?.min[0]).toBeCloseTo(10, 3);
    expect(rtBbox?.min[1]).toBeCloseTo(10, 3);
  });
});
