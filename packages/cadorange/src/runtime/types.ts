import type { Describe } from "../index";

export type Op = {
  id: number;
  type: string;
  args: Record<string, unknown>;
  inputs: number[];
};

export interface OpLog {
  ops: Op[];
  append(op: Op): number;
  slice(to: number): OpLog;
}

export interface Snapshot {
  id: string;
  opIndex: number;
  hash: string;
}

/** Enumerable error codes — exhaustiveness matters for eval/RL statistics. */
export type ErrorCode =
  | "NOT_IMPLEMENTED"
  | "FILLET_RADIUS_TOO_LARGE"
  | "BOOLEAN_FAILED"
  | "INVALID_SHAPE"
  | "INVALID_OP"
  | "TIMEOUT"
  | "OUT_OF_MEMORY"
  | "OP_LIMIT_EXCEEDED"
  | "UNKNOWN";

export interface OpError {
  code: ErrorCode;
  op?: Op;
  message: string;
  /** Executable fix suggestion, aimed at agents. */
  hint?: string;
  context?: { maxRadius?: number; failingEdges?: number[] };
}

export type RunResult =
  | { ok: true; snapshot: Snapshot; describe: Describe; warnings: string[] }
  | { ok: false; error: OpError; lastGood: Snapshot };

export interface Limits {
  timeoutMs?: number;
  memoryMB?: number;
  maxOps?: number;
}

export interface SessionOptions {
  limits?: Limits;
  seed?: number;
}
