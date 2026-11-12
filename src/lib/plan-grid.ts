/**
 * State of the season plan grid in the browser: painting strokes, undo and
 * saving. Pure functions only, so they can be unit-tested; the React
 * component keeps a `GridState` and replaces it with what these return.
 *
 * Saving is serialised: at most one batch is in flight. A batch holds every
 * cell whose shown level differs from the last saved level at the moment it
 * is sent, so later strokes are never lost: they are sent with the next
 * batch, once the earlier one has settled.
 */

export type Level = "high" | "medium" | "low";

/** The level of a cell; null means not trained that week (no allocation). */
export type CellLevel = Level | null;

/** `${focusItemId}|${weekStart}` */
export type CellKey = string;

/** Levels by cell. A missing key means null. */
export type Levels = Readonly<Record<CellKey, Level>>;

export type CellChange = {
  key: CellKey;
  before: CellLevel;
  after: CellLevel;
};

/** Cells changed by one mouse drag, tap or key press, in the order touched. */
export type Stroke = readonly CellChange[];

/** What the server is sent: one entry per cell whose level changes. */
export type SaveChange = {
  focusItemId: string;
  weekStart: string;
  level: CellLevel;
};

export type GridState = {
  /** What the grid shows, including unsaved changes. */
  current: Levels;
  /** What the server is known to have. */
  saved: Levels;
  /** The batch being saved, or null. */
  inFlight: readonly SaveChange[] | null;
  /** Strokes of this visit, newest last. */
  undo: readonly Stroke[];
};

export function cellKey(focusItemId: string, weekStart: string): CellKey {
  return `${focusItemId}|${weekStart}`;
}

export function parseCellKey(key: CellKey): { focusItemId: string; weekStart: string } {
  const at = key.lastIndexOf("|");
  return { focusItemId: key.slice(0, at), weekStart: key.slice(at + 1) };
}

export function levelOf(levels: Levels, key: CellKey): CellLevel {
  return Object.hasOwn(levels, key) ? levels[key] : null;
}

function withLevel(levels: Levels, key: CellKey, level: CellLevel): Levels {
  if (levelOf(levels, key) === level) {
    return levels;
  }
  const next = { ...levels };
  if (level === null) {
    delete next[key];
  } else {
    next[key] = level;
  }
  return next;
}

export function initialState(
  allocations: readonly { focusItemId: string; weekStart: string; level: Level }[],
): GridState {
  const levels: Record<CellKey, Level> = {};
  for (const a of allocations) {
    levels[cellKey(a.focusItemId, a.weekStart)] = a.level;
  }
  return { current: levels, saved: levels, inFlight: null, undo: [] };
}

// --- Strokes -------------------------------------------------------------

/**
 * The level a plain click (or tap, or Space/Enter) gives a cell: the brush,
 * or nothing if the cell already has the brush's level.
 */
export function clickLevel(current: CellLevel, brush: CellLevel): CellLevel {
  return current === brush ? null : brush;
}

/**
 * Sets `key` to `level` as part of `stroke`. The first time a stroke touches
 * a cell it records the level before; touching it again keeps that. Returns
 * the state and stroke unchanged if nothing changes.
 */
export function paintCell(
  state: GridState,
  stroke: Stroke,
  key: CellKey,
  level: CellLevel,
): { state: GridState; stroke: Stroke } {
  const before = levelOf(state.current, key);
  if (before === level) {
    return { state, stroke };
  }
  const index = stroke.findIndex((c) => c.key === key);
  const nextStroke =
    index === -1
      ? [...stroke, { key, before, after: level }]
      : stroke.map((c, i) => (i === index ? { ...c, after: level } : c));
  return {
    state: { ...state, current: withLevel(state.current, key, level) },
    stroke: nextStroke,
  };
}

/**
 * Ends a stroke: records it for undo unless it changed nothing in the end
 * (for example a drag that painted a cell and then cleared it again).
 */
export function commitStroke(state: GridState, stroke: Stroke): GridState {
  const effective = stroke.filter((c) => c.before !== c.after);
  if (effective.length === 0) {
    return state;
  }
  return { ...state, undo: [...state.undo, effective] };
}

/** Puts back the levels the last stroke replaced. */
export function undo(state: GridState): GridState {
  const last = state.undo.at(-1);
  if (!last) {
    return state;
  }
  let current = state.current;
  for (const change of last) {
    current = withLevel(current, change.key, change.before);
  }
  return { ...state, current, undo: state.undo.slice(0, -1) };
}

