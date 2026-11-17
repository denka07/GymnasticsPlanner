import { ChevronLeftIcon, ChevronRightIcon, TableIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { EventDescription } from "@/components/event/event-description";
import { EVENT_ACCENT } from "@/components/event/event-style";
import { PageLoading, PageShell } from "@/components/page-shell";
import { ActivityLibraryProvider } from "@/components/session/activity-library";
import type { CopySourceOption } from "@/components/session/copy-session-dialog";
import {
  SessionColumn,
  type SessionColumnData,
} from "@/components/session/session-column";
import {
  AddSessionButton,
  EditWeekButton,
} from "@/components/session/week-actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { canEdit } from "@/lib/access";
import { formatDayMonth } from "@/lib/dates";
import {
  getWeekPlan,
  type WeekFocus,
  type WeekPlan,
} from "@/lib/data/sessions";
import { cn } from "@/lib/utils";
import { isoWeek, weekdayDate } from "@/lib/weeks";

export default function WeekPage({
  params,
}: PageProps<"/seasons/[seasonId]/weeks/[weekStart]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <WeekContent params={params} />
    </Suspense>
  );
}

function columnData(entry: WeekPlan["sessions"][number]): SessionColumnData {
  if (entry.kind === "stored") {
    const s = entry.session;
    return {
      sessionId: s.id,
      trainingSlotId: s.trainingSlotId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      isCancelled: s.isCancelled,
      noteAfter: s.noteAfter,
      parts: s.parts,
    };
  }
  const p = entry.placeholder;
  return {
    sessionId: null,
    trainingSlotId: p.trainingSlotId,
    date: p.date,
    startTime: p.startTime,
    endTime: p.endTime,
    location: p.location,
    isCancelled: false,
    noteAfter: null,
    parts: [],
  };
}

/**
 * A column's key stays the same when a slot's placeholder becomes a stored
 * session, so its editor keeps its state.
 */
function columnKey(entry: WeekPlan["sessions"][number]): string {
  if (entry.kind === "placeholder") {
    return `slot:${entry.placeholder.trainingSlotId}`;
  }
  return entry.session.trainingSlotId
    ? `slot:${entry.session.trainingSlotId}`
    : `session:${entry.session.id}`;
}

async function WeekContent({
  params,
}: {
  params: PageProps<"/seasons/[seasonId]/weeks/[weekStart]">["params"];
}) {
  const { seasonId, weekStart } = await params;
  // All of this page's data comes from getWeekPlan; extend it there.
  const plan = await getWeekPlan(seasonId, weekStart);
  const { group, season } = plan;
  const t = await getTranslations("Week");
  const ts = await getTranslations("Session");
  const editable = canEdit(plan.access);
  const week = isoWeek(weekStart);
  const weekEnd = weekdayDate(weekStart, 7);
  const title = t("title", { week: week.week });
  const base = `/seasons/${season.id}`;
  const paintedCount = plan.focus.reduce((n, d) => n + d.items.length, 0);
  const copySources: CopySourceOption[] = plan.copySources;

  return (
    <PageShell
      wide
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name, href: base },
        { label: title },
      ]}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <WeekArrow
            href={plan.previousWeek && `${base}/weeks/${plan.previousWeek}`}
            label={t("previous")}
          >
            <ChevronLeftIcon />
          </WeekArrow>
          <div className="grid min-w-0 gap-0.5">
            <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground">
              {t("dateRange", {
                start: formatDayMonth(weekStart),
                end: formatDayMonth(weekEnd),
              })}{" "}
              {week.year}
            </p>
          </div>
          <WeekArrow
            href={plan.nextWeek && `${base}/weeks/${plan.nextWeek}`}
            label={t("next")}
          >
            <ChevronRightIcon />
          </WeekArrow>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="outline" href={base}>
            <TableIcon data-icon="inline-start" />
            {t("seasonPlan")}
          </ButtonLink>
          {editable && (
            <EditWeekButton
              seasonId={season.id}
              weekStart={weekStart}
              week={week.week}
              isBreak={plan.isBreak}
              note={plan.note}
              paintedCount={paintedCount}
            />
          )}
          {editable && (
            <AddSessionButton
              seasonId={season.id}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
          )}
        </div>
      </header>

      {(plan.isBreak || plan.note) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {plan.isBreak && (
            <p className="flex items-center gap-2">
              <Badge variant="secondary">{t("break")}</Badge>
              <span className="text-muted-foreground">{t("breakText")}</span>
            </p>
          )}
          {plan.note && <p className="break-words">{plan.note}</p>}
        </div>
      )}

      {plan.events.length > 0 && (
        <WeekEvents
          events={plan.events}
          editable={editable}
          seasonHref={base}
        />
      )}

      {editable && plan.sessions.length > 0 && (
        <p className="text-sm text-muted-foreground">{ts("hint")}</p>
      )}

      <ActivityLibraryProvider library={plan.library}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-2">
          <FocusColumn focus={plan.focus} />
          {plan.sessions.length === 0 ? (
            <p className="text-muted-foreground lg:py-3">{t("noSessions")}</p>
          ) : (
            plan.sessions.map((entry) => (
              <SessionColumn
                key={columnKey(entry)}
                data={columnData(entry)}
                seasonId={season.id}
                weekStart={weekStart}
                weekEnd={weekEnd}
                editable={editable}
                copySources={copySources}
              />
            ))
          )}
        </div>
      </ActivityLibraryProvider>
    </PageShell>
  );
}

