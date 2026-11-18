/**
 * Pure logic for the part timer on the session page: when a part's planned
 * time ends, how much time is left, and the timer kept in localStorage.
 * Free of React and the browser so it can be unit-tested.
 *
 * A running timer is stored as its absolute end moment (milliseconds since
 * the epoch), never as a counter, so it stays right after the page has been
 * hidden, frozen or reloaded: the time left is always recomputed from the clock.
 */

import { MAX_DURATION, MIN_DURATION, parseTime } from "./outline";

export type TimerMode = "countdown" | "plan";

export type StoredTimer = {
  partId: string;
  mode: TimerMode;
  /** The end moment, in milliseconds since the epoch. */
  endsAt: number;
  /** True once the sound for this end has been played on this device. */
  rang: boolean;
  /** True once a background notification for this end has been shown. */
  notified: boolean;
};

/** Session dates and times are Swedish local time. */
export const SESSION_TIME_ZONE = "Europe/Stockholm";

/** A timer that ran out longer ago than this is forgotten. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/** A stored end further ahead than this is treated as corrupt. */
export const MAX_AHEAD_MS = 8 * 24 * 60 * 60 * 1000;

const MINUTE = 60_000;

/**
 * How long after the end the alert sound may keep repeating. A forgotten
 * phone stops ringing; the visual alert stays until it is handled.
 */
export const ALERT_SOUND_MAX_MS = 2 * MINUTE;

/**
 * Whether the alert sound repeats ("loop") or plays one short round
 * ("once"): it loops unless the time ran out two minutes ago or more.
 */
export function alertSoundMode(endsAt: number, now: number): "loop" | "once" {
  return alertSoundCapReached(endsAt, now) ? "once" : "loop";
}

/** True once the repeating alert sound has run for its two minutes. */
export function alertSoundCapReached(endsAt: number, now: number): boolean {
  return now - endsAt >= ALERT_SOUND_MAX_MS;
}

/** The localStorage key of a session's timer. */
export function timerStorageKey(sessionId: string): string {
  return `part-timer:${sessionId}`;
}

/** The offset of `zone` from UTC at the instant `utcMs`, in milliseconds. */
function zoneOffset(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `zone` shows `minutes` past
 * midnight on `date` (`YYYY-MM-DD`). Minutes past 24 hours run into the
 * next day.
 */
export function zonedMoment(date: string, minutes: number, zone = SESSION_TIME_ZONE): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    return null;
  }
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + minutes * MINUTE;
  // Guess with the offset at the wall time, then correct once for a
  // daylight-saving change between the guess and the answer.
  let utc = wall - zoneOffset(wall, zone);
  utc = wall - zoneOffset(utc, zone);
  return utc;
}

/**
 * When part `index` is planned to end: the session's start time plus the
 * durations of every part up to and including it, on the session's date.
 * Null unless the start time and all those durations are known.
 */
export function plannedEnd(
  date: string,
  startTime: string | null,
  durations: readonly (number | null)[],
  index: number,
  zone = SESSION_TIME_ZONE,
): number | null {
  const start = parseTime(startTime);
  if (start === null || index < 0 || index >= durations.length) {
    return null;
  }
  let minutes = start;
  for (let i = 0; i <= index; i++) {
    const d = durations[i];
    if (d === null) {
      return null;
    }
    minutes += d;
  }
  return zonedMoment(date, minutes, zone);
}

/** "17:45" for an instant, in the session's time zone. */
export function clockTime(ms: number, zone = SESSION_TIME_ZONE): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/** Milliseconds left until `endsAt`; never below zero. */
export function remainingMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/**
 * Time left as "mm:ss", rounded up to whole seconds so "00:00" shows only
 * when the time is up. Minutes are not wrapped into hours: "90:00".
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Whole minutes since the time ran out; 0 within the first minute. */
export function minutesSinceEnd(endsAt: number, now: number): number {
  return Math.max(0, Math.floor((now - endsAt) / MINUTE));
}

/** The minutes typed in the countdown field, or null unless a whole number in range. */
export function parseMinutes(input: string): number | null {
  const text = input.trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const n = Number(text);
  return n >= MIN_DURATION && n <= MAX_DURATION ? n : null;
}

/** A new countdown of `minutes` from `now`. */
export function countdownTimer(partId: string, minutes: number, now: number): StoredTimer {
  return { partId, mode: "countdown", endsAt: now + minutes * MINUTE, rang: false, notified: false };
}

/** A timer that ends at the part's planned end, or null if that has passed. */
export function planTimer(partId: string, endsAt: number, now: number): StoredTimer | null {
  if (endsAt <= now) {
    return null;
  }
  return { partId, mode: "plan", endsAt, rang: false, notified: false };
}

/** The timer one minute longer; an alert that was given is given again. */
export function addMinute(timer: StoredTimer, now: number): StoredTimer {
  const endsAt = Math.max(timer.endsAt, now) + MINUTE;
  return { ...timer, endsAt, rang: false, notified: false };
}

/**
 * The timer stored for a session, or null if there is none, it cannot be
 * read, or it ran out so long ago that it no longer matters.
 */
export function parseStoredTimer(raw: string | null | undefined, now: number): StoredTimer | null {
  if (!raw) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.partId !== "string" || v.partId === "" || v.partId.length > 100) {
    return null;
  }
  if (v.mode !== "countdown" && v.mode !== "plan") {
    return null;
  }
  if (typeof v.endsAt !== "number" || !Number.isFinite(v.endsAt)) {
    return null;
  }
  if (v.endsAt < now - STALE_AFTER_MS || v.endsAt > now + MAX_AHEAD_MS) {
    return null;
  }
  return {
    partId: v.partId,
    mode: v.mode,
    endsAt: v.endsAt,
    rang: v.rang === true,
    notified: v.notified === true,
  };
}

/** The timer as stored in localStorage. */
export function serializeTimer(timer: StoredTimer): string {
  return JSON.stringify(timer);
}
