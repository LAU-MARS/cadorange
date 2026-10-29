/**
 * Runtime assembly model: a placed part tree plus the build123d joint
 * family (Rigid/Revolute/Linear/Cylindrical/Ball/Planar/Polar).
 *
 * Joints are pure placement data — a frame in the owner's local
 * coordinates plus a motion value. `connectTo` solves the child's
 * placement so the two joint frames coincide (with motion applied):
 *
 * ```text
 * childWorld = ownerWorld ∘ Fp ∘ Mp(valueP) ∘ Mc(valueC) ∘ Fc⁻¹
 * child.loc  = this.worldLoc()⁻¹ ∘ childWorld
 * ```
 *
 * where F is the joint frame in owner-local coords and M the joint's
 * motion at its current value (identity for rigid). This mirrors
 * build123d's `Joint.connect_to` — a one-time reposition of the child,
 * self stays fixed — recorded so `solve()` can replay every connection
 * after joint values change (motion studies).
 *
 * Placements compose as `Location` algebra (pure math, no kernel calls);
 * `solids()`/`worldSolid()` bake world placements via `Shape.located()`.
 */

import {
  Axis,
  apply34,
  type BBox,
  identity34,
  Location,
  locationToMat34,
  type Mat34,
  mat34ToLocation,
  mul34,
  planeFrom,
  Rot,
  rotationAbout,
  type Vec3,
  v,
} from "../geom";
import { type AssemblyNode, exportStepAssembly, type StepAssembly } from "../io";
import { record } from "../record";
import { Solid } from "../topo";

/* ------------------------------- joints ---------------------------------- */

export type JointKind =
  | "rigid"
  | "revolute"
  | "linear"
  | "cylindrical"
  | "ball"
  | "planar"
  | "polar";

/** A joint frame: a full `Location`, or origin plus optional axis directions. */
export type FrameInput = Location | { origin?: Vec3; zDir?: Vec3; xDir?: Vec3 };

/** An axis: an `Axis`, or `{ origin?, direction, xDir? }` (`xDir` pins the
 * joint's zero-position orientation — build123d's `angle_reference`). */
export type JointAxis = Axis | { origin?: Vec3; direction: Vec3; xDir?: Vec3 };

export type Range = readonly [number, number];

/**
 * Motion value for `connectTo(value)` — a bare number drives a single-DOF
 * joint (revolute/linear); multi-DOF joints take the matching object.
 */
export type JointValue =
  | number
  | {
      angle?: number;
      linear?: number;
      radial?: number;
      position?: readonly [number, number];
      angles?: readonly [number, number, number];
    };

/** build123d's pairing table: parent (fixed) joint kind → allowed child kinds. */
const PAIRINGS: Record<JointKind, readonly JointKind[]> = {
  rigid: ["rigid"],
  revolute: ["rigid"],
  linear: ["rigid", "revolute"],
  cylindrical: ["rigid"],
  ball: ["rigid"],
  planar: ["rigid"],
  polar: ["rigid"],
};

/** Re-orthogonalizes `xDir` against `zDir` (Location stores raw directions). */
function frameFrom(input: FrameInput): Location {
  if (input instanceof Location) {
    return input;
  }
  const origin = input.origin ?? [0, 0, 0];
  const z = v.normalize(input.zDir ?? [0, 0, 1]);
  const fallback = planeFrom(origin, z).xDir;
  if (!input.xDir) {
    return new Location(origin, z, fallback);
  }
  const x = v.normalize(input.xDir);
  const orthogonal = v.sub(x, v.scale(z, v.dot(x, z))) as Vec3;
  const xDir = v.length(orthogonal) < 1e-9 ? fallback : v.normalize(orthogonal);
  return new Location(origin, z, xDir);
}

