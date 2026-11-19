/*
 * Pure rules for station layouts (docs/data-model.md, "Station layout
 * item"): the input a layout is saved with, which equipment may be placed
 * and how often, and which items no longer fit after the station's equipment
 * changed. Shared by the server, which enforces them, and the browser, which
 * offers only what fits and warns before a save removes something.
 */
import { z } from "zod";

import { ARROW_MAX_CM, ARROW_MIN_CM, arrowSize, MAX_TEXT_LENGTH, textSize } from "./drawing/annotations";
import { unionBounds, type Placed, type Rect } from "./drawing/editor";
import { MAX_LABEL_LENGTH, normalizeDegrees } from "./halls";

/** How far from the station's centre an item's centre may be, in centimetres (10 m). */
export const STATION_LAYOUT_HALF_CM = 1000;

/** Most items one layout may have. */
export const MAX_LAYOUT_ITEMS = 200;

export const LAYOUT_ITEM_KINDS = ["equipment", "arrow", "text"] as const;
export type LayoutItemKind = (typeof LAYOUT_ITEM_KINDS)[number];

/** One line of the station's needed equipment, as far as placing goes. */
export type EquipmentLine = { equipmentId: string; quantity: number };

/** What the placing rules need of an item. */
export type LayoutItemLike = { kind: LayoutItemKind; equipmentId?: string | null };

type Placement = { id: string; xCm: number; yCm: number; rotation: number; label: string | null };

/** A layout item as drawings get it; equipment items carry their configuration's size and look. */
export type DrawnLayoutItem =
  | (Placement & {
      kind: "equipment";
      equipmentId: string;
      configurationId: string;
      equipmentName: string;
      configurationName: string;
      widthCm: number;
      lengthCm: number;
      color: string | null;
      imageUrl: string | null;
    })
  | (Placement & { kind: "arrow"; lengthCm: number })
  | (Placement & { kind: "text"; text: string });

// --- Drawing ---------------------------------------------------------------------------

/** An item's box in metres before rotation: a configuration's size, an arrow's length or a text's line. */
export function layoutItemSize(item: DrawnLayoutItem): { width: number; height: number } {
  if (item.kind === "equipment") {
    return { width: item.widthCm / 100, height: item.lengthCm / 100 };
  }
  return item.kind === "arrow" ? arrowSize(item.lengthCm) : textSize(item.text);
}

/** An item placed in metres around the station's centre (0, 0). */
export function placedLayoutItem(item: DrawnLayoutItem): Placed {
  return { id: item.id, x: item.xCm / 100, y: item.yCm / 100, rotation: item.rotation, ...layoutItemSize(item) };
}

/**
 * The part of the plane a layout's drawing shows, in metres around the
 * station's centre: every item with a margin, at least `minimum` across
 * both ways and centred on the items. Null for an empty layout.
 */
export function layoutView(items: readonly DrawnLayoutItem[], margin = 0.4, minimum = 2): Rect | null {
  const bounds = unionBounds(items.map(placedLayoutItem));
  if (!bounds) {
    return null;
  }
  const width = Math.max(bounds.width + 2 * margin, minimum);
  const height = Math.max(bounds.height + 2 * margin, minimum);
  return {
    x: bounds.x + bounds.width / 2 - width / 2,
    y: bounds.y + bounds.height / 2 - height / 2,
    width,
    height,
  };
}

// --- Input ---------------------------------------------------------------------------

const uuid = z.uuid({ error: "invalid" });

const position = z
  .number({ error: "invalid" })
  .int({ error: "invalid" })
  .min(-STATION_LAYOUT_HALF_CM, { error: "invalid" })
  .max(STATION_LAYOUT_HALF_CM, { error: "invalid" });

const rotation = z
  .number({ error: "invalid" })
  .finite({ error: "invalid" })
  .transform((v) => normalizeDegrees(v));

const label = z
  .string({ error: "invalid" })
  .trim()
  .max(MAX_LABEL_LENGTH, { error: "labelTooLong" })
  .nullish()
  .transform((v) => (v ? v : null));

