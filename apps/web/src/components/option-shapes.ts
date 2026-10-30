/** SPEC §4 Interfaz: each option has a shape as well as a color, so color is never the only cue. */
export const OPTION_SHAPES = ['triangle', 'diamond', 'circle', 'square'] as const;
export type OptionShapeName = (typeof OPTION_SHAPES)[number];

/** A, B, C, D: shown next to the shape and read by screen readers. */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
