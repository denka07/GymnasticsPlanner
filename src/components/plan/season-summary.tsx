import { getTranslations } from "next-intl/server";

import type { Season, TrainingSlot } from "@/db/schema";
import { isoWeek } from "@/lib/weeks";

/** "v. 34–50, 2026", or with both years when the season crosses a new year. */
export async function weekRangeText(season: Pick<Season, "firstWeek" | "lastWeek">) {
  const t = await getTranslations("Seasons");
  const first = isoWeek(season.firstWeek);
  const last = isoWeek(season.lastWeek);
  return first.year === last.year
    ? t("weekRange", { first: first.week, last: last.week, year: first.year })
    : t("weekRangeAcrossYears", {
        first: first.week,
        firstYear: first.year,
        last: last.week,
        lastYear: last.year,
      });
}

/** One training slot: weekday, times if any and location if any. */
export async function trainingSlotText(slot: TrainingSlot) {
  const t = await getTranslations("Seasons");
  const tw = await getTranslations("Weekdays");
  const start = slot.startTime?.slice(0, 5);
  const end = slot.endTime?.slice(0, 5);
  const time =
    start && end
      ? t("timeRange", { start, end })
      : start
        ? t("timeFrom", { start })
        : end
          ? t("timeTo", { end })
          : null;
  const day = tw(`d${slot.weekday}` as "d1");
  return [day, time, slot.location].filter(Boolean).join(" · ");
}

/** Season header: week range and training days. */
export async function SeasonSummary({
  season,
  trainingSlots,
}: {
  season: Season;
  trainingSlots: TrainingSlot[];
}) {
  const t = await getTranslations("Seasons");
  const range = await weekRangeText(season);
  const slots = await Promise.all(trainingSlots.map(trainingSlotText));

  return (
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>{range}</p>
      {slots.length === 0 ? (
        <p>{t("noTrainingDays")}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {slots.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
