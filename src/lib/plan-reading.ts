/*
 * Reading and printing session plans (docs/implementation-plan.md, step 11):
 * which plan a part shows, the order plans are read and printed in, which
 * plans a print shows, each printed page's orientation and the name of a
 * plan saved as an image.
 */

/** What these rules need of a plan. */
export type ReadablePlan = { id: string; isMain: boolean; partIds: readonly string[] };

/** The plan a part shows: its own plan, else the main plan, else none. */
export function planOfPart<P extends ReadablePlan>(partId: string, plans: readonly P[]): P | null {
  return plans.find((p) => !p.isMain && p.partIds.includes(partId)) ?? plans.find((p) => p.isMain) ?? null;
}

/**
 * Plans in reading order: the main plan first, then part plans by their
 * first part's place in the session, and plans without parts last. Plans
 * that tie keep their order.
 */
export function readingOrder<P extends ReadablePlan>(plans: readonly P[], partIds: readonly string[]): P[] {
  const position = new Map(partIds.map((id, index) => [id, index]));
  const rank = (plan: P): number => {
    if (plan.isMain) {
      return -1;
    }
    const places = plan.partIds.map((id) => position.get(id)).filter((i): i is number => i !== undefined);
    return places.length > 0 ? Math.min(...places) : Number.MAX_SAFE_INTEGER;
  };
  return plans
    .map((plan, index) => ({ plan, index, rank: rank(plan) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.plan);
}

/** What the print view prints: every plan, or one. */
export type PrintChoice = "all" | { planId: string };

/** The print view's choice from its `plan` search parameter; anything but a plan id means all. */
export function printChoice(param: string | string[] | undefined, plans: readonly ReadablePlan[]): PrintChoice {
  const value = Array.isArray(param) ? param[0] : param;
  return value && plans.some((p) => p.id === value) ? { planId: value } : "all";
}

/** The plans a print shows, in reading order. */
export function printedPlans<P extends ReadablePlan>(
  plans: readonly P[],
  partIds: readonly string[],
  choice: PrintChoice,
): P[] {
  const ordered = readingOrder(plans, partIds);
  return choice === "all" ? ordered : ordered.filter((p) => p.id === choice.planId);
}

/** The print view's address for a choice. */
export function printHref(sessionId: string, choice: PrintChoice): string {
  const base = `/sessions/${sessionId}/plans/print`;
  return choice === "all" ? base : `${base}?plan=${encodeURIComponent(choice.planId)}`;
}

export type PageOrientation = "portrait" | "landscape";

/**
 * A printed plan's page: landscape when its drawing (the hall, drawn as it
 * is) is wider than tall, else portrait.
 */
export function pageOrientation(hall: { widthCm: number; lengthCm: number }): PageOrientation {
  return hall.widthCm > hall.lengthCm ? "landscape" : "portrait";
}

/** Characters that file systems or chat apps do not take in a file name. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

/** The name of a plan saved as an image: the session's date and the plan's name. */
export function planImageName(date: string, planName: string): string {
  const name = planName.replace(UNSAFE, "-").replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "").slice(0, 80);
  return `${name ? `${date} ${name}` : date}.png`;
}

/** The longest side, in pixels, of a plan saved as an image. */
export const IMAGE_LONG_SIDE_PX = 2400;

/** The pixel size of a plan's image: its proportions, the long side IMAGE_LONG_SIDE_PX. */
export function imageSize(area: { width: number; height: number }, longSide = IMAGE_LONG_SIDE_PX): { width: number; height: number } {
  const scale = longSide / Math.max(area.width, area.height);
  return { width: Math.max(1, Math.round(area.width * scale)), height: Math.max(1, Math.round(area.height * scale)) };
}
