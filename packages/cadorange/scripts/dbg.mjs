import { Box, init } from "../src/index.ts";

await init();
const box = Box(80, 60, 10);
const meta = box.meta();
console.log("faces:");
for (const f of meta.faces)
  console.log(
    ` #${f.index} ${f.surface} area=${f.area.toFixed(1)} center=${JSON.stringify(f.center)} normal=${JSON.stringify(f.normal)}`,
  );
console.log("edges (first 6):");
for (const e of meta.edges.slice(0, 6))
  console.log(
    ` #${e.index} ${e.curve} len=${e.length.toFixed(1)} center=${JSON.stringify(e.center)} dir=${JSON.stringify(e.direction)}`,
  );
