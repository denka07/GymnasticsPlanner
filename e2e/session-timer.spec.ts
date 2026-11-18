import { expect, hydrated, openWith, test } from "./support/fixtures";
import { seedSeason } from "./support/seed";

// Runs in the "phone" project (Pixel-sized viewport with touch). The page's
// clock is set with Playwright's clock API, so the countdowns run in a moment:
// `Date` stays at the time set while timers keep running.

test.describe("Part timer on the session page", () => {
  test("a countdown runs out, alerts, and ticks the part off; a reload keeps the time left", async ({
    coach: page,
    prefix,
  }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [
        {
          weekday: 1,
          week: 0,
          parts: [
            { title: "Uppvärmning", minutes: 10 },
            { title: "Trampett", minutes: 45 },
          ],
        },
      ],
    });
    let now = new Date("2031-03-03T16:00:00+01:00").getTime();
    const advance = (ms: number) => page.clock.setFixedTime((now += ms));
    await page.clock.setFixedTime(now);
    await page.goto(`/sessions/${season.sessionIds[0]}`);

    const checklist = page.getByRole("list", { name: "Delar i passet" });
    const startWarmUp = await hydrated(
      checklist.getByRole("button", { name: "Starta timer för Uppvärmning" }),
    );
    const dialog = page.getByRole("dialog", { name: "Timer för Uppvärmning" });
    await openWith(startWarmUp, dialog);
    // The countdown is pre-filled with the part's duration.
    await expect(dialog.getByRole("radio", { name: "Nedräkning" })).toBeChecked();
    const minutes = dialog.getByRole("textbox", { name: "Minuter" });
    await expect(minutes).toHaveValue("10");
    await minutes.fill("2");
    await dialog.getByRole("button", { name: "Starta", exact: true }).tap();
    await expect(dialog).toBeHidden();

    const timer = page.getByRole("timer", { name: "Tid kvar för Uppvärmning" });
    await expect(timer).toHaveText("02:00");
    await expect(checklist.locator("li[data-timed]")).toContainText("Uppvärmning");

    // "+1 min", then a reload half-way keeps the end moment.
    await page.getByRole("button", { name: "+1 min" }).tap();
    await expect(timer).toHaveText("03:00");
    await advance(60_000);
    await expect(timer).toHaveText("02:00");
    await page.reload();
    await expect(timer).toHaveText("02:00");

    // The time runs out: a red full-screen alert takes over and gets focus.
    await advance(125_000);
    const alert = page.getByRole("alertdialog", { name: /Tiden är ute/ });
    await expect(alert.getByText("Tiden är ute", { exact: true })).toBeVisible();
    await expect(alert.getByText("Uppvärmning", { exact: true })).toBeVisible();
    await expect(alert.getByText("Nästa: Trampett")).toBeVisible();
    await expect(alert).toBeFocused();
    await expect(timer).toBeHidden();
    await expect(page.getByRole("region", { name: "Timer" })).toBeHidden();

    await alert.getByRole("button", { name: "Bocka av" }).tap();
    await expect(alert).toBeHidden();
    await expect(checklist.getByRole("checkbox", { name: /Uppvärmning/ })).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: /av 2 klara/ })).toHaveText("1 av 2 klara");
    // The tick is saved on the server.
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: /av 2 klara/ })).toHaveText("1 av 2 klara");
  });

  test("the time-up alert closes with Stäng and with Escape, without ticking the part", async ({
    coach: page,
    prefix,
  }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [{ weekday: 1, week: 0, parts: [{ title: "Uppvärmning", minutes: 10 }] }],
    });
    let now = new Date("2031-03-03T16:00:00+01:00").getTime();
    await page.clock.setFixedTime(now);
    await page.goto(`/sessions/${season.sessionIds[0]}`);
    const checklist = page.getByRole("list", { name: "Delar i passet" });
    const dialog = page.getByRole("dialog", { name: "Timer för Uppvärmning" });
    await openWith(
      await hydrated(checklist.getByRole("button", { name: "Starta timer för Uppvärmning" })),
      dialog,
    );
    await dialog.getByRole("textbox", { name: "Minuter" }).fill("1");
    await dialog.getByRole("button", { name: "Starta", exact: true }).tap();
    await expect(dialog).toBeHidden();

    const alert = page.getByRole("alertdialog", { name: /Tiden är ute/ });
    for (const close of ["button", "escape"] as const) {
      if (close === "escape") {
        await page.getByRole("button", { name: "Starta timer för Uppvärmning" }).tap();
        await dialog.getByRole("textbox", { name: "Minuter" }).fill("1");
        await dialog.getByRole("button", { name: "Starta", exact: true }).tap();
        await expect(dialog).toBeHidden();
      }
      await page.clock.setFixedTime((now += 65_000));
      await expect(alert).toBeVisible();
      await expect(alert).toBeFocused();
      // Without a next part there is no "Starta nästa".
      await expect(alert.getByRole("button", { name: "Starta nästa" })).toHaveCount(0);
      const box = await alert.getByRole("button", { name: "Stäng" }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(56);
      if (close === "button") {
        await alert.getByRole("button", { name: "Stäng" }).tap();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(alert).toBeHidden();
      await expect(checklist.getByRole("checkbox", { name: /Uppvärmning/ })).not.toBeChecked();
    }
  });

  test("a timer by the plan, stopping it, and replacing a running timer", async ({ coach: page, prefix }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [
        {
          weekday: 1,
          week: 0,
          parts: [
            { title: "Uppvärmning", minutes: 15 },
            { title: "Trampett", minutes: 45 },
            { title: "Styrka" },
          ],
        },
      ],
    });
    // Monday of the season's first week, 17:05; the session starts at 17:00.
    let now = new Date("2031-03-03T17:05:00+01:00").getTime();
    await page.clock.setFixedTime(now);
    await page.goto(`/sessions/${season.sessionIds[0]}`);

    const checklist = page.getByRole("list", { name: "Delar i passet" });
    const dialog = page.getByRole("dialog");
    await openWith(
      await hydrated(checklist.getByRole("button", { name: "Starta timer för Trampett" })),
      dialog,
    );
    await expect(dialog.getByText("Signal kl. 18:00")).toBeVisible();
    await dialog.getByRole("radio", { name: /Enligt planen/ }).check();
    await dialog.getByRole("button", { name: "Starta", exact: true }).tap();
    await expect(dialog).toBeHidden();
    const timer = page.getByRole("timer", { name: "Tid kvar för Trampett" });
    await expect(timer).toHaveText("55:00");

    // Another part replaces it after saying so. A part without a duration
    // starts with an empty, required field and has no plan to follow.
    await openWith(checklist.getByRole("button", { name: "Starta timer för Styrka" }), dialog);
    await expect(dialog.getByText("Timern för Trampett stoppas och ersätts av den nya.")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Enligt planen/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Ersätt och starta" }).tap();
    await expect(dialog.getByText("Ange hela minuter, 1–600.")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Minuter" }).fill("5");
    await dialog.getByRole("button", { name: "Ersätt och starta" }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("timer", { name: "Tid kvar för Styrka" })).toHaveText("05:00");

    // Once the first part's planned end (17:15) has passed, it cannot be used.
    await page.getByRole("button", { name: "Stoppa" }).tap();
    await expect(page.getByRole("region", { name: "Timer" })).toBeHidden();
    await page.clock.setFixedTime((now += 11 * 60_000));
    await openWith(checklist.getByRole("button", { name: "Starta timer för Uppvärmning" }), dialog);
    await expect(dialog.getByText("Planerad sluttid kl. 17:15 har redan passerat.")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Enligt planen/ })).toBeDisabled();
  });
});
