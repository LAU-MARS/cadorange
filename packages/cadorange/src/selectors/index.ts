/**
 * Selector engine — one predicate core, two skins (docs/api-map.md):
 *
 * - build123d skin: typed `ShapeList.filterBy/groupBy/sortBy` (lives in topo).
 * - CadQuery skin: the string DSL parsed here, used by the workplane facade.
 *
 * M0 grammar (CadQuery subset):
 *   ">Z" "<Z"     extreme-most along +Z / −Z (by sub-shape center projection)
 *   ">>Z" "<<Z"   second-most extreme group
 *   "|Z" "|X"     direction parallel to the axis (faces by normal, line edges
 *                 by tangent) — same predicate as `filterBy(Axis.Z)`
 *   "#face" "#edge" "#solid" ...   sub-shape type
 *   "and" "or" "not" "(" ")"       boolean combination
 *
 * Min/max selectors are list-relative (they pick the extreme of *what was
 * passed in*), so a Selector transforms a list rather than testing one item.
 */

import { Axis } from "../geom";
import { Edge, Face } from "../topo";

export type SubShape = Face | Edge;

export interface Selector {
  /** The source string, for error messages and op-log readability. */
  readonly source: string;
  select(items: readonly SubShape[]): SubShape[];
}

/* --------------------------------- lexer --------------------------------- */

type Token =
  | { t: "(" }
  | { t: ")" }
  | { t: "and" }
  | { t: "or" }
  | { t: "not" }
  | { t: "type"; kind: string }
  | { t: "dir"; axis: "X" | "Y" | "Z" }
  | { t: "minmax"; axis: "X" | "Y" | "Z"; dir: "max" | "min"; nth: number };

const TOKEN_RE = /\s*(>>|<<|#\w+|[|<>()]|\w+)/y;

function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  TOKEN_RE.lastIndex = 0;
  while (i < source.length) {
    TOKEN_RE.lastIndex = i;
    const m = TOKEN_RE.exec(source);
    if (!m) {
      if (/^\s+$/.test(source.slice(i))) {
        break;
      }
      throw new Error(`Invalid selector string ${JSON.stringify(source)} at position ${i}.`);
    }
    i = TOKEN_RE.lastIndex;
    const text = m[1] ?? "";
    if (text.startsWith("#")) {
      tokens.push({ t: "type", kind: text.slice(1).toLowerCase() });
    } else if (text === ">>" || text === "<<") {
      const rest = source.slice(i);
      const axis = /^([XYZ])/.exec(rest);
      if (!axis) {
        throw new Error(`Expected an axis after "${text}" in ${JSON.stringify(source)}.`);
      }
      i += 1;
      tokens.push({
        t: "minmax",
        axis: axis[1] as "X" | "Y" | "Z",
        dir: text === ">>" ? "max" : "min",
        nth: 2,
      });
    } else if (text === ">" || text === "<") {
      const rest = source.slice(i);
      const axis = /^([XYZ])/.exec(rest);
      if (!axis) {
        throw new Error(`Expected an axis after "${text}" in ${JSON.stringify(source)}.`);
      }
      i += 1;
      tokens.push({
        t: "minmax",
        axis: axis[1] as "X" | "Y" | "Z",
        dir: text === ">" ? "max" : "min",
        nth: 1,
      });
    } else if (text === "|") {
      const rest = source.slice(i);
      const axis = /^([XYZ])/.exec(rest);
      if (!axis) {
        throw new Error(`Expected an axis after "|" in ${JSON.stringify(source)}.`);
      }
      i += 1;
      tokens.push({ t: "dir", axis: axis[1] as "X" | "Y" | "Z" });
    } else if (text === "(") {
      tokens.push({ t: "(" });
    } else if (text === ")") {
      tokens.push({ t: ")" });
    } else {
      const word = text.toLowerCase();
      if (word === "and" || word === "or" || word === "not") {
        tokens.push({ t: word });
      } else {
        throw new Error(
          `Unknown selector token ${JSON.stringify(text)} in ${JSON.stringify(source)}.`,
        );
      }
    }
  }
  return tokens;
}

/* ------------------------------ parser/AST ------------------------------- */

