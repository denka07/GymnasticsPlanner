"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { EventType } from "@/db/schema";
import { layoutEventRows, truncateLabel, visibleLabelChars } from "@/lib/events";
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

/** A strip fills its share of the cell; the name is written bottom to top. */
const STRIP_CLASS =
  "flex min-w-0 flex-1 items-center justify-start overflow-hidden rounded-sm py-1 text-xs leading-none font-medium whitespace-nowrap [writing-mode:vertical-rl] rotate-180";

type Lane = ReturnType<typeof layoutEventRows<ActivityEvent>>[number]["lanes"][number];

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
    <TooltipProvider>
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
      {rows.map((row) => {
        const chars = visibleLabelChars(row.lanes.flat().map((p) => p.event.name));
        const height = `max(1.75rem, calc(${chars} * 0.68em + 1.25rem))`;
        return row.lanes.map((lane, laneIndex) => (
          <tr key={`${row.type}-${laneIndex}`}>
            <th
              scope="row"
              colSpan={2}
              className="sticky left-0 z-10 border-r border-b bg-background px-2 py-1 text-left font-normal"
            >
              {laneIndex === 0 ? (
                t(`types.${row.type}`)
              ) : (
                <span className="sr-only">{t(`types.${row.type}`)}</span>
              )}
            </th>
            {cellsOf(lane, weeks, height, seasonId, editable)}
          </tr>
        ));
      })}
    </TooltipProvider>
  );
}

/**
 * One <td> per week, with an event's <td> spanning the weeks it covers.
 * Single-week events in the same week share that week's <td> side by side.
 */
function cellsOf(
  lane: Lane,
  weeks: GridWeek[],
  height: string,
  seasonId: string,
  editable: boolean,
): ReactNode[] {
  const cells: ReactNode[] = [];
  let col = 0;
  let i = 0;
  while (i < lane.length) {
    const first = lane[i];
    const group = [first];
    while (first.endCol === first.startCol && lane[i + group.length]?.startCol === first.startCol) {
      group.push(lane[i + group.length]);
    }
    i += group.length;
    for (; col < first.startCol; col++) {
      cells.push(emptyCell(weeks[col], height));
    }
    cells.push(
      <td
        key={first.event.id}
        colSpan={first.endCol - first.startCol + 1}
        data-week={weeks[first.startCol].weekStart}
        style={{ height }}
        className="relative border-r text-xs border-b p-0"
      >
        <div className="absolute inset-0.5 flex gap-px">
          {group.map((placed) => (
            <EventStrip
              key={placed.event.id}
              seasonId={seasonId}
              event={placed.event}
              editable={editable}
            />
          ))}
        </div>
      </td>,
    );
    col = first.endCol + 1;
  }
  for (; col < weeks.length; col++) {
    cells.push(emptyCell(weeks[col], height));
  }
  return cells;
}

function emptyCell(week: GridWeek, height: string): ReactNode {
  return (
    <td
      key={week.weekStart}
      data-week={week.weekStart}
      style={{ height }}
      className={cn("min-w-8 border-r border-b bg-background text-xs", week.className)}
    />
  );
}

function EventStrip({
  seasonId,
  event,
  editable,
}: {
  seasonId: string;
  event: ActivityEvent;
  editable: boolean;
}) {
  const t = useTranslations("Events");
  const dates =
    event.startDate === event.endDate
      ? t("date", { date: event.startDate })
      : t("dates", { start: event.startDate, end: event.endDate });
  const type = t(`types.${event.type}`);
  const className = cn(STRIP_CLASS, TYPE_CLASS[event.type]);
  const label = truncateLabel(event.name);

  const tooltip = (
    <TooltipContent>
      <span className="flex flex-col">
        <span className="font-medium">{event.name}</span>
        <span>{dates}</span>
      </span>
    </TooltipContent>
  );

  if (!editable) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="img"
              tabIndex={0}
              aria-label={t("viewLabel", { name: event.name, type, dates })}
              className={cn(
                className,
                "outline-none focus-visible:outline-2 focus-visible:outline-ring",
              )}
            />
          }
        >
          {label}
        </TooltipTrigger>
        {tooltip}
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <EventDialog
        seasonId={seasonId}
        event={event}
        trigger={
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t("editLabel", { name: event.name, type, dates })}
                className={cn(
                  className,
                  "cursor-pointer outline-none hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring dark:hover:brightness-125",
                )}
              />
            }
          >
            {label}
          </TooltipTrigger>
        }
      />
      {tooltip}
    </Tooltip>
  );
}
