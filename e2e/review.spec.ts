import type { Page } from "@playwright/test";

import { expect, openWith, test } from "./support/fixtures";
import { seedExercise, seedStation } from "./support/seed";

/** Opens the dialog that sends the station for review, with its exercise choice. */
async function openSubmitDialog(page: Page, label = "Skicka in för granskning") {
  const dialog = page.getByRole("dialog", { name: "Skicka in stationen för granskning" });
  await openWith(page.getByRole("button", { name: label }), dialog);
  return dialog;
}

test.describe("Review of library items", () => {
  test("submit a station with one of two exercises, withdraw, reject with a comment, resubmit and approve", async ({
    coach,
    helper,
    newcomer,
    prefix,
  }) => {
    const included = `${prefix} Medskickad övning`;
    const kept = `${prefix} Egen övning`;
    const stationName = `${prefix} Helperns station`;
    const includedId = await seedExercise("helper", included, "Följer med stationen.");
    const keptId = await seedExercise("helper", kept);
    const stationId = await seedStation("helper", stationName, [includedId, keptId]);
    const stationUrl = `/library/stations/${stationId}`;

    // The helper submits the station with only one of the exercises.
    await helper.goto(stationUrl);
    let dialog = await openSubmitDialog(helper);
    await expect(dialog.getByRole("checkbox", { name: included })).toBeChecked();
    await dialog.getByRole("checkbox", { name: kept }).click();
    await expect(dialog.getByRole("checkbox", { name: kept })).not.toBeChecked();
    await dialog.getByRole("button", { name: "Skicka in för granskning" }).click();
    await expect(dialog).toBeHidden();
    await expect(helper.getByText(/^Inskickad för granskning /)).toBeVisible();
    await expect(helper.getByText("Den här övningen granskas tillsammans med stationen:")).toBeVisible();

    // …withdraws it…
    const withdraw = helper.getByRole("alertdialog", { name: "Dra tillbaka inskickningen?" });
    await openWith(helper.getByRole("button", { name: "Dra tillbaka" }), withdraw);
    await withdraw.getByRole("button", { name: "Dra tillbaka" }).click();
    await expect(helper.getByRole("button", { name: "Skicka in för granskning" })).toBeVisible();
    await expect(helper.getByText(/^Inskickad för granskning /)).toBeHidden();

    // …and submits it again.
    dialog = await openSubmitDialog(helper);
    await dialog.getByRole("checkbox", { name: kept }).click();
    await dialog.getByRole("button", { name: "Skicka in för granskning" }).click();
    await expect(helper.getByText(/^Inskickad för granskning /)).toBeVisible();

    // The administrator finds it under Granskning and rejects it; a comment is required.
    await coach.goto("/library/review");
    await coach.getByRole("list", { name: "Inskickat för granskning" }).getByRole("link", { name: new RegExp(stationName) }).click();
    await expect(coach.getByRole("heading", { level: 1, name: stationName })).toBeVisible();
    await expect(coach.getByText(/^Dev Helper skickade in den för granskning/)).toBeVisible();
    const reject = coach.getByRole("dialog", { name: "Avvisa inskickningen" });
    await openWith(coach.getByRole("button", { name: "Avvisa" }), reject);
    await reject.getByRole("button", { name: "Avvisa" }).click();
    await expect(reject.getByRole("alert")).toHaveText("Skriv en kommentar.");
    await reject.getByLabel("Kommentar till Dev Helper").fill("Beskriv hur kilen ska ligga.");
    await reject.getByRole("button", { name: "Avvisa" }).click();
    await expect(reject).toBeHidden();

    // The helper reads the comment and sends it in again.
    await helper.reload();
    await expect(helper.getByText(/^Avvisad /)).toBeVisible();
    await expect(helper.getByText("Beskriv hur kilen ska ligga.")).toBeVisible();
    dialog = await openSubmitDialog(helper, "Skicka in igen");
    await dialog.getByRole("checkbox", { name: kept }).click();
    await dialog.getByRole("button", { name: "Skicka in för granskning" }).click();
    await expect(helper.getByText(/^Inskickad för granskning /)).toBeVisible();

    // The administrator approves it with the included exercise ticked.
    await coach.reload();
    const approve = coach.getByRole("dialog", { name: "Godkänna och göra global?" });
    await openWith(coach.getByRole("button", { name: "Godkänn" }), approve);
    await expect(approve.getByRole("checkbox", { name: included })).toBeChecked();
    await expect(approve.getByRole("checkbox", { name: kept })).toHaveCount(0);
    await approve.getByRole("button", { name: "Godkänn" }).click();
    await expect(approve).toBeHidden();
    await expect(coach.getByRole("heading", { level: 1, name: stationName })).toContainText("Global");
    // Administrators see who created it.
    await expect(coach.getByText("Skapad av Dev Helper")).toBeVisible();

    // The helper sees the outcome.
    await helper.reload();
    await expect(helper.getByText(/^Godkänd /)).toBeVisible();
    await expect(helper.getByText("Den här övningen blev global tillsammans med stationen:")).toBeVisible();

    // Another user sees the station and the included exercise as global, without the creator's name.
    await newcomer.goto(stationUrl);
    await expect(newcomer.getByRole("heading", { level: 1, name: stationName })).toContainText("Global");
    await expect(newcomer.getByText(/^Skapad av/)).toHaveCount(0);
    await expect(newcomer.getByText(included)).toBeVisible();
    await expect(newcomer.getByText(kept)).toHaveCount(0);
    await newcomer.goto(`/library/exercises/${includedId}`);
    await expect(newcomer.getByRole("heading", { level: 1, name: included })).toContainText("Global");
    await expect(newcomer.getByText(/^Skapad av/)).toHaveCount(0);
    // The exercise that stayed personal is not found by others.
    await newcomer.goto(`/library/exercises/${keptId}`);
    await expect(newcomer.getByRole("heading", { name: "Sidan hittades inte" })).toBeVisible();
  });

  test("an administrator makes a station global and another user copies it to their own", async ({
    coach,
    helper,
    prefix,
  }) => {
    const exercise = `${prefix} Coachens övning`;
    const stationName = `${prefix} Coachens station`;
    const exerciseId = await seedExercise("coach", exercise);
    const stationId = await seedStation("coach", stationName, [exerciseId]);

    await coach.goto(`/library/stations/${stationId}`);
    const dialog = coach.getByRole("dialog", { name: "Göra den global?" });
    await openWith(coach.getByRole("button", { name: "Gör global" }), dialog);
    await expect(dialog.getByRole("checkbox", { name: exercise })).toBeChecked();
    await dialog.getByRole("button", { name: "Gör global" }).click();
    await expect(dialog).toBeHidden();
    await expect(coach.getByRole("heading", { level: 1, name: stationName })).toContainText("Global");

    // The helper sees it read-only and copies it.
    await helper.goto(`/library/stations/${stationId}`);
    await expect(helper.getByText(/Den här är global och kan bara ändras av en administratör/)).toBeVisible();
    await expect(helper.getByLabel("Namn")).toHaveCount(0);
    await helper.getByRole("button", { name: "Kopiera till mina" }).click();
    await expect(helper).not.toHaveURL(new RegExp(stationId));
    await expect(helper.getByLabel("Namn")).toHaveValue(stationName);
    await expect(helper.getByRole("heading", { level: 1, name: stationName })).not.toContainText("Global");
    // The copy keeps the exercise, which went global with the station.
    await expect(helper.getByRole("link", { name: exercise })).toBeVisible();
  });
});
