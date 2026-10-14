import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // examples/ import "cadorange" like installed users do; map to the source
    alias: {
      cadorange: new URL("./packages/cadorange/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    browser: {
      enabled: false,
      provider: playwright,
      name: "chromium",
      headless: true,
    },
  },
});
