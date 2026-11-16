import { weekdayDate } from "../src/lib/weeks";

import { expect, test } from "./support/fixtures";
import { formatDayMonth, sessionName, weekNumber } from "./support/names";
import { seedSeason } from "./support/seed";

/** Today's date in Stockholm, as the start page reckons it. */
function todayInStockholm(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

test.describe("Start page", () => {
  test("the week view shows the group's sessions and moves between weeks", async ({ coach: page, prefix }) => {
    const season = await seedSeason({
      prefix,
      weekdays: [1, 3],
      sessions: [
        { weekday: 1, week: 0, parts: [{ title: "Uppvärmning" }] },
        { weekday: 1, week: 1, isCancelled: true },
      ],
    });
    const [first, second] = season.weeks;
    const monday = weekdayDate(first, 1);
    const wednesday = weekdayDate(first, 3);

    await page.goto(`/?week=${first}`);
    const week = page.getByRole("region", { name: `Vecka ${weekNumber(first)}` });
    await expect(week).toBeVisible();
    await expect(week.getByText(`${formatDayMonth(first)} – ${formatDayMonth(weekdayDate(first, 7))}`)).toBeVisible();

    // A planned session links to its page; a training slot not yet planned to the week page.
    await expect(week.getByRole("heading", { name: sessionName(monday) })).toBeVisible();
    const planned = week.getByRole("link", { name: new RegExp(`${season.groupName}.*Planerat`) });
    await expect(planned).toHaveAttribute("href", `/sessions/${season.sessionIds[0]}`);
    await expect(planned).toContainText("17:00");
    await expect(week.getByRole("heading", { name: sessionName(wednesday) })).toBeVisible();
    const unplanned = week.getByRole("link", { name: new RegExp(`${season.groupName}.*Inte planerat än`) });
    await expect(unplanned).toHaveAttribute("href", `/seasons/${season.seasonId}/weeks/${first}`);

    // Next week: the Monday session is cancelled.
    const nav = page.getByRole("navigation", { name: "Byt vecka" });
    await nav.getByRole("link", { name: "Nästa vecka" }).click();
    await expect(page).toHaveURL(`/?week=${second}`);
    await expect(page.getByRole("heading", { name: `Vecka ${weekNumber(second)}` })).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(`${season.groupName}.*Inställt`) }),
    ).toBeVisible();

    // Two weeks back is before the season: nothing planned.
    await nav.getByRole("link", { name: "Föregående vecka" }).click();
    await expect(page.getByRole("heading", { name: `Vecka ${weekNumber(first)}` })).toBeVisible();
    await nav.getByRole("link", { name: "Föregående vecka" }).click();
    await expect(page.getByRole("heading", { name: `Vecka ${weekNumber(first) - 1}` })).toBeVisible();
    await expect(page.getByText("Inga pass den här veckan.")).toBeVisible();

    // "Denna vecka" goes back to the current week, where it is not offered.
    await nav.getByRole("link", { name: "Denna vecka" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Vecka ${weekNumber(todayInStockholm())}` })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Denna vecka" })).toHaveCount(0);

    // A planned session opens from the week view.
    await page.goto(`/?week=${first}`);
    await page.getByRole("link", { name: new RegExp(`${season.groupName}.*Planerat`) }).click();
    await expect(page.getByRole("checkbox", { name: /Uppvärmning/ })).toBeVisible();
  });

  test("the test-user switcher in the header switches user", async ({ coach: page, prefix }) => {
    const season = await seedSeason({ prefix });
    await page.goto("/");
    const switcher = page.getByRole("group", { name: "Byt testanvändare (endast utveckling)" });
    await expect(page.getByRole("banner").getByText("Dev Coach")).toBeVisible();
    await expect(page.getByRole("link", { name: season.groupName })).toBeVisible();

    await switcher.getByRole("button", { name: "Hjälptränare" }).click();
    await expect(page.getByRole("banner").getByText("Dev Helper")).toBeVisible();
    await expect(page.getByRole("link", { name: season.groupName })).toHaveCount(0);

    await switcher.getByRole("button", { name: "Coach" }).click();
    await expect(page.getByRole("banner").getByText("Dev Coach")).toBeVisible();
    await expect(page.getByRole("link", { name: season.groupName })).toBeVisible();
  });
});
