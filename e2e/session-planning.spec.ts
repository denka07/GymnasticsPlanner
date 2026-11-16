import type { Page } from "@playwright/test";

import { weekdayDate } from "../src/lib/weeks";

import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName, weekNumber } from "./support/names";
import { seedSeason } from "./support/seed";

/** A session's column on the week page. */
function column(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test.describe("Planning a session", () => {
  test("type parts and activities in the outline editor, set durations and see them after a reload", async ({
    coach: page,
    prefix,
  }) => {
    const season = await seedSeason({ prefix, weekdays: [1] });
    const monday = season.weeks[0];
    const name = sessionName(monday);
    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);
    await expect(page.getByRole("heading", { level: 1, name: `Vecka ${weekNumber(monday)}` })).toBeVisible();

    const col = column(page, name);
    await expect(col.getByText("Inte planerat än")).toBeVisible();
    const editor = col.getByRole("group", { name: `Innehåll i passet ${name}` });

    // Enter makes a new line; Tab turns a part into a line under the part
    // above; Enter on an empty line makes it a part again.
    await (await hydrated(editor.getByRole("textbox", { name: "Del 1" }))).click();
    await page.keyboard.type("Uppvärmning");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Hopprep");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Spring runt");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Trampett");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Rakt hopp");

    await expect(editor.getByRole("textbox", { name: "Del 2" })).toHaveValue("Trampett");
    await expect(editor.getByRole("textbox", { name: "Rad under Uppvärmning" })).toHaveCount(2);
    await expect(editor.getByRole("textbox", { name: "Rad under Trampett" })).toHaveValue("Rakt hopp");

    await editor.getByRole("spinbutton", { name: "Längd i minuter för Uppvärmning" }).fill("15");
    await editor.getByRole("spinbutton", { name: "Längd i minuter för Trampett" }).fill("30");
    await expect(editor.getByText("Summa 45 min av 90 min")).toBeVisible();
    // Parts get clock times from the session's start, 17:00.
    await expect(editor.getByText("Börjar 17:15")).toBeAttached();
    await expect(col.getByRole("status")).toHaveText("Sparat");
    await expect(col.getByRole("link", { name: "Öppna pass" })).toBeVisible();

    await page.reload();
    const after = column(page, name).getByRole("group", { name: `Innehåll i passet ${name}` });
    await expect(after.getByRole("textbox", { name: "Del 1" })).toHaveValue("Uppvärmning");
    await expect(after.getByRole("textbox", { name: "Rad under Uppvärmning" })).toHaveText(["Hopprep", "Spring runt"]);
    await expect(after.getByRole("textbox", { name: "Del 2" })).toHaveValue("Trampett");
    await expect(after.getByRole("textbox", { name: "Rad under Trampett" })).toHaveValue("Rakt hopp");
    await expect(after.getByRole("spinbutton", { name: "Längd i minuter för Uppvärmning" })).toHaveValue("15");
    await expect(after.getByRole("spinbutton", { name: "Längd i minuter för Trampett" })).toHaveValue("30");
    await expect(column(page, name).getByText("Inte planerat än")).toBeHidden();
  });

  test("copy the content of another session, replacing what is there", async ({ coach: page, prefix }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1, 3],
      sessions: [
        {
          weekday: 1,
          week: 1,
          parts: [
            { title: "Samling", minutes: 10 },
            { title: "Tumbling", minutes: 40, activities: ["Rondat", "Flickis"] },
          ],
        },
        { weekday: 3, week: 0, parts: [{ title: "Gammal del", activities: ["Ska bort"] }] },
      ],
    });
    const source = weekdayDate(season.weeks[1], 1);
    const target = weekdayDate(season.weeks[0], 3);
    const targetName = sessionName(target);
    await page.goto(`/seasons/${season.seasonId}/weeks/${season.weeks[0]}`);

    const col = column(page, targetName);
    await expect(col.getByRole("textbox", { name: "Del 1" })).toHaveValue("Gammal del");
    const menu = page.getByRole("menu");
    await openWith(col.getByRole("button", { name: `Åtgärder för passet ${targetName}` }), menu);
    await menu.getByRole("menuitem", { name: "Kopiera från pass …" }).click();

    const dialog = page.getByRole("dialog", { name: `Kopiera till ${targetName}` });
    await dialog
      .getByRole("radio", { name: new RegExp(`^${sessionName(source)}, vecka ${weekNumber(source)}`) })
      .check();
    await dialog.getByRole("button", { name: "Kopiera" }).click();
    // The target has content, so the copy asks first.
    const confirm = page.getByRole("dialog", { name: "Ersätta innehållet?" });
    await confirm.getByRole("button", { name: "Ersätt" }).click();
    await expect(confirm).toBeHidden();

    await expect(col.getByRole("textbox", { name: "Del 1" })).toHaveValue("Samling");
    await expect(col.getByRole("textbox", { name: "Del 2" })).toHaveValue("Tumbling");
    await expect(col.getByRole("textbox", { name: "Rad under Tumbling" })).toHaveText(["Rondat", "Flickis"]);

    await page.reload();
    const after = column(page, targetName);
    await expect(after.getByRole("textbox", { name: "Del 1" })).toHaveValue("Samling");
    await expect(after.getByRole("spinbutton", { name: "Längd i minuter för Tumbling" })).toHaveValue("40");
    await expect(after.getByRole("textbox", { name: "Rad under Tumbling" })).toHaveText(["Rondat", "Flickis"]);
    await expect(after.getByText("Gammal del")).toHaveCount(0);
  });
});
