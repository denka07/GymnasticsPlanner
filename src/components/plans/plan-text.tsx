import { useTranslations } from "next-intl";

import type { LoadedActivity, LoadedPart } from "@/lib/outline";
import { cn } from "@/lib/utils";

/*
 * The text plan beside a drawing: the plan's parts with their activities,
 * each linked activity carrying the number its station has in the drawing.
 */

/** A short name for an activity: its text's first line, else its exercises, else its station. */
export function activityTitle(activity: LoadedActivity, max = 70): string {
  const text = activity.text.split("\n")[0].trim();
  const title =
    text || activity.exercises.map((e) => e.name).join(", ") || activity.station?.name || "";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

export function PlanText({
  parts,
  numbers,
  className,
}: {
  /** The plan's parts, in order. */
  parts: readonly LoadedPart[];
  /** Activity id to station number. */
  numbers: ReadonlyMap<string, number>;
  className?: string;
}) {
  const t = useTranslations("Plans");
  return (
    <section aria-label={t("textHeading")} className={cn("grid content-start gap-3", className)}>
      <div className="grid gap-0.5">
        <h2 className="font-heading text-base font-semibold">{t("textHeading")}</h2>
        <p className="text-sm text-muted-foreground">{t("textIntro")}</p>
      </div>
      {parts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPartsInPlan")}</p>
      ) : (
        <ol className="grid gap-3">
          {parts.map((part) => (
            <li key={part.id} className="grid gap-1">
              <p className="font-medium break-words">{part.title}</p>
              {part.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noActivities")}</p>
              ) : (
                <ul className="grid gap-1">
                  {part.activities.map((a) => {
                    const number = numbers.get(a.id);
                    return (
                      <li key={a.id} className="flex items-start gap-2 text-sm" data-activity-number={number}>
                        <span
                          aria-label={number === undefined ? undefined : t("numberLabel", { number })}
                          className={cn(
                            "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                            number === undefined ? "border border-dashed border-muted-foreground/40" : "bg-primary text-primary-foreground",
                          )}
                        >
                          {number}
                        </span>
                        <span className="min-w-0 break-words">
                          {activityTitle(a, 200)}
                          {a.station && a.text.trim() !== "" && (
                            <span className="text-muted-foreground"> · {a.station.name}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
