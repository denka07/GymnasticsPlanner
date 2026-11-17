import path from "node:path";

import { head } from "@vercel/blob";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { db, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";
import { sessionName } from "./support/names";
import { seedSeason } from "./support/seed";

config({ path: ".env.local", quiet: true });

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function attachmentsOf(sessionId: string) {
  return db()
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.sessionId, sessionId));
}

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

test.describe("Session attachments", () => {
  test.skip(
    !process.env.BLOB_READ_WRITE_TOKEN,
    "BLOB_READ_WRITE_TOKEN is not set: attachments need the private Vercel Blob store " +
      "(.env.local locally, the repository secret on GitHub).",
  );

  test("upload a photo and a PDF, open them on the session page, keep others out and delete one", async ({
    coach: page,
    newcomer,
    prefix,
  }) => {
    // A slot with no stored session yet: the first upload stores it.
    const season = await seedSeason({ prefix, weekdays: [1] });
    const monday = season.weeks[0];
    const name = sessionName(monday);
    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);

    const card = page.getByRole("region", { name });
    const files = card.getByRole("region", { name: "Bilagor" });
    await expect(files.getByText("Inga bilagor än.")).toBeVisible();
    await hydrated(files.getByRole("button", { name: "Lägg till fil" }));
    await files
      .locator('input[type="file"]')
      .setInputFiles([fixture("E2E-bild.png"), fixture("E2E-plan.pdf")]);

    const image = files.getByRole("link", { name: /E2E-bild\.png/ });
    const pdf = files.getByRole("link", { name: /E2E-plan\.pdf/ });
    await expect(image).toBeVisible({ timeout: 30_000 });
    await expect(pdf).toBeVisible({ timeout: 30_000 });
    await expect(files.getByRole("button", { name: "Lägg till fil" })).toBeEnabled();

    const [session] = await db()
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.seasonId, season.seasonId));
    expect(session).toBeDefined();
    const stored = await attachmentsOf(session.id);
    expect(stored.map((a) => a.contentType).sort()).toEqual(["application/pdf", "image/png"]);
    for (const a of stored) {
      expect(a.pathname).toMatch(new RegExp(`/sessions/${session.id}/[A-Za-z0-9]+-E2E-`));
    }

    // A file whose bytes are not a photo is refused on the server and not kept.
    await files.locator('input[type="file"]').setInputFiles(fixture("E2E-inte-en-bild.png"));
    await expect(page.getByText(/Bara bilder .* och PDF-filer kan bifogas/)).toBeVisible({
      timeout: 30_000,
    });
    expect(await attachmentsOf(session.id)).toHaveLength(2);

    // The session page lists them; links open them in the browser.
    await page.goto(`/sessions/${session.id}`);
    const list = page.getByRole("region", { name: "Bilagor" });
    const imageLink = list.getByRole("link", { name: /E2E-bild\.png/ });
    await expect(imageLink).toBeVisible();
    await expect(list.getByRole("link", { name: /E2E-plan\.pdf/ })).toBeVisible();
    const imageUrl = (await imageLink.getAttribute("href"))!;
    const pdfUrl = (await list.getByRole("link", { name: /E2E-plan\.pdf/ }).getAttribute("href"))!;
    expect(imageUrl).toMatch(/^\/api\/attachments\/[0-9a-f-]{36}$/);

    const imageResponse = await page.request.get(imageUrl);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toBe("image/png");
    expect(imageResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(imageResponse.headers()["content-disposition"]).toMatch(/^inline; filename="E2E-bild\.png"/);
    expect(imageResponse.headers()["cache-control"]).toMatch(/private/);
    const pdfResponse = await page.request.get(pdfUrl);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
    expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Someone without access to the session gets "not found".
    expect((await newcomer.request.get(imageUrl)).status()).toBe(404);
    expect((await newcomer.request.get(pdfUrl)).status()).toBe(404);

    // Deleting asks first, then removes the row and the stored file.
    const imagePath = stored.find((a) => a.contentType === "image/png")!.pathname;
    expect(await blobExists(imagePath)).toBe(true);
    await page.goto(`/seasons/${season.seasonId}/weeks/${monday}`);
    const confirm = page.getByRole("alertdialog", { name: "Ta bort bilagan?" });
    await openWith(files.getByRole("button", { name: "Ta bort E2E-bild.png" }), confirm);
    await confirm.getByRole("button", { name: "Ta bort" }).click();
    await expect(files.getByRole("link", { name: /E2E-bild\.png/ })).toHaveCount(0);
    await expect(files.getByRole("link", { name: /E2E-plan\.pdf/ })).toBeVisible();
    await expect.poll(async () => (await attachmentsOf(session.id)).length).toBe(1);
    expect((await page.request.get(imageUrl)).status()).toBe(404);
    await expect.poll(() => blobExists(imagePath)).toBe(false);
  });
});
