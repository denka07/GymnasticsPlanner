import "server-only";

import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z, ZodError } from "zod";

import { getDb } from "@/db";
import { equipment, equipmentConfigurations, hallFeatures, halls } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { blobEnvironment, SNIFF_BYTES } from "@/lib/attachments";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { blobConfigured, deleteBlobs, listBlobs, readBlobStart } from "@/lib/blob";
import {
  checkEquipmentImage,
  EQUIPMENT_IMAGE_MAX_BYTES,
  EQUIPMENT_IMAGE_TYPES,
  equipmentImageUrl,
  sniffEquipmentImage,
  type EquipmentImageType,
} from "@/lib/equipment-configurations";
import {
  hallFolder,
  hallImagePath,
  hallImageUrl,
  hallInput,
  isHallImageFileName,
  isHallImagePath,
  newHallInput,
  type FeatureKind,
} from "@/lib/halls";
import { byName, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/library";

import { UserError } from "./errors";
import { id } from "./schemas";

/*
 * Halls and their fixed features (docs/data-model.md, "Hall" and "Hall
 * feature"). Every signed-in user reads them; only administrators create,
 * save and delete them. A hall is saved as a whole: its name, size and every
 * feature in one transaction (saveHall).
 *
 * Feature images are uploaded like equipment images
 * (src/lib/data/equipment-configurations.ts): prepareHallImageUpload picks a
 * path in the hall's folder, the browser uploads straight to the private Blob
 * store with a token from POST /api/hall-images/upload
 * (authorizeHallImageUpload), and checkHallImage reads the stored file's first
 * bytes. A feature only gets the image when the hall is saved, which checks a
 * new image's bytes again. Images no feature refers to after a save are
 * deleted from the store (uploads younger than an hour are left, as another
 * administrator may be about to save them).
 */

/** A feature as drawings get it: its own size and look, or its configuration's. */
export type DrawnFeature = {
  id: string;
  kind: FeatureKind;
  xCm: number;
  yCm: number;
  rotation: number;
  label: string | null;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imageUrl: string | null;
  /** The feature's own stored image (not a configuration's); sent back when the hall is saved. */
  imagePathname: string | null;
  equipmentId: string | null;
  configurationId: string | null;
  /** "Tumblingbana, Liggande" for equipment features. */
  equipmentName: string | null;
  configurationName: string | null;
};

export type HallDrawing = {
  id: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  floorColor: string;
  /** The URL that serves the floor image, or null without one. */
  floorImageUrl: string | null;
  /** The stored floor image; sent back when the hall is saved. */
  floorImagePathname: string | null;
  /** In layer order, bottom first. */
  features: DrawnFeature[];
};

export type HallOption = { id: string; name: string };

const F = hallFeatures;
const C = equipmentConfigurations;

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

function nameTaken(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
    throw new UserError("hallNameTaken");
  }
  throw error;
}

// --- Reading ------------------------------------------------------------------------

