import type { Locator } from "@playwright/test";
import { asc, eq } from "drizzle-orm";

import { db, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { seedEquipment, seedStation } from "./support/seed";

async function layoutOf(stationId: string) {
  return db()
    .select()
    .from(schema.stationLayoutItems)
    .where(eq(schema.stationLayoutItems.stationId, stationId))
    .orderBy(asc(schema.stationLayoutItems.layer));
}

/** Gives a seeded station equipment lines and, optionally, placed items of them. */
async function equip(
  stationId: string,
  lines: { equipmentId: string; configurationId: string; quantity: number; placed?: number }[],
) {
  const d = db();
  await d.insert(schema.stationEquipment).values(
    lines.map(({ equipmentId, quantity }) => ({ stationId, equipmentId, quantity })),
  );
  const items = lines.flatMap((l) =>
    Array.from({ length: l.placed ?? 0 }, () => ({ equipmentId: l.equipmentId, configurationId: l.configurationId })),
  );
  if (items.length > 0) {
    await d.insert(schema.stationLayoutItems).values(
      items.map((item, layer) => ({
        id: crypto.randomUUID(),
        stationId,
        kind: "equipment" as const,
        ...item,
        xCm: layer * 250,
        yCm: 0,
        rotation: 0,
        layer,
      })),
    );
  }
}

/** Types into a properties field and leaves it with Enter, which applies it. */
async function setField(panel: Locator, label: string, value: string) {
  const field = panel.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

test.describe("Station layouts", () => {
  test("the owner draws a personal station's layout, saves it and sees it in the list", async ({
    coach: page,
    prefix,
  }) => {
    const matta = `${prefix} Tjockmatta`;
    const kil = `${prefix} Kil`;
    const stationName = `${prefix} Trampett till tjockmatta`;
    const m = await seedEquipment(matta, { name: "Liggande", widthCm: 300, lengthCm: 200, color: "#1f5fa8" });
    const k = await seedEquipment(kil, { name: "Liggande", widthCm: 180, lengthCm: 120, color: "#e0a43a" });
    const stationId = await seedStation("coach", stationName);
    await equip(stationId, [
      { ...m, quantity: 1 },
      { ...k, quantity: 1 },
    ]);

    await page.goto(`/library/stations/${stationId}`);
    const drawing = page.getByRole("application", { name: `Ritning av ${stationName}` });
    const palette = page.getByRole("region", { name: "Lägg till" });
    const placeKil = palette.getByRole("button", { name: `Placera ${kil}` });
    await hydrated(placeKil);

    // The mattress, then the wedge on top of it; each may be placed once.
    await palette.getByRole("button", { name: `Placera ${matta}` }).click();
    await placeKil.click();
    await expect(placeKil).toBeDisabled();
    await expect(palette.getByText("1 av 1 placerade")).toHaveCount(2);
    await expect(drawing.getByRole("button", { name: `${matta}, Liggande` })).toBeVisible();

    // A run-up arrow, 4 m long, and a text.
    await palette.getByRole("button", { name: "Pil" }).click();
    const panel = page.getByRole("region", { name: "Pil" });
    await setField(panel, "Längd (cm)", "400");
    await setField(panel, "Etikett", "Ansats");
    await palette.getByRole("button", { name: "Text" }).click();
    await setField(page.getByRole("region", { name: "Text: Text" }), "Text", "Landa på rygg");
    await expect(drawing.getByRole("button", { name: "Text: Landa på rygg" })).toBeVisible();

    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    const saved = await layoutOf(stationId);
    expect(saved.map((i) => i.kind)).toEqual(["equipment", "equipment", "arrow", "text"]);
    expect(saved[0].equipmentId).toBe(m.equipmentId);
    expect(saved[1].configurationId).toBe(k.configurationId);
    expect(saved[2]).toMatchObject({ lengthCm: 400, label: "Ansats" });
    expect(saved[3].text).toBe("Landa på rygg");

    // Drawn small in the list; a station without a layout has no picture.
    const empty = `${prefix} Utan ritning`;
    await seedStation("coach", empty);
    await page.goto(`/library/stations?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByRole("img", { name: `Ritning av ${stationName}` })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(empty) })).toBeVisible();
    await expect(page.getByRole("img", { name: `Ritning av ${empty}` })).toHaveCount(0);
  });

  test("lowering a quantity removes the extra placed item on save, with a note", async ({
    coach: page,
    prefix,
  }) => {
    const matta = `${prefix} Tunnmatta`;
    const stationName = `${prefix} Två tunnmattor`;
    const m = await seedEquipment(matta, { name: "Liggande", widthCm: 200, lengthCm: 100 });
    const stationId = await seedStation("coach", stationName);
    await equip(stationId, [{ ...m, quantity: 2, placed: 2 }]);
    const [bottom] = await layoutOf(stationId);

    await page.goto(`/library/stations/${stationId}`);
    const quantity = await hydrated(page.getByLabel(`Antal ${matta}`));
    await quantity.fill("1");
    await expect(
      page.getByText("1 del i ritningen passar inte längre stationens redskap och tas bort när du sparar."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Spara ändringar" }).click();
    await expect(
      page.getByText("1 del togs bort från ritningen eftersom den inte längre passar stationens redskap."),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Sparat" })).toBeVisible();

    // The lowest placement stays.
    const left = await layoutOf(stationId);
    expect(left.map((i) => i.id)).toEqual([bottom.id]);
    await page.reload();
    const drawing = page.getByRole("application", { name: `Ritning av ${stationName}` });
    await expect(drawing.getByRole("button", { name: `${matta}, Liggande` })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Lägg till" }).getByText("1 av 1 placerade")).toBeVisible();
  });

  test("a submitted station brings its layout to the review, keeps it when approved and copies it", async ({
    coach,
    helper,
    newcomer,
    prefix,
  }) => {
    const matta = `${prefix} Matta`;
    const stationName = `${prefix} Helperns ritade station`;
    const m = await seedEquipment(matta, { name: "Liggande", widthCm: 200, lengthCm: 300 });
    const stationId = await seedStation("helper", stationName);
    await equip(stationId, [{ ...m, quantity: 2, placed: 2 }]);
    const stationUrl = `/library/stations/${stationId}`;

    // The helper submits it as it is.
    await helper.goto(stationUrl);
    await (await hydrated(helper.getByRole("button", { name: "Skicka in för granskning" }))).click();
    await expect(helper.getByText(/^Inskickad för granskning /)).toBeVisible();

    // The administrator sees the drawing while reviewing, and approves it.
    await coach.goto(stationUrl);
    await expect(coach.getByText(/^Dev Helper skickade in den för granskning/)).toBeVisible();
    await expect(coach.getByRole("img", { name: `Ritning av ${stationName}` })).toBeVisible();
    const approve = coach.getByRole("dialog", { name: "Godkänna och göra global?" }).or(
      coach.getByRole("alertdialog", { name: "Godkänna och göra global?" }),
    );
    await openWith(coach.getByRole("button", { name: "Godkänn" }), approve);
    await approve.getByRole("button", { name: "Godkänn" }).click();
    await expect(coach.getByRole("heading", { level: 1, name: stationName })).toContainText("Global");
    expect(await layoutOf(stationId)).toHaveLength(2);
    // Now an administrator edits it, layout and all.
    await expect(coach.getByRole("application", { name: `Ritning av ${stationName}` })).toBeVisible();

    // Another user reads it and copies it with its layout.
    await newcomer.goto(stationUrl);
    await expect(newcomer.getByRole("img", { name: `Ritning av ${stationName}` })).toBeVisible();
    await (await hydrated(newcomer.getByRole("button", { name: "Kopiera till mina" }))).click();
    await expect(newcomer).not.toHaveURL(new RegExp(stationId));
    const copyId = newcomer.url().split("/").pop()!;
    const copied = await layoutOf(copyId);
    expect(copied).toHaveLength(2);
    expect(copied.every((i) => i.equipmentId === m.equipmentId)).toBe(true);
    expect(copied.map((i) => i.id)).not.toContain((await layoutOf(stationId))[0].id);
  });
});
