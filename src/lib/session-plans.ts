/*
 * Pure rules for session plans (docs/data-model.md, "Session plan" and
 * "Plan item"): the input a plan is saved with, which parts a plan applies
 * to, how placed stations are numbered and linked to activities, and how
 * plans follow a copied outline. Shared by the server, which enforces them,
 * and the browser, which shows the same numbers while drawing.
 */
import { z } from "zod";

import { ARROW_MAX_CM, ARROW_MIN_CM, arrowSize, MAX_TEXT_LENGTH, textSize } from "./drawing/annotations";
import { unionBounds } from "./drawing/editor";
import { HALL_MAX_CM, MAX_LABEL_LENGTH, normalizeDegrees } from "./halls";
import {
  layoutItemInput,
  MAX_LAYOUT_ITEMS,
  placedLayoutItem,
  type DrawnLayoutItem,
} from "./station-layouts";

export const PLAN_ITEM_KINDS = ["equipment", "station", "text", "area", "person", "arrow"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PERSON_ROLES = ["coach", "passare"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/** Most items one plan may have. */
export const MAX_PLAN_ITEMS = 400;
/** Longest plan name. */
export const MAX_PLAN_NAME_LENGTH = 60;
/** Most parts one plan may be attached to. */
export const MAX_PLAN_PARTS = 100;
/** A person's circle, across, in centimetres. */
export const PERSON_CM = 70;
/** A new area's size, in centimetres. */
export const DEFAULT_AREA_CM = { width: 400, length: 300 };
/** A station without a layout is drawn as a square this many metres across. */
export const EMPTY_STATION_M = 2;

// --- Drawn items ------------------------------------------------------------------------

/** What a plan item is, without where it is. */
export type PlanItemContent =
  | {
      kind: "equipment";
      equipmentId: string;
      configurationId: string;
      equipmentName: string;
      configurationName: string;
      widthCm: number;
      lengthCm: number;
      color: string | null;
      imageUrl: string | null;
    }
  | {
      kind: "station";
      /** Null only for an adapted copy of a station that was deleted. */
      stationId: string | null;
      activityId: string | null;
      adapted: boolean;
      /** The station's name; for an adapted copy the name it was adapted with. */
      name: string;
      /** The library layout, or the adapted copy's own; positions around the station's centre. */
      layout: DrawnLayoutItem[];
    }
  | { kind: "text"; text: string }
  | { kind: "area"; widthCm: number; lengthCm: number }
  | { kind: "person"; role: PersonRole }
  | { kind: "arrow"; lengthCm: number };

/** A plan item as drawings get it: centre in whole centimetres from the hall's corner. */
export type DrawnPlanItem = {
  id: string;
  xCm: number;
  yCm: number;
  rotation: number;
  label: string | null;
  content: PlanItemContent;
};

/**
 * A station's box in metres, centred on the station's centre so that the
 * centre stays where the item is placed: wide enough for every layout item
 * on both sides. A station without a layout is a square.
 */
export function stationBox(layout: readonly DrawnLayoutItem[]): { width: number; height: number } {
  const bounds = unionBounds(layout.map(placedLayoutItem));
  if (!bounds) {
    return { width: EMPTY_STATION_M, height: EMPTY_STATION_M };
  }
  const halfX = Math.max(Math.abs(bounds.x), Math.abs(bounds.x + bounds.width));
  const halfY = Math.max(Math.abs(bounds.y), Math.abs(bounds.y + bounds.height));
  return { width: Math.max(2 * halfX, 0.5), height: Math.max(2 * halfY, 0.5) };
}

/** An item's box in metres before rotation. */
export function contentSize(content: PlanItemContent): { width: number; height: number } {
  switch (content.kind) {
    case "equipment":
    case "area":
      return { width: content.widthCm / 100, height: content.lengthCm / 100 };
    case "station":
      return stationBox(content.layout);
    case "text":
      return textSize(content.text);
    case "person":
      return { width: PERSON_CM / 100, height: PERSON_CM / 100 };
    case "arrow":
      return arrowSize(content.lengthCm);
  }
}

// --- Input -------------------------------------------------------------------------------

const uuid = z.uuid({ error: "invalid" });

const position = z
  .number({ error: "invalid" })
  .int({ error: "invalid" })
  .min(0, { error: "invalid" })
  .max(HALL_MAX_CM, { error: "invalid" });

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

const size = z
  .number({ error: "areaSizeInvalid" })
  .int({ error: "areaSizeInvalid" })
  .min(1, { error: "areaSizeInvalid" })
  .max(HALL_MAX_CM, { error: "areaSizeInvalid" });

const shortText = z
  .string({ error: "layoutTextRequired" })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(
    z.string().min(1, { error: "layoutTextRequired" }).max(MAX_TEXT_LENGTH, { error: "layoutTextTooLong" }),
  );

const adaptedLayout = z
  .object({
    name: z
      .string({ error: "invalid" })
      .trim()
      .min(1, { error: "nameRequired" })
      .max(200, { error: "nameTooLong" }),
    items: z.array(layoutItemInput, { error: "invalid" }).max(MAX_LAYOUT_ITEMS, { error: "tooManyLayoutItems" }),
  })
  .strict();

const stationItem = z
  .object({
    ...placement,
    kind: z.literal("station"),
    stationId: uuid.nullable(),
    activityId: uuid.nullable(),
    /** Null while the station follows its library layout. */
    adapted: adaptedLayout.nullable(),
  })
  .strict()
  .refine((item) => item.stationId !== null || item.adapted !== null, { error: "invalid" });

export const planItemInput = z.union(
  [
    z.object({ ...placement, kind: z.literal("equipment"), equipmentId: uuid, configurationId: uuid }).strict(),
    stationItem,
    z.object({ ...placement, kind: z.literal("text"), text: shortText }).strict(),
    z.object({ ...placement, kind: z.literal("area"), widthCm: size, lengthCm: size }).strict(),
    z
      .object({ ...placement, kind: z.literal("person"), role: z.enum(PERSON_ROLES, { error: "invalid" }) })
      .strict(),
    z
      .object({
        ...placement,
        kind: z.literal("arrow"),
        lengthCm: z
          .number({ error: "arrowLengthInvalid" })
          .int({ error: "arrowLengthInvalid" })
          .min(ARROW_MIN_CM, { error: "arrowLengthInvalid" })
          .max(ARROW_MAX_CM, { error: "arrowLengthInvalid" }),
      })
      .strict(),
  ],
  { error: "invalid" },
);

export type PlanItemInput = z.input<typeof planItemInput>;
export type PlanItemValues = z.output<typeof planItemInput>;

/** Every id in a plan's input: items and adapted layouts' items. */
function allIds(items: readonly PlanItemValues[]): string[] {
  return items.flatMap((i) => [
    i.id.toLowerCase(),
    ...(i.kind === "station" && i.adapted ? i.adapted.items.map((l) => l.id.toLowerCase()) : []),
  ]);
}

/** A whole plan in layer order, bottom first: every id once, every activity linked at most once. */
export const planItemsInput = z
  .array(planItemInput, { error: "invalid" })
  .max(MAX_PLAN_ITEMS, { error: "tooManyPlanItems" })
  .refine(
    (items) => {
      const ids = allIds(items);
      return new Set(ids).size === ids.length;
    },
    { error: "invalid" },
  )
  .refine(
    (items) => {
      const linked = linkedActivityIds(items);
      return new Set(linked).size === linked.length;
    },
    { error: "activityLinkedTwice" },
  );

const planName = z
  .string({ error: "invalid" })
  .trim()
  .max(MAX_PLAN_NAME_LENGTH, { error: "nameTooLong" })
  .nullish()
  .transform((v) => (v ? v : null));

const partIds = z
  .array(uuid, { error: "invalid" })
  .max(MAX_PLAN_PARTS, { error: "invalid" })
  .transform((ids) => [...new Set(ids.map((i) => i.toLowerCase()))]);

/** A new plan: the main plan, or a plan for chosen parts; empty or a copy of another plan. */
export const newPlanInput = z
  .object({
    main: z.boolean({ error: "invalid" }),
    partIds,
    name: planName,
    copyFromPlanId: uuid.nullable(),
  })
  .strict()
  .refine((p) => (p.main ? p.partIds.length === 0 : p.partIds.length > 0), { error: "planPartsRequired" });

export type NewPlanInput = z.input<typeof newPlanInput>;

/** A part plan's name and parts; the main plan has only a name. */
export const planSettingsInput = z.object({ name: planName, partIds: partIds.optional() }).strict();

export type PlanSettingsInput = z.input<typeof planSettingsInput>;

// --- Parts and numbers -------------------------------------------------------------------

/** What the rules need of a session's outline, in order. */
export type OutlinePart = { id: string; activities: readonly { id: string; stationId: string | null }[] };

/** What the rules need of a plan. */
export type PlanParts = { id: string; isMain: boolean; partIds: readonly string[] };

/**
 * The parts a plan applies to, in the session's order: a part plan's own
 * parts, or for the main plan every part that has no plan of its own.
 */
export function partsOfPlan<P extends OutlinePart>(
  plan: PlanParts,
  plans: readonly PlanParts[],
  parts: readonly P[],
): P[] {
  if (plan.isMain) {
    const claimed = new Set(plans.filter((p) => !p.isMain).flatMap((p) => p.partIds));
    return parts.filter((part) => !claimed.has(part.id));
  }
  const own = new Set(plan.partIds);
  return parts.filter((part) => own.has(part.id));
}

/** The ids of the activities of the given parts. */
export function activityIdsOf(parts: readonly OutlinePart[]): Set<string> {
  return new Set(parts.flatMap((p) => p.activities.map((a) => a.id)));
}

/** The activities placed stations are linked to, in the items' order. */
export function linkedActivityIds(
  items: readonly ({ kind: string; activityId?: string | null } | { content: PlanItemContent })[],
): string[] {
  return items.flatMap((item) => {
    const linked =
      "content" in item
        ? item.content.kind === "station"
          ? item.content.activityId
          : null
        : item.kind === "station"
          ? (item.activityId ?? null)
          : null;
    return linked ? [linked] : [];
  });
}

/**
 * The number of each linked activity: the plan's parts in order, activities
 * top to bottom, counting only activities linked to a station placed in the
 * plan. Links to activities outside the parts get no number.
 */
export function stationNumbers(parts: readonly OutlinePart[], linked: Iterable<string>): Map<string, number> {
  const set = new Set(linked);
  const numbers = new Map<string, number>();
  for (const part of parts) {
    for (const activity of part.activities) {
      if (set.has(activity.id)) {
        numbers.set(activity.id, numbers.size + 1);
      }
    }
  }
  return numbers;
}

/**
 * The activity a newly placed station is linked to: the one activity in the
 * plan's parts that links to the station, when exactly one does and it is
 * not linked to another placed station already. Otherwise null, and the
 * user picks.
 */
export function autoLinkActivity(
  stationId: string,
  parts: readonly OutlinePart[],
  taken: ReadonlySet<string>,
): string | null {
  const matching = parts.flatMap((p) => p.activities.filter((a) => a.stationId === stationId));
  return matching.length === 1 && !taken.has(matching[0].id) ? matching[0].id : null;
}

/**
 * Items with links only to the allowed activities, each at most once (the
 * lowest item keeps a link given twice). Used when a plan is loaded or copied
 * and when its parts change.
 */
export function keepAllowedLinks<T extends { content: PlanItemContent }>(
  items: readonly T[],
  allowed: ReadonlySet<string>,
): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const c = item.content;
    if (c.kind !== "station" || c.activityId === null) {
      return item;
    }
    if (allowed.has(c.activityId) && !seen.has(c.activityId)) {
      seen.add(c.activityId);
      return item;
    }
    return { ...item, content: { ...c, activityId: null } };
  });
}

