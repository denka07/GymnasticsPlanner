import { describe, expect, it } from "vitest";

import {
  canCopy,
  canCreateWithScope,
  canEditLink,
  canMakeGlobal,
  canReview,
  canSeeCreator,
  canSubmit,
  canWithdraw,
  formatSubmissionDate,
  isVisibleInLibrary,
  libraryAccess,
  matchesScopeFilter,
  parseScopeFilter,
  planLinkChanges,
  submissionStatusFor,
  type LibraryItemRef,
} from "./library";

const coach = { id: "u1", isAdmin: false };
const other = { id: "u2", isAdmin: false };
const admin = { id: "a1", isAdmin: true };

const global: LibraryItemRef = { scope: "global", ownerId: null };
const mine: LibraryItemRef = { scope: "personal", ownerId: "u1" };
const theirs: LibraryItemRef = { scope: "personal", ownerId: "u2" };
const adminsOwn: LibraryItemRef = { scope: "personal", ownerId: "a1" };

describe("libraryAccess under review", () => {
  it("lets an administrator read a personal item that awaits review", () => {
    expect(libraryAccess(mine, admin, { underReview: true })).toBe("view");
  });

  it("gives nobody else access through a review", () => {
    expect(libraryAccess(mine, other, { underReview: true })).toBeNull();
  });

  it("keeps the owner's edit access while the item is under review", () => {
    expect(libraryAccess(mine, coach, { underReview: true })).toBe("edit");
  });
});

describe("isVisibleInLibrary", () => {
  it("shows global items and one's own personal items", () => {
    expect(isVisibleInLibrary(global, coach)).toBe(true);
    expect(isVisibleInLibrary(mine, coach)).toBe(true);
    expect(isVisibleInLibrary(theirs, coach)).toBe(false);
    expect(isVisibleInLibrary(mine, admin)).toBe(false);
  });
});

describe("canEditLink", () => {
  it("leaves links between global items to administrators", () => {
    expect(canEditLink(global, global, admin)).toBe(true);
    expect(canEditLink(global, global, coach)).toBe(false);
  });

  it("lets a coach link their own exercise to a global station", () => {
    expect(canEditLink(global, mine, coach)).toBe(true);
  });

  it("lets a coach link a global exercise to their own station", () => {
    expect(canEditLink(mine, global, coach)).toBe(true);
    expect(canEditLink(mine, mine, coach)).toBe(true);
  });

  it("never touches links to items the user cannot see", () => {
    // A station approved from a coach keeps the coach's personal exercises;
    // an administrator editing the station cannot see or change those links.
    expect(canEditLink(global, mine, admin)).toBe(false);
    expect(canEditLink(theirs, global, coach)).toBe(false);
    expect(canEditLink(global, theirs, coach)).toBe(false);
    expect(canEditLink(mine, theirs, coach)).toBe(false);
  });

  it("treats an administrator's own personal items like anyone's", () => {
    expect(canEditLink(global, adminsOwn, admin)).toBe(true);
    expect(canEditLink(adminsOwn, global, admin)).toBe(true);
  });
});

describe("planLinkChanges", () => {
  const current = [
    { id: "g1", editable: false },
    { id: "p1", editable: true },
    { id: "p2", editable: true },
  ];

  it("removes only editable links missing from the list and adds new ones", () => {
    expect(planLinkChanges(current, ["p1", "p3"], new Set(["p1", "p2", "p3"]))).toEqual({
      add: ["p3"],
      remove: ["p2"],
    });
  });

  it("keeps links the user may not change, even when left out", () => {
    expect(planLinkChanges(current, [], new Set(["p1", "p2"]))).toEqual({
      add: [],
      remove: ["p1", "p2"],
    });
  });

  it("accepts a locked link sent back unchanged", () => {
    expect(planLinkChanges(current, ["g1", "p1", "p2"], new Set(["p1", "p2"]))).toEqual({
      add: [],
      remove: [],
    });
  });

  it("refuses an item the user may not link", () => {
    expect(planLinkChanges(current, ["x"], new Set(["p1", "p2"]))).toBeNull();
  });
});

describe("canCreateWithScope", () => {
  it("lets only administrators create global items", () => {
    expect(canCreateWithScope("personal", coach)).toBe(true);
    expect(canCreateWithScope("global", coach)).toBe(false);
    expect(canCreateWithScope("global", admin)).toBe(true);
  });
});

describe("canCopy", () => {
  it("copies global items only", () => {
    expect(canCopy(global)).toBe(true);
    expect(canCopy(mine)).toBe(false);
  });
});