const placement = { id: uuid, xCm: position, yCm: position, rotation, label };

const equipmentItem = z
  .object({ ...placement, kind: z.literal("equipment"), equipmentId: uuid, configurationId: uuid })
  .strict();

const arrowItem = z
  .object({
    ...placement,
    kind: z.literal("arrow"),
    lengthCm: z
      .number({ error: "arrowLengthInvalid" })
      .int({ error: "arrowLengthInvalid" })
      .min(ARROW_MIN_CM, { error: "arrowLengthInvalid" })
      .max(ARROW_MAX_CM, { error: "arrowLengthInvalid" }),
  })
  .strict();

const textItem = z
  .object({
    ...placement,
    kind: z.literal("text"),
    text: z
      .string({ error: "layoutTextRequired" })
      .transform((v) => v.replace(/\s+/g, " ").trim())
      .pipe(
        z
          .string()
          .min(1, { error: "layoutTextRequired" })
          .max(MAX_TEXT_LENGTH, { error: "layoutTextTooLong" }),
      ),
  })
  .strict();

export const layoutItemInput = z.discriminatedUnion("kind", [equipmentItem, arrowItem, textItem], {
  error: "invalid",
});

export type LayoutItemInput = z.input<typeof layoutItemInput>;
export type LayoutItemValues = z.output<typeof layoutItemInput>;

/** A whole layout in layer order, bottom first; every id once. */
export const stationLayoutInput = z
  .array(layoutItemInput, { error: "invalid" })
  .max(MAX_LAYOUT_ITEMS, { error: "tooManyLayoutItems" })
  .refine((items) => new Set(items.map((i) => i.id.toLowerCase())).size === items.length, {
    error: "invalid",
  });

// --- Placing rules ---------------------------------------------------------------------

/** How many more of each needed equipment may be placed, by equipment id. */
export function placementsLeft(
  items: readonly LayoutItemLike[],
  lines: readonly EquipmentLine[],
): Map<string, number> {
  const left = new Map(lines.map((l) => [l.equipmentId, l.quantity]));
  for (const item of items) {
    if (item.kind === "equipment" && item.equipmentId && left.has(item.equipmentId)) {
      left.set(item.equipmentId, left.get(item.equipmentId)! - 1);
    }
  }
  return left;
}

/** True when one more of the equipment may be placed. */
export function canPlace(
  equipmentId: string,
  items: readonly LayoutItemLike[],
  lines: readonly EquipmentLine[],
): boolean {
  return (placementsLeft(items, lines).get(equipmentId) ?? 0) > 0;
}

/**
 * Splits a layout into the items that fit the station's equipment and those
 * that do not: equipment the station no longer needs, and placements beyond
 * a line's quantity, the topmost first (items are in layer order, bottom
 * first, so the lowest placements are kept). Arrows and texts always fit.
 * Both lists keep the layout's order.
 */
export function pruneLayout<T extends LayoutItemLike>(
  items: readonly T[],
  lines: readonly EquipmentLine[],
): { kept: T[]; removed: T[] } {
  const left = new Map(lines.map((l) => [l.equipmentId, l.quantity]));
  const kept: T[] = [];
  const removed: T[] = [];
  for (const item of items) {
    if (item.kind !== "equipment") {
      kept.push(item);
      continue;
    }
    const n = item.equipmentId ? (left.get(item.equipmentId) ?? 0) : 0;
    if (n > 0) {
      left.set(item.equipmentId!, n - 1);
      kept.push(item);
    } else {
      removed.push(item);
    }
  }
  return { kept, removed };
}

/**
 * True when every equipment item names a configuration of its own equipment,
 * given each configuration's equipment by id.
 */
export function configurationsMatch(
  items: readonly { kind: LayoutItemKind; equipmentId?: string | null; configurationId?: string | null }[],
  equipmentOf: ReadonlyMap<string, string>,
): boolean {
  return items.every(
    (i) =>
      i.kind !== "equipment" ||
      (i.configurationId != null && equipmentOf.get(i.configurationId) === i.equipmentId),
  );
}