/** Joint frame from an axis: the axis is the frame's local Z. */
function axisFrame(axis: JointAxis): Location {
  const origin = axis.origin ?? [0, 0, 0];
  const z = v.normalize(axis.direction);
  const fallback = planeFrom(origin, z).xDir;
  const given = "xDir" in axis ? axis.xDir : undefined;
  if (!given) {
    return new Location(origin, z, fallback);
  }
  const x = v.normalize(given);
  const orthogonal = v.sub(x, v.scale(z, v.dot(x, z))) as Vec3;
  return new Location(origin, z, v.length(orthogonal) < 1e-9 ? fallback : v.normalize(orthogonal));
}

function checkRange(value: number, range: Range | undefined, what: string): number {
  if (range && (value < range[0] || value > range[1])) {
    throw new Error(`${what} = ${value} is outside its range [${range[0]}, ${range[1]}].`);
  }
  return value;
}

/** Motion rotation about the joint frame's local Z (motions live in joint space). */
function spin(angleDegrees: number): Location {
  return rotationAbout(new Axis([0, 0, 0], [0, 0, 1]), angleDegrees);
}

function isIdentity34(m: Mat34): boolean {
  const id = identity34();
  return m.every((x, i) => Math.abs(x - (id[i] ?? 0)) < 1e-12);
}

/**
 * A kinematic coupling on one part. `frame` locates the joint in the
 * owner's local coordinates; `motion()` is the joint's value applied in
 * that frame (identity for rigid).
 */
export abstract class Joint {
  abstract readonly kind: JointKind;
  readonly frame: Location;

  constructor(frame: FrameInput) {
    this.frame = frameFrom(frame);
  }

  abstract motion(): Location;
}

/** Fixed connection — no freedom of motion (build123d `RigidJoint`). */
export class RigidJoint extends Joint {
  readonly kind = "rigid" as const;

  constructor(frame: FrameInput = Location.identity()) {
    super(frame);
  }

  motion(): Location {
    return Location.identity();
  }
}

/** Hinge: rotation about the joint axis, `angle` in degrees (build123d `RevoluteJoint`). */
export class RevoluteJoint extends Joint {
  readonly kind = "revolute" as const;
  readonly angularRange: Range | undefined;
  #angle: number;

  constructor(axis: JointAxis, opts: { angle?: number; angularRange?: Range } = {}) {
    super(axisFrame(axis));
    this.angularRange = opts.angularRange;
    this.#angle = 0;
    if (opts.angle !== undefined) {
      this.angle = opts.angle;
    }
  }

  /** Rotation about the axis, degrees. */
  get angle(): number {
    return this.#angle;
  }

  set angle(deg: number) {
    this.#angle = checkRange(deg, this.angularRange, "RevoluteJoint.angle");
  }

  /** The hinge axis in the owner's local coordinates. */
  get axis(): { origin: Vec3; direction: Vec3 } {
    return { origin: this.frame.origin, direction: this.frame.zDir };
  }

  motion(): Location {
    return spin(this.#angle);
  }
}

/** Slider: translation along the joint axis (build123d `LinearJoint`). */
export class LinearJoint extends Joint {
  readonly kind = "linear" as const;
  readonly linearRange: Range | undefined;
  #linear: number;

  constructor(axis: JointAxis, opts: { linear?: number; linearRange?: Range } = {}) {
    super(axisFrame(axis));
    this.linearRange = opts.linearRange;
    this.#linear = 0;
    if (opts.linear !== undefined) {
      this.linear = opts.linear;
    }
  }

  /** Position along the axis, model units. */
  get linear(): number {
    return this.#linear;
  }

  set linear(position: number) {
    this.#linear = checkRange(position, this.linearRange, "LinearJoint.linear");
  }

  get axis(): { origin: Vec3; direction: Vec3 } {
    return { origin: this.frame.origin, direction: this.frame.zDir };
  }