type Node =
  | { k: "type"; kind: string }
  | { k: "dir"; axis: "X" | "Y" | "Z" }
  | { k: "minmax"; axis: "X" | "Y" | "Z"; dir: "max" | "min"; nth: number }
  | { k: "and"; a: Node; b: Node }
  | { k: "or"; a: Node; b: Node }
  | { k: "not"; a: Node };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): Node {
    let left = parseTerm();
    while (peek()?.t === "or") {
      next();
      left = { k: "or", a: left, b: parseTerm() };
    }
    return left;
  }

  function parseTerm(): Node {
    let left = parseFactor();
    while (peek()?.t === "and") {
      next();
      left = { k: "and", a: left, b: parseFactor() };
    }
    return left;
  }

  function parseFactor(): Node {
    const tok = next();
    if (!tok) {
      throw new Error("Selector ended unexpectedly.");
    }
    if (tok.t === "not") {
      return { k: "not", a: parseFactor() };
    }
    if (tok.t === "(") {
      const inner = parseExpr();
      if (next()?.t !== ")") {
        throw new Error("Missing ')' in selector.");
      }
      return inner;
    }
    if (tok.t === "type" || tok.t === "dir" || tok.t === "minmax") {
      return { k: tok.t, ...tok } as Node;
    }
    throw new Error(`Unexpected token in selector: ${JSON.stringify(tok)}.`);
  }

  const node = parseExpr();
  if (pos !== tokens.length) {
    throw new Error(`Trailing tokens in selector: ${JSON.stringify(tokens.slice(pos))}.`);
  }
  return node;
}

/* ------------------------------- evaluation ------------------------------ */

const AXES = { X: Axis.X, Y: Axis.Y, Z: Axis.Z } as const;

function apply(node: Node, items: readonly SubShape[]): SubShape[] {
  switch (node.k) {
    case "type": {
      const isFace = node.kind === "face" || node.kind === "shell";
      const isEdge = node.kind === "edge" || node.kind === "wire";
      if (!isFace && !isEdge) {
        // #solid/#vertex/... — never present in an M0 sub-shape list.
        return [];
      }
      return items.filter((s) => (isFace ? s instanceof Face : s instanceof Edge));
    }
    case "dir": {
      const axis = AXES[node.axis];
      return items.filter((s) => {
        if (s instanceof Face) {
          return (
            s.meta.surface === "plane" &&
            s.meta.normal !== undefined &&
            axis.isParallel(new Axis(s.meta.center, s.meta.normal))
          );
        }
        return (
          s.meta.curve === "line" &&
          s.meta.direction !== undefined &&
          axis.isParallel(new Axis(s.meta.center, s.meta.direction))
        );
      });
    }
    case "minmax": {
      if (items.length === 0) {
        return [];
      }
      const axisVec: readonly [number, number, number] =
        node.axis === "X" ? [1, 0, 0] : node.axis === "Y" ? [0, 1, 0] : [0, 0, 1];
      const keyed = items.map((s) => ({
        s,
        key: s.center[0] * axisVec[0] + s.center[1] * axisVec[1] + s.center[2] * axisVec[2],
      }));
      const sign = node.dir === "max" ? -1 : 1;
      keyed.sort((a, b) => sign * (a.key - b.key));
      // group by key with a scale-aware tolerance, then take the nth group
      const tol = 1e-4 * (1 + Math.abs(keyed[0]?.key ?? 0));
      const groups: Array<{ s: SubShape; key: number }>[] = [];
      for (const entry of keyed) {
        const last = groups[groups.length - 1];
        if (last && Math.abs((last[0]?.key ?? 0) - entry.key) <= tol) {
          last.push(entry);
        } else {
          groups.push([entry]);
        }
      }
      const group = groups[node.nth - 1] ?? [];
      return group.map((g) => g.s);
    }
    case "and": {
      const a = apply(node.a, items);
      const b = new Set(apply(node.b, items));
      return a.filter((s) => b.has(s));
    }
    case "or": {
      const seen = new Set(apply(node.a, items));
      for (const s of apply(node.b, items)) {
        seen.add(s);
      }
      return [...seen];
    }
    case "not": {
      const excluded = new Set(apply(node.a, items));
      return items.filter((s) => !excluded.has(s));
    }
  }
}

/** Parses a CadQuery-style selector string into an executable selector. */
export function parseSelector(source: string): Selector {
  const node = parse(lex(source));
  return {
    source,
    select: (items) => apply(node, items),
  };
}