/** The features of the given halls by hall id, each list in layer order. */
async function loadFeatures(hallIds: string[]): Promise<Map<string, DrawnFeature[]>> {
  const result = new Map<string, DrawnFeature[]>(hallIds.map((h) => [h, []]));
  if (hallIds.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select({
      feature: F,
      configuration: {
        id: C.id,
        name: C.name,
        widthCm: C.widthCm,
        lengthCm: C.lengthCm,
        color: C.color,
        imagePathname: C.imagePathname,
      },
      equipmentName: equipment.name,
    })
    .from(F)
    .leftJoin(C, eq(C.id, F.configurationId))
    .leftJoin(equipment, eq(equipment.id, F.equipmentId))
    .where(inArray(F.hallId, hallIds))
    .orderBy(asc(F.hallId), asc(F.layer), asc(F.id));
  for (const { feature: f, configuration: c, equipmentName } of rows) {
    const drawn: DrawnFeature =
      f.kind === "equipment" && c
        ? {
            id: f.id,
            kind: f.kind,
            xCm: f.xCm,
            yCm: f.yCm,
            rotation: f.rotation,
            label: f.label,
            widthCm: c.widthCm,
            lengthCm: c.lengthCm,
            color: c.color,
            imageUrl: c.imagePathname ? equipmentImageUrl(c.id, c.imagePathname) : null,
            imagePathname: null,
            equipmentId: f.equipmentId,
            configurationId: f.configurationId,
            equipmentName,
            configurationName: c.name,
          }
        : {
            id: f.id,
            kind: f.kind,
            xCm: f.xCm,
            yCm: f.yCm,
            rotation: f.rotation,
            label: f.label,
            widthCm: f.widthCm ?? 100,
            lengthCm: f.lengthCm ?? 100,
            color: f.color,
            imageUrl: f.imagePathname ? hallImageUrl(f.imagePathname) : null,
            imagePathname: f.imagePathname,
            equipmentId: null,
            configurationId: null,
            equipmentName: null,
            configurationName: null,
          };
    result.get(f.hallId)?.push(drawn);
  }
  return result;
}

const HALL_COLUMNS = {
  id: halls.id,
  name: halls.name,
  widthCm: halls.widthCm,
  lengthCm: halls.lengthCm,
  floorColor: halls.floorColor,
  floorImagePathname: halls.floorImagePathname,
};

function withFloor<T extends { floorImagePathname: string | null }>(row: T) {
  return { ...row, floorImageUrl: row.floorImagePathname ? hallImageUrl(row.floorImagePathname) : null };
}

/** Every hall with its floor and features, by name. */
export async function listHalls(): Promise<HallDrawing[]> {
  await requireUser();
  const rows = await getDb().select(HALL_COLUMNS).from(halls);
  const features = await loadFeatures(rows.map((r) => r.id));
  return rows.sort(byName).map((h) => ({ ...withFloor(h), features: features.get(h.id) ?? [] }));
}

/** Every hall's id and name, by name, for choosing a hall. */
export async function listHallOptions(): Promise<HallOption[]> {
  await requireUser();
  const rows = await getDb().select({ id: halls.id, name: halls.name }).from(halls);
  return rows.sort(byName);
}

/** One hall with its features; not found when it does not exist. */
export async function getHall(hallId: string): Promise<HallDrawing> {
  await requireUser();
  if (!isUuid(hallId)) {
    notFound();
  }
  const [row] = await getDb().select(HALL_COLUMNS).from(halls).where(eq(halls.id, hallId)).limit(1);
  if (!row) {
    notFound();
  }
  const features = await loadFeatures([row.id]);
  return { ...withFloor(row), features: features.get(row.id) ?? [] };
}

/** True when every id is a hall (an empty list is). */
export async function hallsExist(hallIds: readonly string[]): Promise<boolean> {
  const unique = [...new Set(hallIds)];
  if (unique.length === 0) {
    return true;
  }
  const rows = await getDb()
    .select({ id: halls.id })
    .from(halls)
    .where(inArray(halls.id, unique));
  return rows.length === unique.length;
}

// --- Writing (administrators only) ---------------------------------------------------

/** Creates an empty hall; returns its id. */
export async function createHall(input: unknown): Promise<string> {
  await requireAdmin();
  const value = newHallInput.parse(input);
  try {
    const [row] = await getDb().insert(halls).values(value).returning({ id: halls.id });
    return row.id;
  } catch (error) {
    nameTaken(error);
  }
}

/**
 * Saves a hall as a whole: name, size, floor and every feature, in layer
 * order, in one transaction. Features keep the ids the editor gave them. Equipment
 * features must name an existing configuration of their equipment, and a
 * feature or floor image must lie in the hall's folder and be a PNG, JPEG or WebP
 * image by its first bytes. Images no feature refers to any more are then
 * deleted from the store.
 */
export async function saveHall(hallId: unknown, input: unknown): Promise<void> {
  await requireAdmin();
  const hall = id.parse(hallId);
  const value = hallInput.parse(input);
  const db = getDb();

  const [[existing], storedRows] = await Promise.all([
    db
      .select({ id: halls.id, floor: halls.floorImagePathname, floorType: halls.floorImageContentType })
      .from(halls)
      .where(eq(halls.id, hall))
      .limit(1),
    db
      .select({ pathname: F.imagePathname, contentType: F.imageContentType })
      .from(F)
      .where(and(eq(F.hallId, hall), isNotNull(F.imagePathname))),
  ]);
  if (!existing) {
    throw invalid();
  }

  // Equipment and configurations must exist and belong together.
  const pairs = value.features.flatMap((f) =>
    f.kind === "equipment" ? [{ equipmentId: f.equipmentId, configurationId: f.configurationId }] : [],
  );
  if (pairs.length > 0) {
    const configRows = await db
      .select({ id: C.id, equipmentId: C.equipmentId })
      .from(C)
      .where(inArray(C.id, [...new Set(pairs.map((p) => p.configurationId))]));
    const owner = new Map(configRows.map((r) => [r.id, r.equipmentId]));
    if (pairs.some((p) => owner.get(p.configurationId) !== p.equipmentId)) {
      throw invalid("equipmentNotFound");
    }
  }

  // Images: already stored ones keep their type; new ones are checked by their bytes.
  const environment = blobEnvironment(process.env);
  const storedTypes = new Map<string, string>();
  for (const r of storedRows) {
    if (r.pathname && r.contentType) {
      storedTypes.set(r.pathname, r.contentType);
    }
  }
  if (existing.floor && existing.floorType) {
    storedTypes.set(existing.floor, existing.floorType);
  }
  const types = new Map(storedTypes);
  const images = [
    ...value.features.flatMap((f) => (f.kind !== "equipment" && f.imagePathname ? [f.imagePathname] : [])),
    ...(value.floorImagePathname ? [value.floorImagePathname] : []),
  ];
  for (const pathname of images) {
    if (types.has(pathname)) {
      continue;
    }
    if (!isHallImagePath(pathname, environment, hall)) {
      throw invalid();
    }
    types.set(pathname, await checkStoredImage(pathname));
  }

  const rows = value.features.map((f, layer) =>
    f.kind === "equipment"
      ? {
          id: f.id,
          hallId: hall,
          kind: f.kind,
          equipmentId: f.equipmentId,
          configurationId: f.configurationId,
          xCm: f.xCm,
          yCm: f.yCm,
          rotation: f.rotation,
          layer,
          label: f.label,
        }
      : {
          id: f.id,
          hallId: hall,
          kind: f.kind,
          widthCm: f.widthCm,
          lengthCm: f.lengthCm,
          color: f.color,
          imagePathname: f.imagePathname,
          imageContentType: f.imagePathname ? types.get(f.imagePathname) : null,
          xCm: f.xCm,
          yCm: f.yCm,
          rotation: f.rotation,
          layer,
          label: f.label,
        },
  );

  const update = db
    .update(halls)
    .set({
      name: value.name,
      widthCm: value.widthCm,
      lengthCm: value.lengthCm,
      floorColor: value.floorColor,
      floorImagePathname: value.floorImagePathname,
      floorImageContentType: value.floorImagePathname ? types.get(value.floorImagePathname) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(halls.id, hall));
  const clear = db.delete(F).where(eq(F.hallId, hall));
  try {
    if (rows.length > 0) {
      await db.batch([update, clear, db.insert(F).values(rows)]);
    } else {
      await db.batch([update, clear]);
    }
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      // The name, or a feature id that belongs to another hall.
      const [taken] = await db
        .select({ id: halls.id })
        .from(halls)
        .where(sql`lower(${halls.name}) = lower(${value.name}) and ${halls.id} <> ${hall}`)
        .limit(1);
      if (taken) {
        throw new UserError("hallNameTaken");
      }
      throw invalid();
    }
    throw error;
  }

  const kept = new Set(images);
  await deleteUnusedImages(hall, kept);
}

/** Deletes a hall with its features, then its images. Slots and sessions in it are left without a hall. */
export async function deleteHall(hallId: unknown): Promise<void> {
  await requireAdmin();
  const hall = id.parse(hallId);
  const [images, [floor]] = await Promise.all([
    getDb()
      .select({ pathname: F.imagePathname })
      .from(F)
      .where(and(eq(F.hallId, hall), isNotNull(F.imagePathname))),
    getDb().select({ pathname: halls.floorImagePathname }).from(halls).where(eq(halls.id, hall)),
  ]);
  await getDb().delete(halls).where(eq(halls.id, hall));
  await deleteBlobs([...images, ...(floor ? [floor] : [])].flatMap((i) => (i.pathname ? [i.pathname] : [])));
  if (blobConfigured()) {
    try {
      const left = await listBlobs(hallFolder(blobEnvironment(process.env), hall));
      await deleteBlobs(left.map((b) => b.pathname));
    } catch (error) {
      console.error("Could not list a deleted hall's images:", error instanceof Error ? error.message : error);
    }
  }
}

/** An hour: uploads younger than this are not cleaned up, in case they are about to be saved. */
const UPLOAD_GRACE_MS = 60 * 60 * 1000;

/** Deletes the images in the hall's folder that `kept` does not contain, except recent uploads. */
async function deleteUnusedImages(hallId: string, kept: Set<string>): Promise<void> {
  if (!blobConfigured()) {
    return;
  }
  try {
    const stored = await listBlobs(hallFolder(blobEnvironment(process.env), hallId));
    const cutoff = Date.now() - UPLOAD_GRACE_MS;
    await deleteBlobs(
      stored
        .filter((b) => !kept.has(b.pathname) && b.uploadedAt.getTime() < cutoff)
        .map((b) => b.pathname),
    );
  } catch (error) {
    console.error("Could not clean up a hall's images:", error instanceof Error ? error.message : error);
  }
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

async function requireHall(hallId: unknown): Promise<string> {
  const hall = id.parse(hallId);
  const [row] = await getDb().select({ id: halls.id }).from(halls).where(eq(halls.id, hall)).limit(1);
  if (!row) {
    throw invalid();
  }
  return row.id;
}

/** The checked type of a stored image; a file that is not an accepted image is deleted and refused. */
async function checkStoredImage(pathname: string): Promise<EquipmentImageType> {
  const stored = await readBlobStart(pathname, SNIFF_BYTES);
  if (!stored) {
    throw invalid("equipmentImageNotUploaded");
  }
  const contentType = sniffEquipmentImage(stored.bytes);
  if (!contentType || stored.size <= 0 || stored.size > EQUIPMENT_IMAGE_MAX_BYTES) {
    await deleteBlobs([pathname]);
    throw invalid(contentType ? "equipmentImageTooLarge" : "equipmentImageWrongType");
  }
  return contentType;
}

/** Step 1: checks the image's declared type and size; returns the path to upload it to. */
export async function prepareHallImageUpload(
  hallId: unknown,
  input: unknown,
): Promise<{ pathname: string }> {
  await requireAdmin();
  requireStore();
  const file = fileInput.parse(input);
  const problem = checkEquipmentImage(file);
  if (problem) {
    throw invalid(problem === "tooLarge" ? "equipmentImageTooLarge" : "equipmentImageWrongType");
  }
  const hall = await requireHall(hallId);
  const random = crypto.randomUUID().replaceAll("-", "");
  return { pathname: hallImagePath(blobEnvironment(process.env), hall, random, file.name) };
}

const uploadPayload = z.object({ hallId: z.string() }).strict();

/**
 * Step 2, for handleUpload's onBeforeGenerateToken: the options of a client
 * token for uploading `pathname`, or null when the signed-in user may not
 * (not an administrator, no such hall, or a path outside its folder).
 */
export async function authorizeHallImageUpload(pathname: string, clientPayload: string | null) {
  if (!blobConfigured()) {
    return null;
  }
  let hallId: string;
  try {
    ({ hallId } = uploadPayload.parse(JSON.parse(clientPayload ?? "")));
  } catch {
    return null;
  }
  const user = await getCurrentUser();
  if (!user?.isAdmin || !isUuid(hallId)) {
    return null;
  }
  const [row] = await getDb().select({ id: halls.id }).from(halls).where(eq(halls.id, hallId)).limit(1);
  if (!row || !isHallImagePath(pathname, blobEnvironment(process.env), row.id)) {
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

const checkInput = z
  .object({ pathname: z.string({ error: "invalid" }).max(400, { error: "invalid" }) })
  .strict();

/**
 * Step 3: checks the uploaded file's first bytes, so a wrong file is refused
 * at once, and returns the URL the editor shows it with. The feature gets it
 * when the hall is saved.
 */
export async function checkHallImage(hallId: unknown, input: unknown): Promise<{ url: string }> {
  await requireAdmin();
  requireStore();
  const { pathname } = checkInput.parse(input);
  const hall = await requireHall(hallId);
  if (!isHallImagePath(pathname, blobEnvironment(process.env), hall)) {
    throw invalid();
  }
  await checkStoredImage(pathname);
  return { url: hallImageUrl(pathname) };
}

/**
 * A hall's floor or feature image for the signed-in user, or null (the
 * route answers 404). Images the hall uses are served to every signed-in user; an
 * administrator also gets an image just uploaded in the editor and not yet
 * saved.
 */
export async function getHallImageForDownload(
  hallId: string,
  fileName: string,
): Promise<{ pathname: string; contentType: string | null } | null> {
  if (!isUuid(hallId) || !isHallImageFileName(fileName)) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const rows = await getDb()
    .select({ pathname: F.imagePathname, contentType: F.imageContentType })
    .from(F)
    .where(and(eq(F.hallId, hallId), sql`${F.imagePathname} like ${"%/" + fileName}`))
    .limit(5);
  const [floor] = await getDb()
    .select({ pathname: halls.floorImagePathname, contentType: halls.floorImageContentType })
    .from(halls)
    .where(eq(halls.id, hallId))
    .limit(1);
  const used = [...rows, ...(floor ? [floor] : [])].find((r) =>
    r.pathname?.endsWith(`/halls/${hallId}/${fileName}`),
  );
  if (used?.pathname) {
    return { pathname: used.pathname, contentType: used.contentType };
  }
  if (!user.isAdmin) {
    return null;
  }
  // The type of an unsaved upload is read from its bytes by the route.
  return { pathname: `${hallFolder(blobEnvironment(process.env), hallId)}${fileName}`, contentType: null };
}

// --- Catalogue rules ------------------------------------------------------------------

/** True when equipment, or one of its configurations, is fixed in a hall. */
export async function isEquipmentInHall(equipmentId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: F.id })
    .from(F)
    .where(eq(F.equipmentId, equipmentId))
    .limit(1);
  return Boolean(row);
}

/** True when a configuration is fixed in a hall. */
export async function isConfigurationInHall(configurationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: F.id })
    .from(F)
    .where(eq(F.configurationId, configurationId))
    .limit(1);
  return Boolean(row);
}
