/**
 * The sounds the part timer's alarm can play. The choice is stored on the
 * device (each phone plays its own sound), under `ALERT_SOUND_KEY`.
 */

/** The sound ids, in the order they are offered. */
export const ALERT_SOUNDS = ["beeps", "low", "chime", "marimba", "dingdong"] as const;

export type AlertSound = (typeof ALERT_SOUNDS)[number];

export const DEFAULT_ALERT_SOUND: AlertSound = "chime";

/** The localStorage key of the chosen sound. */
export const ALERT_SOUND_KEY = "gp.alertSound";

export function isAlertSound(value: unknown): value is AlertSound {
  return typeof value === "string" && (ALERT_SOUNDS as readonly string[]).includes(value);
}

/** Reads a stored value; anything unknown or missing gives the default. */
export function parseAlertSound(value: string | null | undefined): AlertSound {
  return isAlertSound(value) ? value : DEFAULT_ALERT_SOUND;
}

/** One oscillator of a note, relative to the note's start and frequency. */
export type Tone = {
  type: OscillatorType;
  /** Multiple of the note's frequency. */
  ratio: number;
  /** Peak volume (gain). */
  volume: number;
  /** Seconds from the start to the peak. */
  attack: number;
  /** Seconds from the start until which the peak is held; 0 to decay at once. */
  holdUntil: number;
  /** Seconds from the start until the sound has faded out. */
  end: number;
};

export type Note = {
  /** Seconds from the start of the round. */
  at: number;
  frequency: number;
  tones: Tone[];
};

function beep(at: number, frequency: number): Note {
  return {
    at,
    frequency,
    tones: [{ type: "square", ratio: 1, volume: 0.5, attack: 0.02, holdUntil: 0.28, end: 0.33 }],
  };
}

/** A struck bell: the fundamental and two quieter, shorter overtones. */
function bell(at: number, frequency: number, volume = 0.35, decay = 1.6): Note {
  return {
    at,
    frequency,
    tones: [
      { type: "sine", ratio: 1, volume, attack: 0.01, holdUntil: 0, end: decay },
      { type: "sine", ratio: 2, volume: volume * 0.35, attack: 0.01, holdUntil: 0, end: 0.8 },
      { type: "sine", ratio: 3, volume: volume * 0.12, attack: 0.01, holdUntil: 0, end: 0.4 },
    ],
  };
}

function marimba(at: number, frequency: number): Note {
  return {
    at,
    frequency,
    tones: [
      { type: "triangle", ratio: 1, volume: 0.5, attack: 0.005, holdUntil: 0, end: 0.45 },
      { type: "sine", ratio: 4, volume: 0.08, attack: 0.005, holdUntil: 0, end: 0.08 },
    ],
  };
}

const steps = (gap: number, frequencies: number[], note: (at: number, f: number) => Note) =>
  frequencies.map((f, i) => note(i * gap, f));

/** The notes of one round of each sound. */
export const ALERT_SOUND_NOTES: Record<AlertSound, Note[]> = {
  beeps: steps(0.4, [880, 1109, 1397], beep),
  low: steps(0.4, [440, 554, 698], beep),
  chime: steps(0.35, [523, 659, 784], (at, f) => bell(at, f)),
  marimba: steps(0.18, [392, 523, 659, 784], marimba),
  dingdong: [bell(0, 659, 0.4, 1.4), bell(0.55, 523, 0.4, 1.8)],
};

/** Seconds from the start of a round until its last note has faded out. */
export function roundLength(sound: AlertSound): number {
  return Math.max(
    ...ALERT_SOUND_NOTES[sound].flatMap((n) => n.tones.map((p) => n.at + p.end)),
  );
}
