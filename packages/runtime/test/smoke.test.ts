import { describe, expect, it } from "vitest";
import { Session } from "../src/index";

describe("runtime skeleton", () => {
  it("Session.create rejects with NotImplementedError", async () => {
    await expect(Session.create()).rejects.toThrowError(/not implemented/i);
  });
});
