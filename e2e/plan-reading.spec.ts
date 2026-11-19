import { expect, hydrated, openWith, test } from "./support/fixtures";
import { seedSessionWithPlans } from "./support/plans";

// Runs in the "phone" project (Pixel-sized viewport with touch).

test.describe("Reading plans on a phone", () => {
  test("open a part's plan, move between plans and zoom, and tap a station's number to reach its activity", async ({
    coach: page,
    prefix,
  }) => {
    const { sessionId, otherSessionId, stationName } = await seedSessionWithPlans(prefix, {
      widthCm: 2000,
      lengthCm: 3000,
    });
    await page.goto(`/sessions/${sessionId}`);

    // The plans are not shown until asked for: one button at the top, one per part.
    await expect(page.getByRole("img", { name: /i E2E/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Visa passets 2 ritningar" })).toBeVisible();
    const checklist = page.getByRole("list", { name: "Delar i passet" });
    for (const part of ["Samling", "Trampett", "Styrka"]) {
      await expect(checklist.getByRole("button", { name: `Visa ritningen för ${part}` })).toBeVisible();
    }

    // Trampett has a plan of its own.
    const view = page.getByRole("dialog", { name: "Banan" });
    await openWith(await hydrated(checklist.getByRole("button", { name: "Visa ritningen för Trampett" })), view);
    await expect(view.getByText("2 av 2")).toBeVisible();
    await expect(view.getByText("Gäller Trampett")).toBeVisible();

    // Arrows move to the session's other plans; the main plan is first.
    await view.getByRole("button", { name: "Föregående ritning: Huvudritning" }).tap();
    const main = page.getByRole("dialog", { name: "Huvudritning" });
    await expect(main.getByText("Gäller Samling, Styrka")).toBeVisible();
    await expect(main.getByRole("button", { name: "Ingen föregående ritning" })).toBeDisabled();
    await main.getByRole("button", { name: "Nästa ritning: Banan" }).tap();
    await expect(view).toBeVisible();

    // The zoom buttons zoom about the middle; "Visa hela" fits it again.
    const frame = view.locator("[data-zoom-frame]");
    await expect(frame).toHaveAttribute("data-scale", "1.00");
    await view.getByRole("button", { name: "Zooma in" }).tap();
    await expect(frame).toHaveAttribute("data-scale", "1.50");
    await view.getByRole("button", { name: "Visa hela" }).tap();
    await expect(frame).toHaveAttribute("data-scale", "1.00");

    // The hall is longer than wide and the phone is held upright, so the drawing is not turned.
    await expect(view.locator("svg[data-plan-drawing]")).not.toHaveAttribute("data-turned", "true");

    // Tapping the station's number closes the view and unfolds its activity.
    await view.getByRole("button", { name: "Station 1: visa aktiviteten" }).tap();
    await expect(view).toBeHidden();
    const volt = checklist.getByRole("button", { name: new RegExp(`${stationName}.*Volt`) });
    await expect(volt).toHaveAttribute("aria-expanded", "true");
    await expect(volt).toBeFocused();
    await expect(volt).toBeInViewport();
    await expect(checklist.getByText("Trampetten mot tjockmattan.")).toBeVisible();

    // A session without plans shows none of this.
    await page.goto(`/sessions/${otherSessionId}`);
    await expect(page.getByRole("list", { name: "Delar i passet" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Visa passets/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Visa ritningen för/ })).toHaveCount(0);
  });
});
