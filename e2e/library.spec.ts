import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName } from "./support/names";
import { seedExercise, seedSeason, seedStation } from "./support/seed";

test.describe("Library and linking", () => {
  test("create a station with equipment and exercises", async ({ coach: page, prefix }) => {
    const equipmentName = `${prefix} Plint`;
    const stationName = `${prefix} Plint med kil`;

    // Dev Coach is an administrator and may add equipment to the catalogue.
    await page.goto("/library/equipment");
    const equipmentDialog = page.getByRole("dialog", { name: "Nytt redskap" });
    await openWith(page.getByRole("button", { name: "Nytt redskap" }), equipmentDialog);
    await equipmentDialog.getByLabel("Namn").fill(equipmentName);
    await equipmentDialog.getByRole("button", { name: "Skapa" }).click();
    await expect(equipmentDialog).toBeHidden();
    await expect(page.getByText(equipmentName, { exact: true })).toBeVisible();

    // A personal station; creating it opens its page.
    await page.goto("/library/stations");
    const stationDialog = page.getByRole("dialog", { name: "Ny station" });
    await openWith(page.getByRole("button", { name: "Ny station" }), stationDialog);
    await stationDialog.getByLabel("Namn").fill(stationName);
    await expect(stationDialog.getByRole("radio", { name: /^Personlig/ })).toBeChecked();
    await stationDialog.getByRole("button", { name: "Skapa" }).click();
    await expect(page.getByLabel("Namn")).toHaveValue(stationName);

    await page.getByLabel("Beskrivning").fill("Kilen mot plinten.");
    await page.getByLabel("Redskap att lägga till").selectOption({ label: equipmentName });
    await page.getByRole("button", { name: "Lägg till redskap" }).click();
    await page.getByRole("spinbutton", { name: `Antal ${equipmentName}` }).fill("2");

    // Exercises are created by name from the search field.
    const find = page.getByLabel("Sök övning att lägga till");
    for (const exercise of [`${prefix} Upphopp`, `${prefix} Kullerbytta`]) {
      await find.fill(exercise);
      await page.getByRole("button", { name: `Skapa övningen ”${exercise}”` }).click();
      await expect(page.getByRole("link", { name: exercise })).toBeVisible();
      await find.fill("");
    }
    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Beskrivning")).toHaveValue("Kilen mot plinten.");
    await expect(page.getByRole("spinbutton", { name: `Antal ${equipmentName}` })).toHaveValue("2");
    await expect(page.getByRole("link", { name: `${prefix} Upphopp` })).toBeVisible();
    await expect(page.getByRole("link", { name: `${prefix} Kullerbytta` })).toBeVisible();

    // The station is listed among the user's own.
    await page.goto("/library/stations");
    await expect(page.getByRole("link", { name: new RegExp(stationName) })).toBeVisible();
  });

  test("link a station and exercises from an activity, see them on the session page, then delete a used exercise", async ({
    coach: page,
    prefix,
  }) => {
    const supported = `${prefix} Rakt hopp`;
    const created = `${prefix} Halvskruv`;
    const stationName = `${prefix} Trampett`;
    const exerciseId = await seedExercise("coach", supported);
    await seedStation("coach", stationName, [exerciseId]);
    const season = await seedSeason({ prefix, weekdays: [1] });
    const monday = season.weeks[0];
    const name = sessionName(monday);

    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);
    const col = page.getByRole("region", { name });
    const editor = col.getByRole("group", { name: `Innehåll i passet ${name}` });
    await (await hydrated(editor.getByRole("textbox", { name: "Del 1" }))).click();
    await page.keyboard.type("Hopp");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("tre varv");

    const dialog = page.getByRole("dialog", { name: "Station och övningar" });
    await openWith(editor.getByRole("button", { name: "Station och övningar för tre varv" }), dialog);
    await dialog.getByLabel("Sök station").fill(stationName);
    await dialog.getByRole("button", { name: `Välj ${stationName}` }).click();
    await expect(dialog.getByText(stationName, { exact: true })).toBeVisible();

    // The station's exercises come first, marked as supported.
    const option = dialog.getByRole("button", { name: `Lägg till ${supported}` });
    await expect(option).toContainText("Stöds av stationen");
    await option.click();
    await dialog.getByLabel("Sök övning").fill(created);
    await dialog.getByRole("button", { name: `Skapa övningen ”${created}” och koppla till stationen` }).click();
    await expect(dialog.getByRole("button", { name: `Ta bort ${created} från raden` })).toBeVisible();
    await dialog.getByRole("button", { name: "Klar" }).click();
    await expect(dialog).toBeHidden();

    const linked = editor.getByRole("button", { name: "Station och övningar för tre varv" }).first();
    await expect(linked).toContainText(stationName);
    await expect(linked).toContainText(supported);
    await expect(linked).toContainText(created);
    await expect(col.getByRole("status")).toHaveText("Sparat");

    // The session page shows the station with its exercises.
    await col.getByRole("link", { name: "Öppna pass" }).click();
    const checklist = page.getByRole("list", { name: "Delar i passet" });
    await expect(checklist.getByText(`${stationName}`, { exact: true })).toBeVisible();
    await expect(checklist.getByText(": tre varv")).toBeVisible();
    await expect(checklist.getByText(`${supported}, ${created}`)).toBeVisible();
    const sessionUrl = page.url();

    // The new exercise was linked to the station as well.
    await page.goto("/library/stations");
    await page.getByRole("link", { name: new RegExp(stationName) }).click();
    await expect(page.getByRole("link", { name: created })).toBeVisible();

    // Deleting an exercise that an activity uses says so and removes it from the activity.
    await page.getByRole("link", { name: created }).click();
    await expect(page.getByText("Används i 1 aktivitet i ett pass.")).toBeVisible();
    const confirm = page.getByRole("alertdialog", { name: "Ta bort övningen?" });
    await openWith(page.getByRole("button", { name: "Ta bort övningen" }), confirm);
    await expect(confirm).toContainText("Den används i 1 aktivitet i ett pass");
    await confirm.getByRole("button", { name: "Ta bort" }).click();
    await expect(page).toHaveURL(/\/library\/exercises$/);

    await page.goto(sessionUrl);
    await expect(checklist.getByText(supported, { exact: true })).toBeVisible();
    await expect(page.getByText(created)).toHaveCount(0);
  });
});