/** Previous or next week; disabled at the season's ends. */
function WeekArrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <ButtonLink variant="outline" size="icon" aria-label={label} href={href}>
      {children}
    </ButtonLink>
  );
}

/** The events overlapping the week, with their descriptions (editable with edit access). */
async function WeekEvents({
  events,
  editable,
  seasonHref,
}: {
  events: WeekPlan["events"];
  editable: boolean;
  seasonHref: string;
}) {
  const t = await getTranslations("Week");
  const te = await getTranslations("Events");
  return (
    <section aria-labelledby="week-events-heading" className="grid gap-3">
      <h2
        id="week-events-heading"
        className="font-heading text-xl font-semibold"
      >
        {t("events")}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <li
            key={e.id}
            className={cn(
              "grid content-start gap-2 rounded-xl border border-l-8 bg-card p-4",
              EVENT_ACCENT[e.type].bar,
            )}
          >
            <div className="grid gap-1">
              <h3 className="font-heading text-lg font-semibold break-words">
                {e.name}
              </h3>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-sm font-medium",
                    EVENT_ACCENT[e.type].chip,
                  )}
                >
                  {te(`types.${e.type}`)}
                </span>
                <span className="text-muted-foreground">
                  {e.startDate === e.endDate
                    ? formatDayMonth(e.startDate)
                    : t("dateRange", {
                        start: formatDayMonth(e.startDate),
                        end: formatDayMonth(e.endDate),
                      })}
                </span>
              </p>
            </div>
            {editable ? (
              <EventDescription eventId={e.id} initial={e.description ?? ""} />
            ) : e.description ? (
              <p className="break-words whitespace-pre-wrap">{e.description}</p>
            ) : (
              <p className="text-muted-foreground">{te("noDescription")}</p>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <p>
          <Link
            href={seasonHref}
            className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
          >
            {te("planLink")}
          </Link>
        </p>
      )}
    </section>
  );
}

const LEVEL_SWATCH = {
  high: "bg-focus-high",
  medium: "bg-focus-medium",
  low: "bg-focus-low",
} as const;

/**
 * The week's focus, grouped by discipline: high and medium items listed
 * (high in bold), low items after them in parentheses.
 */
async function FocusColumn({ focus }: { focus: WeekFocus[] }) {
  const t = await getTranslations("Week");
  const tl = await getTranslations("Plan.levels");
  return (
    <section
      aria-labelledby="week-focus-heading"
      className="grid content-start gap-3 rounded-xl border bg-muted/40 p-3 lg:w-64 lg:shrink-0"
    >
      <h2
        id="week-focus-heading"
        className="font-heading text-xl font-semibold"
      >
        {t("focus")}
      </h2>
      {focus.length === 0 ? (
        <p className="text-muted-foreground">{t("noFocus")}</p>
      ) : (
        focus.map((d) => {
          const main = d.items.filter((i) => i.level !== "low");
          const low = d.items.filter((i) => i.level === "low");
          return (
            <div key={d.disciplineId} className="grid gap-1">
              <h3 className="font-semibold">{d.name}</h3>
              <ul className="grid gap-0.5">
                {main.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2.5 shrink-0 rounded-sm",
                        LEVEL_SWATCH[i.level],
                      )}
                    />
                    <span className={cn(i.level === "high" && "font-semibold")}>
                      {i.name}
                      <span className="sr-only">, {tl(i.level)}</span>
                    </span>
                  </li>
                ))}
                {low.length > 0 && (
                  <li className="flex items-baseline gap-2 text-muted-foreground">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2.5 shrink-0 rounded-sm",
                        LEVEL_SWATCH.low,
                      )}
                    />
                    <span>
                      ({low.map((i) => i.name).join(", ")})
                      <span className="sr-only">, {tl("low")}</span>
                    </span>
                  </li>
                )}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