  motion(): Location {
    return new Location([0, 0, this.#linear]);
  }
}

/** Screw: rotation about + translation along the axis (build123d `CylindricalJoint`). */
export class CylindricalJoint extends Joint {
  readonly kind = "cylindrical" as const;
  readonly angularRange: Range | undefined;
  readonly linearRange: Range | undefined;
  #angle: number;
  #linear: number;

  constructor(
    axis: JointAxis,
    opts: {
      angle?: number;
      linear?: number;
      angularRange?: Range;
      linearRange?: Range;
    } = {},
  ) {
    super(axisFrame(axis));
    this.angularRange = opts.angularRange;
    this.linearRange = opts.linearRange;
    this.#angle = 0;
    this.#linear = 0;
    if (opts.angle !== undefined) {
      this.angle = opts.angle;
    }
    if (opts.linear !== undefined) {
      this.linear = opts.linear;
    }
  }

  get angle(): number {
    return this.#angle;
  }

  set angle(deg: number) {
    this.#angle = checkRange(deg, this.angularRange, "CylindricalJoint.angle");
  }

  get linear(): number {
    return this.#linear;
  }

  set linear(position: number) {
    this.#linear = checkRange(position, this.linearRange, "CylindricalJoint.linear");
  }

  get axis(): { origin: Vec3; direction: Vec3 } {
    return { origin: this.frame.origin, direction: this.frame.zDir };
  }

  motion(): Location {
    return spin(this.#angle).mul(new Location([0, 0, this.#linear]));
  }
}

/** Ball: gimbal rotation about the joint frame (build123d `BallJoint`). */
export class BallJoint extends Joint {
  readonly kind = "ball" as const;
  readonly angularRange: readonly [Range, Range, Range] | undefined;
  #angles: readonly [number, number, number];

  constructor(
    frame: FrameInput = Location.identity(),
    opts: {
      angles?: readonly [number, number, number];
      angularRange?: readonly [Range, Range, Range];
    } = {},
  ) {
    super(frame);
    this.angularRange = opts.angularRange;
    this.#angles = [0, 0, 0];
    if (opts.angles) {
      this.angles = opts.angles;
    }
  }

  /** Gimbal XYZ Euler angles, degrees (build123d `Rot` convention). */
  get angles(): readonly [number, number, number] {
    return this.#angles;
  }

  set angles(value: readonly [number, number, number]) {
    const range = this.angularRange;
    this.#angles = [
      checkRange(value[0], range ? range[0] : undefined, "BallJoint.angles[0]"),
      checkRange(value[1], range ? range[1] : undefined, "BallJoint.angles[1]"),
      checkRange(value[2], range ? range[2] : undefined, "BallJoint.angles[2]"),
    ];
  }

  motion(): Location {
    return Rot(this.#angles[0], this.#angles[1], this.#angles[2]);
  }
}

/**
 * Puck on a plane: spin about the axis (the plane's normal) and slide
 * `position = [u, v]` in the joint frame's plane.
 */
export class PlanarJoint extends Joint {
  readonly kind = "planar" as const;
  readonly angularRange: Range | undefined;
  #angle: number;
  #position: readonly [number, number];

  constructor(
    axis: JointAxis,
    opts: { angle?: number; position?: readonly [number, number]; angularRange?: Range } = {},
  ) {
    super(axisFrame(axis));
    this.angularRange = opts.angularRange;
    this.#angle = 0;
    this.#position = [0, 0];
    if (opts.angle !== undefined) {
      this.angle = opts.angle;
    }
    if (opts.position) {
      this.position = opts.position;
    }
  }

  get angle(): number {
    return this.#angle;
  }

  set angle(deg: number) {
    this.#angle = checkRange(deg, this.angularRange, "PlanarJoint.angle");
  }

  /** Slide in the joint frame's local XY, model units. */
  get position(): readonly [number, number] {
    return this.#position;
  }

  set position(pos: readonly [number, number]) {
    this.#position = pos;
  }

  motion(): Location {
    return new Location([this.#position[0], this.#position[1], 0]).mul(spin(this.#angle));
  }
}

/** Polar slider: spin about the axis, then slide `radial` along local X. */
export class PolarJoint extends Joint {
  readonly kind = "polar" as const;
  readonly angularRange: Range | undefined;
  #angle: number;
  #radial: number;

  constructor(
    axis: JointAxis,
    opts: { angle?: number; radial?: number; angularRange?: Range } = {},
  ) {
    super(axisFrame(axis));
    this.angularRange = opts.angularRange;
    this.#angle = 0;
    this.#radial = 0;
    if (opts.angle !== undefined) {
      this.angle = opts.angle;
    }
    if (opts.radial !== undefined) {
      this.radial = opts.radial;
    }
  }

  get angle(): number {
    return this.#angle;
  }

  set angle(deg: number) {
    this.#angle = checkRange(deg, this.angularRange, "PolarJoint.angle");
  }

  get radial(): number {
    return this.#radial;
  }

  set radial(distance: number) {
    this.#radial = distance;
  }

  motion(): Location {
    return new Location([this.#radial, 0, 0]).mul(spin(this.#angle));
  }
}

const VALUE_KEYS: Record<JointKind, readonly string[]> = {
  rigid: [],
  revolute: ["angle"],
  linear: ["linear"],
  cylindrical: ["angle", "linear"],
  ball: ["angles"],
  planar: ["angle", "position"],
  polar: ["angle", "radial"],
};

/** Sets a joint's motion value from a `JointValue`, rejecting foreign keys. */
function applyValue(joint: Joint, value: JointValue, what: string): void {
  const kind = joint.kind;
  const allowed = VALUE_KEYS[kind];
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        throw new Error(
          `${what}: joint "${kind}" does not take "${key}" — allowed: ${allowed.join(", ") || "none (rigid)"}.`,
        );
      }
    }
  }
  if (kind === "rigid") {
    throw new Error(`${what}: rigid joints take no motion value.`);
  }
  if (typeof value === "number") {
    if (kind === "revolute") {
      (joint as RevoluteJoint).angle = value;
    } else if (kind === "linear") {
      (joint as LinearJoint).linear = value;
    } else {
      throw new Error(
        `${what}: "${kind}" needs an object value ({ ${allowed.join(", ")} }), not a bare number.`,
      );
    }
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `${what}: joint "${kind}" does not take "${key}" — allowed: ${allowed.join(", ")}.`,
      );
    }
  }
  if (value.angle !== undefined) {
    if (kind === "revolute") (joint as RevoluteJoint).angle = value.angle;
    else if (kind === "cylindrical") (joint as CylindricalJoint).angle = value.angle;
    else if (kind === "planar") (joint as PlanarJoint).angle = value.angle;
    else if (kind === "polar") (joint as PolarJoint).angle = value.angle;
  }
  if (value.linear !== undefined && kind === "cylindrical") {
    (joint as CylindricalJoint).linear = value.linear;
  }
  if (value.linear !== undefined && kind === "linear") {
    (joint as LinearJoint).linear = value.linear;
  }
  if (value.radial !== undefined && kind === "polar") {
    (joint as PolarJoint).radial = value.radial;
  }
  if (value.position !== undefined && kind === "planar") {
    (joint as PlanarJoint).position = value.position;
  }
  if (value.angles !== undefined && kind === "ball") {
    (joint as BallJoint).angles = value.angles;
  }
}

/* ------------------------------ assembly --------------------------------- */

export interface AssemblyInit {
  name?: string | null;
  /** "#RRGGBB" or null. */
  color?: string | null;
  /** Placement relative to the parent node (default identity). */
  loc?: Location;
  /** Joints defined on this node, keyed by label. */
  joints?: Record<string, Joint>;
  /** Leaf shape — mutually exclusive with `children` (the kernel's rule). */
  solid?: Solid;
  children?: readonly Assembly[];
}

export interface AddOpts {
  name?: string | null;
  color?: string | null;
  loc?: Location;
  joints?: Record<string, Joint>;
}

interface Connection {
  readonly child: Assembly;
  readonly parentLabel: string;
  readonly childLabel: string;
}

/**
 * A runtime assembly node: either a placed part (`solid`) or a group
 * (`children`) — never both, matching the STEP document rule. Joints live
 * on nodes by label; `connectTo` places a child by pairing joints, and
 * `solve()` replays every connection at current joint values.
 */
export class Assembly {
  name: string | null;
  color: string | null;
  /** Placement relative to the parent node. */
  loc: Location;
  readonly joints: Record<string, Joint> = {};
  readonly children: Assembly[] = [];
  readonly solid: Solid | undefined;
  #parent: Assembly | undefined;
  #connections: Connection[] = [];

  constructor(init: AssemblyInit = {}) {
    this.name = init.name ?? null;
    this.color = init.color ?? null;
    this.loc = init.loc ?? Location.identity();
    if (init.solid && init.children && init.children.length > 0) {
      throw new Error(
        "Assembly: a node carries either a solid or children (assembly vs leaf), not both.",
      );
    }
    this.solid = init.solid;
    Object.assign(this.joints, init.joints ?? {});
    for (const child of init.children ?? []) {
      this.add(child);
    }
  }

  get parent(): Assembly | undefined {
    return this.#parent;
  }

  /** Attaches `child` (wrapping a bare `Solid` into a leaf node). Returns the node. */
  add(child: Assembly | Solid, opts: AddOpts = {}): Assembly {
    const node = child instanceof Solid ? new Assembly({ solid: child }) : child;
    if (this.solid) {
      throw new Error(
        "Assembly.add: a leaf node (with a solid) cannot take children — group under a childless node instead.",
      );
    }
    if (node === this || node.contains(this)) {
      throw new Error("Assembly.add: cannot attach a node to its own subtree (cycle).");
    }
    if (node.#parent && node.#parent !== this) {
      throw new Error(
        `Assembly.add: "${node.name ?? "node"}" already belongs to another assembly — detach it first.`,
      );
    }
    if (opts.name !== undefined) node.name = opts.name;
    if (opts.color !== undefined) node.color = opts.color;
    if (opts.loc) node.loc = opts.loc;
    Object.assign(node.joints, opts.joints ?? {});
    if (!node.#parent) {
      this.children.push(node);
      node.#parent = this;
    }
    return node;
  }

  /** Defines a joint on this node by label (build123d `part.joints[label] = ...`). */
  addJoint(label: string, joint: Joint): this {
    this.joints[label] = joint;
    return this;
  }

  /** True when `node` is this node or anywhere in its subtree. */
  contains(node: Assembly): boolean {
    if (node === this) {
      return true;
    }
    return this.children.some((c) => c.contains(node));
  }

  /** Finds a joint by label on this node or its subtree (depth-first). */
  findJoint(label: string): { node: Assembly; joint: Joint } | undefined {
    const own = this.joints[label];
    if (own) {
      return { node: this, joint: own };
    }
    for (const c of this.children) {
      const hit = c.findJoint(label);
      if (hit) {
        return hit;
      }
    }
    return undefined;
  }

  #jointLabels(): string {
    const walk = (a: Assembly, path: string): string[] => {
      const own = Object.keys(a.joints).map((l) => (path ? `${path}/${l}` : l));
      return [
        ...own,
        ...a.children.flatMap((c) => walk(c, path ? `${path}/${c.name ?? "?"}` : (c.name ?? "?"))),
      ];
    };
    return walk(this, "").join(", ") || "(none)";
  }

  /**
   * Places `child` so the child joint frame lands on the parent joint
   * frame, with both joints' motion applied (build123d `connect_to`: the
   * parent side stays fixed; the child is repositioned once). The child is
   * attached to this node if needed, and the connection is recorded for
   * `solve()`. `value` sets the parent joint's motion at connect time
   * (with `angle` routed to a revolute child in a linear→revolute pair).
   */
  connectTo(
    child: Assembly,
    parentLabel: string,
    childLabel: string,
    value?: JointValue,
  ): Assembly {
    return record("connectTo", { parent: parentLabel, child: childLabel, value }, () => {
      const p = this.findJoint(parentLabel);
      if (!p) {
        throw new Error(
          `connectTo: no joint "${parentLabel}" on this assembly or its subtree. Joints: ${this.#jointLabels()}.`,
        );
      }
      const c = child.findJoint(childLabel);
      if (!c) {
        throw new Error(
          `connectTo: no joint "${childLabel}" on the child or its subtree. Joints: ${child.#jointLabels()}.`,
        );
      }
      if (!PAIRINGS[p.joint.kind].includes(c.joint.kind)) {
        throw new Error(
          `connectTo: a ${p.joint.kind} joint connects to ${PAIRINGS[p.joint.kind].join("/")}, ` +
            `but child joint "${childLabel}" is ${c.joint.kind}.`,
        );
      }
      if (value !== undefined) {
        if (p.joint.kind === "linear" && c.joint.kind === "revolute" && typeof value === "object") {
          const { angle, ...rest } = value;
          if (Object.keys(rest).length > 0) {
            applyValue(p.joint, rest as JointValue, "connectTo");
          }
          if (angle !== undefined) {
            (c.joint as RevoluteJoint).angle = angle;
          }
        } else {
          applyValue(p.joint, value, "connectTo");
        }
      }
      this.add(child);
      this.#place(p.node, p.joint, child, c.joint);
      this.#connections.push({ child, parentLabel, childLabel });
      return child;
    });
  }

  #place(owner: Assembly, parentJoint: Joint, child: Assembly, childJoint: Joint): void {
    const childWorld = owner
      .worldLoc()
      .mul(parentJoint.frame)
      .mul(parentJoint.motion())
      .mul(childJoint.motion())
      .mul(childJoint.frame.inverse());
    child.loc = this.worldLoc().inverse().mul(childWorld);
  }

