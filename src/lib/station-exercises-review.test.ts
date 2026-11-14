import { describe, expect, it } from "vitest";

import {
  canGoWithStation,
  canSubmitExercise,
  exercisesToApprove,
  exercisesToMakeGlobal,
  planIncludedExercises,
  splitIncludedOutcome,
  type StationExerciseCandidate,
} from "./library";

const coach = { id: "u1", isAdmin: false };
const admin = { id: "a1", isAdmin: true };

const own = (id: string, supported = true): StationExerciseCandidate => ({
  id,
  scope: "personal",
  ownerId: "u1",
  supported,
});
const others: StationExerciseCandidate = { id: "x", scope: "personal", ownerId: "u2", supported: true };
const globalOne: StationExerciseCandidate = { id: "g", scope: "global", ownerId: null, supported: true };

describe("canGoWithStation", () => {
  it("accepts the owner's personal exercises the station supports", () => {
    expect(canGoWithStation(own("e1"), "u1")).toBe(true);
  });

  it("refuses unsupported, global and others' exercises", () => {
    expect(canGoWithStation(own("e1", false), "u1")).toBe(false);
    expect(canGoWithStation(globalOne, "u1")).toBe(false);
    expect(canGoWithStation(others, "u1")).toBe(false);
  });
});

describe("planIncludedExercises", () => {
  const candidates = [own("e1"), own("e2"), own("e3", false), others, globalOne];

  it("returns the ticked exercises the submitter may include", () => {
    expect(planIncludedExercises(candidates, ["e1", "e2", "e1"], "u1")).toEqual(["e1", "e2"]);
  });

  it("allows including none", () => {
    expect(planIncludedExercises(candidates, [], "u1")).toEqual([]);
  });

  it("refuses an exercise that is not supported, not theirs, global or unknown", () => {
    expect(planIncludedExercises(candidates, ["e1", "e3"], "u1")).toBeNull();
    expect(planIncludedExercises(candidates, ["x"], "u1")).toBeNull();
    expect(planIncludedExercises(candidates, ["g"], "u1")).toBeNull();
    expect(planIncludedExercises(candidates, ["nope"], "u1")).toBeNull();
  });
});

describe("exercisesToApprove", () => {
  it("keeps the ticked included exercises that still qualify", () => {
    const included = [own("e1"), own("e2")];
    expect(exercisesToApprove(included, ["e2"], "u1")).toEqual(["e2"]);
  });

  it("ignores ticked exercises that were not included", () => {
    expect(exercisesToApprove([own("e1")], ["e1", "e9"], "u1")).toEqual(["e1"]);
  });

  it("ignores included exercises that no longer qualify", () => {
    const unlinked = own("e1", false);
    const nowGlobal: StationExerciseCandidate = { ...own("e2"), scope: "global", ownerId: null };
    expect(exercisesToApprove([unlinked, nowGlobal], ["e1", "e2"], "u1")).toEqual([]);
  });

  it("ignores exercises owned by someone other than the submitter", () => {
    expect(exercisesToApprove([others], ["x"], "u1")).toEqual([]);
  });
});

describe("exercisesToMakeGlobal", () => {
  const adminOwn = (id: string, supported = true): StationExerciseCandidate => ({
    id,
    scope: "personal",
    ownerId: "a1",
    supported,
  });

  it("takes the administrator's own ticked supported exercises", () => {
    const supported = [adminOwn("e1"), adminOwn("e2"), adminOwn("e3", false)];
    expect(exercisesToMakeGlobal(supported, ["e1", "e3", "e9"], admin)).toEqual(["e1"]);
  });

  it("gives nothing to a non-administrator", () => {
    expect(exercisesToMakeGlobal([own("e1")], ["e1"], coach)).toEqual([]);
  });
});

describe("canSubmitExercise", () => {
  const mine = { scope: "personal" as const, ownerId: "u1" };

  it("lets the owner submit when nothing is pending", () => {
    expect(canSubmitExercise(mine, coach, false, false)).toBe(true);
  });

  it("refuses while the exercise goes with a pending station submission", () => {
    expect(canSubmitExercise(mine, coach, false, true)).toBe(false);
  });

  it("refuses while it has its own pending submission", () => {
    expect(canSubmitExercise(mine, coach, true, false)).toBe(false);
  });
});

describe("splitIncludedOutcome", () => {
  it("splits into global and personal", () => {
    const a = { id: "a", scope: "global" as const };
    const b = { id: "b", scope: "personal" as const };
    expect(splitIncludedOutcome([a, b])).toEqual({ global: [a], personal: [b] });
  });
});
