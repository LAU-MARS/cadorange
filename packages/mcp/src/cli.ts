#!/usr/bin/env node
/**
 * `cado` CLI — run / describe / export models from the command line.
 *
 * Skeleton stage: only --help works; subcommands land with the M0 milestone.
 */

const USAGE = `cado — agent-native CAD CLI (M0 skeleton)

Usage:
  cado run <model.ts> [--render iso,top,front] [--export step,stl]
  cado describe <model.ts> [--json]
  cado --help

Subcommands are not implemented yet. See the roadmap in the repository README.
`;

/** Entry point, exported for tests. Returns the desired process exit code. */
export function main(argv: string[]): number {
  const [cmd] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    return cmd ? 0 : 1;
  }
  process.stderr.write(`cado: "${cmd}" is not implemented yet (M0 skeleton)\n`);
  return 1;
}

// Run only when executed directly (node dist/cli.js or tsx src/cli.ts).
const invoked =
  typeof process !== "undefined" &&
  (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js"));
if (invoked) {
  process.exitCode = main(process.argv.slice(2));
}
