import { describe, expect, it } from "vitest";

import { errorKey, exerciseInput, idList, searchInput, stationInput } from "./schemas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function keyOf(schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("expected failure");
  }
  return errorKey(result.error as Parameters<typeof errorKey>[0]);
}

describe("exerciseInput", () => {
  it("trims, turns empty texts into null and drops duplicate stations", () => {
    const values = exerciseInput.parse({
      name: " Grupperad volt ",
      description: "",
      disciplineName: null,
      stationIds: [A, A.toUpperCase(), B],
    });
    expect(values).toEqual({
      name: "Grupperad volt",
      description: null,
      disciplineName: null,
      stationIds: [A, B],
    });
  });

  it("rejects a missing name", () => {
    expect(keyOf(exerciseInput, { name: " ", stationIds: [] })).toBe("nameRequired");
  });
});

describe("stationInput", () => {
  const base = { name: "Station", equipment: [], exerciseIds: [] };

  it("accepts equipment lines with quantities", () => {
    const values = stationInput.parse({
      ...base,
      equipment: [{ equipmentId: A, quantity: 2 }, { equipmentId: B, quantity: 1 }],
    });
    expect(values.equipment).toHaveLength(2);
    expect(values.description).toBeNull();
  });

  it("rejects a bad quantity and a repeated entry", () => {
    expect(keyOf(stationInput, { ...base, equipment: [{ equipmentId: A, quantity: 0 }] })).toBe(
      "invalidQuantity",
    );
    expect(keyOf(stationInput, { ...base, equipment: [{ equipmentId: A, quantity: 1.5 }] })).toBe(
      "invalidQuantity",
    );
    expect(
      keyOf(stationInput, {
        ...base,
        equipment: [
          { equipmentId: A, quantity: 1 },
          { equipmentId: A, quantity: 2 },
        ],
      }),
    ).toBe("duplicateEquipment");
  });

  it("rejects malformed exercise ids", () => {
    expect(keyOf(stationInput, { ...base, exerciseIds: ["nope"] })).toBe("invalid");
  });
});

describe("idList and searchInput", () => {
  it("drops duplicate ids", () => {
    expect(idList.parse([B, B])).toEqual([B]);
  });

  it("turns non-strings into an empty search", () => {
    expect(searchInput.parse(["a"])).toBe("");
    expect(searchInput.parse("  kil ")).toBe("kil");
  });
});
