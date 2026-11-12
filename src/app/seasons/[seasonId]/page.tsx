import { SettingsIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { PageLoading, PageShell } from "@/components/page-shell";
import { SeasonSummary } from "@/components/plan/season-summary";
import { Button } from "@/components/ui/button";
import { canEdit } from "@/lib/access";
import { getSeasonPlan } from "@/lib/data/seasons";

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

  return (
    <PageShell
      crumbs={[{ label: group.name, href: `/groups/${group.id}` }, { label: season.name }]}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <p className="text-sm text-muted-foreground">{group.name}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">
            {season.name}
          </h1>
          <SeasonSummary season={season} trainingSlots={plan.trainingSlots} />
        </div>
        {canEdit(plan.access) && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/seasons/${season.id}/setup`} />}
          >
            <SettingsIcon data-icon="inline-start" />
            {t("Seasons.setupLink")}
          </Button>
        )}
      </header>

      {/* Part C replaces this placeholder with the season plan grid. */}
      <section
        aria-labelledby="season-grid-heading"
        className="grid gap-2 rounded-xl border-2 border-dashed p-6"
        data-placeholder="season-grid"
      >
        <h2 id="season-grid-heading" className="font-heading text-lg font-semibold">
          {t("Seasons.gridTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("Seasons.gridPlaceholder")}</p>
      </section>
    </PageShell>
  );
}
