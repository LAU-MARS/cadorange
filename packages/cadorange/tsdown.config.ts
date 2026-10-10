import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/workplane/index.ts",
    "src/runtime/index.ts",
    "src/render/index.ts",
    "src/mcp/index.ts",
    "src/cli.ts",
  ],
  format: "esm",
  dts: true,
  target: "es2022",
  fixedExtension: false,
  outDir: "dist",
});
