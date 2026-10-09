import { todo } from "../util";
import type { Kernel } from "./types";

export interface InitOptions {
  /** Explicit URL or path to the OCCT WASM binary (file, http(s) or data:). */
  wasmUrl?: string;
}

/**
 * Loads the OCCT WASM kernel exactly once per process.
 *
 * Must work in Node, browsers and Web Workers, and must honor an explicit
 * `wasmUrl`. Validating this across all three targets is the top M0 risk —
 * do it in week one.
 */
export async function init(_opts: InitOptions = {}): Promise<void> {
  todo("init (occt.ts WASM loading)");
}

/** Builds the occt.ts-backed Kernel. The single OCCT import site lives here. */
export function createOcctKernel(): Kernel {
  todo("createOcctKernel");
}
