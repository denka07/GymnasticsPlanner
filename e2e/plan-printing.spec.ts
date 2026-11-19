import { eq } from "drizzle-orm";

import { db, devEmail, devUserId, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { seedSessionWithPlans } from "./support/plans";

/** The page sizes of a PDF in points, from its pages' media boxes. */
function pageSizes(pdf: Buffer): { width: number; height: number }[] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => ({
    width: Number(m[1]),
    height: Number(m[2]),
  }));
}

test.describe("Printing plans", () => {
  test("a viewer prints all plans or one, each on its own page, a wide hall in landscape", async ({
    helper: page,
    prefix,
  }) => {
    // The hall is wider than long, so its plans print on landscape pages.
    const { sessionId } = await seedSessionWithPlans(prefix, { widthCm: 4000, lengthCm: 2000 });
    await db()
      .insert(schema.shares)
      .values({
        email: devEmail("helper"),
        userId: await devUserId("helper"),
        sessionId,
        level: "view",
        createdBy: await devUserId("coach"),
      });

    // The plans page offers this plan or all of them.
    await page.goto(`/sessions/${sessionId}/plans`);
    const menu = page.getByRole("menu");
    await openWith(await hydrated(page.getByRole("button", { name: "Skriv ut …" })), menu);
    await menu.getByRole("menuitem", { name: "Alla ritningar" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}/plans/print$`));

    // Every plan, the main plan first, each followed by its numbered text.
    const plans = page.locator(".print-plan");
    await expect(plans.getByRole("heading", { level: 2 }).filter({ hasNotText: "Passdelar" })).toHaveText([
      "Huvudritning",
      "Banan",
    ]);
    for (const plan of await plans.all()) {
      await expect(plan).toHaveAttribute("data-orientation", "landscape");
    }
    const main = page.getByRole("region", { name: "Huvudritning" });
    await expect(main.getByText("Samling", { exact: true })).toBeVisible();
    await expect(main.getByText("Styrka", { exact: true })).toBeVisible();
    await expect(main.getByText("Volt")).toHaveCount(0);
    const banan = page.getByRole("region", { name: "Banan" });
    await expect(banan.locator("[data-station-number='1']")).toBeVisible();
    await expect(banan.locator("[data-activity-number='1']")).toContainText("Volt");
    await expect(banan.getByText("Rakt hopp")).toBeVisible();

    // In print the app's chrome is gone and each plan is on landscape A4 pages.
    const all = pageSizes(await page.pdf({ preferCSSPageSize: true }));
    // A drawing page and a text page per plan.
    expect(all).toHaveLength(4);
    for (const size of all) {
      expect(size.width).toBeGreaterThan(size.height);
      expect(Math.round(size.width)).toBe(842);
    }

    // The print view chooses one plan too.
    await (await hydrated(page.getByLabel("Vad ska skrivas ut?"))).selectOption({ label: "Banan" });
    await expect(page).toHaveURL(/\/plans\/print\?plan=/);
    await expect(plans).toHaveCount(1);
    await expect(plans.getByRole("heading", { name: "Banan" })).toBeVisible();
    expect(pageSizes(await page.pdf({ preferCSSPageSize: true }))).toHaveLength(2);
    await expect(page.getByRole("button", { name: "Skriv ut", exact: true })).toBeVisible();

    // "Spara som bild" downloads the plan shown as a PNG named after the date and the plan.
    await page.goto(`/sessions/${sessionId}/plans`);
    const save = await hydrated(page.getByRole("button", { name: "Spara som bild" }));
    const download = page.waitForEvent("download");
    await save.click();
    const file = await download;
    const [{ date }] = await db()
      .select({ date: schema.sessions.date })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    expect(file.suggestedFilename()).toBe(`${date} Huvudritning.png`);
    const png = await file.createReadStream();
    const head = await new Promise<Buffer>((resolve) => png.once("data", (chunk) => resolve(chunk as Buffer)));
    expect(head.subarray(1, 4).toString()).toBe("PNG");
  });
});
