import type { ShapeHandle } from "./kernel/types";

/**
 * Op recording — the day-one rule from docs/architecture.md §3.3:
 * every mutating core operation goes through `record()`, so the runtime
 * Session/OpLog can observe, snapshot and replay the exact same stream
 * regardless of which API style (core algebra or workplane facade) produced it.
 *
 * With no subscribers installed this is a transparent pass-through.
 */

export interface OpRecord {
  /** Monotonic, process-wide — the id the OpLog keys snapshots by. */
  readonly id: number;
  readonly type: string;
  readonly args: unknown;
}

export type OpStatus = "done" | "error";

export interface OpEvent {
  readonly op: OpRecord;
  readonly status: OpStatus;
  readonly result?: ShapeHandle;
  readonly error?: unknown;
}

export type OpListener = (event: OpEvent) => void;

let nextOpId = 1;
const listeners = new Set<OpListener>();

/** Subscribe to every recorded operation. Returns an unsubscribe function. */
export function onOp(listener: OpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs `run()` and records it as one op. Errors propagate unchanged after
 * being recorded — structured error mapping (runtime) subscribes via onOp.
 */
export function record<T>(type: string, args: unknown, run: () => T): T {
  const op: OpRecord = { id: nextOpId++, type, args };
  try {
    const result = run();
    for (const listener of listeners) {
      listener({ op, status: "done", result: result as ShapeHandle | undefined });
    }
    return result;
  } catch (error) {
    for (const listener of listeners) {
      listener({ op, status: "error", error });
    }
    throw error;
  }
}
