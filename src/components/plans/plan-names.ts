import type { useTranslations } from "next-intl";

import type { LoadedPlan } from "@/lib/data/session-plans";
import type { LoadedPart } from "@/lib/outline";
import { linkedActivityIds, partsOfPlan, stationNumbers, type OutlinePart } from "@/lib/session-plans";

/*
 * What every view of a session's plans says about a plan: its name, the
 * parts it applies to and its stations' numbers. Shared by the plans page,
 * the phone's plan view and the print view.
 */

type Translate = ReturnType<typeof useTranslations<"Plans">>;

/** The outline as the plan rules need it. */
export function outlineOf(parts: readonly LoadedPart[]): OutlinePart[] {
  return parts.map((p) => ({
    id: p.id,
    activities: p.activities.map((a) => ({ id: a.id, stationId: a.station?.id ?? null })),
  }));
}

/** A plan's name as lists show it. */
export function planName(plan: LoadedPlan, parts: readonly LoadedPart[], t: Translate): string {
  if (plan.name) {
    return plan.name;
  }
  if (plan.isMain) {
    return t("mainPlan");
  }
  const titles = parts.filter((p) => plan.partIds.includes(p.id)).map((p) => p.title);
  return titles.length > 0 ? t("partPlan", { parts: titles.join(", ") }) : t("partPlanUnnamed");
}

/** The parts a plan applies to, in the session's order. */
export function planParts(plan: LoadedPlan, plans: readonly LoadedPlan[], parts: readonly LoadedPart[]): LoadedPart[] {
  const ids = new Set(partsOfPlan(plan, plans, outlineOf(parts)).map((p) => p.id));
  return parts.filter((p) => ids.has(p.id));
}

/** What a plan applies to, in one line. */
export function appliesTo(plan: LoadedPlan, plans: readonly LoadedPlan[], parts: readonly LoadedPart[], t: Translate): string {
  if (!plan.isMain && plan.partIds.length === 0) {
    return t("noPartsInPlan");
  }
  if (plan.isMain && !plans.some((p) => !p.isMain)) {
    return t("appliesToAll");
  }
  const own = planParts(plan, plans, parts);
  return own.length > 0 ? t("appliesTo", { parts: own.map((p) => p.title).join(", ") }) : t("noPartsInPlan");
}

/** Activity id to the number its station has in the plan. */
export function planNumbers(plan: LoadedPlan, plans: readonly LoadedPlan[], parts: readonly LoadedPart[]) {
  return stationNumbers(outlineOf(planParts(plan, plans, parts)), linkedActivityIds(plan.items));
}

/** The people's initials, from the messages. */
export function personInitials(t: Translate) {
  return { coach: t("initials.coach"), passare: t("initials.passare") };
}