// --- Saving --------------------------------------------------------------

/** Cells whose shown level differs from the saved one, as server changes. */
export function pendingChanges(state: GridState): SaveChange[] {
  const keys = new Set([...Object.keys(state.current), ...Object.keys(state.saved)]);
  const changes: SaveChange[] = [];
  for (const key of keys) {
    const level = levelOf(state.current, key);
    if (level !== levelOf(state.saved, key)) {
      changes.push({ ...parseCellKey(key), level });
    }
  }
  return changes;
}

/** True when something is being saved or waits to be. */
export function isDirty(state: GridState): boolean {
  return state.inFlight !== null || pendingChanges(state).length > 0;
}

/**
 * Starts saving: returns the batch to send and the state with it in flight,
 * or null if a batch is already in flight or there is nothing to save.
 */
export function startSave(
  state: GridState,
): { state: GridState; batch: SaveChange[] } | null {
  if (state.inFlight !== null) {
    return null;
  }
  const batch = pendingChanges(state);
  if (batch.length === 0) {
    return null;
  }
  return { state: { ...state, inFlight: batch }, batch };
}

/**
 * Settles the batch in flight. On success its levels become the saved ones.
 * On failure each of its cells goes back to its saved level, unless a later
 * stroke has changed the cell again since; that change is kept and sent with
 * the next batch. Returns the keys of the cells that were reverted.
 */
export function finishSave(
  state: GridState,
  ok: boolean,
): { state: GridState; reverted: CellKey[] } {
  const batch = state.inFlight;
  if (batch === null) {
    return { state, reverted: [] };
  }
  if (ok) {
    let saved = state.saved;
    for (const change of batch) {
      saved = withLevel(saved, cellKey(change.focusItemId, change.weekStart), change.level);
    }
    return { state: { ...state, saved, inFlight: null }, reverted: [] };
  }
  let current = state.current;
  const reverted: CellKey[] = [];
  for (const change of batch) {
    const key = cellKey(change.focusItemId, change.weekStart);
    if (levelOf(current, key) === change.level) {
      current = withLevel(current, key, levelOf(state.saved, key));
      reverted.push(key);
    }
  }
  return { state: { ...state, current, inFlight: null }, reverted };
}

// --- Layout and keyboard -------------------------------------------------

/**
 * For each focus item of a discipline, how many rows its category label
 * cell spans: consecutive items with the same category share one cell, which
 * belongs to the first of them (span >= 1); the others get 0. Items without a
 * category get their own empty cell.
 */
export function categorySpans(items: readonly { category: string | null }[]): number[] {
  const spans = items.map(() => 0);
  let start = 0;
  for (let i = 1; i <= items.length; i++) {
    const category = items[start]?.category ?? null;
    const same = i < items.length && category !== null && items[i].category === category;
    if (!same) {
      spans[start] = i - start;
      start = i;
    }
  }
  return spans;
}

export type GridPosition = { row: number; col: number };

/** Where an arrow, Home or End key moves focus in a grid of rows × cols; null for other keys. */
export function moveFocus(
  { row, col }: GridPosition,
  key: string,
  rows: number,
  cols: number,
  ctrl = false,
): GridPosition | null {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
  switch (key) {
    case "ArrowUp":
      return { row: clamp(row - 1, rows), col };
    case "ArrowDown":
      return { row: clamp(row + 1, rows), col };
    case "ArrowLeft":
      return { row, col: clamp(col - 1, cols) };
    case "ArrowRight":
      return { row, col: clamp(col + 1, cols) };
    case "Home":
      return ctrl ? { row: 0, col: 0 } : { row, col: 0 };
    case "End":
      return ctrl ? { row: rows - 1, col: cols - 1 } : { row, col: cols - 1 };
    default:
      return null;
  }
}

/** The level a key sets on a focused cell, or undefined for keys that set none. */
export function keyLevel(
  key: string,
  brush: CellLevel,
): CellLevel | undefined {
  switch (key) {
    case "1":
      return "high";
    case "2":
      return "medium";
    case "3":
      return "low";
    case "0":
    case "Delete":
    case "Backspace":
      return null;
    case " ":
    case "Enter":
      return brush;
    default:
      return undefined;
  }
}
