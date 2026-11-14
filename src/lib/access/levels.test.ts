import { describe, expect, it } from "vitest";

import {
  canEdit,
  canOpenSeason,
  canOpenSession,
  canParticipate,
  canView,
  grantCovers,
  groupScopes,
  highest,
  isOwner,
  isUuid,
  meetsMinimum,
  resolveAccess,
  seasonAccessIn,
  sessionAccessIn,
  type Grant,
  type Target,
} from "./levels";

const G = "group-1";
const G2 = "group-2";
const S = "season-1";
const S2 = "season-2";
const X = "session-1";
const X2 = "session-2";

const group: Target = { kind: "group", groupId: G };
const season: Target = { kind: "season", groupId: G, seasonId: S };
const otherSeason: Target = { kind: "season", groupId: G, seasonId: S2 };
const session: Target = { kind: "session", groupId: G, seasonId: S, sessionId: X };
const sibling: Target = { kind: "session", groupId: G, seasonId: S, sessionId: X2 };

const groupShare = (level: Grant["level"], groupId = G): Grant => ({
  level,
  groupId,
  seasonId: null,
  sessionId: null,
});
const seasonShare = (level: Grant["level"], seasonId = S): Grant => ({
  level,
  groupId: G,
  seasonId,
  sessionId: null,
});
const sessionShare = (level: Grant["level"], sessionId = X): Grant => ({
  level,
  groupId: G,
  seasonId: S,
  sessionId,
});

describe("canEdit / canView / canParticipate / isOwner", () => {
  it("lets owner and edit change content", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("edit")).toBe(true);
    expect(canEdit("view")).toBe(false);
    expect(canEdit(null)).toBe(false);
  });
  it("lets every level read", () => {
    expect(canView("owner")).toBe(true);
    expect(canView("edit")).toBe(true);
    expect(canView("view")).toBe(true);
    expect(canView(null)).toBe(false);
  });
  it("lets a viewer tick parts and write the note, but not edit", () => {
    expect(canParticipate("view")).toBe(true);
    expect(canParticipate("edit")).toBe(true);
    expect(canParticipate("owner")).toBe(true);
    expect(canParticipate(null)).toBe(false);
    expect(canEdit("view")).toBe(false);
  });
  it("keeps sharing, deleting and copying to the owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("edit")).toBe(false);
    expect(isOwner("view")).toBe(false);
    expect(isOwner(null)).toBe(false);
  });
});

describe("meetsMinimum", () => {
  it("compares levels", () => {
    expect(meetsMinimum("owner", "edit")).toBe(true);
    expect(meetsMinimum("edit", "edit")).toBe(true);
    expect(meetsMinimum("view", "edit")).toBe(false);
    expect(meetsMinimum("view", "view")).toBe(true);
    expect(meetsMinimum("edit", "view")).toBe(true);
  });
  it("treats participate as reachable from view", () => {
    expect(meetsMinimum("view", "participate")).toBe(true);
    expect(meetsMinimum("edit", "participate")).toBe(true);
  });
  it("requires the owner for owner", () => {
    expect(meetsMinimum("owner", "owner")).toBe(true);
    expect(meetsMinimum("edit", "owner")).toBe(false);
    expect(meetsMinimum("view", "owner")).toBe(false);
  });
  it("never accepts no access", () => {
    for (const minimum of ["view", "participate", "edit", "owner"] as const) {
      expect(meetsMinimum(null, minimum)).toBe(false);
    }
  });
});

describe("highest", () => {
  it("picks the highest level and ignores missing ones", () => {
    expect(highest(["view", "edit"])).toBe("edit");
    expect(highest(["edit", "owner", "view"])).toBe("owner");
    expect(highest([null, undefined, "view"])).toBe("view");
    expect(highest([])).toBeNull();
    expect(highest([null])).toBeNull();
  });
});

describe("grantCovers (inheritance downwards)", () => {
  it("a group share covers the group, its seasons and their sessions", () => {
    const g = groupShare("view");
    expect(grantCovers(g, group)).toBe(true);
    expect(grantCovers(g, season)).toBe(true);
    expect(grantCovers(g, otherSeason)).toBe(true);
    expect(grantCovers(g, session)).toBe(true);
  });
  it("a group share does not cover another group", () => {
    expect(grantCovers(groupShare("edit", G2), group)).toBe(false);
    expect(grantCovers(groupShare("edit", G2), session)).toBe(false);
  });
  it("a season share covers the season and its sessions, not the group or other seasons", () => {
    const g = seasonShare("view");
    expect(grantCovers(g, group)).toBe(false);
    expect(grantCovers(g, season)).toBe(true);
    expect(grantCovers(g, otherSeason)).toBe(false);
    expect(grantCovers(g, session)).toBe(true);
    expect(grantCovers(g, sibling)).toBe(true);
  });
  it("a session share covers only that session", () => {
    const g = sessionShare("edit");
    expect(grantCovers(g, group)).toBe(false);
    expect(grantCovers(g, season)).toBe(false);
    expect(grantCovers(g, session)).toBe(true);
    expect(grantCovers(g, sibling)).toBe(false);
  });
});

