import type { Shape } from "cadorange";
import { describe, expect, it } from "vitest";
import { render } from "../src/index";

describe("render skeleton", () => {
  it("render rejects with NotImplementedError", async () => {
    await expect(render({} as Shape)).rejects.toThrowError(/not implemented/i);
  });
});
