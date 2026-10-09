import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { startMcpServer } from "../src/index";

describe("cado CLI skeleton", () => {
  it("prints usage for --help and exits 0", () => {
    expect(main(["--help"])).toBe(0);
  });

  it("unknown commands exit 1 with a not-implemented note", () => {
    expect(main(["run", "model.ts"])).toBe(1);
  });
});

describe("mcp server skeleton", () => {
  it("startMcpServer rejects with NotImplementedError", async () => {
    await expect(startMcpServer()).rejects.toThrowError(/not implemented/i);
  });
});
