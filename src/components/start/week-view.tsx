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
        <div className="grid gap-4">
          {days.map((day) => (
            <div key={day.date} className="grid gap-2">
              <h3 className="text-base font-semibold">
                {t(`Weekdays.d${weekdayOf(day.date)}` as "Weekdays.d1")} {formatDayMonth(day.date)}
                {day.date === today && (
                  <span className="ml-2 rounded-md bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground">
                    {t("Start.today")}
                  </span>
                )}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold">
                            {time ? `${time} · ${item.groupName}` : item.groupName}
                          </span>
                          <span
                            className={
                              item.state === "cancelled"
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {state}
                          </span>
                        </span>
                        {item.location && (
                          <span className="text-muted-foreground">{item.location}</span>
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