  /**
   * Replays every recorded connection at the joints' CURRENT values
   * (subtree-wide, parent level first). Motion studies: mutate
   * `joint.angle`/`joint.linear`, then call `solve()`.
   */
  solve(): this {
    for (const { child, parentLabel, childLabel } of this.#connections) {
      const p = this.findJoint(parentLabel);
      const c = child.findJoint(childLabel);
      if (!p || !c) {
        throw new Error(
          `solve: joint ${!p ? `"${parentLabel}"` : `"${childLabel}"`} vanished after connectTo was recorded.`,
        );
      }
      this.#place(p.node, p.joint, child, c.joint);
    }
    for (const c of this.children) {
      c.solve();
    }
    return this;
  }

  /** Placement in world (root) coordinates — parent chain composed. */
  worldLoc(): Location {
    return this.#parent ? this.#parent.worldLoc().mul(this.loc) : this.loc;
  }

  /** The leaf's shape baked at its world placement (kernel rotate+translate). */
  worldSolid(): Solid | undefined {
    if (!this.solid) {
      return undefined;
    }
    const w = this.worldLoc();
    const id = Location.identity();
    const same =
      v.eq(w.origin, id.origin, 1e-12) &&
      v.eq(w.zDir, id.zDir, 1e-9) &&
      v.eq(w.xDir, id.xDir, 1e-9);
    return same ? this.solid : this.solid.located(w);
  }

