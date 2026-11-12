"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { saveFocusAllocationsAction } from "@/app/plan-actions";
import {
  commitStroke,
  finishSave,
  initialState,
  isDirty,
  paintCell,
  setBreakWeeks,
  startSave,
  undo,
  type CellKey,
  type CellLevel,
  type GridState,
  type Level,
  type SaveChange,
  type Stroke,
} from "@/lib/plan-grid";

import { useErrorMessage } from "./use-error-message";

/** How long keyboard edits wait before they are sent, in milliseconds. */
const KEYBOARD_SAVE_DELAY = 400;

export type SaveStatus = "idle" | "saving" | "saved";

type Snapshot = { grid: GridState; savedOnce: boolean };

/** Sends a batch; resolves to null on success or a Swedish error message. */
type SaveFn = (batch: SaveChange[]) => Promise<string | null>;

/**
 * Holds the grid state outside React so that the save loop can run across
 * renders. State changes go through the pure functions of plan-grid.ts.
 */
class PlanGridStore {
  private snapshot: Snapshot;
  private stroke: Stroke | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private save: SaveFn = async () => null;
  private onError: (message: string) => void = () => {};

  constructor(grid: GridState) {
    this.snapshot = { grid, savedOnce: false };
  }

  /** Sets how batches are sent and failures reported; called after every render. */
  setHandlers(save: SaveFn, onError: (message: string) => void) {
    this.save = save;
    this.onError = onError;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(grid: GridState, savedOnce = this.snapshot.savedOnce) {
    if (grid === this.snapshot.grid && savedOnce === this.snapshot.savedOnce) {
      return;
    }
    this.snapshot = { grid, savedOnce };
    this.listeners.forEach((l) => l());
  }

  /** Sends the next batch unless one is in flight, a stroke is open or keyboard edits are settling. */
  private pump() {
    if (this.timer !== null || this.stroke !== null) {
      return;
    }
    const started = startSave(this.snapshot.grid);
    if (!started) {
      return;
    }
    this.set(started.state);
    this.save(started.batch)
      .then((error) => {
        const { state } = finishSave(this.snapshot.grid, error === null);
        this.set(state, error === null);
        if (error !== null) {
          this.onError(error);
        }
        // Send what was painted meanwhile.
        this.pump();
      });
  }

  private saveSoon() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, KEYBOARD_SAVE_DELAY);
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Sends waiting changes now, without the keyboard delay. */
  flush = () => {
    this.clearTimer();
    this.pump();
  };

  beginStroke = () => {
    this.stroke = [];
  };

  /** Paints a cell as part of the open stroke. */
  paint = (key: CellKey, level: CellLevel) => {
    const result = paintCell(this.snapshot.grid, this.stroke ?? [], key, level);
    if (this.stroke !== null) {
      this.stroke = result.stroke;
    }
    this.set(result.state);
  };

  /** Ends the open stroke, records it for undo and saves it. */
  endStroke = () => {
    const stroke = this.stroke;
    if (stroke === null) {
      return;
    }
    this.stroke = null;
    this.set(commitStroke(this.snapshot.grid, stroke));
    this.flush();
  };

  /** A one-cell edit (tap or key press) as its own undo step. */
  setCell = (key: CellKey, level: CellLevel, { debounce }: { debounce: boolean }) => {
    const { state, stroke } = paintCell(this.snapshot.grid, [], key, level);
    this.set(commitStroke(state, stroke));
    if (debounce) {
      this.saveSoon();
    } else {
      this.flush();
    }
  };

  /** Follows the page when a week is marked or unmarked as a break. */
  setBreakWeeks = (breakWeeks: readonly string[]) => {
    this.set(setBreakWeeks(this.snapshot.grid, breakWeeks));
  };

  undo = () => {
    if (this.stroke !== null) {
      return;
    }
    this.set(undo(this.snapshot.grid));
    this.flush();
  };
}

/**
 * Grid state for one visit of the season page: painting, undo and saving,
 * one batch at a time, with failures shown as a toast.
 */
export function usePlanGrid(
  seasonId: string,
  allocations: readonly { focusItemId: string; weekStart: string; level: Level }[],
  breakWeeks: readonly string[],
) {
  const t = useTranslations("Plan");
  const errorMessage = useErrorMessage();
  const [store] = useState(() => new PlanGridStore(initialState(allocations, breakWeeks)));
  const breakKey = breakWeeks.join();

  // A week marked as a break loses its cells; one unmarked stays empty.
  useEffect(() => {
    store.setBreakWeeks(breakKey === "" ? [] : breakKey.split(","));
  }, [store, breakKey]);
  const { grid, savedOnce } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    store.setHandlers(
      (batch) =>
        saveFocusAllocationsAction(seasonId, batch).then(
          (result) => (result.ok ? null : errorMessage(result.error)),
          () => errorMessage("unexpected"),
        ),
      (message) => toast.error(t("saveFailed"), { description: message }),
    );
  });

  // Leaving the page sends keyboard edits that are still waiting.
  useEffect(() => store.flush, [store]);

  const dirty = isDirty(grid);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const status: SaveStatus = dirty ? "saving" : savedOnce ? "saved" : "idle";

  return {
    levels: grid.current,
    breakWeeks: grid.breakWeeks,
    canUndo: grid.undo.length > 0,
    status,
    beginStroke: store.beginStroke,
    paint: store.paint,
    endStroke: store.endStroke,
    setCell: store.setCell,
    undo: store.undo,
  };
}
