import type { Page } from "@playwright/test";
import { and, asc, eq, inArray } from "drizzle-orm";

import { weekdayDate } from "../src/lib/weeks";

import { db, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName, weekNumber } from "./support/names";
import { seedEquipment, seedHall, seedSeason, seedStation } from "./support/seed";

/** A session's column on the week page. */
function column(page: Page, name: string) {
  return page.getByRole("region", { name });
}

/** The session's plans with their parts and items, from the database. */
async function plansOf(sessionId: string) {
  const d = db();
  const plans = await d
    .select()
    .from(schema.sessionPlans)
    .where(eq(schema.sessionPlans.sessionId, sessionId))
    .orderBy(asc(schema.sessionPlans.createdAt));
  const ids = plans.map((p) => p.id);
  if (ids.length === 0) {
    return [];
  }
  const [parts, items] = await Promise.all([
    d.select().from(schema.sessionPlanParts).where(inArray(schema.sessionPlanParts.planId, ids)),
    d.select().from(schema.planItems).where(inArray(schema.planItems.planId, ids)),
  ]);
  return plans.map((p) => ({
    ...p,
    partIds: parts.filter((x) => x.planId === p.id).map((x) => x.sessionPartId),
    items: items.filter((i) => i.planId === p.id),
  }));
}

/** The parts and activities of a session, in order. */
async function outlineOf(sessionId: string) {
  const d = db();
  const parts = await d
    .select()
    .from(schema.sessionParts)
    .where(eq(schema.sessionParts.sessionId, sessionId))
    .orderBy(asc(schema.sessionParts.sortOrder));
  const activities = await d
    .select()
    .from(schema.activities)
    .where(inArray(schema.activities.sessionPartId, parts.map((p) => p.id)))
    .orderBy(asc(schema.activities.sortOrder));
  return parts.map((p) => ({ ...p, activities: activities.filter((a) => a.sessionPartId === p.id) }));
}