  /** All leaves, document order, baked at their world placements. */
  solids(): Solid[] {
    return this.leafNodes()
      .map((n) => n.worldSolid())
      .filter((s): s is Solid => s !== undefined);
  }

  /** All leaf nodes, document order. */
  leafNodes(): Assembly[] {
    if (this.solid) {
      return [this];
    }
    return this.children.flatMap((c) => c.leafNodes());
  }

  /** World bounding box of every leaf (pure math over cached metadata). */
  bbox(): BBox {
    const leaves = this.leafNodes();
    if (leaves.length === 0) {
      throw new Error("Assembly.bbox: no leaf shapes in this assembly.");
    }
    let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const leaf of leaves) {
      if (!leaf.solid) {
        continue;
      }
      const m = locationToMat34(leaf.worldLoc());
      const bb = leaf.solid.boundingBox();
      for (let i = 0; i < 8; i++) {
        const corner: Vec3 = [
          i & 1 ? bb.max[0] : bb.min[0],
          i & 2 ? bb.max[1] : bb.min[1],
          i & 4 ? bb.max[2] : bb.min[2],
        ];
        const p = apply34(m, corner);
        min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
        max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
      }
    }
    return { min, max };
  }

  /**
   * Exploded view: a structural copy with every leaf pushed radially away
   * from the assembly's bbox center — offset direction = leaf center −
   * assembly center, magnitude = `factor` × that distance (`factor < 0`
   * implodes). Solids are shared; placements are new; recorded joint
   * connections do NOT carry over (this is a positioned snapshot).
   */
  explode(factor = 1): Assembly {
    const source = this.leafNodes();
    const box = this.bbox();
    const center: Vec3 = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    const copy = this.#clone();
    const copied = copy.leafNodes();
    for (let i = 0; i < source.length; i++) {
      const leaf = source[i];
      const target = copied[i];
      if (!leaf || !target || !leaf.solid) {
        continue;
      }
      const leafCenter = solidWorldCenter(leaf);
      const delta = v.sub(leafCenter, center);
      const dist = v.length(delta);
      if (dist < 1e-9) {
        continue;
      }
      const offset = v.scale(v.normalize(delta), factor * dist);
      const newWorld = new Location(offset).mul(leaf.worldLoc());
      const parentWorld = target.#parent ? target.#parent.worldLoc() : Location.identity();
      target.loc = parentWorld.inverse().mul(newWorld);
    }
    return copy;
  }

