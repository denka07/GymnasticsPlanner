import path from "node:path";

import { head } from "@vercel/blob";
import type { Locator, Page } from "@playwright/test";
import { config } from "dotenv";
import { asc, eq } from "drizzle-orm";

import { db, schema } from "./support/db";
import { expect, hydrated, openWith, test } from "./support/fixtures";

config({ path: ".env.local", quiet: true });

const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function configurationsOf(equipmentId: string) {
  return db()
    .select()
    .from(schema.equipmentConfigurations)
    .where(eq(schema.equipmentConfigurations.equipmentId, equipmentId))
    .orderBy(asc(schema.equipmentConfigurations.sortOrder));
}

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

/** Adds a configuration through the "Ny uppställning" dialog. */
async function addConfiguration(
  page: Page,
  input: { name: string; width: string; length: string; color?: string },
) {
  const dialog = page.getByRole("dialog", { name: "Ny uppställning" });
  await openWith(page.getByRole("button", { name: "Ny uppställning" }), dialog);
  await hydrated(dialog.getByLabel("Namn"));
  await dialog.getByLabel("Namn").fill(input.name);
  await dialog.getByLabel("Bredd (cm)").fill(input.width);
  await dialog.getByLabel("Längd (cm)").fill(input.length);
  if (input.color) {
    await dialog.getByRole("radio", { name: input.color }).check({ force: true });
  }
  await dialog.getByRole("button", { name: "Spara" }).click();
  await expect(dialog).toBeHidden();
}

async function size(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { width: box!.width, height: box!.height };
}

