import { CopyIcon, SettingsIcon } from "lucide-react";
import { io } from "next/cache";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { PageLoading, PageShell } from "@/components/page-shell";
import { ActivitiesRows } from "@/components/plan/activities-rows";
import { CopySeasonDialog } from "@/components/plan/copy-season-dialog";
import { SeasonGrid, type GridWeek } from "@/components/plan/season-grid";
import { SeasonSummary } from "@/components/plan/season-summary";
import { Button } from "@/components/ui/button";
import { canEdit } from "@/lib/access";
import { listEditableGroups } from "@/lib/data/groups";
import { getSeasonPlan } from "@/lib/data/seasons";
import { mondayToWeekInput } from "@/lib/season-weeks";
import { isoWeek, mondayOf } from "@/lib/weeks";

/** Greys out a break week's column: a translucent layer over the cell colour. */
const BREAK_WEEK_CLASS = "bg-[linear-gradient(var(--break-tint),var(--break-tint))]";

export default function SeasonPage({ params }: PageProps<"/seasons/[seasonId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SeasonContent params={params} />
    </Suspense>
  );
}

async function SeasonContent({
  params,
}: {
  params: PageProps<"/seasons/[seasonId]">["params"];
}) {
  const { seasonId } = await params;
  // All of this page's data comes from getSeasonPlan; extend it there.
  const plan = await getSeasonPlan(seasonId);
  const { group, season } = plan;
  const t = await getTranslations();
  const editable = canEdit(plan.access);
  const currentWeek = await currentMonday();
  const targetGroups = await listEditableGroups();
  const weekRows = new Map(plan.weekRows.map((r) => [r.weekStart, r]));
  const weeks: GridWeek[] = plan.weeks.map((weekStart) => {
    const row = weekRows.get(weekStart);
    return {
      weekStart,
      week: isoWeek(weekStart).week,
      isCurrent: weekStart === currentWeek,
      isBreak: row?.isBreak ?? false,
      note: row?.note ?? null,
      className: row?.isBreak ? BREAK_WEEK_CLASS : undefined,
    };
  });
  const focusItemCount = plan.disciplines.reduce((n, d) => n + d.focusItems.length, 0);
  const gridKey = [
    plan.weeks.join(),
    ...plan.disciplines.flatMap((d) => d.focusItems.map((i) => i.id)),
  ].join("|");

  return (
    <PageShell
      wide
      crumbs={[{ label: group.name, href: `/groups/${group.id}` }, { label: season.name }]}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1">
          <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight break-words">
            {season.name}
          </h1>
          <SeasonSummary season={season} trainingSlots={plan.trainingSlots} />
        </div>
        <div className="flex flex-wrap gap-2">
          {targetGroups.length > 0 && (
            <CopySeasonDialog
              trigger={
                <Button variant="outline">
                  <CopyIcon data-icon="inline-start" />
                  {t("Seasons.copySeason")}
                </Button>
              }
              sourceSeasonId={season.id}
              sourceName={season.name}
              firstWeek={mondayToWeekInput(season.firstWeek)}
              lastWeek={mondayToWeekInput(season.lastWeek)}
              groups={targetGroups}
              defaultGroupId={group.id}
            />
          )}
          {editable && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/seasons/${season.id}/setup`} />}
            >
              <SettingsIcon data-icon="inline-start" />
              {t("Seasons.setupLink")}
            </Button>
          )}
        </div>
      </header>

      <section aria-labelledby="season-grid-heading" className="grid min-w-0 gap-2">
        <h2 id="season-grid-heading" className="font-heading text-xl font-semibold">
          {t("Seasons.gridTitle")}
        </h2>
        {focusItemCount === 0 ? (
          <div className="grid justify-items-start gap-2 rounded-xl border border-dashed p-6">
            <p className="font-medium">{t("Plan.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {editable ? t("Plan.emptyText") : t("Plan.emptyTextView")}
            </p>
            {editable && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/seasons/${season.id}/setup`} />}
              >
                {t("Plan.emptyLink")}
              </Button>
            )}
          </div>
        ) : (
          <SeasonGrid
            // A new set of rows or weeks starts the grid afresh.
            key={gridKey}
            seasonId={season.id}
            seasonName={season.name}
            disciplines={plan.disciplines.map((d) => ({
              id: d.id,
              name: d.name,
              focusItems: d.focusItems.map((i) => ({ id: i.id, name: i.name, category: i.category })),
            }))}
            weeks={weeks}
            allocations={plan.allocations}
            editable={editable}
            footerRows={
              <ActivitiesRows
                seasonId={season.id}
                weeks={weeks}
                events={plan.events}
                editable={editable}
              />
            }
          />
        )}
      </section>
    </PageShell>
  );
}

/** The Monday of the current week, in Swedish time. */
async function currentMonday(): Promise<string> {
  await io();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return mondayOf(today);
}
