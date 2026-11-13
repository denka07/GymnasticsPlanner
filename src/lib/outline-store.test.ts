import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activity, part, type OutlineLine, type SavedPart } from "./outline";
import { OutlineStore, SAVE_DELAY, type SaveResult } from "./outline-store";

const SESSION = "00000000-0000-4000-8000-000000000001";
const placeholder = {
  seasonId: "00000000-0000-4000-8000-000000000002",
  trainingSlotId: "00000000-0000-4000-8000-000000000003",
  weekStart: "2026-08-31",
};

/** A save function whose calls the test resolves by hand. */
function controlledSave() {
  const calls: { target: unknown; parts: SavedPart[]; resolve: (r: SaveResult) => void }[] = [];
  const save = (target: unknown, parts: SavedPart[]) =>
    new Promise<SaveResult>((resolve) => calls.push({ target, parts, resolve }));
  return { calls, save };
}

function titles(parts: SavedPart[]) {
  return parts.map((p) => p.title);
}

const lines = (...names: string[]): OutlineLine[] => names.map((n, i) => part(`p${i}`, n));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("OutlineStore", () => {
  it("saves once typing pauses, then reports saved", async () => {
    const { calls, save } = controlledSave();
    const store = new OutlineStore(lines("A"), { sessionId: SESSION });
    store.setHandlers(save, () => {}, () => {});
    store.setLines(lines("AB"));
    store.setLines(lines("ABC"));
    expect(store.getSnapshot().status).toBe("saving");
    vi.advanceTimersByTime(SAVE_DELAY - 1);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(1);
    expect(titles(calls[0].parts)).toEqual(["ABC"]);
    calls[0].resolve({ ok: true, sessionId: SESSION });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("sends edits made while a save is in flight afterwards", async () => {
    const { calls, save } = controlledSave();
    const store = new OutlineStore(lines("A"), { sessionId: SESSION });
    store.setHandlers(save, () => {}, () => {});
    store.setLines(lines("A1"));
    store.flush();
    expect(calls).toHaveLength(1);
    store.setLines(lines("A1", "B"));
    store.flush();
    // Still one in flight: nothing new is sent yet.
    expect(calls).toHaveLength(1);
    calls[0].resolve({ ok: true, sessionId: SESSION });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(titles(calls[1].parts)).toEqual(["A1", "B"]);
    expect(store.getSnapshot().status).toBe("saving");
    calls[1].resolve({ ok: true, sessionId: SESSION });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("switches from a placeholder to the stored session after the first save", async () => {
    const { calls, save } = controlledSave();
    const stored = vi.fn();
    const store = new OutlineStore([], placeholder);
    store.setHandlers(save, () => {}, stored);
    store.setLines([part("p", "Samling")]);
    store.flush();
    expect(calls[0].target).toEqual(placeholder);
    calls[0].resolve({ ok: true, sessionId: SESSION });
    await vi.runAllTimersAsync();
    expect(stored).toHaveBeenCalledWith(SESSION);
    expect(store.currentTarget).toEqual({ sessionId: SESSION });
    store.setLines([part("p", "Samling!")]);
    store.flush();
    expect(calls[1].target).toEqual({ sessionId: SESSION });
  });

  it("keeps edits after a failure and retries on the next edit only", async () => {
    const { calls, save } = controlledSave();
    const onError = vi.fn();
    const store = new OutlineStore(lines("A"), { sessionId: SESSION });
    store.setHandlers(save, onError, () => {});
    store.setLines(lines("B"));
    store.flush();
    calls[0].resolve({ ok: false, error: "tooManyParts" });
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith("tooManyParts");
    expect(store.getSnapshot().status).toBe("failed");
    expect(store.getSnapshot().lines[0].text).toBe("B");
    store.flush();
    expect(calls).toHaveLength(1);
    store.setLines(lines("C"));
    store.flush();
    expect(calls).toHaveLength(2);
  });

  it("settles: resolves after waiting edits are saved", async () => {
    const { calls, save } = controlledSave();
    const store = new OutlineStore(lines("A"), { sessionId: SESSION });
    store.setHandlers(save, () => {}, () => {});
    store.setLines(lines("B"));
    let settled = false;
    const done = store.settle().then(() => (settled = true));
    expect(calls).toHaveLength(1);
    await Promise.resolve();
    expect(settled).toBe(false);
    calls[0].resolve({ ok: true, sessionId: SESSION });
    await done;
    expect(settled).toBe(true);
  });

  it("replaces the outline as saved, cancelling a pending save", async () => {
    const { calls, save } = controlledSave();
    const store = new OutlineStore(lines("A"), placeholder);
    store.setHandlers(save, () => {}, () => {});
    store.setLines(lines("B"));
    store.replace([part("x", "Kopia"), activity("y", "Rad")], SESSION);
    vi.advanceTimersByTime(SAVE_DELAY * 2);
    expect(calls).toHaveLength(0);
    expect(store.getSnapshot().lines.map((l) => l.text)).toEqual(["Kopia", "Rad"]);
    expect(store.currentTarget).toEqual({ sessionId: SESSION });
  });

  it("starts with one empty part for an empty outline", () => {
    const store = new OutlineStore([], placeholder);
    expect(store.getSnapshot().lines).toHaveLength(1);
    expect(store.getSnapshot().lines[0].kind).toBe("part");
    expect(store.getSnapshot().status).toBe("idle");
  });
});
