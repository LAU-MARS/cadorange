/**
 * M0 target example — does not run yet.
 * Mirrors the README quick start; every call throws until M0 lands.
 */
import { Axis, Box, Cylinder, fillet, init } from "cadorange";

await init(); // loads the OCCT WASM kernel once

const plate = Box(80, 60, 10);
const hole = Cylinder({ radius: 8, height: 10 });

let part = plate.cut(hole);
part = fillet(part.edges().filterBy(Axis.Z), 3);

console.log(part.describe());
// { volume: 45989.4, bbox: [80, 60, 10], faces: 11, edges: 26, valid: true }

await part.export("plate.step");
await part.export("plate.stl", { tolerance: 0.05 });