test.describe("Session plans", () => {
  test("choose the hall, draw a main plan with a numbered station, and copy it into a plan for a part", async ({
    coach: page,
    prefix,
  }) => {
    const hallName = `${prefix} Hallen`;
    const stationName = `${prefix} Trampettstation`;
    const otherStation = `${prefix} Annan station`;
    await seedHall(hallName, 2000, 3000);
    const stationId = await seedStation("coach", stationName);
    await seedStation("coach", otherStation);
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [
        {
          weekday: 1,
          week: 0,
          parts: [
            { title: "Samling", activities: ["Prata"] },
            { title: "Trampett", activities: [{ text: "Volt", stationId }, "Rakt hopp"] },
          ],
        },
      ],
    });
    const sessionId = season.sessionIds[0];
    const monday = season.weeks[0];

    // The week page opens the session's plans.
    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);
    await column(page, sessionName(monday)).getByRole("link", { name: "Ritningar" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/plans$`));

    // Without a hall the page asks for one first.
    await expect(page.getByText("Passet har ingen hall än.")).toBeVisible();
    const hallSelect = await hydrated(page.getByLabel("Hall", { exact: true }));
    await hallSelect.selectOption({ label: hallName });
    await page.getByRole("button", { name: "Använd hallen" }).click();
    await expect(page.getByText(`Hall: ${hallName}`)).toBeVisible();

    // The main plan, from empty.
    const plans = page.getByRole("navigation", { name: "Passets ritningar" });
    const create = page.getByRole("dialog", { name: "Ny ritning" });
    await openWith(page.getByRole("button", { name: "Ny ritning" }), create);
    await expect(create.getByRole("radio", { name: "Hela passet (huvudritning)" })).toBeChecked();
    await create.getByRole("button", { name: "Skapa" }).click();
    await expect(create).toBeHidden();
    await expect(plans.getByRole("button", { name: /^Huvudritning/ })).toBeVisible();
    // The hall is longer than wide, so on this wide screen it is shown turned.
    await expect(page.getByRole("button", { name: "Vrid vyn 90°" })).toHaveAttribute("aria-pressed", "true");

    // The session's own station is offered first; placing it links it to
    // the one activity that uses it, which gives it number 1.
    const palette = page.getByRole("region", { name: "Lägg till" });
    const own = palette.getByRole("list", { name: "Används i passet" });
    await expect(own.getByRole("button", { name: `Placera ${stationName}` })).toBeVisible();
    await expect(own.getByRole("button", { name: `Placera ${otherStation}` })).toHaveCount(0);
    await own.getByRole("button", { name: `Placera ${stationName}` }).click();
    const drawing = page.getByRole("application", { name: `Huvudritning i ${hallName}` });
    await expect(drawing.getByRole("button", { name: `Station 1: ${stationName}` })).toBeVisible();
    const text = page.getByRole("region", { name: "Passdelar" });
    await expect(text.locator("[data-activity-number='1']")).toContainText("Volt");

    // Another station is not used by an activity: it stays unlinked until
    // one is picked, and then numbers follow the activities' order.
    await palette.getByRole("searchbox", { name: "Sök station" }).fill("Annan");
    await palette.getByRole("button", { name: `Placera ${otherStation}` }).click();
    const properties = page.getByRole("region", { name: `Station: ${otherStation}` });
    await properties.getByLabel("Används till aktivitet").selectOption({ label: "Prata" });
    await expect(drawing.getByRole("button", { name: `Station 1: ${otherStation}` })).toBeVisible();
    await expect(drawing.getByRole("button", { name: `Station 2: ${stationName}` })).toBeVisible();

    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    // A plan for the Trampett part, as a copy of the main plan. The part
    // leaves the main plan, so only the copy keeps the link to Volt.
    await openWith(page.getByRole("button", { name: "Ny ritning" }), create);
    await expect(create.getByRole("radio", { name: "Valda passdelar" })).toBeChecked();
    await create.getByRole("checkbox", { name: "Trampett" }).click();
    await create.getByLabel("Börja med").selectOption({ label: "Kopia av Huvudritning" });
    await create.getByRole("button", { name: "Skapa" }).click();
    await expect(create).toBeHidden();
    const partPlan = page.getByRole("application", { name: `Ritning för Trampett i ${hallName}` });
    await expect(partPlan.getByRole("button", { name: `Station 1: ${stationName}` })).toBeVisible();
    await expect(partPlan.getByRole("button", { name: `Station: ${otherStation}` })).toBeVisible();

    await plans.getByRole("button", { name: /^Huvudritning/ }).click();
    await expect(drawing.getByRole("button", { name: `Station: ${stationName}` })).toBeVisible();
    await expect(drawing.getByRole("button", { name: `Station 1: ${otherStation}` })).toBeVisible();

    const outline = await outlineOf(sessionId);
    const [main, part] = await plansOf(sessionId);
    expect(main.isMain).toBe(true);
    expect(main.items.map((i) => i.activityId).sort()).toEqual([null, outline[0].activities[0].id].sort());
    expect(part.isMain).toBe(false);
    expect(part.partIds).toEqual([outline[1].id]);
    expect(part.items.find((i) => i.stationId === stationId)?.activityId).toBe(outline[1].activities[0].id);
  });

  test("copying a session's content copies its plans onto the copied parts", async ({ coach: page, prefix }) => {
    const hallName = `${prefix} Hallen`;
    const stationName = `${prefix} Trampettstation`;
    const hallId = await seedHall(hallName);
    const stationId = await seedStation("coach", stationName);
    const season = await seedSeason({
      prefix,
      weekdays: [1, 3],
      sessions: [
        {
          weekday: 1,
          week: 1,
          parts: [
            { title: "Samling" },
            { title: "Trampett", activities: ["Rakt hopp", { text: "Volt", stationId }] },
          ],
        },
      ],
    });
    const [sourceId] = season.sessionIds;
    const d = db();
    await d.update(schema.sessions).set({ hallId }).where(eq(schema.sessions.id, sourceId));
    const source = await outlineOf(sourceId);
    const mainId = crypto.randomUUID();
    const partPlanId = crypto.randomUUID();
    await d.batch([
      d.insert(schema.sessionPlans).values([
        { id: mainId, sessionId: sourceId, isMain: true },
        { id: partPlanId, sessionId: sourceId, isMain: false, name: "Banan" },
      ]),
      d.insert(schema.sessionPlanParts).values({ sessionPartId: source[1].id, planId: partPlanId }),
      d.insert(schema.planItems).values([
        { id: crypto.randomUUID(), planId: mainId, kind: "text", text: "Samling här", xCm: 500, yCm: 500, layer: 0 },
        {
          id: crypto.randomUUID(),
          planId: partPlanId,
          kind: "station",
          stationId,
          activityId: source[1].activities[1].id,
          xCm: 1000,
          yCm: 1500,
          layer: 0,
        },
      ]),
    ]);

    const sourceDate = weekdayDate(season.weeks[1], 1);
    const target = weekdayDate(season.weeks[0], 3);
    const targetName = sessionName(target);
    await page.goto(`/seasons/${season.seasonId}/weeks/${season.weeks[0]}`);
    const col = column(page, targetName);
    const menu = page.getByRole("menu");
    await openWith(col.getByRole("button", { name: `Åtgärder för passet ${targetName}` }), menu);
    await menu.getByRole("menuitem", { name: "Kopiera från pass …" }).click();
    const dialog = page.getByRole("dialog", { name: `Kopiera till ${targetName}` });
    await dialog
      .getByRole("radio", { name: new RegExp(`^${sessionName(sourceDate)}, vecka ${weekNumber(sourceDate)}`) })
      .check();
    await dialog.getByRole("button", { name: "Kopiera" }).click();
    await expect(dialog).toBeHidden();

    // The copy's column links to its two plans.
    await col.getByRole("link", { name: "Ritningar (2)" }).click();
    const plans = page.getByRole("navigation", { name: "Passets ritningar" });
    await expect(plans.getByRole("button", { name: /^Huvudritning/ })).toBeVisible();
    await plans.getByRole("button", { name: /^Banan/ }).click();
    await expect(plans.getByRole("button", { name: /^Banan/ })).toContainText("Gäller Trampett");
    // The station's number follows the copied activity.
    await expect(page.getByRole("region", { name: "Passdelar" }).locator("[data-activity-number='1']")).toContainText(
      "Volt",
    );

    const [targetId] = (
      await d
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.seasonId, season.seasonId), eq(schema.sessions.date, target)))
    ).map((r) => r.id);
    const copied = await outlineOf(targetId);
    const [main, part] = await plansOf(targetId);
    expect(main.isMain).toBe(true);
    expect(main.items.map((i) => i.text)).toEqual(["Samling här"]);
    expect(part.name).toBe("Banan");
    expect(part.partIds).toEqual([copied[1].id]);
    expect(part.items[0].activityId).toBe(copied[1].activities[1].id);
    // The source keeps its own plans.
    expect((await plansOf(sourceId)).map((p) => p.id).sort()).toEqual([mainId, partPlanId].sort());
  });

  test("a station deleted while placed stays in the plan as an adapted copy", async ({ coach: page, prefix }) => {
    const hallName = `${prefix} Hallen`;
    const stationName = `${prefix} Plintstation`;
    const hallId = await seedHall(hallName);
    const plint = await seedEquipment(`${prefix} Plint`, { name: "Hel", widthCm: 160, lengthCm: 90 });
    const stationId = await seedStation("coach", stationName);
    const season = await seedSeason({ prefix, weekdays: [1], sessions: [{ weekday: 1, week: 0, parts: [{ title: "Hopp" }] }] });
    const [sessionId] = season.sessionIds;
    const planId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const d = db();
    await d.batch([
      d.insert(schema.stationEquipment).values({ stationId, equipmentId: plint.equipmentId, quantity: 1 }),
      d.insert(schema.stationLayoutItems).values({
        id: crypto.randomUUID(),
        stationId,
        kind: "equipment",
        ...plint,
        xCm: 0,
        yCm: 0,
        layer: 0,
      }),
      d.update(schema.sessions).set({ hallId }).where(eq(schema.sessions.id, sessionId)),
      d.insert(schema.sessionPlans).values({ id: planId, sessionId, isMain: true }),
      d.insert(schema.planItems).values({ id: itemId, planId, kind: "station", stationId, xCm: 800, yCm: 800, layer: 0 }),
    ]);

    await page.goto(`/library/stations/${stationId}`);
    const confirm = page.getByRole("alertdialog", { name: "Ta bort stationen?" });
    await openWith(page.getByRole("button", { name: "Ta bort stationen" }), confirm);
    await confirm.getByRole("button", { name: "Ta bort" }).click();
    await expect(page).toHaveURL(/\/library\/stations$/);

    const [item] = await d.select().from(schema.planItems).where(eq(schema.planItems.id, itemId));
    expect([item.stationId, item.isAdapted, item.stationName]).toEqual([null, true, stationName]);
    const layout = await d
      .select()
      .from(schema.planItemLayoutItems)
      .where(eq(schema.planItemLayoutItems.planItemId, itemId));
    expect(layout.map((l) => l.configurationId)).toEqual([plint.configurationId]);

    // The plan still draws it, under the name it had.
    await page.goto(`/sessions/${sessionId}/plans`);
    const drawing = page.getByRole("application", { name: `Huvudritning i ${hallName}` });
    await drawing.getByRole("button", { name: `Station: ${stationName}` }).click();
    await expect(page.getByText("Stationen är borttagen ur biblioteket")).toBeVisible();
  });
});
