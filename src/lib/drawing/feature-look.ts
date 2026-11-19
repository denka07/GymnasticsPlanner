/*
 * Lines that give hall features their default look when they have no image
 * (docs/data-model.md, "Hall feature"): wall bars striped, storage hatched,
 * stands as rows. Pure, in the feature's own metres with (0, 0) at its
 * top-left corner, so they can be tested and drawn the same everywhere.
 */

export type Segment = { x1: number; y1: number; x2: number; y2: number };

/** Most lines one feature gets, so a huge feature stays cheap to draw. */
const MAX_LINES = 400;

function spacingFor(length: number, spacing: number): number {
  return Math.max(spacing, length / MAX_LINES);
}

/**
 * Rungs across the feature's long side, every `spacing` metres: wall bars
 * seen from above.
 */
export function stripeLines(width: number, height: number, spacing = 0.15): Segment[] {
  const along = width >= height;
  const length = along ? width : height;
  const step = spacingFor(length, spacing);
  const lines: Segment[] = [];
  for (let p = step; p < length - 1e-9; p += step) {
    lines.push(along ? { x1: p, y1: 0, x2: p, y2: height } : { x1: 0, y1: p, x2: width, y2: p });
  }
  return lines;
}

/** Rows along the feature's long side, every `spacing` metres: stands. */
export function rowLines(width: number, height: number, spacing = 0.8): Segment[] {
  const along = width >= height;
  const depth = along ? height : width;
  const step = spacingFor(depth, spacing);
  const lines: Segment[] = [];
  for (let p = step; p < depth - 1e-9; p += step) {
    lines.push(along ? { x1: 0, y1: p, x2: width, y2: p } : { x1: p, y1: 0, x2: p, y2: height });
  }
  return lines;
}

/**
 * Diagonal hatching (from bottom left to top right) every `spacing` metres,
 * cut to the rectangle: storage.
 */
export function hatchLines(width: number, height: number, spacing = 0.5): Segment[] {
  const step = spacingFor(width + height, spacing);
  const lines: Segment[] = [];
  // Lines x + y = c for c between 0 and width + height.
  for (let c = step; c < width + height - 1e-9; c += step) {
    const x1 = Math.max(0, c - height);
    const y1 = c - x1;
    const x2 = Math.min(width, c);
    const y2 = c - x2;
    lines.push({ x1, y1, x2, y2 });
  }
  return lines;
}

/**
 * A door seen from above: the leaf, as wide as the opening and swung open
 * into the hall, and the arc it sweeps. The opening runs along the feature's
 * long side and the hall side is below it (+y) before rotation.
 */
export function doorSwing(width: number, height: number): { leaf: Segment; arc: string } {
  const along = width >= height;
  if (along) {
    const r = width;
    return {
      leaf: { x1: 0, y1: height, x2: 0, y2: height + r },
      arc: `M ${r} ${height} A ${r} ${r} 0 0 1 0 ${height + r}`,
    };
  }
  const r = height;
  return {
    leaf: { x1: width, y1: 0, x2: width + r, y2: 0 },
    arc: `M ${width} ${r} A ${r} ${r} 0 0 0 ${width + r} 0`,
  };
}
