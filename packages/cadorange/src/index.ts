/**
 * cadorange — agent-native CAD runtime in TypeScript.
 *
 * Core API follows build123d's algebra mode (explicit objects, methods
 * instead of operator overloading); `cadorange/workplane` is the CadQuery-style
 * fluent facade. Mapping details: docs/api-map.md.
 */

export type { Axis3, AxisName, BBox, Loc, Location, Mesh, Plane, Vec3 } from "./geom";
export { Axis, axisByName, planeFrom, v } from "./geom";
export type { ExportFormat } from "./io";
export { exportGlb, exportShape, exportStep, exportStl, importStep } from "./io";
export type {
  CurveKind,
  EdgeMeta,
  FaceMeta,
  HoleMeta,
  InitOptions,
  Kernel,
  ShapeHandle,
  ShapeMeta,
  SurfaceKind,
  VertexMeta,
} from "./kernel";
export { init } from "./kernel";
export {
  chamfer,
  common,
  compound,
  cut,
  extrude,
  fillet,
  fuse,
  intersect,
  mirror,
  revolve,
  translate,
} from "./ops";
export { Box, Cone, Cylinder, Sphere, Torus } from "./primitives";
export type { OpEvent, OpListener, OpRecord, OpStatus } from "./record";
export { onOp, record } from "./record";
export type { Selector, SubShape } from "./selectors";
export { parseSelector } from "./selectors";
export type { SketchOpts } from "./sketch";
export {
  CenterArc,
  Circle,
  combineWires,
  faceOf,
  gridLocations,
  Line,
  Polygon,
  Polyline,
  RadiusArc,
  Rectangle,
  RegularPolygon,
  SlotCenterToCenter,
  ThreePointArc,
} from "./sketch";
export type { Describe } from "./topo";
export { Edge, Face, Shape, ShapeList, Solid, Vertex, Wire } from "./topo";
