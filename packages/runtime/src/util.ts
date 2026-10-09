/** Thrown by every skeleton stub until the real M0 implementation lands. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet — this is the M0 repository skeleton.`);
    this.name = "NotImplementedError";
  }
}

/** Stub body helper: keeps signatures real while bodies wait for M0. */
export function todo(what: string): never {
  throw new NotImplementedError(what);
}