/**
 * The stations to offer first when placing: those the plan's activities
 * link to, in the order they are used, each once.
 */
export function stationsOfParts(parts: readonly OutlinePart[]): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    for (const a of part.activities) {
      if (a.stationId && !ids.includes(a.stationId)) {
        ids.push(a.stationId);
      }
    }
  }
  return ids;
}

// --- Copying -----------------------------------------------------------------------------

/**
 * How a copied outline maps the source's parts and activities to the copy's:
 * by position, part by part and activity by activity.
 */
export function copyMapping(
  source: readonly { id: string; activities: readonly { id: string }[] }[],
  copy: readonly { id: string; activities: readonly { id: string }[] }[],
): { parts: Map<string, string>; activities: Map<string, string> } {
  const parts = new Map<string, string>();
  const activities = new Map<string, string>();
  source.forEach((part, i) => {
    const target = copy[i];
    if (!target) {
      return;
    }
    parts.set(part.id, target.id);
    part.activities.forEach((a, j) => {
      const copied = target.activities[j];
      if (copied) {
        activities.set(a.id, copied.id);
      }
    });
  });
  return { parts, activities };
}

/**
 * Copies of a plan's items with new ids (adapted layouts' items included).
 * `activity` maps a linked activity to the copy's, or to null to drop the
 * link.
 */
