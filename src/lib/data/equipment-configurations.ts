import "server-only";

import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z, ZodError } from "zod";

import { getDb } from "@/db";
import { equipment, equipmentConfigurations, stationEquipment } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { blobEnvironment, SNIFF_BYTES } from "@/lib/attachments";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { blobConfigured, deleteBlobs, readBlobStart } from "@/lib/blob";
import {
  checkEquipmentImage,
  configurationInput,
  EQUIPMENT_IMAGE_MAX_BYTES,
  EQUIPMENT_IMAGE_TYPES,
  equipmentImagePath,
  equipmentImageUrl,
  isEquipmentImagePath,
  MAX_CONFIGURATIONS,
  sniffEquipmentImage,
} from "@/lib/equipment-configurations";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/library";
import { moveStep, sortOrders, type Direction } from "@/lib/reorder";

import { UserError } from "./errors";
import { isConfigurationInHall } from "./halls";
import { isConfigurationInStationLayout } from "./station-layouts";
import { id } from "./schemas";

/*
 * Configurations of equipment (docs/data-model.md, "Equipment
 * configuration"): every signed-in user reads them; only administrators
 * create, change, reorder and delete them. The first configuration of a piece
 * of equipment becomes its default, and deleting the default makes the next
 * one in order the default.
 *
 * Images are uploaded like session attachments (src/lib/data/attachments.ts),
 * because a 5 MB file is larger than a server action may receive:
 * prepareEquipmentImageUpload picks the path, the browser uploads straight to
 * the private Blob store with a token from POST /api/equipment-images/upload
 * (authorizeEquipmentImageUpload), and registerEquipmentImage checks the
 * stored file's first bytes before the configuration gets it. A replaced or
 * removed image is deleted from the store after the database change.
 */

/** What pages and drawings get of a configuration. */
export type ConfigurationItem = {
  id: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  /** The URL that serves its image, or null without one. */
  imageUrl: string | null;
  isDefault: boolean;
};

const C = equipmentConfigurations;

const ITEM_COLUMNS = {
  id: C.id,
  equipmentId: C.equipmentId,
  name: C.name,
  widthCm: C.widthCm,
  lengthCm: C.lengthCm,
  color: C.color,
  imagePathname: C.imagePathname,
  isDefault: C.isDefault,
};

function toItem(row: {
  id: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imagePathname: string | null;
  isDefault: boolean;
}): ConfigurationItem {
  return {
    id: row.id,
    name: row.name,
    widthCm: row.widthCm,
    lengthCm: row.lengthCm,
    color: row.color,
    imageUrl: row.imagePathname ? equipmentImageUrl(row.id, row.imagePathname) : null,
    isDefault: row.isDefault,
  };
}

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

// --- Reading ------------------------------------------------------------------------

/** Every configuration of the catalogue by equipment id, each list in order. */
export async function listAllConfigurations(): Promise<Map<string, ConfigurationItem[]>> {
  await requireUser();
  const rows = await getDb()
    .select(ITEM_COLUMNS)
    .from(C)
    .orderBy(asc(C.equipmentId), asc(C.sortOrder), asc(C.createdAt), asc(C.id));
  const result = new Map<string, ConfigurationItem[]>();
  for (const row of rows) {
    const list = result.get(row.equipmentId) ?? [];
    list.push(toItem(row));
    result.set(row.equipmentId, list);
  }
  return result;
}

export type EquipmentDetails = {
  id: string;
  name: string;
  stationCount: number;
  configurations: ConfigurationItem[];
};

/** One piece of equipment with its configurations in order; not found when it does not exist. */
export async function getEquipmentDetails(equipmentId: string): Promise<EquipmentDetails> {
  await requireUser();
  if (!isUuid(equipmentId)) {
    notFound();
  }
  const db = getDb();
  const [[entry], configurations] = await Promise.all([
    db
      .select({
        id: equipment.id,
        name: equipment.name,
        stationCount: count(stationEquipment.stationId),
      })
      .from(equipment)
      .leftJoin(stationEquipment, eq(stationEquipment.equipmentId, equipment.id))
      .where(eq(equipment.id, equipmentId))
      .groupBy(equipment.id),
    db
      .select(ITEM_COLUMNS)
      .from(C)
      .where(eq(C.equipmentId, equipmentId))
      .orderBy(asc(C.sortOrder), asc(C.createdAt), asc(C.id)),
  ]);
  if (!entry) {
    notFound();
  }
  return { ...entry, configurations: configurations.map(toItem) };
}

/** The stored images of a piece of equipment's configurations, for clean-up after deleting it. */
export async function imagePathnamesOfEquipment(equipmentId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ pathname: C.imagePathname })
    .from(C)
    .where(eq(C.equipmentId, equipmentId));
  return rows.flatMap((r) => (r.pathname ? [r.pathname] : []));
}

// --- Writing (administrators only) ---------------------------------------------------

