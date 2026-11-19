/*
 * Undo and redo for the drawing editor, as pure functions over immutable
 * states. Each committed change is one step; a drag commits once, when it
 * ends.
 */

export type History<S> = {
  past: S[];
  present: S;
  future: S[];
};

/** How many steps back can be undone. */
export const HISTORY_LIMIT = 100;

export function createHistory<S>(present: S): History<S> {
  return { past: [], present, future: [] };
}

/**
 * Makes `next` the present, so undo goes back to the current one. Redo is
 * cleared. Committing the present itself changes nothing. At most `limit`
 * steps are kept.
 */
export function commit<S>(history: History<S>, next: S, limit = HISTORY_LIMIT): History<S> {
  if (Object.is(next, history.present)) {
    return history;
  }
  const past = [...history.past, history.present];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [] };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

export function undo<S>(history: History<S>): History<S> {
  if (!canUndo(history)) {
    return history;
  }
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<S>(history: History<S>): History<S> {
  if (!canRedo(history)) {
    return history;
  }
  const [next, ...future] = history.future;
  return { past: [...history.past, history.present], present: next, future };
}
