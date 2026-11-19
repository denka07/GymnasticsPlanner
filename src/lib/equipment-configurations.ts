/*
 * Pure rules for equipment configurations (docs/data-model.md, "Equipment
 * configuration"): their input, sizes, colours and images, and where images
 * are stored. Shared by the server, which enforces them, and the browser,
 * which checks the same rules first to give a quick error.
 */
import { z } from "zod";

import { safeFileName, sniffType } from "./attachments";

/** Largest width or length, in centimetres: 50 m. */
export const CONFIGURATION_MAX_CM = 5000;

/** Most configurations one piece of equipment may have. */
export const MAX_CONFIGURATIONS = 20;

const centimetres = z
  .number({ error: "sizeInvalid" })
  .int({ error: "sizeInvalid" })
  .min(1, { error: "sizeInvalid" })
  .max(CONFIGURATION_MAX_CM, { error: "sizeInvalid" });

/** A colour as "#rrggbb"; stored lowercase. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

const color = z
  .string({ error: "colorInvalid" })
  .trim()
  .toLowerCase()
  .regex(HEX_COLOR, { error: "colorInvalid" })
  .nullish()
  .transform((v) => v ?? null);

/** What an administrator types for a configuration. */
export const configurationInput = z
  .object({
    name: z
      .string({ error: "nameRequired" })
      .trim()
      .min(1, { error: "nameRequired" })
      .max(100, { error: "nameTooLong" }),
    widthCm: centimetres,
    lengthCm: centimetres,
    color,
  })
  .strict();

export type ConfigurationInput = z.infer<typeof configurationInput>;

/**
 * Colours mats and equipment often have, offered as one-click choices.
 * `key` names the colour in messages/sv.json (Configurations.colors).
 */
export const PALETTE = [
  { key: "blue", value: "#2563a8" },
  { key: "red", value: "#c23b32" },
  { key: "yellow", value: "#e8b730" },
  { key: "green", value: "#3c8a55" },
  { key: "grey", value: "#8b9097" },
  { key: "black", value: "#33363b" },
] as const;

/** A whole number of centimetres typed in a field, or null when it is not one. */
export function parseCentimetres(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 1 && value <= CONFIGURATION_MAX_CM ? value : null;
}

/** A size for people: "200 × 100 cm" (width × length). */
export function formatSize(widthCm: number, lengthCm: number, locale: string): string {
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return `${n.format(widthCm)} × ${n.format(lengthCm)} cm`;
}

// --- Images ---------------------------------------------------------------------

/** Largest accepted image: 5 MB. */
export const EQUIPMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** PNG, JPEG and WebP; never SVG, which could carry scripts. */
export const EQUIPMENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type EquipmentImageType = (typeof EQUIPMENT_IMAGE_TYPES)[number];

/** For the file picker's `accept` attribute. */
export const EQUIPMENT_IMAGE_ACCEPT = [
  ...EQUIPMENT_IMAGE_TYPES,
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
].join(",");

export function isEquipmentImageType(type: unknown): type is EquipmentImageType {
  return typeof type === "string" && (EQUIPMENT_IMAGE_TYPES as readonly string[]).includes(type);
}

export type EquipmentImageProblem = "wrongType" | "tooLarge" | "empty";

/** Checks an image's declared type and size before it is uploaded. */
export function checkEquipmentImage(file: { type: string; size: number }): EquipmentImageProblem | null {
  if (!isEquipmentImageType(file.type)) {
    return "wrongType";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "empty";
  }
  if (file.size > EQUIPMENT_IMAGE_MAX_BYTES) {
    return "tooLarge";
  }
  return null;
}

/** The accepted image type the file's first bytes show, or null. */
export function sniffEquipmentImage(bytes: Uint8Array): EquipmentImageType | null {
  const type = sniffType(bytes);
  return isEquipmentImageType(type) ? type : null;
}

/** The folder of a piece of equipment's images: `<env>/equipment/<equipmentId>/`. */
export function equipmentFolder(environment: string, equipmentId: string): string {
  return `${environment}/equipment/${equipmentId}/`;
}

/** Where a new image is stored: `<env>/equipment/<equipmentId>/<random>-<safe file name>`. */
export function equipmentImagePath(
  environment: string,
  equipmentId: string,
  random: string,
  fileName: string,
): string {
  return `${equipmentFolder(environment, equipmentId)}${random}-${safeFileName(fileName)}`;
}

/** True when `pathname` is a file directly in the equipment's folder, named as equipmentImagePath names them. */
export function isEquipmentImagePath(pathname: string, environment: string, equipmentId: string): boolean {
  const folder = equipmentFolder(environment, equipmentId);
  if (!pathname.startsWith(folder)) {
    return false;
  }
  return /^[A-Za-z0-9]{8,64}-[A-Za-z0-9._-]{1,80}$/.test(pathname.slice(folder.length));
}

/**
 * The random part of a stored image's file name. It changes whenever the
 * image is replaced, so it versions the image's URL.
 */
export function imageVersion(pathname: string): string {
  const file = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dash = file.indexOf("-");
  return dash > 0 ? file.slice(0, dash) : file;
}

/**
 * The URL that serves a configuration's image. The version makes a replaced
 * image a new URL, so the old one can be cached for long.
 */
export function equipmentImageUrl(configurationId: string, pathname: string): string {
  return `/api/equipment-images/${configurationId}?v=${imageVersion(pathname)}`;
}
