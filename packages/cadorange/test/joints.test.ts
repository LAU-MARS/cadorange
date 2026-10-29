import { beforeAll, describe, expect, it } from "vitest";
import {
  Assembly,
  BallJoint,
  Box,
  Cylinder,
  CylindricalJoint,
  init,
  LinearJoint,
  PlanarJoint,
  PolarJoint,
  RevoluteJoint,
  RigidJoint,
} from "../src/index";

beforeAll(async () => {
  await init();
});

const TOL = 3;

/** Asserts a node's world bbox against [minX, minY, minZ, maxX, maxY, maxZ]. */
function expectBbox(node: Assembly, expected: readonly number[]): void {
  const solid = node.worldSolid();
  if (!solid) {
    throw new Error("node has no solid");
  }
  const b = solid.meta().bbox;
  const actual = [...b.min, ...b.max];
  expect(actual.length).toBe(6);
  for (let i = 0; i < 6; i++) {
    expect(actual[i]).toBeCloseTo(expected[i] ?? 0, TOL);
  }
}

describe("joint frames and values (pure math)", () => {
  it("rigid joints carry a frame; identity frame is the local origin", () => {
    const j = new RigidJoint({ origin: [1, 2, 3], zDir: [0, 0, 1], xDir: [1, 0, 0] });
    expect(j.kind).toBe("rigid");
    expect([...j.frame.origin]).toEqual([1, 2, 3]);
    expect([...new RigidJoint().frame.origin]).toEqual([0, 0, 0]);
  });

  it("axis joints pin their zero-position orientation via xDir", () => {
    const j = new RevoluteJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] });
    expect([...j.frame.xDir]).toEqual([1, 0, 0]);
    expect([...j.frame.zDir]).toEqual([0, 0, 1]);
    // a non-orthogonal xDir is re-orthogonalized against the axis
    const k = new RevoluteJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 1] });
    const dot = k.frame.xDir.reduce((s, x, i) => s + x * (k.frame.zDir[i] ?? 0), 0);
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it("range validation rejects out-of-range values", () => {
    const j = new RevoluteJoint(
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { angularRange: [0, 45] },
    );
    j.angle = 45;
    expect(() => {
      j.angle = 90;
    }).toThrow(/outside its range/);
  });
});

