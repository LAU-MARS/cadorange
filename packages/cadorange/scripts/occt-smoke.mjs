/**
 * Raw occt.ts smoke test — verifies the M0-critical path without any cadorange
 * wrapper: WASM load in Node, primitives, booleans, describe(), index-based
 * fillet, STEP export. Run: node scripts/occt-smoke.mjs
 */
import { OccSession } from "occt.ts";

const occ = await OccSession.create();
console.log("occt version:", occ.occtVersion);

const box = occ.makeBox(80, 60, 10);
console.log("box volume:", box.volume(), "expected:", 80 * 60 * 10);

const hole = occ.makeCylinder(8, 12, { origin: [40, 30, -1] }); // z -1..11, fully through
const part = occ.cut(box, hole);
const expected = 80 * 60 * 10 - Math.PI * 8 * 8 * 10; // only the in-box span is removed
console.log("cut volume:", part.volume().toFixed(3), "expected:", expected.toFixed(3));

const d = occ.describe(part);
console.log("describe: faces=%d edges=%d holes=%d", d.faces.length, d.edges.length, d.holes.length);

// Vertical edges (parallel to Z) selected from describe() metadata, then
// filleted by 1-based index — the exact dataflow cadorange's selector engine
// and fillet() will use.
const vertical = d.edges
  .filter((e) => e.curve === "line" && Math.abs(e.direction[2]) > 0.999)
  .map((e) => e.index);
console.log("vertical edge indices:", vertical);

const filleted = occ.fillet(part, 3, { edges: vertical });
console.log("filleted volume:", filleted.volume().toFixed(3), "faces:", filleted.count("Face"));

const step = occ.writeStep(filleted);
console.log("STEP bytes:", step.length, "header:", new TextDecoder().decode(step.slice(0, 30)));

console.log("SMOKE OK");
