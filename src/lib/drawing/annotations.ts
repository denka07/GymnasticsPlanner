/*
 * Pure geometry of the drawn plans' annotations: arrows and short texts
 * (docs/data-model.md, "Station layout item" and "Plan item"). Shared by
 * station layouts and session plans. Everything is in metres. Like any placed
 * item, an annotation is drawn from (0, 0) to its width and height and then
 * placed at its centre and rotation: an arrow at rotation 0 points right
 * (along x), and a text reads left to right.
 */

import { tidy, type Point } from "./editor";

/** How thick an arrow's box is, in metres: what can be clicked and the head's width. */
export const ARROW_THICKNESS = 0.4;
/** Shortest and longest arrows, in centimetres. */
export const ARROW_MIN_CM = 10;
export const ARROW_MAX_CM = 5000;
/** A new arrow's length, in centimetres. */
export const DEFAULT_ARROW_CM = 300;

/** A text's height in metres; its width follows its length. */
export const TEXT_SIZE = 0.4;
/** Longest text, in characters. */
export const MAX_TEXT_LENGTH = 200;
/** Roughly how wide a character is, as a share of the text's height. */
const CHAR_WIDTH = 0.58;

export type ArrowShape = {
  /** The shaft, from the tail to where the head begins. */
  shaft: { x1: number; y1: number; x2: number; y2: number };
  /** The head's three corners: the tip last. */
  head: [Point, Point, Point];
};

/**
 * An arrow `length` metres long in a box `thickness` high, pointing right:
 * a shaft along the middle and a filled head at the right end. The head is
 * at most a third of the length, so a short arrow still has a shaft.
 */
export function arrowShape(length: number, thickness = ARROW_THICKNESS): ArrowShape {
  const mid = thickness / 2;
  const headLength = tidy(Math.min(thickness * 1.25, length / 3));
  const neck = tidy(length - headLength);
  return {
    shaft: { x1: 0, y1: mid, x2: neck, y2: mid },
    head: [
      { x: neck, y: 0 },
      { x: neck, y: thickness },
      { x: tidy(length), y: mid },
    ],
  };
}

/** An arrow's box in metres, from its length in centimetres. */
export function arrowSize(lengthCm: number): { width: number; height: number } {
  return { width: lengthCm / 100, height: ARROW_THICKNESS };
}

/** Where an arrow's tip is, given its centre, length (metres) and rotation (degrees clockwise). */
export function arrowTip(center: Point, length: number, rotation: number): Point {
  const r = (rotation * Math.PI) / 180;
  return {
    x: tidy(center.x + (Math.cos(r) * length) / 2),
    y: tidy(center.y + (Math.sin(r) * length) / 2),
  };
}

/**
 * A text's box in metres: one line `size` high and about as wide as its
 * characters, with a little room on both sides. An empty text keeps a
 * square box so it can still be picked.
 */
export function textSize(text: string, size = TEXT_SIZE): { width: number; height: number } {
  const chars = [...text.trim()].length;
  return { width: tidy(Math.max(size, (chars * CHAR_WIDTH + 0.5) * size)), height: size };
}

/** A text cut to the longest allowed, on one line. */
export function cleanText(text: string): string {
  return [...text.replace(/\s+/g, " ").trim()].slice(0, MAX_TEXT_LENGTH).join("");
}