test.describe("Equipment configurations", () => {
  test("an administrator adds, draws, reorders the default and deletes configurations; others only see them", async ({
    coach: page,
    helper,
    prefix,
  }) => {
    const equipmentName = `${prefix} Tunnmatta`;

    // Create the equipment and open its page from the Redskap tab.
    await page.goto("/library/equipment");
    const createDialog = page.getByRole("dialog", { name: "Nytt redskap" });
    await openWith(page.getByRole("button", { name: "Nytt redskap" }), createDialog);
    await createDialog.getByLabel("Namn").fill(equipmentName);
    await createDialog.getByRole("button", { name: "Skapa" }).click();
    await expect(createDialog).toBeHidden();
    const entryLink = page.getByRole("link", { name: equipmentName });
    await expect(entryLink).toBeVisible();
    await entryLink.click();
    await expect(page.getByRole("heading", { level: 1, name: equipmentName })).toBeVisible();
    await expect(page.getByText("Redskapet har inga uppställningar än och kan inte ritas.")).toBeVisible();
    const equipmentId = page.url().split("/").pop()!;

    // A lying mat in blue, and the same mat standing on its long side.
    await addConfiguration(page, { name: "Liggande", width: "100", length: "200", color: "Blå" });
    await addConfiguration(page, { name: "Stående på långsidan", width: "50", length: "200" });

    const list = page.getByRole("region", { name: "Uppställningar", exact: true });
    const lying = list.getByRole("listitem").filter({ hasText: "Liggande" });
    const standing = list.getByRole("listitem").filter({ hasText: "Stående på långsidan" });
    await expect(lying.getByText("Standard", { exact: true })).toBeVisible();
    await expect(lying.getByText("100 × 200 cm")).toBeVisible();
    await expect(lying.getByText("Blå")).toBeVisible();
    await expect(standing.getByText("50 × 200 cm")).toBeVisible();
    await expect(standing.getByText("Standard", { exact: true })).toHaveCount(0);

    let rows = await configurationsOf(equipmentId);
    expect(rows.map((r) => [r.name, r.widthCm, r.lengthCm, r.color, r.isDefault])).toEqual([
      ["Liggande", 100, 200, "#2563a8", true],
      ["Stående på långsidan", 50, 200, null, false],
    ]);

    // An image for the standing mat, checked by its bytes and served through the app.
    if (hasBlob) {
      await standing.locator('input[type="file"]').setInputFiles(fixture("E2E-bild.png"));
      await expect(standing.getByText("Har bild")).toBeVisible({ timeout: 30_000 });
      rows = await configurationsOf(equipmentId);
      const withImage = rows.find((r) => r.name === "Stående på långsidan")!;
      expect(withImage.imageContentType).toBe("image/png");
      expect(withImage.imagePathname).toMatch(new RegExp(`/equipment/${equipmentId}/[A-Za-z0-9]+-E2E-bild\\.png$`));
    }

    // Both drawn to scale, side by side: the same length, the lying one twice as wide.
    const preview = page.getByRole("region", { name: "Uppställningarna i skala" });
    const lyingDrawing = preview.getByRole("img", { name: "Liggande, 100 × 200 cm" });
    const standingDrawing = preview.getByRole("img", { name: "Stående på långsidan, 50 × 200 cm" });
    await expect(lyingDrawing).toBeVisible();
    await expect(standingDrawing).toBeVisible();
    const a = await size(lyingDrawing);
    const b = await size(standingDrawing);
    expect(a.height).toBeCloseTo(b.height, 0);
    expect(a.width / b.width).toBeCloseTo(2, 1);
    expect(a.height / a.width).toBeCloseTo(2, 1);
    await expect(lyingDrawing.locator("rect").first()).toHaveAttribute("fill", "#2563a8");
    await expect(preview.getByText("1 m")).toBeVisible();

    let imageUrl = "";
    if (hasBlob) {
      const image = standingDrawing.locator("image");
      await expect(image).toHaveAttribute("preserveAspectRatio", "none");
      imageUrl = (await image.getAttribute("href"))!;
      expect(imageUrl).toMatch(/^\/api\/equipment-images\/[0-9a-f-]{36}\?v=[A-Za-z0-9]+$/);
      const response = await page.request.get(imageUrl);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["cache-control"]).toMatch(/^private/);
      // Any signed-in user may see it.
      expect((await helper.request.get(imageUrl)).status()).toBe(200);
    }

    // The Redskap tab draws them too.
    await page.goto("/library/equipment");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: equipmentName }) });
    await expect(card.getByRole("img", { name: "Liggande, 100 × 200 cm" })).toBeVisible();
    await expect(card.getByRole("img", { name: "Stående på långsidan, 50 × 200 cm" })).toBeVisible();
    await page.goto(`/library/equipment/${equipmentId}`);

    // Make the standing mat the default, remembering the request to replay it as Dev Helper.
    const makeDefault = standing.getByRole("button", { name: "Gör Stående på långsidan till standard" });
    await hydrated(makeDefault);
    const [actionRequest] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"])),
      makeDefault.click(),
    ]);
    await expect(standing.getByText("Standard", { exact: true })).toBeVisible();
    await expect(lying.getByText("Standard", { exact: true })).toHaveCount(0);
    rows = await configurationsOf(equipmentId);
    expect(rows.map((r) => [r.name, r.isDefault])).toEqual([
      ["Liggande", false],
      ["Stående på långsidan", true],
    ]);

    // Dev Helper sees the page and its drawings, without any edit controls.
    await helper.goto(`/library/equipment/${equipmentId}`);
    await expect(helper.getByRole("heading", { level: 1, name: equipmentName })).toBeVisible();
    await expect(helper.getByText("Bara administratörer kan ändra uppställningarna.")).toBeVisible();
    await expect(helper.getByRole("img", { name: "Liggande, 100 × 200 cm" })).toBeVisible();
    await expect(helper.getByRole("button", { name: "Ny uppställning" })).toHaveCount(0);
    await expect(helper.getByRole("button", { name: /^(Ändra|Ta bort|Gör) / })).toHaveCount(0);
    await helper.goto("/library/equipment");
    await expect(helper.getByRole("button", { name: "Nytt redskap" })).toHaveCount(0);

    // Calling the administrators' actions directly gets "not found" and changes nothing.
    const liggandeId = rows.find((r) => r.name === "Liggande")!.id;
    const replay = await helper.request.post(actionRequest.url(), {
      headers: {
        "next-action": actionRequest.headers()["next-action"],
        "content-type": actionRequest.headers()["content-type"],
        accept: "text/x-component",
      },
      data: actionRequest.postData()!.replace(rows.find((r) => r.isDefault)!.id, liggandeId),
    });
    expect(replay.status()).toBe(404);
    const token = await helper.request.post("/api/equipment-images/upload", {
      data: {
        type: "blob.generate-client-token",
        payload: {
          pathname: `e2e/x/equipment/${equipmentId}/0123456789abcdef-x.png`,
          clientPayload: JSON.stringify({ configurationId: liggandeId }),
          multipart: false,
        },
      },
    });
    expect(token.status()).toBe(404);
    rows = await configurationsOf(equipmentId);
    expect(rows.map((r) => [r.name, r.isDefault])).toEqual([
      ["Liggande", false],
      ["Stående på långsidan", true],
    ]);

    // Deleting the default (with its image): the next one becomes the default.
    const imagePath = rows.find((r) => r.name === "Stående på långsidan")!.imagePathname;
    const confirm = page.getByRole("alertdialog", { name: "Ta bort uppställningen?" });
    await openWith(standing.getByRole("button", { name: "Ta bort Stående på långsidan" }), confirm);
    await confirm.getByRole("button", { name: "Ta bort" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(lying.getByText("Standard", { exact: true })).toBeVisible();
    await expect(preview.getByRole("img")).toHaveCount(1);
    rows = await configurationsOf(equipmentId);
    expect(rows.map((r) => [r.name, r.isDefault])).toEqual([["Liggande", true]]);
    if (hasBlob && imagePath) {
      expect((await page.request.get(imageUrl)).status()).toBe(404);
      await expect.poll(() => blobExists(imagePath)).toBe(false);
    }
  });
});
