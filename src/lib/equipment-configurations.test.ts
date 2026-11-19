import { describe, expect, it } from "vitest";

import {
  checkEquipmentImage,
  configurationInput,
  EQUIPMENT_IMAGE_MAX_BYTES,
  equipmentImagePath,
  equipmentImageUrl,
  formatSize,
  imageVersion,
  isEquipmentImagePath,
  parseCentimetres,
  sniffEquipmentImage,
} from "./equipment-configurations";

const EQUIPMENT = "6f1c2a4e-1b2c-4d5e-8f90-0123456789ab";

describe("configurationInput", () => {
  const valid = { name: " Liggande ", widthCm: 200, lengthCm: 100, color: "#2563A8" };

  it("trims the name and lowercases the colour", () => {
    expect(configurationInput.parse(valid)).toEqual({
      name: "Liggande",
      widthCm: 200,
      lengthCm: 100,
      color: "#2563a8",
    });
  });

  it("allows no colour", () => {
    expect(configurationInput.parse({ ...valid, color: null }).color).toBeNull();
    expect(configurationInput.parse({ ...valid, color: undefined }).color).toBeNull();
  });

  it.each([0, -1, 1.5, 5001, Number.NaN])("refuses the size %s", (size) => {
    const result = configurationInput.safeParse({ ...valid, widthCm: size });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("sizeInvalid");
  });

  it("accepts the largest size", () => {
    expect(configurationInput.parse({ ...valid, lengthCm: 5000 }).lengthCm).toBe(5000);
  });

  it.each(["blue", "#abc", "#12345g", "url(x)"])("refuses the colour %s", (color) => {
    const result = configurationInput.safeParse({ ...valid, color });
    expect(result.error?.issues[0].message).toBe("colorInvalid");
  });

  it("needs a name", () => {
    expect(configurationInput.safeParse({ ...valid, name: "  " }).error?.issues[0].message).toBe(
      "nameRequired",
    );
  });

  it("refuses unknown fields", () => {
    expect(configurationInput.safeParse({ ...valid, isDefault: true }).success).toBe(false);
  });
});

describe("parseCentimetres", () => {
  it("reads whole centimetres", () => {
    expect(parseCentimetres(" 200 ")).toBe(200);
  });

  it.each(["", "0", "1,5", "2.5", "-3", "5001", "abc"])("refuses %j", (text) => {
    expect(parseCentimetres(text)).toBeNull();
  });
});

describe("formatSize", () => {
  it("shows width × length in centimetres", () => {
    expect(formatSize(200, 100, "sv")).toBe("200 × 100 cm");
  });

  it("groups thousands the Swedish way", () => {
    expect(formatSize(1200, 35, "sv")).toBe("1 200 × 35 cm");
  });
});

describe("checkEquipmentImage", () => {
  it("accepts PNG, JPEG and WebP up to 5 MB", () => {
    expect(checkEquipmentImage({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkEquipmentImage({ type: "image/jpeg", size: EQUIPMENT_IMAGE_MAX_BYTES })).toBeNull();
    expect(checkEquipmentImage({ type: "image/webp", size: 1 })).toBeNull();
  });

  it("refuses SVG, HEIC and PDF", () => {
    expect(checkEquipmentImage({ type: "image/svg+xml", size: 10 })).toBe("wrongType");
    expect(checkEquipmentImage({ type: "image/heic", size: 10 })).toBe("wrongType");
    expect(checkEquipmentImage({ type: "application/pdf", size: 10 })).toBe("wrongType");
  });

  it("refuses empty and too large files", () => {
    expect(checkEquipmentImage({ type: "image/png", size: 0 })).toBe("empty");
    expect(checkEquipmentImage({ type: "image/png", size: EQUIPMENT_IMAGE_MAX_BYTES + 1 })).toBe("tooLarge");
  });
});

describe("sniffEquipmentImage", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7 xxxxxxx");
  const svg = new TextEncoder().encode("<svg xmlns='x'>");

  it("knows a PNG by its bytes", () => {
    expect(sniffEquipmentImage(png)).toBe("image/png");
  });

  it("refuses a PDF and an SVG", () => {
    expect(sniffEquipmentImage(pdf)).toBeNull();
    expect(sniffEquipmentImage(svg)).toBeNull();
  });
});

describe("image paths", () => {
  const random = "0123456789abcdef0123456789abcdef";

  it("stores an image in its equipment's folder", () => {
    expect(equipmentImagePath("development", EQUIPMENT, random, "Tunnmatta liggande.PNG")).toBe(
      `development/equipment/${EQUIPMENT}/${random}-Tunnmatta-liggande.png`,
    );
  });

  it("accepts only paths in the equipment's folder", () => {
    const path = equipmentImagePath("e2e/abc", EQUIPMENT, random, "bild.png");
    expect(isEquipmentImagePath(path, "e2e/abc", EQUIPMENT)).toBe(true);
    expect(isEquipmentImagePath(path, "production", EQUIPMENT)).toBe(false);
    expect(isEquipmentImagePath(path, "e2e/abc", "11111111-1b2c-4d5e-8f90-0123456789ab")).toBe(false);
    expect(isEquipmentImagePath(`${path}/../x`, "e2e/abc", EQUIPMENT)).toBe(false);
    expect(
      isEquipmentImagePath(`development/sessions/${EQUIPMENT}/${random}-a.png`, "development", EQUIPMENT),
    ).toBe(false);
  });

  it("versions the URL with the random part of the file name", () => {
    const path = equipmentImagePath("development", EQUIPMENT, random, "bild.png");
    expect(imageVersion(path)).toBe(random);
    expect(equipmentImageUrl("c0ffee00-1b2c-4d5e-8f90-0123456789ab", path)).toBe(
      `/api/equipment-images/c0ffee00-1b2c-4d5e-8f90-0123456789ab?v=${random}`,
    );
  });
});
