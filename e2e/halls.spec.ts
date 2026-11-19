import path from "node:path";

import type { Locator, Page } from "@playwright/test";
import { config } from "dotenv";
import { asc, eq, inArray } from "drizzle-orm";

import { todayInStockholm } from "../src/lib/session-view";
import { addWeeks, isoWeek, mondayOf, weekdayDate } from "../src/lib/weeks";

import { db, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName } from "./support/names";
import { seedEquipment, seedHall, seedSeason } from "./support/seed";

config({ path: ".env.local", quiet: true });

const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function featuresOf(hallId: string) {
  return db()
    .select()
    .from(schema.hallFeatures)
    .where(eq(schema.hallFeatures.hallId, hallId))
    .orderBy(asc(schema.hallFeatures.layer));
}

/** Types into a properties field and leaves it with Enter, which applies it. */
async function setField(panel: Locator, label: string, value: string) {
  const field = panel.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

/** The centre of an element on the screen. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

function column(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test.describe("Halls", () => {
  test("an administrator draws a hall with features and saves it; others only read it", async ({
    coach: page,
    helper,
    prefix,
  }) => {
    const hallName = `${prefix} C-salen`;
    const equipmentName = `${prefix} Tumblingbana`;
    await seedEquipment(equipmentName, { name: "Utrullad", widthCm: 200, lengthCm: 1200, color: "#2563a8" });

    // Create the hall from the Hallar tab; it opens in the editor.
    await page.goto("/library/halls");
    const dialog = page.getByRole("dialog", { name: "Ny hall" });
    await openWith(page.getByRole("button", { name: "Ny hall" }), dialog);
    await dialog.getByLabel("Namn").fill(hallName);
    await dialog.getByLabel("Bredd (m)").fill("24,5");
    await dialog.getByLabel("Längd (m)").fill("42");
    await dialog.getByRole("button", { name: "Skapa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: hallName })).toBeVisible();
    await expect(page.getByText("24,5 × 42 m").first()).toBeVisible();
    const hallId = page.url().split("/").pop()!;

    const drawing = page.getByRole("application", { name: `Ritning av ${hallName}` });
    const palette = page.getByRole("region", { name: "Lägg till" });
    await hydrated(palette.getByRole("button", { name: "Ribbstol" }));

    // Wall bars, a door and an MD pit from the palette, and the fixed track.
    await palette.getByRole("button", { name: "Ribbstol" }).click();
    await palette.getByRole("button", { name: "Dörr" }).click();
    await palette.getByRole("button", { name: "MD-grop" }).click();
    await palette.getByLabel("Redskap", { exact: true }).selectOption({ label: equipmentName });
    await palette.getByRole("button", { name: "Lägg till redskap" }).click();
    await expect(drawing.locator("[data-item-id]")).toHaveCount(4);
    await expect(drawing.getByRole("button", { name: `${equipmentName}, Utrullad` })).toBeVisible();
    // New items are placed in the middle; the track, still selected, moves 6 m right with Shift+arrows.
    const trackX = page.getByRole("region", { name: `${equipmentName}, Utrullad` }).getByLabel("X (m)");
    await expect(trackX).toHaveValue("12,5");
    await drawing.focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+ArrowRight");
    }
    await expect(trackX).toHaveValue("18,5");

    // The pit: its own size, a label, and a move by dragging that lands on the 0,5 m grid.
    await drawing.getByRole("button", { name: "MD-grop", exact: true }).click({ position: { x: 3, y: 3 } });
    const panel = page.getByRole("region", { name: "MD-grop", exact: true });
    await setField(panel, "Bredd (cm)", "500");
    // A photo of the pit, stretched to its size, instead of its colour.
    if (hasBlob) {
      await panel.locator('input[type="file"]').setInputFiles(fixture("E2E-bild.png"));
      await expect(panel.getByRole("button", { name: "Byt bild" })).toBeVisible({ timeout: 30_000 });
    }
    await setField(panel, "Etikett", "Stora gropen");
    const pitLabelled = drawing.getByRole("button", { name: "MD-grop: Stora gropen" });
    await expect(pitLabelled).toBeVisible();
    const start = await centre(pitLabelled);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 25, { steps: 5 });
    await page.mouse.move(start.x + 80, start.y + 50, { steps: 5 });
    await page.mouse.up();
    const x = page.getByRole("region", { name: "MD-grop: Stora gropen" }).getByLabel("X (m)");
    await expect(x).not.toHaveValue("12,5");

    // Rotate with the keyboard, undo it, and rotate again.
    await page.keyboard.press("r");
    const rotation = page.getByRole("region", { name: "MD-grop: Stora gropen" }).getByLabel("Vridning (°)");
    await expect(rotation).toHaveValue("15");
    await page.keyboard.press("Control+z");
    await expect(rotation).toHaveValue("0");
    await page.keyboard.press("Shift+r");
    await expect(rotation).toHaveValue("345");

    // Move the pit off the door below it, then duplicate the door and delete the copy again.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+ArrowDown");
    }
    // The door is small: zoom in on the middle, where it is, first.
    for (let i = 0; i < 6; i++) {
      await page.getByRole("button", { name: "Zooma in" }).click();
    }
    // Its box includes the swing of the door leaf; click the door itself, at the top.
    await drawing.getByRole("button", { name: "Dörr" }).click({ position: { x: 10, y: 3 } });
    await page.keyboard.press("Control+d");
    await expect(drawing.getByRole("button", { name: "Dörr" })).toHaveCount(2);
    await page.keyboard.press("Delete");
    await expect(drawing.getByRole("button", { name: "Dörr" })).toHaveCount(1);

    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await expect(page.getByText("Sparat", { exact: true })).toBeVisible();

    const [hall] = await db().select().from(schema.halls).where(eq(schema.halls.id, hallId));
    expect([hall.name, hall.widthCm, hall.lengthCm]).toEqual([hallName, 2450, 4200]);
    const features = await featuresOf(hallId);
    expect(features.map((f) => f.kind)).toEqual(["wall_bars", "door", "md_pit", "equipment"]);
    const savedPit = features[2];
    expect([savedPit.label, savedPit.widthCm, savedPit.lengthCm, savedPit.rotation]).toEqual([
      "Stora gropen",
      500,
      1000,
      345,
    ]);
    // Dragged away from the centre, onto the grid.
    expect(savedPit.xCm).not.toBe(1250);
    expect(savedPit.xCm % 50).toBe(0);
    expect(savedPit.yCm % 50).toBe(0);
    const imageUrl = hasBlob ? await pitLabelled.locator("image").getAttribute("href") : null;
    if (hasBlob) {
      expect(savedPit.imageContentType).toBe("image/png");
      expect(savedPit.imagePathname).toMatch(new RegExp(`/halls/${hallId}/[A-Za-z0-9]+-E2E-bild\\.png$`));
      expect(imageUrl).toMatch(new RegExp(`^/api/hall-images/${hallId}/[A-Za-z0-9]+-E2E-bild\\.png$`));
    }
    expect(features[3].widthCm).toBeNull();

    // Equipment fixed in a hall cannot leave the catalogue.
    await page.goto("/library/equipment");
    const confirm = page.getByRole("alertdialog", { name: "Ta bort redskapet?" });
    await openWith(page.getByRole("button", { name: `Ta bort ${equipmentName}` }), confirm);
    await confirm.getByRole("button", { name: "Ta bort" }).click();
    await expect(page.getByText("Redskapet står fast i en hall och kan inte tas bort.")).toBeVisible();
    expect(await db().select().from(schema.equipment).where(eq(schema.equipment.name, equipmentName))).toHaveLength(1);

    // The list draws the hall small; a helper coach only reads it.
    await helper.goto("/library/halls");
    await expect(helper.getByRole("img", { name: `${hallName}, 24,5 × 42 m` })).toBeVisible();
    await helper.getByRole("link", { name: new RegExp(hallName) }).click();
    await expect(helper.getByRole("heading", { level: 1, name: hallName })).toBeVisible();
    await expect(helper.getByText("Bara administratörer kan ändra hallen.")).toBeVisible();
    await expect(helper.getByRole("img", { name: `${hallName}, 24,5 × 42 m` })).toBeVisible();
    await expect(helper.getByRole("application")).toHaveCount(0);
    await expect(helper.getByRole("button", { name: "Spara ändringar" })).toHaveCount(0);
    if (imageUrl) {
      // A saved feature image is served to every signed-in user.
      const response = await helper.request.get(imageUrl);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("a training day gets a default hall and its upcoming stored sessions can follow it", async ({
    coach: page,
    prefix,
  }) => {
    const before = await seedHall(`${prefix} AB-hallen`);
    const after = await seedHall(`${prefix} C-salen`);
    // Two weeks back, so the season has a passed session as well as an upcoming one.
    const today = todayInStockholm(new Date());
    const start = isoWeek(addWeeks(mondayOf(today), -2));
    const season = await seedSeason({
      prefix,
      start,
      weekCount: 6,
      weekdays: [1],
      sessions: [
        { weekday: 1, week: 0 },
        { weekday: 1, week: 4 },
      ],
    });
    const d = db();
    await d.update(schema.trainingSlots).set({ hallId: before }).where(eq(schema.trainingSlots.id, season.slotIds[1]));
    await d.update(schema.sessions).set({ hallId: before }).where(inArray(schema.sessions.id, season.sessionIds));

    await page.goto(`/seasons/${season.seasonId}/setup`);
    const dialog = page.getByRole("dialog", { name: "Redigera säsongen" });
    await openWith(page.getByRole("button", { name: "Redigera säsongen" }), dialog);
    const hall = dialog.getByLabel("Hall", { exact: true });
    await expect(hall).toHaveValue(before);
    await hall.selectOption({ label: `${prefix} C-salen` });
    await dialog.getByRole("button", { name: "Spara" }).click();

    // Only the upcoming session is counted and changed.
    const prompt = page.getByRole("alertdialog", { name: "Byt hall för kommande pass?" });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByText(`Måndag: ${prefix} C-salen. 1 sparat pass från i dag har en annan hall.`)).toBeVisible();
    await prompt.getByRole("button", { name: "Byt hall för dem" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByText(`${prefix} C-salen`).first()).toBeVisible();

    const [slot] = await d.select().from(schema.trainingSlots).where(eq(schema.trainingSlots.id, season.slotIds[1]));
    expect(slot.hallId).toBe(after);
    const sessions = await d
      .select({ id: schema.sessions.id, hallId: schema.sessions.hallId })
      .from(schema.sessions)
      .where(inArray(schema.sessions.id, season.sessionIds));
    const hallOf = (id: string) => sessions.find((s) => s.id === id)?.hallId;
    expect(hallOf(season.sessionIds[0])).toBe(before);
    expect(hallOf(season.sessionIds[1])).toBe(after);

    // Changing it back and keeping the sessions' hall leaves them alone.
    await openWith(page.getByRole("button", { name: "Redigera säsongen" }), dialog);
    await dialog.getByLabel("Hall", { exact: true }).selectOption({ label: `${prefix} AB-hallen` });
    await dialog.getByRole("button", { name: "Spara" }).click();
    await prompt.getByRole("button", { name: "Behåll deras hall" }).click();
    await expect(prompt).toBeHidden();
    const [kept] = await d
      .select({ hallId: schema.sessions.hallId })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, season.sessionIds[1]));
    expect(kept.hallId).toBe(after);
  });

  test("placeholders show their slot's hall, a stored session copies it, and a session's hall can be changed", async ({
    coach: page,
    prefix,
  }) => {
    const cSalen = await seedHall(`${prefix} C-salen`);
    const abHallen = await seedHall(`${prefix} AB-hallen`);
    const season = await seedSeason({ prefix, weekdays: [1, 3] });
    const d = db();
    await d.update(schema.trainingSlots).set({ hallId: cSalen, location: null }).where(eq(schema.trainingSlots.id, season.slotIds[1]));
    await d.update(schema.trainingSlots).set({ hallId: abHallen, location: null }).where(eq(schema.trainingSlots.id, season.slotIds[3]));

    const monday = season.weeks[0];
    const wednesday = weekdayDate(monday, 3);
    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);
    const mondayColumn = column(page, sessionName(monday));
    const wednesdayColumn = column(page, sessionName(wednesday));
    await expect(mondayColumn.getByText(`${prefix} C-salen`)).toBeVisible();
    await expect(wednesdayColumn.getByText(`${prefix} AB-hallen`)).toBeVisible();

    // Cancelling the Wednesday placeholder stores it with its slot's hall.
    const menu = page.getByRole("menu");
    await openWith(wednesdayColumn.getByRole("button", { name: `Åtgärder för passet ${sessionName(wednesday)}` }), menu);
    await menu.getByRole("menuitem", { name: "Ställ in passet" }).click();
    await expect(wednesdayColumn.getByText("Inställt")).toBeVisible();
    const [stored] = await d
      .select({ hallId: schema.sessions.hallId })
      .from(schema.sessions)
      .where(eq(schema.sessions.trainingSlotId, season.slotIds[3]));
    expect(stored.hallId).toBe(abHallen);

    // Monday is held in AB-hallen this week.
    await openWith(mondayColumn.getByRole("button", { name: `Åtgärder för passet ${sessionName(monday)}` }), menu);
    await menu.getByRole("menuitem", { name: "Ändra datum, tid, plats och hall …" }).click();
    const details = page.getByRole("dialog", { name: "Datum, tid, plats och hall" });
    await expect(details.getByLabel("Hall")).toHaveValue(cSalen);
    await details.getByLabel("Hall").selectOption({ label: `${prefix} AB-hallen` });
    await details.getByRole("button", { name: "Spara" }).click();
    await expect(details).toBeHidden();
    await expect(mondayColumn.getByText(`${prefix} AB-hallen`)).toBeVisible();
    const [moved] = await d
      .select({ hallId: schema.sessions.hallId })
      .from(schema.sessions)
      .where(eq(schema.sessions.trainingSlotId, season.slotIds[1]));
    expect(moved.hallId).toBe(abHallen);
    // The slot keeps its hall for the other weeks.
    await page.goto(`/seasons/${season.seasonId}/weeks/${season.weeks[1]}`);
    await expect(column(page, sessionName(season.weeks[1])).getByText(`${prefix} C-salen`)).toBeVisible();
  });
});