describe("resolveAccess", () => {
  it("gives the owner owner everywhere, whatever the shares", () => {
    expect(resolveAccess(group, true, [])).toBe("owner");
    expect(resolveAccess(session, true, [groupShare("view")])).toBe("owner");
  });
  it("gives no access without a covering share", () => {
    expect(resolveAccess(group, false, [])).toBeNull();
    expect(resolveAccess(session, false, [sessionShare("edit", X2)])).toBeNull();
    expect(resolveAccess(otherSeason, false, [seasonShare("edit")])).toBeNull();
  });
  it("inherits a group share's level", () => {
    expect(resolveAccess(session, false, [groupShare("edit")])).toBe("edit");
    expect(resolveAccess(season, false, [groupShare("view")])).toBe("view");
  });
  it("lets the highest level win", () => {
    expect(resolveAccess(session, false, [groupShare("view"), sessionShare("edit")])).toBe("edit");
    expect(resolveAccess(session, false, [groupShare("edit"), sessionShare("view")])).toBe("edit");
    expect(resolveAccess(session, false, [seasonShare("view"), groupShare("edit")])).toBe("edit");
    expect(resolveAccess(sibling, false, [groupShare("view"), sessionShare("edit")])).toBe("view");
  });
});

describe("groupScopes (partial visibility)", () => {
  it("marks owned groups as owner", () => {
    const scopes = groupScopes([G], []);
    expect(scopes.get(G)?.access).toBe("owner");
    expect(scopes.has(G2)).toBe(false);
  });

  it("a group share opens the whole group", () => {
    const scope = groupScopes([], [groupShare("view")]).get(G)!;
    expect(scope.access).toBe("view");
    expect(canOpenSeason(scope, S)).toBe(true);
    expect(canOpenSeason(scope, S2)).toBe(true);
    expect(canOpenSession(scope, S, X)).toBe(true);
  });

  it("a season share shows the group with only that season", () => {
    const scope = groupScopes([], [seasonShare("edit")]).get(G)!;
    expect(scope.access).toBeNull();
    expect(canOpenSeason(scope, S)).toBe(true);
    expect(canOpenSeason(scope, S2)).toBe(false);
    expect(seasonAccessIn(scope, S)).toBe("edit");
    expect(canOpenSession(scope, S, X)).toBe(true);
    expect(canOpenSession(scope, S2, X2)).toBe(false);
  });

  it("a session share shows the group with only that session", () => {
    const scope = groupScopes([], [sessionShare("view")]).get(G)!;
    expect(scope.access).toBeNull();
    expect(canOpenSeason(scope, S)).toBe(false);
    expect(canOpenSession(scope, S, X)).toBe(true);
    expect(canOpenSession(scope, S, X2)).toBe(false);
    expect(sessionAccessIn(scope, S, X)).toBe("view");
  });

  it("does not open a session id claimed under another season", () => {
    const scope = groupScopes([], [sessionShare("edit")]).get(G)!;
    expect(canOpenSession(scope, S2, X)).toBe(false);
  });

  it("keeps the highest level per season and session", () => {
    const scope = groupScopes(
      [],
      [seasonShare("view"), seasonShare("edit"), sessionShare("edit"), sessionShare("view")],
    ).get(G)!;
    expect(scope.seasons.get(S)).toBe("edit");
    expect(scope.sessions.get(X)?.level).toBe("edit");
  });

  it("combines inherited and own levels, highest wins", () => {
    const scope = groupScopes([], [groupShare("view"), sessionShare("edit")]).get(G)!;
    expect(sessionAccessIn(scope, S, X)).toBe("edit");
    expect(sessionAccessIn(scope, S, X2)).toBe("view");
    expect(seasonAccessIn(scope, S)).toBe("view");
  });

  it("agrees with resolveAccess", () => {
    const grants = [seasonShare("view"), sessionShare("edit", X2)];
    const scope = groupScopes([], grants).get(G)!;
    for (const target of [season, otherSeason, session, sibling]) {
      const viaScope =
        target.kind === "season"
          ? seasonAccessIn(scope, target.seasonId)
          : target.kind === "session"
            ? sessionAccessIn(scope, target.seasonId, target.sessionId)
            : scope.access;
      expect(viaScope).toBe(resolveAccess(target, false, grants));
    }
  });

  it("the owner of a group keeps owner even if also shared", () => {
    const scope = groupScopes([G], [groupShare("view")]).get(G)!;
    expect(scope.access).toBe("owner");
  });
});

describe("isUuid", () => {
  it("accepts UUIDs", () => {
    expect(isUuid("3f2b8c1e-5d4a-4e7b-9a10-0c2d3e4f5a6b")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("3f2b8c1e-5d4a-4e7b-9a10-0c2d3e4f5a6b'; drop table users")).toBe(false);
  });
});