describe("canMakeGlobal", () => {
  it("lets an administrator turn their own personal item global", () => {
    expect(canMakeGlobal(adminsOwn, admin)).toBe(true);
  });

  it("refuses others' items, global items and non-administrators", () => {
    expect(canMakeGlobal(mine, admin)).toBe(false);
    expect(canMakeGlobal(global, admin)).toBe(false);
    expect(canMakeGlobal(mine, coach)).toBe(false);
  });
});

describe("canSubmit", () => {
  it("lets the owner submit a personal item without a pending submission", () => {
    expect(canSubmit(mine, coach, false)).toBe(true);
  });

  it("allows one pending submission per item", () => {
    expect(canSubmit(mine, coach, true)).toBe(false);
  });

  it("refuses others' items, global items and administrators", () => {
    expect(canSubmit(theirs, coach, false)).toBe(false);
    expect(canSubmit(global, coach, false)).toBe(false);
    expect(canSubmit(adminsOwn, admin, false)).toBe(false);
  });
});

describe("canWithdraw", () => {
  it("lets the submitter withdraw while pending", () => {
    expect(canWithdraw({ status: "pending", submittedBy: "u1" }, coach)).toBe(true);
  });

  it("refuses reviewed submissions and other users", () => {
    expect(canWithdraw({ status: "rejected", submittedBy: "u1" }, coach)).toBe(false);
    expect(canWithdraw({ status: "approved", submittedBy: "u1" }, coach)).toBe(false);
    expect(canWithdraw({ status: "pending", submittedBy: "u1" }, other)).toBe(false);
    expect(canWithdraw({ status: "pending", submittedBy: "u1" }, admin)).toBe(false);
  });
});

describe("canReview", () => {
  it("lets administrators review pending submissions of personal items", () => {
    expect(canReview({ status: "pending" }, mine, admin)).toBe(true);
  });

  it("refuses non-administrators, reviewed submissions and global items", () => {
    expect(canReview({ status: "pending" }, mine, coach)).toBe(false);
    expect(canReview({ status: "rejected" }, mine, admin)).toBe(false);
    expect(canReview({ status: "approved" }, mine, admin)).toBe(false);
    expect(canReview({ status: "pending" }, global, admin)).toBe(false);
  });
});

describe("canSeeCreator", () => {
  it("shows the creator to administrators only", () => {
    expect(canSeeCreator(admin)).toBe(true);
    expect(canSeeCreator(coach)).toBe(false);
  });
});

describe("submissionStatusFor", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 10, day));

  it("picks the user's newest submission", () => {
    const rows = [
      { id: "1", submittedBy: "u1", submittedAt: at(1), status: "rejected" as const },
      { id: "2", submittedBy: "u1", submittedAt: at(3), status: "pending" as const },
      { id: "3", submittedBy: "u2", submittedAt: at(5), status: "approved" as const },
    ];
    expect(submissionStatusFor(rows, coach)?.id).toBe("2");
  });

  it("is null without submissions by the user", () => {
    expect(submissionStatusFor([], coach)).toBeNull();
    expect(
      submissionStatusFor(
        [{ submittedBy: "u2", submittedAt: at(1), status: "pending" as const }],
        coach,
      ),
    ).toBeNull();
  });
});

describe("formatSubmissionDate", () => {
  it("formats in Swedish, in Swedish time", () => {
    // 23:30 UTC is already the next day in Stockholm.
    expect(formatSubmissionDate(new Date("2026-11-13T23:30:00Z"))).toBe("14 november 2026");
  });
});

describe("scope filter", () => {
  it("parses known values and falls back to all", () => {
    expect(parseScopeFilter("mine")).toBe("mine");
    expect(parseScopeFilter("global")).toBe("global");
    expect(parseScopeFilter("x")).toBe("all");
    expect(parseScopeFilter(undefined)).toBe("all");
  });

  it("matches items by filter", () => {
    expect(matchesScopeFilter(global, "global", coach)).toBe(true);
    expect(matchesScopeFilter(mine, "global", coach)).toBe(false);
    expect(matchesScopeFilter(mine, "mine", coach)).toBe(true);
    expect(matchesScopeFilter(global, "mine", coach)).toBe(false);
    expect(matchesScopeFilter(theirs, "mine", coach)).toBe(false);
    expect(matchesScopeFilter(theirs, "all", coach)).toBe(false);
    expect(matchesScopeFilter(global, "all", coach)).toBe(true);
  });
});
