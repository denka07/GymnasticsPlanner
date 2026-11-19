/*
 * Pure rules for halls and their fixed features (docs/data-model.md, "Hall"
 * and "Hall feature"): kinds and their defaults, the input a hall is saved
 * with, sizes typed in metres, and where feature images are stored. Shared by
 * the server, which enforces them, and the browser, which checks them first.
 */
import { z } from "zod";

import { HEX_COLOR } from "./equipment-configurations";
import { safeFileName } from "./attachments";

/** Largest hall or feature width or length, in centimetres: 200 m. */
export const HALL_MAX_CM = 20000;

/** Most features one hall may have. */
export const MAX_HALL_FEATURES = 400;

/** Longest feature label, in characters. */
export const MAX_LABEL_LENGTH = 60;

/** Every kind of feature, in the order the editor offers them. */
export const FEATURE_KINDS = [
  "wall_bars",
  "door",
  "port",
  "storage",
  "wall",
  "foam_pit",
  "md_pit",
  "stands",
  "other",
  "equipment",
] as const;

export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** The kinds with a size, colour and image of their own (all but equipment). */
export type ShapeKind = Exclude<FeatureKind, "equipment">;

export const SHAPE_KINDS = FEATURE_KINDS.filter((k): k is ShapeKind => k !== "equipment");

/**
 * How a kind is drawn without an image: `stripes` (wall bars), `hatch`
 * (storage), `solid` (wall, pits, other), `opening` (door, port) or `rows`
 * (stands).
 */
export type KindLook = "stripes" | "hatch" | "solid" | "opening" | "rows";

/** A new feature's size (cm), colour and look, per kind. */
export const KIND_DEFAULTS: Record<
  ShapeKind,
  { widthCm: number; lengthCm: number; color: string; look: KindLook }
> = {
  wall_bars: { widthCm: 400, lengthCm: 20, color: "#b98a57", look: "stripes" },
  door: { widthCm: 100, lengthCm: 20, color: "#f4f1ea", look: "opening" },
  port: { widthCm: 400, lengthCm: 30, color: "#e6e2d8", look: "opening" },
  storage: { widthCm: 600, lengthCm: 400, color: "#c8c1b4", look: "hatch" },
  wall: { widthCm: 1000, lengthCm: 20, color: "#4b5058", look: "solid" },
  foam_pit: { widthCm: 400, lengthCm: 800, color: "#5b8fd6", look: "solid" },
  md_pit: { widthCm: 400, lengthCm: 1000, color: "#2f5d9e", look: "solid" },
  stands: { widthCm: 1200, lengthCm: 300, color: "#9aa3ad", look: "rows" },
  other: { widthCm: 200, lengthCm: 200, color: "#c4c8cd", look: "solid" },
};

export function isShapeKind(kind: FeatureKind): kind is ShapeKind {
  return kind !== "equipment";
}

// --- Sizes in metres ---------------------------------------------------------------

/**
 * A size typed in metres, with a comma or point and at most two decimals
 * ("24,5", "42", "0.75"), as whole centimetres; null when it is not one or
 * is outside 0,01–200 m.
 */
export function parseMetres(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const cm = Math.round(Number(trimmed) * 100);
  return cm >= 1 && cm <= HALL_MAX_CM ? cm : null;
}

/** Centimetres as metres for a field or text: 2450 → "24,5" in Swedish. */
export function formatMetres(cm: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(
    cm / 100,
  );
}

/** A hall's size for people: "24,5 × 42 m" (width × length). */
export function formatHallSize(widthCm: number, lengthCm: number, locale: string): string {
  return `${formatMetres(widthCm, locale)} × ${formatMetres(lengthCm, locale)} m`;
}

// --- Input -------------------------------------------------------------------------

const hallCentimetres = z
  .number({ error: "hallSizeInvalid" })
  .int({ error: "hallSizeInvalid" })
  .min(1, { error: "hallSizeInvalid" })
  .max(HALL_MAX_CM, { error: "hallSizeInvalid" });

const featureCentimetres = z
  .number({ error: "featureSizeInvalid" })
  .int({ error: "featureSizeInvalid" })
  .min(1, { error: "featureSizeInvalid" })
  .max(HALL_MAX_CM, { error: "featureSizeInvalid" });

const hallName = z
  .string({ error: "nameRequired" })
  .trim()
  .min(1, { error: "nameRequired" })
  .max(100, { error: "nameTooLong" });

