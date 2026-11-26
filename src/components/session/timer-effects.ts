/**
 * Browser side effects of the part timer: sound, vibration, keeping the
 * screen awake and the background notification. Every function does nothing
 * where the browser lacks the feature, and never throws.
 */

import {
  ALERT_SOUND_KEY,
  ALERT_SOUND_NOTES,
  DEFAULT_ALERT_SOUND,
  parseAlertSound,
  type AlertSound,
} from "@/lib/alert-sounds";

const NOTIFICATIONS_ASKED_KEY = "part-timer:notifications-asked";
/** The service worker only needs to control the session pages. */
const SW_SCOPE = "/sessions/";

let audio: AudioContext | null = null;

/**
 * Creates and resumes the audio context. Call from a tap: browsers only let
 * a page start sound after the user has interacted with it.
 */
export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    audio ??= new Ctor();
    if (audio.state !== "running") {
      void audio.resume().catch(() => {});
    }
  } catch {
    audio = null;
  }
}

/** Time from the start of one round to the next, with a pause in between. */
const ROUND_MS = 2600;
/** The vibration pattern of one round, in milliseconds (vibrate, pause, ...). */
const VIBRATION = [400, 150, 400, 150, 400];
const SOUND_CHANGE_EVENT = "alert-sound-change";

/** The choice when localStorage cannot be used (e.g. blocked site data). */
let soundInMemory: AlertSound = DEFAULT_ALERT_SOUND;

/** The alarm sound chosen on this device; the default when none is saved. */
export function readAlertSound(): AlertSound {
  try {
    return parseAlertSound(window.localStorage.getItem(ALERT_SOUND_KEY));
  } catch {
    return soundInMemory;
  }
}

/** Saves the alarm sound for every timer on this device. */
export function saveAlertSound(sound: AlertSound): void {
  soundInMemory = sound;
  try {
    window.localStorage.setItem(ALERT_SOUND_KEY, sound);
  } catch {
    // Blocked site data: the choice lasts while the page is open.
  }
  window.dispatchEvent(new Event(SOUND_CHANGE_EVENT));
}

/** Calls `onChange` when the chosen sound changes, here or in another tab. */
export function subscribeAlertSound(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ALERT_SOUND_KEY || e.key === null) {
      onChange();
    }
  };
  window.addEventListener(SOUND_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SOUND_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Plays one round of the given alarm sound (see `ALERT_SOUND_NOTES`). */
export function playRound(sound: AlertSound): void {
  try {
    unlockAudio();
    const ctx = audio;
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + 0.05;
    for (const note of ALERT_SOUND_NOTES[sound]) {
      const at = start + note.at;
      for (const tone of note.tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.value = note.frequency * tone.ratio;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(tone.volume, at + tone.attack);
        if (tone.holdUntil > tone.attack) {
          gain.gain.setValueAtTime(tone.volume, at + tone.holdUntil);
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + tone.end + 0.02);
      }
    }
  } catch {
    // No sound is better than a broken page.
  }
}

/**
 * Vibrates with the alarm pattern. Chrome only vibrates while the page is
 * visible and has had a tap since it loaded; otherwise the call is ignored
 * and returns false. Returns whether the browser accepted the call.
 */
export function vibrate(): boolean {
  try {
    if (document.visibilityState !== "visible") {
      return false;
    }
    return navigator.vibrate?.(VIBRATION) ?? false;
  } catch {
    return false;
  }
}

/**
 * Sounds (with the sound chosen on this device) and vibrates the alarm now and, when `loop` is set, again every
 * round until `stopAt` (milliseconds since the epoch) or until the returned
 * function is called. Without `loop` it is one round.
 */
export function startAlarm(options: { loop: boolean; stopAt: number }): () => void {
  let timer: number | undefined;
  let stopped = false;
  const sound = readAlertSound();
  const round = () => {
    if (stopped) {
      return;
    }
    playRound(sound);
    vibrate();
    if (options.loop && Date.now() + ROUND_MS < options.stopAt) {
      timer = window.setTimeout(round, ROUND_MS);
    }
  };
  // The page coming back to the front: vibrate at once, as a hidden page cannot.
  const onVisible = () => {
    if (!stopped && options.loop && document.visibilityState === "visible") {
      window.clearTimeout(timer);
      round();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  round();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    try {
      navigator.vibrate?.(0);
    } catch {
      // Not supported.
    }
  };
}

/** Holds a screen wake lock while wanted, taking it again when the page returns. */
export class ScreenAwake {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    if (this.sentinel && !this.sentinel.released) {
      return;
    }
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") {
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!this.wanted) {
        void sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
    } catch {
      // Denied (e.g. battery saver) or unsupported: the timer still works.
    }
  }

  release(): void {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) {
      void sentinel.release().catch(() => {});
    }
  }
}

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: SW_SCOPE });
  } catch {
    return null;
  }
}

/** Registers the worker when notifications are already allowed, so it is ready later. */
export function prepareNotifications(): void {
  if (notificationsSupported() && Notification.permission === "granted") {
    void registerWorker();
  }
}

/**
 * Asks for permission to notify, once per device and only from a tap. A
 * refusal is never asked about again.
 */
export function askForNotifications(): void {
  if (!notificationsSupported()) {
    return;
  }
  try {
    if (Notification.permission === "granted") {
      void registerWorker();
      return;
    }
    if (Notification.permission !== "default" || localStorage.getItem(NOTIFICATIONS_ASKED_KEY)) {
      return;
    }
    localStorage.setItem(NOTIFICATIONS_ASKED_KEY, "1");
    void Notification.requestPermission()
      .then((permission) => {
        if (permission === "granted") {
          void registerWorker();
        }
      })
      .catch(() => {});
  } catch {
    // Storage or permissions blocked.
  }
}

/**
 * Shows a notification through the service worker (Android Chrome does not
 * allow `new Notification()` from a page). Resolves to whether it was shown.
 */
export async function showTimerNotification(
  title: string,
  body: string,
  sessionId: string,
): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? (await registerWorker());
    if (!registration) {
      return false;
    }
    await registration.showNotification(title, {
      body,
      tag: `part-timer-${sessionId}`,
      requireInteraction: true,
      data: { url: `/sessions/${sessionId}` },
    });
    return true;
  } catch {
    return false;
  }
}

/** The current time; read in event handlers, never during render. */
export function clockNow(): number {
  return Date.now();
}