  #clone(): Assembly {
    const node = new Assembly({
      name: this.name,
      color: this.color,
      loc: this.loc,
      solid: this.solid,
      joints: { ...this.joints },
    });
    for (const c of this.children) {
      node.add(c.#clone());
    }
    return node;
  }

  /** Local-placement view for `exportStepAssembly` (identity → null). */
  toNodes(): AssemblyNode[] {
    const conv = (a: Assembly): AssemblyNode => {
      const m = locationToMat34(a.loc);
      return {
        name: a.name,
        color: a.color,
        transform: isIdentity34(m) ? null : m,
        ...(a.solid ? { solid: a.solid } : {}),
        ...(a.children.length > 0 ? { children: a.children.map(conv) } : {}),
      };
    };
    if (this.children.length > 0 || !this.solid) {
      return this.children.map(conv);
    }
    return [conv(this)];
  }

  /** Writes this assembly as a STEP assembly document (names/colors/nesting). */
  toStep(): Uint8Array {
    return exportStepAssembly(this.toNodes());
  }

  /**
   * Rebuilds a runtime assembly from an imported STEP document. Leaf
   * solids arrive world-baked (R17), so the accumulated instance transform
   * is un-baked onto each leaf and node `loc`s keep the local structure.
   */
  static fromStep(doc: StepAssembly): Assembly {
    const build = (nodes: readonly AssemblyNode[], acc: Mat34): Assembly[] =>
      nodes.map((n) => {
        const local = n.transform ? mat34ToLocation(n.transform) : Location.identity();
        const accLocal = n.transform ? mul34(acc, n.transform) : acc;
        let solid: Solid | undefined;
        if (n.solid) {
          solid = n.solid;
          if (!isIdentity34(accLocal)) {
            solid = solid.located(mat34ToLocation(accLocal).inverse());
          }
        }
        const node = new Assembly({ name: n.name, color: n.color, loc: local, solid });
        for (const kid of build(n.children ?? [], accLocal)) {
          node.add(kid);
        }
        return node;
      });
    return new Assembly({ children: build(doc.tree, identity34()) });
  }
}

function solidWorldCenter(leaf: Assembly): Vec3 {
  if (!leaf.solid) {
    return [0, 0, 0];
  }
  const m = locationToMat34(leaf.worldLoc());
  const c = leaf.solid.center();
  return apply34(m, c);
}