/** The configuration's equipment and image, or a validation error when it does not exist. */
async function loadConfiguration(configurationId: unknown) {
  const configId = id.parse(configurationId);
  const [row] = await getDb()
    .select({ id: C.id, equipmentId: C.equipmentId, imagePathname: C.imagePathname })
    .from(C)
    .where(eq(C.id, configId))
    .limit(1);
  if (!row) {
    throw invalid();
  }
  return row;
}

function nameTaken(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
    throw new UserError("configurationNameTaken");
  }
  throw error;
}

/**
 * Adds a configuration at the end of the equipment's list. It becomes the
 * default when the equipment has none. Returns its id.
 */
export async function createConfiguration(equipmentId: unknown, input: unknown): Promise<string> {
  await requireAdmin();
  const entryId = id.parse(equipmentId);
  const value = configurationInput.parse(input);
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(C).where(eq(C.equipmentId, entryId));
  if (n >= MAX_CONFIGURATIONS) {
    throw new UserError("tooManyConfigurations");
  }
  const [exists] = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(eq(equipment.id, entryId))
    .limit(1);
  if (!exists) {
    throw invalid();
  }
  try {
    const [row] = await db
      .insert(C)
      .values({
        equipmentId: entryId,
        ...value,
        sortOrder: sql`(select coalesce(max(sort_order) + 1, 0) from equipment_configurations where equipment_id = ${entryId})`,
        isDefault: sql`not exists (select 1 from equipment_configurations where equipment_id = ${entryId} and is_default)`,
      })
      .returning({ id: C.id });
    return row.id;
  } catch (error) {
    nameTaken(error);
  }
}

/** Changes a configuration's name, size and colour. Returns its equipment's id. */
export async function updateConfiguration(configurationId: unknown, input: unknown): Promise<string> {
  await requireAdmin();
  const row = await loadConfiguration(configurationId);
  const value = configurationInput.parse(input);
  try {
    await getDb().update(C).set(value).where(eq(C.id, row.id));
  } catch (error) {
    nameTaken(error);
  }
  return row.equipmentId;
}

/** Moves a configuration one step up or down in its equipment's list. */
export async function moveConfiguration(configurationId: unknown, direction: unknown): Promise<void> {
  await requireAdmin();
  const step = z.enum(["up", "down"], { error: "invalid" }).parse(direction) as Direction;
  const row = await loadConfiguration(configurationId);
  const db = getDb();
  const siblings = await db
    .select({ id: C.id })
    .from(C)
    .where(eq(C.equipmentId, row.equipmentId))
    .orderBy(asc(C.sortOrder), asc(C.createdAt), asc(C.id));
  const order = moveStep(
    siblings.map((s) => s.id),
    row.id,
    step,
  );
  if (!order) {
    return;
  }
  const [first, ...rest] = sortOrders(order).map(({ id: configId, sortOrder }) =>
    db.update(C).set({ sortOrder }).where(eq(C.id, configId)),
  );
  await db.batch([first, ...rest]);
}

/** Makes a configuration its equipment's default, in place of the previous one. */
export async function setDefaultConfiguration(configurationId: unknown): Promise<void> {
  await requireAdmin();
  const row = await loadConfiguration(configurationId);
  const db = getDb();
  // One batch is one transaction; the old default is cleared first, so the
  // index allowing one default per equipment holds after each statement.
  await db.batch([
    db
      .update(C)
      .set({ isDefault: false })
      .where(and(eq(C.equipmentId, row.equipmentId), eq(C.isDefault, true), ne(C.id, row.id))),
    db.update(C).set({ isDefault: true }).where(eq(C.id, row.id)),
  ]);
}

/**
 * Deletes a configuration and then its image. When it was the default, the
 * first remaining one becomes the default. A configuration fixed in a hall
 * cannot be deleted. Returns its equipment's id.
 */
export async function deleteConfiguration(configurationId: unknown): Promise<string> {
  await requireAdmin();
  const row = await loadConfiguration(configurationId);
  if (await isConfigurationInHall(row.id)) {
    throw new UserError("configurationInHall");
  }
  if (await isConfigurationInStationLayout(row.id)) {
    throw new UserError("configurationInLayout");
  }
  const db = getDb();
  await db.batch([
    db.delete(C).where(eq(C.id, row.id)),
    db
      .update(C)
      .set({ isDefault: true })
      .where(
        and(
          eq(
            C.id,
            sql`(select id from equipment_configurations where equipment_id = ${row.equipmentId} order by sort_order, created_at, id limit 1)`,
          ),
          sql`not exists (select 1 from equipment_configurations where equipment_id = ${row.equipmentId} and is_default)`,
        ),
      ),
  ]);
  if (row.imagePathname) {
    await deleteBlobs([row.imagePathname]);
  }
  return row.equipmentId;
}

// --- Images -------------------------------------------------------------------------

const fileInput = z
  .object({
    name: z.string({ error: "invalid" }).max(1000, { error: "invalid" }),
    type: z.string({ error: "invalid" }).max(200, { error: "invalid" }),
    size: z.number({ error: "invalid" }).int({ error: "invalid" }),
  })
  .strict();

