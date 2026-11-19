import "server-only";

import { and, asc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { notFound } from "next/navigation";
import { ZodError } from "zod";

import { getDb } from "@/db";
import {
  activities,
  equipment,
  equipmentConfigurations,
  groups,
  planItemLayoutItems,
  planItems,
  seasons,
  sessionParts,
  sessionPlanParts,
  sessionPlans,
  sessions,
  stationEquipment,
  stationLayoutItems,
  stations,
} from "@/db/schema";
import { allVisible, canEdit, getSeasonAccess, requireSessionAccess, visibleTo, type AccessLevel } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import { equipmentImageUrl } from "@/lib/equipment-configurations";
import { byName } from "@/lib/library";
import type { LoadedPart } from "@/lib/outline";
import {
  activityIdsOf,
  copyItems,
  keepAllowedLinks,
  linkedActivityIds,
  newPlanInput,
  partsOfPlan,
  planItemsInput,
  planSettingsInput,
  toPlanInput,
  type DrawnPlanItem,
  type OutlinePart,
  type PlanItemContent,
  type PlanItemValues,
  type PlanParts,
  type PersonRole,
} from "@/lib/session-plans";
import type { DrawnLayoutItem } from "@/lib/station-layouts";
import { mondayOf } from "@/lib/weeks";

import { getHall, hallsExist, listHallOptions, type HallDrawing, type HallOption } from "./halls";
import { loadOutlines } from "./outlines";
import { configurationOwners, layoutRows, loadStationLayouts } from "./station-layouts";

/*
 * Session plans (docs/data-model.md, "Session plan" and "Plan item"). Access
 * follows the session: view access to see its plans, edit access to change
 * them. Everyone who can see a plan sees the stations and equipment drawn in
 * it, whoever owns them. A plan's items are saved as a whole, in one batch.
 */

const P = sessionPlans;
const PP = sessionPlanParts;
const I = planItems;
const L = planItemLayoutItems;
const C = equipmentConfigurations;

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

// --- Reading ------------------------------------------------------------------------

/** A plan with the parts it is attached to and its items in layer order. */
export type LoadedPlan = {
  id: string;
  isMain: boolean;
  name: string | null;
  /** A part plan's own parts, in the session's order; empty for the main plan. */
  partIds: string[];
  items: DrawnPlanItem[];
};

/** A station the picker offers, with what is needed to draw and adapt it. */
export type PickStation = {
  id: string;
  name: string;
  global: boolean;
  layout: DrawnLayoutItem[];
  /** The station's needed equipment, for adapting it. */
  lines: { equipmentId: string; name: string; quantity: number }[];
};

export type SessionPlansPage = {
  access: AccessLevel;
  canEdit: boolean;
  session: {
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    hallId: string | null;
    weekStart: string;
  };
  group: { id: string; name: string };
  season: { id: string; name: string };
  /** True when the user can open the season, and so its week page. */
  canOpenSeason: boolean;
  hall: HallDrawing | null;
  /** Every hall, for choosing the session's; empty without edit access. */
  halls: HallOption[];
  parts: LoadedPart[];
  /** The main plan first, then part plans in the order they were made. */
  plans: LoadedPlan[];
  /** Visible stations for placing; empty without edit access. */
  stations: PickStation[];
};

type LayoutRow = typeof L.$inferSelect | typeof stationLayoutItems.$inferSelect;

/** A stored layout row drawn, given its configuration's look; null if it cannot be drawn. */
function drawnLayoutItem(
  row: LayoutRow,
  configuration: { name: string; widthCm: number; lengthCm: number; color: string | null; imagePathname: string | null } | null,
  equipmentName: string | null,
): DrawnLayoutItem | null {
  const placement = { id: row.id, xCm: row.xCm, yCm: row.yCm, rotation: row.rotation, label: row.label };
  if (row.kind === "equipment" && configuration && row.equipmentId && row.configurationId) {
    return {
      ...placement,
      kind: "equipment",
      equipmentId: row.equipmentId,
      configurationId: row.configurationId,
      equipmentName: equipmentName ?? "",
      configurationName: configuration.name,
      widthCm: configuration.widthCm,
      lengthCm: configuration.lengthCm,
      color: configuration.color,
      imageUrl: configuration.imagePathname
        ? equipmentImageUrl(row.configurationId, configuration.imagePathname)
        : null,
    };
  }
  if (row.kind === "arrow" && row.lengthCm !== null) {
    return { ...placement, kind: "arrow", lengthCm: row.lengthCm };
  }
  if (row.kind === "text" && row.text !== null) {
    return { ...placement, kind: "text", text: row.text };
  }
  return null;
}

const CONFIGURATION_LOOK = {
  name: C.name,
  widthCm: C.widthCm,
  lengthCm: C.lengthCm,
  color: C.color,
  imagePathname: C.imagePathname,
};

/** The session's plans with their parts and items, without checking access. */
export async function loadPlans(sessionId: string): Promise<LoadedPlan[]> {
  const db = getDb();
  const [planRows, partRows, itemRows, layoutRows] = await Promise.all([
    db.select().from(P).where(eq(P.sessionId, sessionId)).orderBy(asc(P.createdAt), asc(P.id)),
    db
      .select({ planId: PP.planId, partId: PP.sessionPartId })
      .from(PP)
      .innerJoin(sessionParts, eq(sessionParts.id, PP.sessionPartId))
      .where(eq(sessionParts.sessionId, sessionId))
      .orderBy(asc(sessionParts.sortOrder)),
    db
      .select({
        item: I,
        configuration: CONFIGURATION_LOOK,
        equipmentName: equipment.name,
        stationName: stations.name,
      })
      .from(I)
      .innerJoin(P, eq(P.id, I.planId))
      .leftJoin(C, eq(C.id, I.configurationId))
      .leftJoin(equipment, eq(equipment.id, I.equipmentId))
      .leftJoin(stations, eq(stations.id, I.stationId))
      .where(eq(P.sessionId, sessionId))
      .orderBy(asc(I.layer), asc(I.id)),
    db
      .select({ row: L, configuration: CONFIGURATION_LOOK, equipmentName: equipment.name })
      .from(L)
      .innerJoin(I, eq(I.id, L.planItemId))
      .innerJoin(P, eq(P.id, I.planId))
      .leftJoin(C, eq(C.id, L.configurationId))
      .leftJoin(equipment, eq(equipment.id, L.equipmentId))
      .where(eq(P.sessionId, sessionId))
      .orderBy(asc(L.layer), asc(L.id)),
  ]);

  const adaptedLayouts = new Map<string, DrawnLayoutItem[]>();
  for (const { row, configuration, equipmentName } of layoutRows) {
    const drawn = drawnLayoutItem(row, configuration, equipmentName);
    if (drawn) {
      const list = adaptedLayouts.get(row.planItemId) ?? [];
      list.push(drawn);
      adaptedLayouts.set(row.planItemId, list);
    }
  }
  const libraryLayouts = await loadStationLayouts(
    itemRows.flatMap(({ item }) => (item.kind === "station" && !item.isAdapted && item.stationId ? [item.stationId] : [])),
  );

  const itemsByPlan = new Map<string, DrawnPlanItem[]>();
  for (const { item: i, configuration: c, equipmentName, stationName } of itemRows) {
    let content: PlanItemContent | null = null;
    switch (i.kind) {
      case "equipment":
        if (c && i.equipmentId && i.configurationId) {
          content = {
            kind: "equipment",
            equipmentId: i.equipmentId,
            configurationId: i.configurationId,
            equipmentName: equipmentName ?? "",
            configurationName: c.name,
            widthCm: c.widthCm,
            lengthCm: c.lengthCm,
            color: c.color,
            imageUrl: c.imagePathname ? equipmentImageUrl(i.configurationId, c.imagePathname) : null,
          };
        }
        break;
      case "station":
        content = {
          kind: "station",
          stationId: i.stationId,
          activityId: i.activityId,
          adapted: i.isAdapted,
          name: (i.isAdapted ? i.stationName : stationName) ?? i.stationName ?? "",
          layout: i.isAdapted
            ? (adaptedLayouts.get(i.id) ?? [])
            : i.stationId
              ? (libraryLayouts.get(i.stationId) ?? [])
              : [],
        };
        break;
      case "text":
        content = i.text ? { kind: "text", text: i.text } : null;
        break;
      case "area":
        content =
          i.widthCm !== null && i.lengthCm !== null
            ? { kind: "area", widthCm: i.widthCm, lengthCm: i.lengthCm }
            : null;
        break;
      case "person":
        content = i.personRole ? { kind: "person", role: i.personRole as PersonRole } : null;
        break;
      case "arrow":
        content = i.lengthCm !== null ? { kind: "arrow", lengthCm: i.lengthCm } : null;
        break;
    }
    if (content) {
      const list = itemsByPlan.get(i.planId) ?? [];
      list.push({ id: i.id, xCm: i.xCm, yCm: i.yCm, rotation: i.rotation, label: i.label, content });
      itemsByPlan.set(i.planId, list);
    }
  }

  const partsByPlan = new Map<string, string[]>();
  for (const r of partRows) {
    const list = partsByPlan.get(r.planId) ?? [];
    list.push(r.partId);
    partsByPlan.set(r.planId, list);
  }
  return planRows
    .map((p) => ({
      id: p.id,
      isMain: p.isMain,
      name: p.name,
      partIds: p.isMain ? [] : (partsByPlan.get(p.id) ?? []),
      items: itemsByPlan.get(p.id) ?? [],
    }))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
}

/** The outline as the plan rules need it. */
function outlineOf(parts: readonly LoadedPart[]): OutlinePart[] {
  return parts.map((p) => ({
    id: p.id,
    activities: p.activities.map((a) => ({ id: a.id, stationId: a.station?.id ?? null })),
  }));
}

/** The stations the user may place, with their layouts and needed equipment. */
async function loadPickStations(): Promise<PickStation[]> {
  const user = await requireUser();
  const db = getDb();
  const [rows, lineRows] = await Promise.all([
    db
      .select({ id: stations.id, name: stations.name, scope: stations.scope })
      .from(stations)
      .where(visibleTo(stations, user)),
    db
      .select({
        stationId: stationEquipment.stationId,
        equipmentId: stationEquipment.equipmentId,
        name: equipment.name,
        quantity: stationEquipment.quantity,
      })
      .from(stationEquipment)
      .innerJoin(stations, eq(stations.id, stationEquipment.stationId))
      .innerJoin(equipment, eq(equipment.id, stationEquipment.equipmentId))
      .where(visibleTo(stations, user)),
  ]);
  const layouts = await loadStationLayouts(rows.map((r) => r.id));
  const lines = new Map<string, PickStation["lines"]>();
  for (const l of lineRows) {
    const list = lines.get(l.stationId) ?? [];
    list.push({ equipmentId: l.equipmentId, name: l.name, quantity: l.quantity });
    lines.set(l.stationId, list);
  }
  return rows.sort(byName).map((r) => ({
    id: r.id,
    name: r.name,
    global: r.scope === "global",
    layout: layouts.get(r.id) ?? [],
    lines: (lines.get(r.id) ?? []).sort(byName),
  }));
}

/**
 * Everything the plans page shows. Calls notFound() without view access.
 * Links to activities that no longer belong to a plan's parts are left out.
 */
export async function getSessionPlansPage(sessionId: string): Promise<SessionPlansPage> {
  if (!isUuid(sessionId)) {
    notFound();
  }
  const { user, access } = await requireSessionAccess(sessionId, "view");
  const editable = canEdit(access);
  const [row] = await getDb()
    .select({
      session: sessions,
      season: { id: seasons.id, name: seasons.name },
      group: { id: groups.id, name: groups.name },
    })
    .from(sessions)
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .innerJoin(groups, eq(groups.id, seasons.groupId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const s = row.session;
  const [outlines, plans, hall, halls, pick, seasonAccess] = await Promise.all([
    loadOutlines([sessionId]),
    loadPlans(sessionId),
    s.hallId ? getHall(s.hallId) : null,
    editable ? listHallOptions() : [],
    editable ? loadPickStations() : [],
    getSeasonAccess(user.id, row.season.id),
  ]);
  const parts = outlines.get(sessionId) ?? [];
  const outline = outlineOf(parts);
  const shapes: PlanParts[] = plans;
  return {
    access,
    canEdit: editable,
    session: {
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      hallId: s.hallId,
      weekStart: mondayOf(s.date),
    },
    group: row.group,
    season: row.season,
    canOpenSeason: seasonAccess !== null,
    hall,
    halls,
    parts,
    plans: plans.map((plan) => ({
      ...plan,
      items: keepAllowedLinks(plan.items, activityIdsOf(partsOfPlan(plan, shapes, outline))),
    })),
    stations: pick,
  };
}

/** How many plans each session has. */
export async function countPlans(sessionIds: readonly string[]): Promise<Map<string, number>> {
  if (sessionIds.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ sessionId: P.sessionId, n: sql<number>`count(*)::int` })
    .from(P)
    .where(inArray(P.sessionId, [...sessionIds]))
    .groupBy(P.sessionId);
  return new Map(rows.map((r) => [r.sessionId, r.n]));
}

// --- Writing ------------------------------------------------------------------------

/** The plan and its session, with edit access to the session checked. */
async function requirePlanForEdit(planId: unknown) {
  if (typeof planId !== "string" || !isUuid(planId)) {
    notFound();
  }
  const [plan] = await getDb().select().from(P).where(eq(P.id, planId)).limit(1);
  if (!plan) {
    notFound();
  }
  const { user } = await requireSessionAccess(plan.sessionId, "edit");
  return { plan, user };
}

/** The session's outline and plans' parts, as the rules need them. */
async function loadStructure(sessionId: string): Promise<{ outline: OutlinePart[]; plans: PlanParts[] }> {
  const db = getDb();
  const [outlines, planRows, partRows] = await Promise.all([
    loadOutlines([sessionId]),
    db.select({ id: P.id, isMain: P.isMain }).from(P).where(eq(P.sessionId, sessionId)),
    db
      .select({ planId: PP.planId, partId: PP.sessionPartId })
      .from(PP)
      .innerJoin(P, eq(P.id, PP.planId))
      .where(eq(P.sessionId, sessionId)),
  ]);
  return {
    outline: outlineOf(outlines.get(sessionId) ?? []),
    plans: planRows.map((p) => ({
      ...p,
      partIds: partRows.filter((r) => r.planId === p.id).map((r) => r.partId),
    })),
  };
}

/**
 * Statements that remove links to activities outside each plan's parts,
 * for the plans as they will be (after parts move between plans).
 */
function linkCleanup(plans: readonly PlanParts[], outline: readonly OutlinePart[]): BatchItem<"pg">[] {
  const db = getDb();
  return plans.map((plan) => {
    const allowed = [...activityIdsOf(partsOfPlan(plan, plans, outline))];
    return db
      .update(I)
      .set({ activityId: null })
      .where(
        and(
          eq(I.planId, plan.id),
          isNotNull(I.activityId),
          allowed.length > 0 ? notInArray(I.activityId, allowed) : undefined,
        ),
      );
  });
}

/** Statements that attach the parts to a plan, taking them from any other plan. */
function attachParts(planId: string, partIds: readonly string[]): BatchItem<"pg">[] {
  if (partIds.length === 0) {
    return [];
  }
  const db = getDb();
  return [
    db
      .insert(PP)
      .values(partIds.map((sessionPartId) => ({ sessionPartId, planId })))
      .onConflictDoUpdate({ target: PP.sessionPartId, set: { planId: sql`excluded.plan_id` } }),
  ];
}

/** Rows for a plan's items: the items and the adapted stations' layouts. */
function itemRows(planId: string, items: readonly PlanItemValues[]) {
  const rows = items.map((item, layer) => ({
    id: item.id,
    planId,
    kind: item.kind,
    equipmentId: item.kind === "equipment" ? item.equipmentId : null,
    configurationId: item.kind === "equipment" ? item.configurationId : null,
    stationId: item.kind === "station" ? item.stationId : null,
    activityId: item.kind === "station" ? item.activityId : null,
    isAdapted: item.kind === "station" && item.adapted !== null,
    stationName: item.kind === "station" && item.adapted ? item.adapted.name : null,
    personRole: item.kind === "person" ? item.role : null,
    widthCm: item.kind === "area" ? item.widthCm : null,
    lengthCm: item.kind === "area" || item.kind === "arrow" ? item.lengthCm : null,
    text: item.kind === "text" ? item.text : null,
    xCm: item.xCm,
    yCm: item.yCm,
    rotation: item.rotation,
    layer,
    label: item.label,
  }));
  const layouts = items.flatMap((item) =>
    item.kind === "station" && item.adapted
      ? layoutRows(item.id, item.adapted.items).map(({ stationId, ...r }) => ({ ...r, planItemId: stationId }))
      : [],
  );
  return { rows, layouts };
}

/** Insert statements for a plan's items, in layer order. */
function insertItems(planId: string, items: readonly PlanItemValues[]): BatchItem<"pg">[] {
  const db = getDb();
  const { rows, layouts } = itemRows(planId, items);
  const statements: BatchItem<"pg">[] = [];
  if (rows.length > 0) {
    statements.push(db.insert(I).values(rows));
  }
  if (layouts.length > 0) {
    statements.push(db.insert(L).values(layouts));
  }
  return statements;
}

/**
 * Throws unless every reference in the items is sound: stations exist, and
 * stations the session does not use already are visible to the user;
 * configurations belong to their equipment; linked activities belong to the
 * plan's parts; ids new to the plan are unused.
 */
async function checkItems(
  plan: { id: string; sessionId: string },
  items: readonly PlanItemValues[],
  user: { id: string },
  allowedActivities: ReadonlySet<string>,
) {
  for (const id of linkedActivityIds(items)) {
    if (!allowedActivities.has(id)) {
      throw invalid("activityNotInPlan");
    }
  }

  const db = getDb();
  const stationIds = [
    ...new Set(items.flatMap((i) => (i.kind === "station" && i.stationId ? [i.stationId] : []))),
  ];
  if (stationIds.length > 0) {
    const [existing, used] = await Promise.all([
      db.select({ id: stations.id }).from(stations).where(inArray(stations.id, stationIds)),
      db
        .select({ id: I.stationId })
        .from(I)
        .innerJoin(P, eq(P.id, I.planId))
        .where(and(eq(P.sessionId, plan.sessionId), inArray(I.stationId, stationIds)))
        .union(
          db
            .select({ id: activities.stationId })
            .from(activities)
            .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
            .where(and(eq(sessionParts.sessionId, plan.sessionId), inArray(activities.stationId, stationIds))),
        ),
    ]);
    if (existing.length !== stationIds.length) {
      throw invalid("stationNotFound");
    }
    const known = new Set(used.map((u) => u.id));
    if (!(await allVisible(stations, user, stationIds.filter((s) => !known.has(s))))) {
      throw invalid("stationNotFound");
    }
  }

  const pairs = items.flatMap((i) => {
    if (i.kind === "equipment") {
      return [{ equipmentId: i.equipmentId, configurationId: i.configurationId }];
    }
    if (i.kind === "station" && i.adapted) {
      return i.adapted.items.flatMap((l) =>
        l.kind === "equipment" ? [{ equipmentId: l.equipmentId, configurationId: l.configurationId }] : [],
      );
    }
    return [];
  });
  const owners = await configurationOwners(pairs.map((p) => p.configurationId));
  if (pairs.some((p) => owners.get(p.configurationId) !== p.equipmentId)) {
    throw invalid("equipmentNotFound");
  }

  const ids = items.flatMap((i) => [
    i.id,
    ...(i.kind === "station" && i.adapted ? i.adapted.items.map((l) => l.id) : []),
  ]);
  if (ids.length > 0) {
    const [takenItems, takenLayouts] = await Promise.all([
      db
        .select({ id: I.id })
        .from(I)
        .where(and(inArray(I.id, ids), sql`${I.planId} <> ${plan.id}`))
        .limit(1),
      db
        .select({ id: L.id })
        .from(L)
        .innerJoin(I, eq(I.id, L.planItemId))
        .where(and(inArray(L.id, ids), sql`${I.planId} <> ${plan.id}`))
        .limit(1),
    ]);
    if (takenItems.length > 0 || takenLayouts.length > 0) {
      throw invalid();
    }
  }
}

/** Saves a plan's items as a whole, in one batch. */
export async function savePlanItems(planId: unknown, input: unknown): Promise<void> {
  const items = planItemsInput.parse(input);
  const { plan, user } = await requirePlanForEdit(planId);
  const { outline, plans } = await loadStructure(plan.sessionId);
  const self = plans.find((p) => p.id === plan.id)!;
  await checkItems(plan, items, user, activityIdsOf(partsOfPlan(self, plans, outline)));
  const db = getDb();
  await db.batch([db.delete(I).where(eq(I.planId, plan.id)), ...insertItems(plan.id, items)]);
}

/** Checks that the parts are parts of the session. */
function checkParts(partIds: readonly string[], outline: readonly OutlinePart[]) {
  const known = new Set(outline.map((p) => p.id));
  if (partIds.some((id) => !known.has(id))) {
    throw invalid("partNotFound");
  }
}

/** Plans as they will be once the parts are attached to `planId`. */
function withParts(plans: readonly PlanParts[], planId: string, partIds: readonly string[]): PlanParts[] {
  const moved = new Set(partIds);
  return plans.map((p) =>
    p.id === planId
      ? { ...p, partIds: [...partIds] }
      : { ...p, partIds: p.partIds.filter((id) => !moved.has(id)) },
  );
}

/**
 * Adds a plan to a session: the main plan, or a plan for chosen parts (which
 * leave the plan they had). It starts empty or as a copy of another plan of
 * the session, whose links to activities outside the new plan's parts are
 * dropped. Returns the new plan's id.
 */
export async function createPlan(sessionId: unknown, input: unknown): Promise<string> {
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    notFound();
  }
  const values = newPlanInput.parse(input);
  await requireSessionAccess(sessionId, "edit");
  const { outline, plans } = await loadStructure(sessionId);
  if (values.main && plans.some((p) => p.isMain)) {
    throw invalid("mainPlanExists");
  }
  checkParts(values.partIds, outline);
  let source: LoadedPlan | undefined;
  if (values.copyFromPlanId) {
    source = (await loadPlans(sessionId)).find((p) => p.id === values.copyFromPlanId);
    if (!source) {
      throw invalid();
    }
  }

  const id = crypto.randomUUID();
  const next = withParts([...plans, { id, isMain: values.main, partIds: [] }], id, values.partIds);
  const allowed = activityIdsOf(partsOfPlan(next.find((p) => p.id === id)!, next, outline));
  const db = getDb();
  const statements: BatchItem<"pg">[] = [
    db.insert(P).values({ id, sessionId, isMain: values.main, name: values.name }),
    ...attachParts(id, values.partIds),
    ...linkCleanup(next, outline),
  ];
  if (source) {
    const copied = copyItems(
      keepAllowedLinks(source.items, allowed),
      () => crypto.randomUUID(),
      (activityId) => (allowed.has(activityId) ? activityId : null),
    );
    statements.push(...insertItems(id, planItemsInput.parse(copied.map(toPlanInput))));
  }
  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return id;
}

/** Renames a plan, and for a part plan sets its parts (taken from any other plan). */
export async function updatePlanSettings(planId: unknown, input: unknown): Promise<void> {
  const values = planSettingsInput.parse(input);
  const { plan } = await requirePlanForEdit(planId);
  const db = getDb();
  const statements: BatchItem<"pg">[] = [db.update(P).set({ name: values.name }).where(eq(P.id, plan.id))];
  if (!plan.isMain && values.partIds) {
    if (values.partIds.length === 0) {
      throw invalid("planPartsRequired");
    }
    const { outline, plans } = await loadStructure(plan.sessionId);
    checkParts(values.partIds, outline);
    const next = withParts(plans, plan.id, values.partIds);
    statements.push(
      db.delete(PP).where(eq(PP.planId, plan.id)),
      ...attachParts(plan.id, values.partIds),
      ...linkCleanup(next, outline),
    );
  }
  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

/** Deletes a plan with its items. */
export async function deletePlan(planId: unknown): Promise<void> {
  const { plan } = await requirePlanForEdit(planId);
  await getDb().delete(P).where(eq(P.id, plan.id));
}

/** Sets the session's hall, which its plans are drawn on; items keep their positions. */
export async function setSessionHall(sessionId: unknown, hallId: unknown): Promise<void> {
  if (typeof sessionId !== "string" || !isUuid(sessionId)) {
    notFound();
  }
  if (typeof hallId !== "string" || !isUuid(hallId)) {
    throw invalid("hallNotFound");
  }
  await requireSessionAccess(sessionId, "edit");
  if (!(await hallsExist([hallId]))) {
    throw invalid("hallNotFound");
  }
  await getDb().update(sessions).set({ hallId }).where(eq(sessions.id, sessionId));
}

// --- Copying and deleting elsewhere -----------------------------------------------------

/**
 * Statements that replace the target session's plans with copies of the
 * source's, for a copied outline: part plans apply to the parts at the same
 * positions (`parts` maps source to copy) and links follow the copied
 * activities. Run them after the copied parts and activities are inserted.
 */
export async function copyPlansStatements(
  sourceSessionId: string,
  targetSessionId: string,
  mapping: { parts: ReadonlyMap<string, string>; activities: ReadonlyMap<string, string> },
): Promise<BatchItem<"pg">[]> {
  const db = getDb();
  const source = await loadPlans(sourceSessionId);
  const statements: BatchItem<"pg">[] = [db.delete(P).where(eq(P.sessionId, targetSessionId))];
  for (const plan of source) {
    const id = crypto.randomUUID();
    statements.push(db.insert(P).values({ id, sessionId: targetSessionId, isMain: plan.isMain, name: plan.name }));
    statements.push(
      ...attachParts(
        id,
        plan.partIds.flatMap((p) => {
          const copied = mapping.parts.get(p);
          return copied ? [copied] : [];
        }),
      ),
    );
    const copied = copyItems(
      plan.items,
      () => crypto.randomUUID(),
      (activityId) => mapping.activities.get(activityId) ?? null,
    );
    statements.push(...insertItems(id, planItemsInput.parse(copied.map(toPlanInput))));
  }
  return statements;
}

/**
 * Statements that turn the station's placements into adapted copies before
 * the station is deleted: its layout and name are copied into each plan item
 * that still follows it.
 */
export function adaptPlacementsStatements(stationId: string, name: string): [BatchItem<"pg">, BatchItem<"pg">] {
  const db = getDb();
  const S = stationLayoutItems;
  const following = and(eq(I.stationId, stationId), eq(I.isAdapted, false));
  return [
    db.insert(L).select(
      db
        .select({
          id: sql<string>`gen_random_uuid()`.as("id"),
          planItemId: I.id,
          kind: S.kind,
          equipmentId: S.equipmentId,
          configurationId: S.configurationId,
          lengthCm: S.lengthCm,
          text: S.text,
          xCm: S.xCm,
          yCm: S.yCm,
          rotation: S.rotation,
          layer: S.layer,
          label: S.label,
        })
        .from(I)
        .innerJoin(S, eq(S.stationId, I.stationId))
        .where(following),
    ),
    db.update(I).set({ isAdapted: true, stationName: name }).where(following),
  ];
}

/** True when equipment is drawn in a session plan, on its own or in an adapted station. */
export async function isEquipmentInPlan(equipmentId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: I.id })
    .from(I)
    .where(eq(I.equipmentId, equipmentId))
    .union(db.select({ id: L.id }).from(L).where(eq(L.equipmentId, equipmentId)))
    .limit(1);
  return Boolean(row);
}

/** True when a configuration is drawn in a session plan, on its own or in an adapted station. */
export async function isConfigurationInPlan(configurationId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: I.id })
    .from(I)
    .where(eq(I.configurationId, configurationId))
    .union(db.select({ id: L.id }).from(L).where(eq(L.configurationId, configurationId)))
    .limit(1);
  return Boolean(row);
}

