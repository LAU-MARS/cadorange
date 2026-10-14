/**
 * cadorange — agent-native CAD runtime in TypeScript.
 *
 * Core API follows build123d's algebra mode (explicit objects, methods
 * instead of operator overloading); `cadorange/workplane` is the CadQuery-style
 * fluent facade. Mapping details: docs/api-map.md.
 */

export type { Axis3, AxisName, BBox, Color, Loc, Mat3, Mesh, Placement, Plane, Vec3 } from "./geom";
export {
  Axis,
  axisByName,
  color,
  Location,
  m3apply,
  mat3ToAxisAngle,
  mul3,
  Pos,
  planeFrom,
  Rot,
  transpose3,
  v,
} from "./geom";
export type { AssemblyNode, ExportFormat, StepAssembly } from "./io";
export {
  exportBrep,
  exportGlb,
  exportObj,
  exportShape,
  exportStep,
  exportStepAssembly,
  exportStl,
  importBrep,
  importStep,
  importStepAssembly,
} from "./io";
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
  distance,
  draft,
  extrude,
  fillet,
  fuse,
  intersect,
  loft,
  mirror,
  offset,
  project,
  revolve,
  rotate,
  scale,
  section,
  shell,
  split,
  sweep,
  translate,
} from "./ops";
export { Box, Cone, Cylinder, Sphere, Torus, Wedge } from "./primitives";
export type { OpEvent, OpListener, OpRecord, OpStatus } from "./record";
export { onOp, record } from "./record";
export type { Selector, SubShape } from "./selectors";
export { parseSelector } from "./selectors";
export type { SketchOpts } from "./sketch";
export {
  Bezier,
  BSpline,
  CenterArc,
  Circle,
  ConicArc,
  combineWires,
  Ellipse,
  EllipticalCenterArc,
  EllipticalStartArc,
  FilletPolyline,
  faceOf,
  gridLocations,
  Helix,
  IntersectingLine,
  JernArc,
  Line,
  offsetWire,
  PolarLine,
  Polygon,
  Polyline,
  RadiusArc,
  Rectangle,
  RectangleRounded,
  RegularPolygon,
  SagittaArc,
  SlotArc,
  SlotCenterPoint,
  SlotCenterToCenter,
  SlotOverall,
  Spline,
  Superellipse,
  TangentArc,
  ThreePointArc,
  Trapezoid,
  Triangle,
} from "./sketch";
export type { Describe } from "./topo";
export { Edge, Face, Shape, ShapeList, Solid, Vertex, Wire } from "./topo";
