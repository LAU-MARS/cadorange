/**
 * cadorange — agent-native CAD runtime in TypeScript (M0 skeleton).
 *
 * Every export here is signature-only; bodies land with the M0 milestone.
 */

export type { AxisName, BBox, Loc, Location, Mesh, Plane, Vec3 } from "./geom";
export { Axis } from "./geom";
export type { ExportFormat } from "./io";
export { exportShape, importStep } from "./io";
export type { InitOptions, Kernel, ShapeHandle } from "./kernel";
export { init } from "./kernel";
export { chamfer, common, cut, extrude, fillet, fuse, revolve } from "./ops";
export { Box, Cone, Cylinder, Sphere, Torus } from "./primitives";
export { parseSelector } from "./selectors";
export type {
  Describe,
  Edge,
  Face,
  Shape,
  ShapeList,
  Solid,
  Vertex,
} from "./topo";
