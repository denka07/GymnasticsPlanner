import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { StartWeek } from "@/lib/data/start-week";
import { formatDayMonth, shortTime, weekdayOf } from "@/lib/dates";
import { addWeeks, isoWeek } from "@/lib/weeks";

const navClass = buttonVariants({ variant: "outline" }) + " h-11 px-3 text-base";
const rowClass =
  "grid min-h-11 gap-0.5 rounded-xl border bg-card px-4 py-3 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function weekHref(monday: string, current: string): string {
  return monday === current ? "/" : `/?week=${monday}`;
}

/** The sessions of one week across the user's groups, with week navigation. */
export async function WeekView({ data }: { data: StartWeek }) {
  const t = await getTranslations();
  const { weekStart, weekEnd, currentWeek, today, days } = data;
  const week = isoWeek(weekStart).week;

  return (
    <section aria-labelledby="week-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="week-heading" className="font-heading text-xl font-semibold">
            {t("Start.weekHeading", { week })}
          </h2>
          <p className="text-muted-foreground">
            {t("Start.weekRange", { from: formatDayMonth(weekStart), to: formatDayMonth(weekEnd) })}
          </p>
        </div>
        <nav aria-label={t("Start.weekNav")} className="flex flex-wrap items-center gap-2">
          <Link
            href={weekHref(addWeeks(weekStart, -1), currentWeek)}
            className={navClass}
            aria-label={t("Start.previousWeek")}
            title={t("Start.previousWeek")}
          >
            <ChevronLeftIcon />
          </Link>
          {weekStart !== currentWeek && (
            <Link href="/" className={navClass}>
              {t("Start.thisWeek")}
            </Link>
          )}
          <Link
            href={weekHref(addWeeks(weekStart, 1), currentWeek)}
            className={navClass}
            aria-label={t("Start.nextWeek")}
            title={t("Start.nextWeek")}
          >
            <ChevronRightIcon />
          </Link>
        </nav>
      </div>

      {days.length === 0 ? (
        <p className="text-muted-foreground">{t("Start.weekEmpty")}</p>
      ) : (
        <div className="flex flex-wrap items-start justify-start gap-4">
          {days.map((day) => (
            <div
              key={day.date}
              className={
                "grid min-w-0 max-w-80 flex-[1_1_10.5rem] content-start gap-2 rounded-xl p-2 " +
                (day.date === today ? "bg-muted/60 ring-1 ring-primary/40" : "")
              }
            >
              <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                <span>
                  {t(`Weekdays.d${weekdayOf(day.date)}` as "Weekdays.d1")} {formatDayMonth(day.date)}
                </span>
                {day.date === today && (
                  <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground">
                    {t("Start.today")}
                  </span>
                )}
              </h3>
              <ul className="grid gap-2">
                {day.items.map((item) => {
                  const time = shortTime(item.startTime);
                  const href = item.sessionId
                    ? `/sessions/${item.sessionId}`
                    : `/seasons/${item.seasonId}/weeks/${weekStart}`;
                  const state = t(
                    item.state === "cancelled"
                      ? "Start.stateCancelled"
                      : item.state === "planned"
                        ? "Start.statePlanned"
                        : "Start.stateUnplanned",
                  );
                  return (
                    <li key={item.key}>
                      <Link href={href} className={rowClass}>
                        {time && (
                          <span
                            className={
                              "text-lg font-semibold tabular-nums " +
                              (item.state === "cancelled" ? "line-through" : "")
                            }
                          >
                            {time}
                          </span>
                        )}
                        <span
                          className={
                            "break-words font-medium " +
                            (item.state === "cancelled" ? "text-muted-foreground line-through" : "")
                          }
                        >
                          {item.groupName}
                        </span>
                        <span
                          className={
                            "text-sm " +
                            (item.state === "cancelled"
                              ? "font-semibold text-destructive"
                              : item.state === "planned"
                                ? "font-medium"
                                : "text-muted-foreground italic")
                          }
                        >
                          {state}
                        </span>
                        {item.location && (
                          <span className="break-words text-muted-foreground">{item.location}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
