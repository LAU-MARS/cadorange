import { describe, expect, it } from "vitest";
import { Box, init } from "../src/index";

describe("cadorange skeleton", () => {
  it("primitive stubs throw NotImplementedError", () => {
    expect(() => Box(1, 1, 1)).toThrowError(/not implemented/i);
  });

  it("init() rejects with NotImplementedError", async () => {
    await expect(init()).rejects.toThrowError(/not implemented/i);
  });
});
