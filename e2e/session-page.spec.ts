import { expect, hydrated, openWith, test } from "./support/fixtures";
import { seedExercise, seedSeason, seedStation } from "./support/seed";

// Runs in the "phone" project (Pixel-sized viewport with touch).

test.describe("Session page on a phone", () => {
  test("tick and untick parts, reset the ticks and write the note after the session", async ({
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
            { title: "Uppvärmning", minutes: 15, activities: ["Hopprep"] },
            { title: "Trampett", minutes: 45 },
            { title: "Styrka", minutes: 30 },
          ],
        },
      ],
    });
    await page.goto(`/sessions/${season.sessionIds[0]}`);

    const progress = page.getByRole("status").filter({ hasText: /av 3 klara/ });
    await expect(progress).toHaveText("0 av 3 klara");
    const checklist = page.getByRole("list", { name: "Delar i passet" });
    const warmUp = await hydrated(checklist.getByRole("checkbox", { name: /Uppvärmning/ }));
    const trampett = checklist.getByRole("checkbox", { name: /Trampett/ });
    // Clock times from the start, 17:00.
    await expect(checklist.getByText("17:15")).toBeVisible();

    await warmUp.tap();
    await expect(warmUp).toBeChecked();
    await expect(progress).toHaveText("1 av 3 klara");
    await trampett.tap();
    await expect(progress).toHaveText("2 av 3 klara");
    await trampett.tap();
    await expect(trampett).not.toBeChecked();
    await expect(progress).toHaveText("1 av 3 klara");
    await trampett.tap();
    await expect(progress).toHaveText("2 av 3 klara");

    const note = page.getByRole("textbox", { name: "Anteckning efter passet" });
    await note.fill("Bra pass, alla klarade rakt hopp.");
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    // Ticks and the note are kept.
    await page.reload();
    await expect(progress).toHaveText("2 av 3 klara");
    await expect(checklist.getByRole("checkbox", { name: /Uppvärmning/ })).toBeChecked();
    await expect(note).toHaveValue("Bra pass, alla klarade rakt hopp.");

    // Resetting asks first, then clears every tick.
    const reset = page.getByRole("alertdialog", { name: "Återställa alla bockar?" });
    await openWith(page.getByRole("button", { name: "Återställ bockar" }), reset);
    await reset.getByRole("button", { name: "Återställ" }).click();
    await expect(progress).toHaveText("0 av 3 klara");
    await expect(page.getByRole("button", { name: "Återställ bockar" })).toBeDisabled();
    await page.reload();
    await expect(progress).toHaveText("0 av 3 klara");
    await expect(note).toHaveValue("Bra pass, alla klarade rakt hopp.");
  });

  test("a linked activity expands to show its exercises and their descriptions", async ({
    coach: page,
    prefix,
  }) => {
    const a = await seedExercise("coach", `${prefix} Rakt hopp`, "Armarna upp, landa på fötterna.");
    const b = await seedExercise("coach", `${prefix} Grupperat`);
    const c = await seedExercise("coach", `${prefix} Pikerat`);
    const station = await seedStation("coach", `${prefix} Trampett till tjockmatta`, [a, b, c]);
    const season = await seedSeason({
      prefix,
      weekdays: [1],
      sessions: [
        {
          weekday: 1,
          week: 0,
          parts: [
            {
              title: "Trampett",
              activities: [{ text: "tre varv", stationId: station, exerciseIds: [a, b, c] }],
            },
          ],
        },
      ],
    });
    await page.goto(`/sessions/${season.sessionIds[0]}`);

    const activity = await hydrated(
      page.getByRole("button", { name: new RegExp(`${prefix} Trampett till tjockmatta: tre varv`) }),
    );
    await expect(activity).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Armarna upp, landa på fötterna.")).toBeHidden();
    await activity.tap();
    await expect(activity).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Armarna upp, landa på fötterna.")).toBeVisible();
    await expect(page.getByText(`${prefix} Pikerat`, { exact: true })).toBeVisible();
    await activity.tap();
    await expect(page.getByText("Armarna upp, landa på fötterna.")).toBeHidden();
  });
});
