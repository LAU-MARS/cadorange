import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
