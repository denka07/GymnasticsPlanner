"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  addMinute,
  parseStoredTimer,
  serializeTimer,
  timerStorageKey,
  type StoredTimer,
} from "@/lib/part-timer";

import { unlockAudio } from "./timer-effects";

/** How often the shown time is recomputed from the clock, in milliseconds. */
const TICK_MS = 250;
const CHANGE_EVENT = "part-timer-change";

/** Fallback when localStorage cannot be used (e.g. blocked site data). */
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string | null): void {
  if (value === null) {
    memory.delete(key);
  } else {
    memory.set(key, value);
  }
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Kept in memory for this page only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeStorage(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function subscribeVisibility(callback: () => void): () => void {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

/**
 * The session's timer on this device, kept in localStorage as its end
 * moment, and the current time, recomputed from the clock several times a
 * second and whenever the page becomes visible again.
 */
export function usePartTimer(sessionId: string) {
  const key = timerStorageKey(sessionId);
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readRaw(key),
    () => null,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
  // 0 until the first tick after mounting; nothing is shown before then.
  const [now, setNow] = useState(0);

  const hasRaw = raw !== null;
  useEffect(() => {
    if (!hasRaw) {
      return;
    }
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tick);
    // After a reload the audio context is locked again until the next tap.
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("pointerdown", unlockAudio);
    };
  }, [hasRaw]);

  const timer = useMemo(() => (now === 0 ? null : parseStoredTimer(raw, now)), [raw, now]);

  // Forget a value that cannot be read or ran out long ago.
  useEffect(() => {
    if (now !== 0 && raw !== null && timer === null) {
      writeRaw(key, null);
    }
  }, [key, now, raw, timer]);

  const save = useCallback((next: StoredTimer | null) => {
    writeRaw(key, next === null ? null : serializeTimer(next));
  }, [key]);

  const start = useCallback(
    (next: StoredTimer) => {
      save(next);
      setNow(Date.now());
    },
    [save],
  );
  const stop = useCallback(() => save(null), [save]);
  const extend = useCallback(() => {
    const current = parseStoredTimer(readRaw(key), Date.now());
    if (current) {
      save(addMinute(current, Date.now()));
      setNow(Date.now());
    }
  }, [key, save]);
  const mark = useCallback(
    (flag: "rang" | "notified") => {
      const current = parseStoredTimer(readRaw(key), Date.now());
      if (current && !current[flag]) {
        save({ ...current, [flag]: true });
      }
    },
    [key, save],
  );

  return { timer, now, visible, start, stop, extend, mark };
}