/** A new hall: name and size. */
export const newHallInput = z
  .object({ name: hallName, widthCm: hallCentimetres, lengthCm: hallCentimetres })
  .strict();

export type NewHallInput = z.infer<typeof newHallInput>;

const uuid = z.uuid({ error: "invalid" });

const label = z
  .string({ error: "invalid" })
  .trim()
  .max(MAX_LABEL_LENGTH, { error: "labelTooLong" })
  .nullish()
  .transform((v) => (v ? v : null));

/** A position in whole centimetres, a little outside the hall allowed for walls on its edge. */
const position = z
  .number({ error: "invalid" })
  .int({ error: "invalid" })
  .min(-HALL_MAX_CM, { error: "invalid" })
  .max(2 * HALL_MAX_CM, { error: "invalid" });

const rotation = z
  .number({ error: "invalid" })
  .finite({ error: "invalid" })
  .transform((v) => normalizeDegrees(v));

const placement = {
  id: uuid,
  xCm: position,
  yCm: position,
  rotation,
  label,
};

const equipmentFeature = z
  .object({
    ...placement,
    kind: z.literal("equipment"),
    equipmentId: uuid,
    configurationId: uuid,
  })
  .strict();

const shapeFeature = z
  .object({
    ...placement,
    kind: z.enum(SHAPE_KINDS as [ShapeKind, ...ShapeKind[]], { error: "invalid" }),
    widthCm: featureCentimetres,
    lengthCm: featureCentimetres,
    color: z
      .string({ error: "colorInvalid" })
      .trim()
      .toLowerCase()
      .regex(HEX_COLOR, { error: "colorInvalid" }),
    imagePathname: z
      .string({ error: "invalid" })
      .max(400, { error: "invalid" })
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict();

export const featureInput = z.discriminatedUnion("kind", [equipmentFeature, shapeFeature], {
  error: "invalid",
});

export type FeatureInput = z.input<typeof featureInput>;
export type FeatureValues = z.output<typeof featureInput>;

/** A whole hall as the editor saves it; features in layer order, bottom first. */
export const hallInput = z
  .object({
    name: hallName,
    widthCm: hallCentimetres,
    lengthCm: hallCentimetres,
    features: z.array(featureInput).max(MAX_HALL_FEATURES, { error: "tooManyFeatures" }),
  })
  .strict()
  .superRefine((h, ctx) => {
    const ids = h.features.map((f) => f.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "invalid", path: ["features"] });
    }
  });

export type HallInput = z.input<typeof hallInput>;
export type HallValues = z.output<typeof hallInput>;

/** Degrees in [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const d = degrees % 360;
  const n = d < 0 ? d + 360 : d;
  // 359.99999 after rounding errors is 0.
  return n >= 360 - 1e-9 ? 0 : n;
}

// --- Images ------------------------------------------------------------------------

/** The folder of a hall's feature images: `<env>/halls/<hallId>/`. */
export function hallFolder(environment: string, hallId: string): string {
  return `${environment}/halls/${hallId}/`;
}

/** Where a new feature image is stored: `<env>/halls/<hallId>/<random>-<safe file name>`. */
export function hallImagePath(
  environment: string,
  hallId: string,
  random: string,
  fileName: string,
): string {
  return `${hallFolder(environment, hallId)}${random}-${safeFileName(fileName)}`;
}

const IMAGE_FILE = /^[A-Za-z0-9]{8,64}-[A-Za-z0-9._-]{1,80}$/;

/** True when `pathname` is a file directly in the hall's folder, named as hallImagePath names them. */
export function isHallImagePath(pathname: string, environment: string, hallId: string): boolean {
  const folder = hallFolder(environment, hallId);
  return pathname.startsWith(folder) && IMAGE_FILE.test(pathname.slice(folder.length));
}

/**
 * The URL that serves a feature image. The file name starts with a random
 * part that is new for every upload, so the URL never shows another image
 * and may be cached for long.
 */
export function hallImageUrl(pathname: string): string {
  const parts = pathname.split("/");
  const file = parts.at(-1) ?? "";
  const hallId = parts.at(-2) ?? "";
  return `/api/hall-images/${hallId}/${encodeURIComponent(file)}`;
}

/** True when `fileName` is a name hallImagePath gives a file. */
export function isHallImageFileName(fileName: string): boolean {
  return IMAGE_FILE.test(fileName);
}
