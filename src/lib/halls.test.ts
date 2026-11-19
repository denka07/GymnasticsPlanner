import { describe, expect, it } from "vitest";

import {
  formatHallSize,
  hallImagePath,
  hallImageUrl,
  hallInput,
  isHallImageFileName,
  isHallImagePath,
  KIND_DEFAULTS,
  newHallInput,
  normalizeDegrees,
  parseMetres,
  placeParts,
  SHAPE_KINDS,
} from "./halls";

const HALL = "4b0f6d5e-8a7c-4c1e-9d2f-1a2b3c4d5e6f";
const F1 = "0d8e7a40-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const F2 = "1d8e7a40-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const EQ = "2d8e7a40-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const CONF = "3d8e7a40-1b2c-4d3e-8f90-a1b2c3d4e5f6";

describe("parseMetres", () => {
  it("reads metres with a comma or point as whole centimetres", () => {
    expect(parseMetres("24,5")).toBe(2450);
    expect(parseMetres(" 42 ")).toBe(4200);
    expect(parseMetres("0.75")).toBe(75);
    expect(parseMetres("12,34")).toBe(1234);
  });
  it("refuses other text, more than two decimals and sizes outside 0,01–200 m", () => {
    for (const text of ["", "abc", "1,234", "-3", "0", "200,01", "1 000", "1e3"]) {
      expect(parseMetres(text)).toBeNull();
    }
    expect(parseMetres("200")).toBe(20000);
  });
});

describe("formatHallSize", () => {
  it("shows width × length in metres with a decimal comma", () => {
    expect(formatHallSize(2450, 4200, "sv-SE")).toBe("24,5 × 42 m");
    expect(formatHallSize(1234, 100, "sv-SE")).toBe("12,34 × 1 m");
  });
});

describe("normalizeDegrees", () => {
  it("keeps angles in [0, 360)", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-15)).toBe(345);
    expect(normalizeDegrees(735)).toBe(15);
    expect(normalizeDegrees(359.9999999999)).toBe(0);
  });
});

describe("KIND_DEFAULTS", () => {
  it("gives every kind but equipment a valid size and colour", () => {
    expect(SHAPE_KINDS).not.toContain("equipment");
    for (const kind of SHAPE_KINDS) {
      const d = KIND_DEFAULTS[kind];
      expect(d.widthCm).toBeGreaterThan(0);
      expect(d.lengthCm).toBeGreaterThan(0);
      expect(d.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("newHallInput", () => {
  it("needs a name and a size in whole centimetres", () => {
    expect(newHallInput.parse({ name: " C-salen ", widthCm: 2450, lengthCm: 4200 })).toEqual({
      name: "C-salen",
      widthCm: 2450,
      lengthCm: 4200,
    });
    expect(newHallInput.safeParse({ name: "", widthCm: 2450, lengthCm: 4200 }).error?.issues[0].message).toBe(
      "nameRequired",
    );
    expect(newHallInput.safeParse({ name: "X", widthCm: 0, lengthCm: 4200 }).error?.issues[0].message).toBe(
      "hallSizeInvalid",
    );
    expect(newHallInput.safeParse({ name: "X", widthCm: 24.5, lengthCm: 4200 }).success).toBe(false);
  });
});

describe("hallInput", () => {
  const wallBars = {
    id: F1,
    kind: "wall_bars",
    widthCm: 400,
    lengthCm: 20,
    color: "#B98A57",
    imagePathname: null,
    xCm: 200,
    yCm: 10,
    rotation: -90,
    label: "  ",
  };
  const fixed = {
    id: F2,
    kind: "equipment",
    equipmentId: EQ,
    configurationId: CONF,
    xCm: 1200,
    yCm: 2000,
    rotation: 0,
    label: "Tumbling",
  };

  it("reads features of every kind, normalising colour, rotation and empty labels", () => {
    const value = hallInput.parse({ name: "C-salen", widthCm: 2450, lengthCm: 4200, features: [wallBars, fixed] });
    expect(value.features[0]).toMatchObject({ color: "#b98a57", rotation: 270, label: null });
    expect(value.features[1]).toMatchObject({ kind: "equipment", configurationId: CONF, label: "Tumbling" });
  });

  it("refuses a size or colour on an equipment feature and an equipment on another kind", () => {
    const base = { name: "C-salen", widthCm: 2450, lengthCm: 4200 };
    expect(hallInput.safeParse({ ...base, features: [{ ...fixed, widthCm: 100 }] }).success).toBe(false);
    expect(hallInput.safeParse({ ...base, features: [{ ...wallBars, equipmentId: EQ }] }).success).toBe(false);
    expect(hallInput.safeParse({ ...base, features: [{ ...wallBars, kind: "pool" }] }).success).toBe(false);
  });

  it("checks feature sizes, positions and labels", () => {
    const base = { name: "C-salen", widthCm: 2450, lengthCm: 4200 };
    const message = (feature: object) =>
      hallInput.safeParse({ ...base, features: [feature] }).error?.issues[0].message;
    expect(message({ ...wallBars, widthCm: 0 })).toBe("featureSizeInvalid");
    expect(message({ ...wallBars, lengthCm: 20001 })).toBe("featureSizeInvalid");
    expect(message({ ...wallBars, color: "red" })).toBe("colorInvalid");
    expect(message({ ...wallBars, xCm: 10.5 })).toBe("invalid");
    expect(message({ ...wallBars, label: "x".repeat(61) })).toBe("labelTooLong");
  });

  it("refuses the same feature id twice", () => {
    const result = hallInput.safeParse({
      name: "C-salen",
      widthCm: 2450,
      lengthCm: 4200,
      features: [wallBars, { ...wallBars }],
    });
    expect(result.success).toBe(false);
  });
});

describe("hall images", () => {
  it("stores images in the hall's folder under a random name", () => {
    const path = hallImagePath("production", HALL, "abc123def456", "MD-grop ö.png");
    expect(path).toMatch(new RegExp(`^production/halls/${HALL}/abc123def456-`));
    expect(isHallImagePath(path, "production", HALL)).toBe(true);
    expect(isHallImagePath(path, "preview", HALL)).toBe(false);
    expect(isHallImagePath(`production/halls/${HALL}/../x/abc123def456-a.png`, "production", HALL)).toBe(false);
    expect(isHallImagePath(`production/halls/${HALL}/sub/abc123def456-a.png`, "production", HALL)).toBe(false);
  });

  it("serves an image by its hall and file name", () => {
    const path = `e2e/ab12/halls/${HALL}/abc123def456-mdgrop.png`;
    expect(hallImageUrl(path)).toBe(`/api/hall-images/${HALL}/abc123def456-mdgrop.png`);
    expect(isHallImageFileName("abc123def456-mdgrop.png")).toBe(true);
    expect(isHallImageFileName("../secret")).toBe(false);
    expect(isHallImageFileName("short-a.png")).toBe(false);
  });
});

describe("placeParts", () => {
  it("names location and hall once each", () => {
    expect(placeParts("Stora hallen", "C-salen")).toEqual(["Stora hallen", "C-salen"]);
    expect(placeParts("c-salen ", "C-salen")).toEqual(["c-salen"]);
    expect(placeParts(null, "C-salen")).toEqual(["C-salen"]);
    expect(placeParts("  ", null)).toEqual([]);
  });
});
