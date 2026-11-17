/**
 * Browser side effects of the part timer: sound, vibration, keeping the
 * screen awake and the background notification. Every function does nothing
 * where the browser lacks the feature, and never throws.
 */

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

/** Three short beeps, made with the Web Audio API. */
export function playChime(): void {
  try {
    unlockAudio();
    const ctx = audio;
    if (!ctx) {
      return;
    }
    const start = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const at = start + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.6, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.27);
    }
  } catch {
    // No sound is better than a broken page.
  }
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // Not supported.
  }
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
