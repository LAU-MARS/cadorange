import { describe, expect, it } from "vitest";
import type { Shape } from "../src/index";
import { render } from "../src/render";

describe("render skeleton", () => {
  it("render rejects with NotImplementedError", async () => {
    await expect(render({} as Shape)).rejects.toThrowError(/not implemented/i);
  });
});
