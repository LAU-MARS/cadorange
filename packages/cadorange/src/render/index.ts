import type { Shape } from "../index";
import { todo } from "../util";

export type View = "iso" | "top" | "front" | "back" | "left" | "right" | "bottom";

export interface RenderOptions {
  views?: View[];
  /** Square output size in pixels (default 512). */
  size?: number;
  format?: "png" | "svg";
}

export interface Rendered {
  view: View;
  format: "png" | "svg";
  data: Uint8Array;
}

/**
 * Renders a shape from multiple views without a GPU or a browser window,
 * so vision models can check their own work.
 */
export async function render(shape: Shape, opts: RenderOptions = {}): Promise<Rendered[]> {
  void shape;
  void opts;
  todo("render");
}
