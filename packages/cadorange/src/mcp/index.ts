export interface McpServerOptions {
  name?: string;
  version?: string;
  /** stdio is the only transport planned for M0. */
  transport?: "stdio";
}

/** Starts the cadorange MCP server (tools: run, describe, render, export). */
export async function startMcpServer(_opts: McpServerOptions = {}): Promise<void> {
  todo("startMcpServer");
}

/** Thrown by every skeleton stub until the real M0 implementation lands. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet — this is the M0 repository skeleton.`);
    this.name = "NotImplementedError";
  }
}

function todo(what: string): never {
  throw new NotImplementedError(what);
}
