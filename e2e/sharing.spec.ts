import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, devEmail, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName } from "./support/names";
import { seedSeason } from "./support/seed";

/** Opens the group's Dela dialog as its owner. */
async function openShareDialog(page: Page, groupId: string, groupName: string) {
  await page.goto(`/groups/${groupId}`);
  const dialog = page.getByRole("dialog", { name: `Dela ${groupName}` });
  await openWith(page.getByRole("button", { name: "Dela" }), dialog);
  return dialog;
}

async function share(dialog: ReturnType<Page["getByRole"]>, email: string, level: "Kan se" | "Kan redigera") {
  await dialog.getByLabel("Lägg till en person").fill(email);
  await dialog.getByRole("combobox", { name: "Behörighet", exact: true }).selectOption({ label: level });
  await dialog.getByRole("button", { name: "Dela", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: `Behörighet för ${email}` })).toBeVisible();
}

test.describe("Sharing", () => {
  test("share a group with a help coach, change the level, then remove the share", async ({
    coach,
    helper,
    prefix,
  }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [{ weekday: 1, week: 0, parts: [{ title: "Uppvärmning" }, { title: "Trampett" }] }],
    });
    const helperEmail = devEmail("helper");
    const monday = season.weeks[0];
    const weekUrl = `/seasons/${season.seasonId}/weeks/${monday}`;
    const sessionUrl = `/sessions/${season.sessionIds[0]}`;
    const name = sessionName(monday);

    // The coach shares the group for viewing.
    const dialog = await openShareDialog(coach, season.groupId, season.groupName);
    await expect(dialog.getByText("Ingen annan har tillgång än.")).toBeVisible();
    await share(dialog, helperEmail, "Kan se");
    await expect(dialog.getByText("Dev Helper")).toBeVisible();
    const level = dialog.getByRole("combobox", { name: `Behörighet för ${helperEmail}` });
    await expect(level).toHaveValue("view");

    // The helper sees it under "Delat med mig", with the owner's name.
    await helper.goto("/");
    const shared = helper.getByRole("region", { name: "Delat med mig" });
    await expect(shared.getByRole("link", { name: season.groupName })).toBeVisible();
    await expect(shared.getByText("Delad av Dev Coach")).toBeVisible();

    // Viewing: no editing controls anywhere, but parts can be ticked.
    await shared.getByRole("link", { name: season.groupName }).click();
    await expect(helper.getByRole("heading", { level: 1, name: season.groupName })).toBeVisible();
    await expect(helper.getByRole("button", { name: "Ny säsong" })).toHaveCount(0);
    await expect(helper.getByRole("button", { name: "Byt namn" })).toHaveCount(0);
    await expect(helper.getByRole("button", { name: "Dela" })).toHaveCount(0);

    await helper.goto(weekUrl);
    const col = helper.getByRole("region", { name });
    await expect(col.getByRole("list", { name: `Innehåll i passet ${name}` })).toContainText("Uppvärmning");
    await expect(col.getByRole("textbox")).toHaveCount(0);
    await expect(helper.getByRole("button", { name: "Uppehåll och anteckning" })).toHaveCount(0);
    await expect(helper.getByRole("button", { name: "Lägg till pass" })).toHaveCount(0);
    await expect(col.getByRole("button", { name: `Åtgärder för passet ${name}` })).toHaveCount(0);

    await helper.goto(sessionUrl);
    const warmUp = await hydrated(helper.getByRole("checkbox", { name: /Uppvärmning/ }));
    await warmUp.click();
    await expect(helper.getByRole("status").filter({ hasText: "1 av 2 klara" })).toBeVisible();
    await expect(helper.getByRole("link", { name: "Redigera" })).toHaveCount(0);
    await helper.reload();
    await expect(helper.getByRole("checkbox", { name: /Uppvärmning/ })).toBeChecked();

    // The coach gives edit access; the helper can now edit the outline.
    // The list is read back from the server after the change.
    await level.selectOption("edit");
    await expect(level).toHaveValue("edit");
    await expect(level).toBeEnabled();

    const editor = helper.getByRole("region", { name }).getByRole("group", { name: `Innehåll i passet ${name}` });
    await expect(async () => {
      await helper.goto(weekUrl);
      await expect(editor.getByRole("textbox", { name: "Del 2" })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    const part = await hydrated(editor.getByRole("textbox", { name: "Del 2" }));
    await part.fill("Trampett och plint");
    await part.blur();
    await expect(helper.getByRole("region", { name }).getByRole("status")).toHaveText("Sparat");
    await helper.reload();
    await expect(editor.getByRole("textbox", { name: "Del 2" })).toHaveValue("Trampett och plint");

    // Removing the share takes the access away: the pages are not found.
    await dialog.getByRole("button", { name: `Ta bort delningen med ${helperEmail}` }).click();
    await expect(dialog.getByText("Ingen annan har tillgång än.")).toBeVisible();
    await helper.goto(sessionUrl);
    await expect(helper.getByRole("heading", { name: "Sidan hittades inte" })).toBeVisible();
    await helper.goto(`/groups/${season.groupId}`);
    await expect(helper.getByRole("heading", { name: "Sidan hittades inte" })).toBeVisible();
    await helper.goto("/");
    await expect(helper.getByRole("link", { name: season.groupName })).toHaveCount(0);
  });

  test("a share to an address that has not signed in waits, then works after the first visit", async ({
    coach,
    newcomer,
    prefix,
  }) => {
    const season = await seedSeason({ prefix, weekdays: [1] });
    const email = devEmail("newcomer");

    // Make Dev Newcomer someone who has never signed in. The account is a
    // test user that owns nothing; this fails rather than delete one that does.
    await db().delete(schema.users).where(eq(schema.users.email, email));

    const dialog = await openShareDialog(coach, season.groupId, season.groupName);
    await share(dialog, email, "Kan se");
    const entry = dialog.getByRole("listitem").filter({ hasText: email });
    await expect(entry.getByText("Har inte loggat in än")).toBeVisible();

    // The first visit signs the newcomer in, and the share starts working.
    await newcomer.goto("/");
    const shared = newcomer.getByRole("region", { name: "Delat med mig" });
    await expect(shared.getByRole("link", { name: season.groupName })).toBeVisible();
    await shared.getByRole("link", { name: season.groupName }).click();
    await expect(newcomer.getByRole("heading", { level: 1, name: season.groupName })).toBeVisible();

    const again = await openShareDialog(coach, season.groupId, season.groupName);
    const signedIn = again.getByRole("listitem").filter({ hasText: email });
    await expect(signedIn.getByText("Dev Newcomer")).toBeVisible();
    await expect(signedIn.getByText("Har inte loggat in än")).toHaveCount(0);
  });
});
