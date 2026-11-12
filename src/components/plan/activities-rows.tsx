"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { EventType } from "@/db/schema";
import { layoutEventRows } from "@/lib/events";
import { cn } from "@/lib/utils";

import { EventDialog } from "./event-dialog";
import type { GridWeek } from "./season-grid";

export type ActivityEvent = {
  id: string;
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
};

const TYPE_CLASS: Record<EventType, string> = {
  competition: "bg-event-competition text-event-competition-foreground",
  camp: "bg-event-camp text-event-camp-foreground",
  show: "bg-event-show text-event-show-foreground",
  other: "bg-event-other text-event-other-foreground",
};

const LABEL_CLASS =
  "absolute inset-y-0.5 left-0.5 z-[1] flex min-w-[calc(100%-0.25rem)] items-center rounded px-1.5 text-left font-medium whitespace-nowrap";

/**
 * The "Aktiviteter" block for the footer of the season grid: a heading row
 * that repeats the week numbers, then one group of rows per event type that
 * has an event inside the season's weeks. Rendered inside the grid's table,
 * so the columns line up with the weeks.
 */
export function ActivitiesRows({
  seasonId,
  weeks,
  events,
  editable,
}: {
  seasonId: string;
  weeks: GridWeek[];
  events: ActivityEvent[];
  editable: boolean;
}) {
  const t = useTranslations("Events");
  const tp = useTranslations("Plan");
  const rows = layoutEventRows(
    weeks.map((w) => w.weekStart),
    events,
  );

  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={2}
          className="sticky left-0 z-10 border-t border-r border-b bg-muted px-2 py-1 text-left text-sm font-semibold"
        >
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {t("heading")}
            {editable && (
              <EventDialog
                seasonId={seasonId}
                defaultDate={weeks[0]?.weekStart}
                trigger={
                  <Button variant="outline" size="xs" type="button">
                    <PlusIcon data-icon="inline-start" />
                    {t("newEvent")}
                  </Button>
                }
              />
            )}
          </span>
        </th>
        {weeks.map((week) => (
          <th
            key={week.weekStart}
            scope="col"
            data-week={week.weekStart}
            className={cn(
              "h-7 min-w-8 border-t border-r border-b bg-muted px-1 text-center font-medium tabular-nums",
              week.className,
            )}
          >
            <span className="sr-only">{tp("weekPrefix")} </span>
            {week.week}
          </th>
        ))}
      </tr>
      {rows.map((row) =>
        row.lanes.map((lane, laneIndex) => (
          <tr key={`${row.type}-${laneIndex}`}>
            <th
              scope="row"
              colSpan={2}
              className="sticky left-0 z-10 border-r border-b bg-background px-2 py-1 text-left font-normal"
            >
              {laneIndex === 0 ? t(`types.${row.type}`) : <span className="sr-only">{t(`types.${row.type}`)}</span>}
            </th>
            {cellsOf(lane, weeks, (event) => (
              <EventLabel
                key={event.id}
                seasonId={seasonId}
                event={event}
                editable={editable}
                text={
                  event.startDate === event.endDate
                    ? t("date", { date: event.startDate })
                    : t("dates", { start: event.startDate, end: event.endDate })
                }
              />
            ))}
          </tr>
        )),
      )}
    </>
  );
}

/** One <td> per week, with an event's <td> spanning the weeks it covers. */
function cellsOf(
  lane: ReturnType<typeof layoutEventRows<ActivityEvent>>[number]["lanes"][number],
  weeks: GridWeek[],
  label: (event: ActivityEvent) => ReactNode,
): ReactNode[] {
  const cells: ReactNode[] = [];
  let col = 0;
  for (const placed of lane) {
    for (; col < placed.startCol; col++) {
      cells.push(emptyCell(weeks[col]));
    }
    cells.push(
      <td
        key={placed.event.id}
        colSpan={placed.endCol - placed.startCol + 1}
        data-week={weeks[placed.startCol].weekStart}
        className="relative h-7 border-r border-b p-0"
      >
        {label(placed.event)}
      </td>,
    );
    col = placed.endCol + 1;
  }
  for (; col < weeks.length; col++) {
    cells.push(emptyCell(weeks[col]));
  }
  return cells;
}

function emptyCell(week: GridWeek): ReactNode {
  return (
    <td
      key={week.weekStart}
      data-week={week.weekStart}
      className={cn("h-7 min-w-8 border-r border-b bg-background", week.className)}
    />
  );
}

function EventLabel({
  seasonId,
  event,
  editable,
  text,
}: {
  seasonId: string;
  event: ActivityEvent;
  editable: boolean;
  /** The event's dates, for the tooltip. */
  text: string;
}) {
  const t = useTranslations("Events");
  const className = cn(LABEL_CLASS, TYPE_CLASS[event.type]);
  const title = `${event.name} (${t(`types.${event.type}`)}), ${text}`;

  if (!editable) {
    return (
      <span title={title} className={className}>
        {event.name}
      </span>
    );
  }
  return (
    <EventDialog
      seasonId={seasonId}
      event={event}
      trigger={
        <button
          type="button"
          title={title}
          aria-label={t("editLabel", { name: event.name })}
          className={cn(
            className,
            "cursor-pointer outline-none hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:brightness-125",
          )}
        >
          {event.name}
        </button>
      }
    />
  );
}
