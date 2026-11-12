import { PencilIcon, Trash2Icon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { deleteSeasonAction, updateSeasonAction } from "@/app/plan-actions";
import { PageLoading, PageShell } from "@/components/page-shell";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { SeasonDialog } from "@/components/plan/season-dialog";
import { SeasonSummary } from "@/components/plan/season-summary";
import { StructureEditor } from "@/components/plan/structure-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { canEdit } from "@/lib/access";
import { getSeasonPlan } from "@/lib/data/seasons";
import { listCategories } from "@/lib/data/structure";
import { mondayToWeekInput } from "@/lib/season-weeks";

export default function SeasonSetupPage({
  params,
}: PageProps<"/seasons/[seasonId]/setup">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SetupContent params={params} />
    </Suspense>
  );
}

async function SetupContent({
  params,
}: {
  params: PageProps<"/seasons/[seasonId]/setup">["params"];
}) {
  const { seasonId } = await params;
  const [plan, categories] = await Promise.all([
    getSeasonPlan(seasonId),
    listCategories(seasonId),
  ]);
  // Setup is for editing; people who can only view see the season page.
  if (!canEdit(plan.access)) {
    notFound();
  }
  const { group, season } = plan;
  const t = await getTranslations();

  return (
    <PageShell
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name, href: `/seasons/${season.id}` },
        { label: t("Nav.setup") },
      ]}
    >
      <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">
        {t("Seasons.setupTitle", { name: season.name })}
      </h1>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">{t("Seasons.details")}</h2>
          <div className="flex flex-wrap gap-2">
            <SeasonDialog
              trigger={
                <Button variant="outline">
                  <PencilIcon data-icon="inline-start" />
                  {t("Seasons.editDetails")}
                </Button>
              }
              title={t("Seasons.editTitle")}
              submitLabel={t("Common.save")}
              initial={{
                name: season.name,
                firstWeek: mondayToWeekInput(season.firstWeek),
                lastWeek: mondayToWeekInput(season.lastWeek),
                trainingSlots: plan.trainingSlots.map((s) => ({
                  weekday: s.weekday,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  location: s.location,
                })),
              }}
              action={updateSeasonAction.bind(null, season.id)}
            />
            {plan.access === "owner" && (
              <ConfirmDelete
                trigger={
                  <Button variant="destructive">
                    <Trash2Icon data-icon="inline-start" />
                    {t("Seasons.deleteSeason")}
                  </Button>
                }
                title={t("Seasons.deleteTitle", { name: season.name })}
                description={t("Seasons.deleteText", { name: season.name })}
                action={deleteSeasonAction.bind(null, season.id)}
              />
            )}
          </div>
        </div>
        <div className="grid gap-1">
          <p className="font-medium">{season.name}</p>
          <SeasonSummary season={season} trainingSlots={plan.trainingSlots} />
        </div>
      </section>

      <Separator />

      <StructureEditor
        seasonId={season.id}
        categories={categories}
        disciplines={plan.disciplines.map((d) => ({
          id: d.id,
          name: d.name,
          focusItems: d.focusItems.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
          })),
        }))}
      />
    </PageShell>
  );
}
