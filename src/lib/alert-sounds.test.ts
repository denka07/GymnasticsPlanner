import { describe, expect, it } from "vitest";

import {
  ALERT_SOUND_NOTES,
  ALERT_SOUNDS,
  DEFAULT_ALERT_SOUND,
  isAlertSound,
  parseAlertSound,
  roundLength,
} from "./alert-sounds";

/** Time from the start of one alarm round to the next, as in timer-effects. */
const ROUND_MS = 2600;

describe("alert sounds", () => {
  it("offers five sounds with the chime as the default", () => {
    expect(ALERT_SOUNDS).toEqual(["beeps", "low", "chime", "marimba", "dingdong"]);
    expect(DEFAULT_ALERT_SOUND).toBe("chime");
  });

  it("parses a stored value, falling back to the chime", () => {
    for (const sound of ALERT_SOUNDS) {
      expect(parseAlertSound(sound)).toBe(sound);
    }
    expect(parseAlertSound(null)).toBe("chime");
    expect(parseAlertSound(undefined)).toBe("chime");
    expect(parseAlertSound("")).toBe("chime");
    expect(parseAlertSound("siren")).toBe("chime");
    expect(parseAlertSound("Beeps")).toBe("chime");
    expect(parseAlertSound("toString")).toBe("chime");
  });

  it("tells sound ids from other values", () => {
    expect(isAlertSound("marimba")).toBe(true);
    expect(isAlertSound("constructor")).toBe(false);
    expect(isAlertSound(3)).toBe(false);
  });

  it("keeps the beeps as they were and lowers them by an octave for the low beeps", () => {
    const freqs = (s: "beeps" | "low") => ALERT_SOUND_NOTES[s].map((n) => n.frequency);
    expect(freqs("beeps")).toEqual([880, 1109, 1397]);
    expect(freqs("low")).toEqual([440, 554, 698]);
    expect(ALERT_SOUND_NOTES.beeps.map((n) => n.at)).toEqual([0, 0.4, 0.8]);
  });

  it("builds the chime and ding-dong from bells with overtones", () => {
    const chime = ALERT_SOUND_NOTES.chime;
    expect(chime.map((n) => n.frequency)).toEqual([523, 659, 784]);
    expect(chime[0].tones.map((t) => t.ratio)).toEqual([1, 2, 3]);
    expect(chime[0].tones[1].volume).toBeCloseTo(0.35 * 0.35);
    const dingdong = ALERT_SOUND_NOTES.dingdong;
    expect(dingdong.map((n) => [n.at, n.frequency])).toEqual([
      [0, 659],
      [0.55, 523],
    ]);
  });

  it("fits every round, with a pause, inside the alarm's round time", () => {
    for (const sound of ALERT_SOUNDS) {
      expect(roundLength(sound) * 1000).toBeLessThan(ROUND_MS);
      for (const note of ALERT_SOUND_NOTES[sound]) {
        for (const tone of note.tones) {
          expect(tone.attack).toBeGreaterThan(0);
          expect(Math.max(tone.attack, tone.holdUntil)).toBeLessThan(tone.end);
          expect(tone.volume).toBeGreaterThan(0);
          expect(tone.volume).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });
});