function requireStore() {
  if (!blobConfigured()) {
    throw invalid("equipmentImagesUnavailable");
  }
}

/** Step 1: checks the image's declared type and size; returns the path to upload it to. */
export async function prepareEquipmentImageUpload(
  configurationId: unknown,
  input: unknown,
): Promise<{ pathname: string }> {
  await requireAdmin();
  requireStore();
  const file = fileInput.parse(input);
  const problem = checkEquipmentImage(file);
  if (problem) {
    throw invalid(problem === "tooLarge" ? "equipmentImageTooLarge" : "equipmentImageWrongType");
  }
  const row = await loadConfiguration(configurationId);
  const random = crypto.randomUUID().replaceAll("-", "");
  return {
    pathname: equipmentImagePath(blobEnvironment(process.env), row.equipmentId, random, file.name),
  };
}

const uploadPayload = z.object({ configurationId: z.string() }).strict();

/**
 * Step 2, for handleUpload's onBeforeGenerateToken: the options of a client
 * token for uploading `pathname`, or null when the signed-in user may not
 * (not an administrator, no such configuration, or a path outside its
 * equipment's folder).
 */
export async function authorizeEquipmentImageUpload(pathname: string, clientPayload: string | null) {
  if (!blobConfigured()) {
    return null;
  }
  let configurationId: string;
  try {
    ({ configurationId } = uploadPayload.parse(JSON.parse(clientPayload ?? "")));
  } catch {
    return null;
  }
  const user = await getCurrentUser();
  if (!user?.isAdmin || !isUuid(configurationId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ equipmentId: C.equipmentId })
    .from(C)
    .where(eq(C.id, configurationId))
    .limit(1);
  if (!row || !isEquipmentImagePath(pathname, blobEnvironment(process.env), row.equipmentId)) {
    return null;
  }
  return {
    allowedContentTypes: [...EQUIPMENT_IMAGE_TYPES],
    maximumSizeInBytes: EQUIPMENT_IMAGE_MAX_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + 10 * 60 * 1000,
  };
}

const registerInput = z
  .object({ pathname: z.string({ error: "invalid" }).max(400, { error: "invalid" }) })
  .strict();

/**
 * Step 3: gives the configuration the uploaded image after checking what was
 * actually stored, then deletes the image it replaces. A file that is not a
 * PNG, JPEG or WebP image by its first bytes, or is too large, is deleted
 * and refused.
 */
export async function registerEquipmentImage(configurationId: unknown, input: unknown): Promise<string> {
  await requireAdmin();
  requireStore();
  const { pathname } = registerInput.parse(input);
  const row = await loadConfiguration(configurationId);
  if (!isEquipmentImagePath(pathname, blobEnvironment(process.env), row.equipmentId)) {
    throw invalid();
  }
  if (row.imagePathname === pathname) {
    // Registered already (a repeated request).
    return row.equipmentId;
  }
  const stored = await readBlobStart(pathname, SNIFF_BYTES);
  if (!stored) {
    throw invalid("equipmentImageNotUploaded");
  }
  const contentType = sniffEquipmentImage(stored.bytes);
  if (!contentType || stored.size <= 0 || stored.size > EQUIPMENT_IMAGE_MAX_BYTES) {
    await deleteBlobs([pathname]);
    throw invalid(contentType ? "equipmentImageTooLarge" : "equipmentImageWrongType");
  }
  const updated = await getDb()
    .update(C)
    .set({ imagePathname: pathname, imageContentType: contentType })
    .where(eq(C.id, row.id))
    .returning({ id: C.id });
  if (updated.length === 0) {
    // The configuration was deleted meanwhile.
    await deleteBlobs([pathname]);
    throw invalid();
  }
  if (row.imagePathname) {
    await deleteBlobs([row.imagePathname]);
  }
  return row.equipmentId;
}

/** Removes a configuration's image; it is drawn in its colour again. Returns its equipment's id. */
export async function removeEquipmentImage(configurationId: unknown): Promise<string> {
  await requireAdmin();
  const row = await loadConfiguration(configurationId);
  if (row.imagePathname) {
    await getDb()
      .update(C)
      .set({ imagePathname: null, imageContentType: null })
      .where(eq(C.id, row.id));
    await deleteBlobs([row.imagePathname]);
  }
  return row.equipmentId;
}

/**
 * A configuration's image for the signed-in user, or null when there is no
 * such image or nobody is signed in (the route answers 404 either way).
 */
export async function getEquipmentImageForDownload(
  configurationId: string,
): Promise<{ pathname: string; contentType: string } | null> {
  if (!isUuid(configurationId)) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const [row] = await getDb()
    .select({ pathname: C.imagePathname, contentType: C.imageContentType })
    .from(C)
    .where(eq(C.id, configurationId))
    .limit(1);
  if (!row?.pathname || !row.contentType) {
    return null;
  }
  return { pathname: row.pathname, contentType: row.contentType };
}