describe("connectTo placements (build123d connect_to semantics)", () => {
  it("rigid: pins a cylinder onto the plate's top-face point", () => {
    const asm = new Assembly({ name: "clamp" });
    asm.add(Box(80, 60, 10), {
      name: "plate",
      joints: { mount: new RigidJoint({ origin: [40, 30, 10] }) },
    });
    const pin = asm.add(Cylinder({ radius: 4, height: 30 }), {
      name: "pin",
      joints: { base: new RigidJoint() },
    });
    asm.connectTo(pin, "mount", "base");
    expectBbox(pin, [36, 26, 10, 44, 34, 40]);
    expect(pin.worldSolid()?.volume()).toBeCloseTo(Math.PI * 16 * 30, 3);
  });

  it("revolute: hinges an arm at angle 0, then solve() swings it to 90°", () => {
    const asm = new Assembly();
    const base = asm.add(Box(10, 10, 10), {
      joints: {
        hinge: new RevoluteJoint({ origin: [5, 5, 10], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const arm = asm.add(Box(20, 4, 2), {
      joints: { pivot: new RigidJoint() },
    });
    asm.connectTo(arm, "hinge", "pivot", 0);
    expectBbox(arm, [5, 5, 10, 25, 9, 12]);

    // motion study: turn the joint, replay the connection
    const hinge = base.joints.hinge;
    if (!(hinge instanceof RevoluteJoint)) {
      throw new Error("hinge lost");
    }
    hinge.angle = 90;
    asm.solve();
    // arm rotated a quarter turn about (5,5): x = 5 - y_local ∈ [1,5]
    expectBbox(arm, [1, 5, 10, 5, 25, 12]);
  });

  it("revolute: connectTo with { angle } reaches the same placement as solve()", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 10), {
      joints: {
        hinge: new RevoluteJoint({ origin: [5, 5, 10], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const arm = asm.add(Box(20, 4, 2), { joints: { pivot: new RigidJoint() } });
    asm.connectTo(arm, "hinge", "pivot", { angle: 90 });
    expectBbox(arm, [1, 5, 10, 5, 25, 12]);
  });

  it("linear: slides a payload along the axis (bare-number value)", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 2), {
      joints: {
        rail: new LinearJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const payload = asm.add(Box(4, 4, 4), { joints: { mount: new RigidJoint() } });
    asm.connectTo(payload, "rail", "mount", 15);
    expectBbox(payload, [0, 0, 15, 4, 4, 19]);
  });

  it("cylindrical: rotates and translates along the axis (a screw)", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 2), {
      joints: {
        screw: new CylindricalJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const bolt = asm.add(Box(4, 4, 4), { joints: { mount: new RigidJoint() } });
    asm.connectTo(bolt, "screw", "mount", { angle: 90, linear: 10 });
    expectBbox(bolt, [-4, 0, 10, 0, 4, 14]);
  });

  it("ball: gimbal angles rotate the child in the joint frame", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 2), {
      joints: {
        socket: new BallJoint({ origin: [0, 0, 0], zDir: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const link = asm.add(Box(8, 4, 2), { joints: { mount: new RigidJoint() } });
    asm.connectTo(link, "socket", "mount", { angles: [0, 0, 90] });
    expectBbox(link, [-4, 0, 0, 0, 8, 2]);
  });

  it("planar: slides in the joint plane and spins about the normal", () => {
    const asm = new Assembly();
    asm.add(Box(40, 40, 2), {
      joints: {
        table: new PlanarJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const puck = asm.add(Box(4, 2, 1), { joints: { mount: new RigidJoint() } });
    asm.connectTo(puck, "table", "mount", { position: [10, 5] });
    expectBbox(puck, [10, 5, 0, 14, 7, 1]);

    const puck2 = asm.add(Box(4, 2, 1), { joints: { mount: new RigidJoint() } });
    asm.connectTo(puck2, "table", "mount", { angle: 90, position: [10, 5] });
    expectBbox(puck2, [8, 5, 0, 10, 9, 1]);
  });

  it("polar: angle then radial offset (polar coordinates)", () => {
    const asm = new Assembly();
    asm.add(Box(40, 40, 2), {
      joints: {
        table: new PolarJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const puck = asm.add(Box(4, 2, 1), { joints: { mount: new RigidJoint() } });
    asm.connectTo(puck, "table", "mount", { angle: 90, radial: 10 });
    expectBbox(puck, [8, 0, 0, 10, 4, 1]);
  });

  it("linear → revolute pairing: slide plus child hinge, driven by one value", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 2), {
      joints: {
        rail: new LinearJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    const arm = asm.add(Box(20, 4, 2), {
      joints: {
        pivot: new RevoluteJoint({ origin: [0, 0, 0], direction: [0, 0, 1], xDir: [1, 0, 0] }),
      },
    });
    asm.connectTo(arm, "rail", "pivot", { linear: 10, angle: 90 });
    expectBbox(arm, [-4, 0, 10, 0, 20, 12]);
  });

  it("finds the parent joint anywhere in the subtree (build123d joint_between)", () => {
    const asm = new Assembly();
    const plate = asm.add(new Assembly({ name: "plate" }));
    plate.add(Box(8, 8, 2), {
      joints: { mount: new RigidJoint({ origin: [4, 4, 4] }) },
    });
    // joint lives on the nested leaf, connectTo is called on the root
    const pin = new Assembly({
      solid: Cylinder({ radius: 1, height: 6 }),
      joints: { base: new RigidJoint() },
    });
    asm.connectTo(pin, "mount", "base");
    expectBbox(pin, [3, 3, 4, 5, 5, 10]);
  });

  it("rejects invalid pairings, unknown labels, bad values, foreign parents, cycles", () => {
    const asm = new Assembly();
    asm.add(Box(10, 10, 2), {
      joints: { hinge: new RevoluteJoint({ origin: [0, 0, 0], direction: [0, 0, 1] }) },
    });
    const arm = asm.add(Box(20, 4, 2), {
      joints: { pivot: new RevoluteJoint({ origin: [0, 0, 0], direction: [0, 0, 1] }) },
    });
    expect(() => asm.connectTo(arm, "hinge", "pivot")).toThrow(
      /revolute joint connects to rigid.*is revolute/s,
    );
    expect(() => asm.connectTo(arm, "nope", "pivot")).toThrow(/no joint "nope"/);
    expect(() => asm.connectTo(arm, "hinge", "nope")).toThrow(/no joint "nope"/);

    const rigidAsm = new Assembly();
    rigidAsm.add(Box(10, 10, 2), { joints: { mount: new RigidJoint() } });
    const part = rigidAsm.add(Box(4, 4, 4), { joints: { mount: new RigidJoint() } });
    expect(() => rigidAsm.connectTo(part, "mount", "mount", 5)).toThrow(
      /rigid joints take no motion/,
    );
    expect(() => rigidAsm.connectTo(part, "mount", "mount", { linear: 5 })).toThrow(
      /does not take "linear"/,
    );

    // a node already parented elsewhere cannot be connected into another tree
    const other = new Assembly();
    other.add(Box(4, 4, 4), { joints: { mount: new RigidJoint() } });
    expect(() => other.connectTo(part, "mount", "mount")).toThrow(/another assembly/);

    // cycle: attaching a node's own ancestor back under it
    const cycle = new Assembly();
    const group = cycle.add(new Assembly({ joints: { j: new RigidJoint() } }));
    group.add(Box(4, 4, 4), { joints: { j: new RigidJoint() } });
    expect(() => group.connectTo(cycle, "j", "j")).toThrow(/cycle/);
  });
});
