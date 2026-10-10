import type { Describe } from "../index";
import { todo } from "../util";
import type { Limits, Op, RunResult, SessionOptions, Snapshot } from "./types";

export interface RenderOpts {
  views?: string[];
  size?: number;
  format?: "png" | "svg";
}

export type ExportFormat = "step" | "stl" | "glb" | "brep";

/**
 * An agent-facing modeling session.
 *
 * `run` and `apply` both write into the same OpLog; every core op funnels
 * through a single record() entry point so the log is always complete.
 * That invariant is fixed from day one — retrofitting it later is painful.
 */
export class Session {
  static async create(_opts: SessionOptions = {}): Promise<Session> {
    todo("Session.create");
  }

  /** Runs TypeScript modeling code in the sandbox. */
  async run(_code: string): Promise<RunResult> {
    todo("Session.run");
  }

  /** Applies one structured action (same log, no code). */
  async apply(_op: Op): Promise<RunResult> {
    todo("Session.apply");
  }

  /** Cheap: op index plus cached shape hashes, no geometry copy. */
  snapshot(): Snapshot {
    todo("Session.snapshot");
  }

  fork(_snap?: Snapshot): Session {
    todo("Session.fork");
  }

  rollback(_snap: Snapshot): void {
    todo("Session.rollback");
  }

  describe(): Describe {
    todo("Session.describe");
  }

  async render(_opts: RenderOpts): Promise<Uint8Array[]> {
    todo("Session.render");
  }

  async export(_fmt: ExportFormat): Promise<Uint8Array> {
    todo("Session.export");
  }

  get limits(): Limits {
    return todo("Session.limits");
  }
}

export type {
  ErrorCode,
  Limits,
  Op,
  OpError,
  OpLog,
  RunResult,
  SessionOptions,
  Snapshot,
} from "./types";
