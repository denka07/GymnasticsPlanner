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

  test("events show beside the sessions, with a long description that expands", async ({ coach: page, prefix }) => {
    const long = Array.from({ length: 12 }, (_, i) => `Rad ${i + 1} i beskrivningen`).join("\n");
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [{ weekday: 1, week: 0 }],
      events: [
        { name: `${prefix} Läger`, type: "camp", week: 0, weekday: 2, days: 3, description: long },
        { name: `${prefix} Kort`, type: "show", week: 0, weekday: 5, description: "Kort text" },
      ],
    });
    const first = season.weeks[0];
    const tuesday = weekdayDate(first, 2);
    const wednesday = weekdayDate(first, 3);

    await page.goto(`/?week=${first}`);
    const week = page.getByRole("region", { name: `Vecka ${weekNumber(first)}` });
    // A multi-day event appears on each covered day, and a day with only events gets a column.
    await expect(week.getByRole("heading", { name: sessionName(tuesday) })).toBeVisible();
    await expect(week.getByRole("heading", { name: sessionName(wednesday) })).toBeVisible();
    await expect(week.getByRole("link", { name: `${prefix} Läger` })).toHaveCount(3);
    await expect(week.getByText("Läger", { exact: true })).toHaveCount(3);
    await expect(week.getByRole("link", { name: `${prefix} Kort` })).toHaveAttribute(
      "href",
      `/seasons/${season.seasonId}/weeks/${first}`,
    );
    // A short description has no "Visa mer".
    await expect(week.getByText("Kort text")).toBeVisible();

    // The long one is cut off; the button expands and collapses it in place.
    const camp = week.getByRole("heading", { name: `${prefix} Läger` }).first().locator("xpath=..");
    const more = camp.getByRole("button", { name: "Visa mer" });
    await expect(more).toBeVisible();
    const isCutOff = () =>
      camp.getByText("Rad 12 i beskrivningen").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    await expect.poll(isCutOff).toBe(true);
    await more.click();
    await expect(camp.getByRole("button", { name: "Visa mindre" })).toBeVisible();
    await expect(page).toHaveURL(`/?week=${first}`);
    await expect.poll(isCutOff).toBe(false);
    await camp.getByRole("button", { name: "Visa mindre" }).click();
    await expect(camp.getByRole("button", { name: "Visa mer" })).toBeVisible();

    // The card opens the week page.
    await camp.getByRole("link", { name: `${prefix} Läger` }).click();
    await expect(page).toHaveURL(`/seasons/${season.seasonId}/weeks/${first}`);
  });

  test("an event's description is edited on the week page and kept", async ({ coach: page, prefix }) => {
    const season = await seedSeason({
      prefix,
      events: [{ name: `${prefix} Falun`, week: 1, weekday: 3, days: 2 }],
    });
    const url = `/seasons/${season.seasonId}/weeks/${season.weeks[1]}`;
    await page.goto(url);
    const field = page.getByRole("textbox", { name: "Beskrivning" });
    await field.fill("Samling 07:30\nMed matsäck");
    await field.blur();
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Beskrivning" })).toHaveValue("Samling 07:30\nMed matsäck");

    // Shown on the start page too.
    await page.goto(`/?week=${season.weeks[1]}`);
    await expect(page.getByText("Samling 07:30").first()).toBeVisible();
  });

  test("a user without access to the season does not see its events", async ({
    coach: page,
    helper,
    prefix,
  }) => {
    const season = await seedSeason({
      prefix,
      events: [{ name: `${prefix} Falun`, week: 0, weekday: 3, description: "Bara läsning" }],
    });
    // The helper has no access to the group: the event is not visible.
    await helper.goto(`/?week=${season.weeks[0]}`);
    await expect(helper.getByText("Bara läsning")).toHaveCount(0);
    await page.goto(`/seasons/${season.seasonId}/weeks/${season.weeks[0]}`);
    await expect(page.getByRole("textbox", { name: "Beskrivning" })).toHaveValue("Bara läsning");
  });
});