export function copyItems<T extends DrawnPlanItem>(
  items: readonly T[],
  newId: () => string,
  activity: (id: string) => string | null,
): T[] {
  return items.map((item) => {
    const c = item.content;
    if (c.kind !== "station") {
      return { ...item, id: newId() };
    }
    return {
      ...item,
      id: newId(),
      content: {
        ...c,
        activityId: c.activityId === null ? null : activity(c.activityId),
        layout: c.adapted ? c.layout.map((l) => ({ ...l, id: newId() })) : c.layout,
      },
    };
  });
}

/** What a save sends for a drawn item. */
export function toPlanInput(item: DrawnPlanItem): PlanItemInput {
  const placed = { id: item.id, xCm: item.xCm, yCm: item.yCm, rotation: item.rotation, label: item.label };
  const c = item.content;
  switch (c.kind) {
    case "equipment":
      return { ...placed, kind: "equipment", equipmentId: c.equipmentId, configurationId: c.configurationId };
    case "station":
      return {
        ...placed,
        kind: "station",
        stationId: c.stationId,
        activityId: c.activityId,
        adapted: c.adapted ? { name: c.name, items: c.layout.map(layoutInputOf) } : null,
      };
    case "text":
      return { ...placed, kind: "text", text: c.text };
    case "area":
      return { ...placed, kind: "area", widthCm: c.widthCm, lengthCm: c.lengthCm };
    case "person":
      return { ...placed, kind: "person", role: c.role };
    case "arrow":
      return { ...placed, kind: "arrow", lengthCm: c.lengthCm };
  }
}

function layoutInputOf(item: DrawnLayoutItem) {
  const placed = { id: item.id, xCm: item.xCm, yCm: item.yCm, rotation: item.rotation, label: item.label };
  if (item.kind === "equipment") {
    return {
      ...placed,
      kind: "equipment" as const,
      equipmentId: item.equipmentId,
      configurationId: item.configurationId,
    };
  }
  if (item.kind === "arrow") {
    return { ...placed, kind: "arrow" as const, lengthCm: item.lengthCm };
  }
  return { ...placed, kind: "text" as const, text: item.text };
}
