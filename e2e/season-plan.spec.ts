import type { Locator, Page } from "@playwright/test";

import { db, schema } from "./support/db";
import { expect, openWith, test } from "./support/fixtures";
import { seedSeason } from "./support/seed";

/** A grid cell, found by its label "<item>, vecka <n>: <level>". */
function cell(page: Page, item: string, week: number): Locator {
  return page.getByRole("gridcell", { name: new RegExp(`^${item}, vecka ${week}: `) });
}

async function expectLevel(page: Page, item: string, week: number, level: string) {
  await expect(cell(page, item, week)).toHaveAccessibleName(`${item}, vecka ${week}: ${level}`);
}

test.describe("Season plan", () => {
  test("create a group and a season, set up the structure, paint the grid and mark a break week", async ({
    coach: page,
    prefix,
  }) => {
    const groupName = `${prefix} Trupp`;
    const seasonName = `${prefix} HT`;
    const item1 = `${prefix} Volter`;
    const item2 = `${prefix} Landning`;

    // A new group from the start page.
    await page.goto("/");
    const groupDialog = page.getByRole("dialog", { name: "Ny grupp" });
    await openWith(page.getByRole("button", { name: "Ny grupp" }), groupDialog);
    await groupDialog.getByLabel("Gruppnamn").fill(groupName);
    await groupDialog.getByRole("button", { name: "Skapa" }).click();
    // Creating the group opens its page.
    await expect(page.getByRole("heading", { level: 1, name: groupName })).toBeVisible();

    // A season of four weeks with Mondays as training days.
    const seasonDialog = page.getByRole("dialog", { name: "Ny säsong" });
    await openWith(page.getByRole("button", { name: "Ny säsong" }), seasonDialog);
    await seasonDialog.getByLabel("Namn").fill(seasonName);
    const first = seasonDialog.getByRole("group", { name: "Första vecka" });
    await first.getByLabel("År").fill("2031");
    await first.getByLabel("Vecka").fill("10");
    const last = seasonDialog.getByRole("group", { name: "Sista vecka" });
    await last.getByLabel("År").fill("2031");
    await last.getByLabel("Vecka").fill("13");
    await expect(seasonDialog.getByText("4 veckor")).toBeVisible();
    await seasonDialog.getByRole("checkbox", { name: "Måndag" }).click();
    await seasonDialog.getByLabel("Start").fill("17:00");
    await seasonDialog.getByLabel("Slut").fill("18:30");
    await seasonDialog.getByLabel(/^Plats/).fill("E2E-hallen");
    await seasonDialog.getByRole("button", { name: "Skapa" }).click();
    await expect(seasonDialog).toBeHidden();
    await page.getByRole("link", { name: new RegExp(seasonName) }).click();
    await expect(page.getByRole("heading", { level: 1, name: seasonName })).toBeVisible();

    // A discipline with two focus items, in the season's settings.
    await page.getByRole("link", { name: "Gå till inställningar" }).click();
    const disciplineDialog = page.getByRole("dialog", { name: "Ny disciplin" });
    await openWith(page.getByRole("button", { name: "Lägg till disciplin" }), disciplineDialog);
    await disciplineDialog.getByLabel("Disciplin").fill(`${prefix} Trampett`);
    await disciplineDialog.getByRole("button", { name: "Lägg till" }).click();
    await expect(disciplineDialog).toBeHidden();
    for (const [name, category] of [
      [item1, "Redskap"],
      [item2, "Landing"],
    ]) {
      const dialog = page.getByRole("dialog", { name: `Nytt fokusområde i ${prefix} Trampett` });
      await openWith(page.getByRole("button", { name: "Lägg till fokusområde" }), dialog);
      await dialog.getByLabel("Fokusområde").fill(name);
      await dialog.getByLabel(/^Kategori/).fill(category);
      await dialog.getByRole("button", { name: "Lägg till" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Paint: a click, a drag over two weeks, and a second level.
    await page.getByRole("link", { name: seasonName }).click();
    const grid = page.getByRole("grid", { name: `Säsongsplan för ${seasonName}` });
    await expect(grid).toBeVisible();
    await expect(page.getByRole("button", { name: "Mycket fokus", pressed: true })).toBeVisible();
    await cell(page, item1, 10).click();
    await expectLevel(page, item1, 10, "Mycket fokus");

    await cell(page, item1, 11).hover();
    await page.mouse.down();
    await cell(page, item1, 12).hover();
    await page.mouse.up();
    await expectLevel(page, item1, 11, "Mycket fokus");
    await expectLevel(page, item1, 12, "Mycket fokus");

    await page.getByRole("button", { name: "Visst fokus" }).click();
    await cell(page, item2, 11).click();
    await expectLevel(page, item2, 11, "Visst fokus");
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    // Week 11 becomes a break: its cells are cleared.
    await page.getByRole("link", { name: "Vecka 11" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Vecka 11" })).toBeVisible();
    const breakBox = page.getByRole("checkbox", { name: "Uppehåll (ingen träning)" });
    await openWith(page.getByRole("button", { name: "Uppehåll och anteckning" }), breakBox);
    await breakBox.click();
    await expect(page.getByText("2 markeringar i veckan tas bort")).toBeVisible();
    await page.getByLabel("Anteckning").fill("Sportlov");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Veckan är ett uppehåll. Ordinarie pass visas inte.")).toBeVisible();

    await page.getByRole("link", { name: "Säsongsplan" }).click();
    await expect(grid).toBeVisible();
    await expectLevel(page, item1, 11, "uppehåll");
    await expectLevel(page, item2, 11, "uppehåll");
    await expect(page.getByRole("link", { name: /^Vecka 11 ?, uppehåll ?, anteckning: Sportlov$/ })).toBeVisible();

    // Everything is kept after a reload.
    await page.reload();
    await expectLevel(page, item1, 10, "Mycket fokus");
    await expectLevel(page, item1, 11, "uppehåll");
    await expectLevel(page, item1, 12, "Mycket fokus");
    await expectLevel(page, item2, 11, "uppehåll");
    await expectLevel(page, item2, 12, "Tränas inte alls");

    // Ending the break leaves the week's column empty.
    await page.getByRole("link", { name: /^Vecka 11/ }).click();
    await openWith(page.getByRole("button", { name: "Uppehåll och anteckning" }), breakBox);
    await breakBox.click();
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Veckan är ett uppehåll. Ordinarie pass visas inte.")).toBeHidden();
    await page.getByRole("link", { name: "Säsongsplan" }).click();
    await expectLevel(page, item1, 11, "Tränas inte alls");
    await expectLevel(page, item2, 11, "Tränas inte alls");
  });

  test("a grid cell can be set and cleared from the keyboard", async ({ coach: page, prefix }) => {
    const season = await seedSeason({ prefix, weekCount: 3 });
    const disciplineId = crypto.randomUUID();
    const item = `${prefix} Styrka`;
    await db().batch([
      db().insert(schema.disciplines).values({ id: disciplineId, seasonId: season.seasonId, name: "Styrka", sortOrder: 0 }),
      db().insert(schema.focusItems).values({ disciplineId, name: item, sortOrder: 0 }),
    ]);

    await page.goto(`/seasons/${season.seasonId}`);
    await cell(page, item, 10).focus();
    await page.keyboard.press("2");
    await expectLevel(page, item, 10, "Visst fokus");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("1");
    await expectLevel(page, item, 11, "Mycket fokus");
    await page.keyboard.press("0");
    await expectLevel(page, item, 11, "Tränas inte alls");
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();
    await page.reload();
    await expectLevel(page, item, 10, "Visst fokus");
    await expectLevel(page, item, 11, "Tränas inte alls");
  });
});
