/**
 * The save loop of the session outline editor, without React, so it can be
 * unit-tested. See OutlineStore.
 */
import type { SessionTarget } from "./data/schemas";
import { ensureLines, toSavedParts, type OutlineLine, type SavedPart } from "./outline";

/** How long typing must pause before the outline is sent, in milliseconds. */
export const SAVE_DELAY = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export type Snapshot = { lines: OutlineLine[]; status: SaveStatus };

export type SaveResult = { ok: true; sessionId: string } | { ok: false; error: string };
export type SaveFn = (target: SessionTarget, parts: SavedPart[]) => Promise<SaveResult>;

export const newLineId = () => crypto.randomUUID();

/**
 * Holds a session's outline outside React so the save loop can run across
 * renders. Every change bumps a version; one save is in flight at a time and
 * sends the whole outline. When it returns, anything typed meanwhile is sent
 * next, so no edit is lost. A failed save is not retried until the next edit.
 */
export class OutlineStore {
  private lines: OutlineLine[];
  private version = 0;
  private savedVersion = 0;
  private failedVersion: number | null = null;
  private savedOnce = false;
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private save: SaveFn = async () => ({ ok: false, error: "unexpected" });
  private onError: (message: string) => void = () => {};
  private onStored: (sessionId: string) => void = () => {};

  constructor(
    lines: OutlineLine[],
    private target: SessionTarget,
  ) {
    this.lines = ensureLines(lines, newLineId);
    this.snapshot = { lines: this.lines, status: "idle" };
  }

  setHandlers(
    save: SaveFn,
    onError: (message: string) => void,
    onStored: (sessionId: string) => void,
  ) {
    this.save = save;
    this.onError = onError;
    this.onStored = onStored;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private status(): SaveStatus {
    if (this.failedVersion === this.version) {
      return "failed";
    }
    if (this.version !== this.savedVersion) {
      return "saving";
    }
    return this.savedOnce ? "saved" : "idle";
  }

  private emit() {
    const status = this.status();
    if (this.snapshot.lines === this.lines && this.snapshot.status === status) {
      return;
    }
    this.snapshot = { lines: this.lines, status };
    this.listeners.forEach((l) => l());
  }

  get dirty() {
    return this.version !== this.savedVersion;
  }

  get currentTarget() {
    return this.target;
  }

  /** Replaces the outline after an edit and saves it shortly. */
  setLines = (lines: OutlineLine[]) => {
    this.lines = lines;
    this.version++;
    this.emit();
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, SAVE_DELAY);
  };

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private pump() {
    if (this.inFlight || this.version === this.savedVersion || this.failedVersion === this.version) {
      return;
    }
    const version = this.version;
    const parts = toSavedParts(this.lines);
    this.inFlight = this.save(this.target, parts)
      .catch((): SaveResult => ({ ok: false, error: "unexpected" }))
      .then((result) => {
        this.inFlight = null;
        if (result.ok) {
          if (!("sessionId" in this.target) || this.target.sessionId !== result.sessionId) {
            this.target = { sessionId: result.sessionId };
            this.onStored(result.sessionId);
          }
          this.savedVersion = version;
          this.savedOnce = true;
          this.failedVersion = null;
        } else {
          this.failedVersion = this.version;
          this.onError(result.error);
        }
        this.emit();
        // Send what was typed meanwhile.
        if (this.timer === null) {
          this.pump();
        }
      });
  }

  /** Sends waiting edits now, without the typing delay. */
  flush = () => {
    this.clearTimer();
    this.pump();
  };

  /** Sends waiting edits and resolves once nothing is in flight. */
  settle = async () => {
    this.flush();
    while (this.inFlight) {
      await this.inFlight;
    }
  };

  /** Takes an outline from the server (after a copy) as saved. */
  replace(lines: OutlineLine[], sessionId: string) {
    this.clearTimer();
    this.lines = ensureLines(lines, newLineId);
    this.version++;
    this.savedVersion = this.version;
    this.failedVersion = null;
    this.target = { sessionId };
    this.emit();
  }
}
