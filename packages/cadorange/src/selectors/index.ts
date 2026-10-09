import { todo } from "../util";

/**
 * Parses CadQuery-style selector strings: ">Z" (topmost), "|Z" (parallel to Z),
 * "#face"/"#edge" (by type), and combinations like ">Z and |X".
 *
 * `filterBy`/`groupBy`/`sortBy` themselves live on ShapeList (see topo).
 */
export function parseSelector(_selector: string): unknown {
  todo("parseSelector");
}
