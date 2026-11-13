import { PlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { createExerciseAction } from "@/app/library-actions";
import { LibrarySearch } from "@/components/library/library-search";
import { LibraryTabs } from "@/components/library/library-tabs";
import { ScopeBadge } from "@/components/library/scope-badge";
import { PageLoading, PageShell } from "@/components/page-shell";
import { NameDialog } from "@/components/plan/name-dialog";
import { Button } from "@/components/ui/button";
import { listExercises } from "@/lib/data/exercises";
import { searchInput } from "@/lib/data/schemas";

export default function ExercisesPage({ searchParams }: PageProps<"/library/exercises">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ExercisesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExercisesContent({
  searchParams,
}: {
  searchParams: PageProps<"/library/exercises">["searchParams"];
}) {
  const search = searchInput.parse((await searchParams).q);
  const [exercises, t, tl, tc] = await Promise.all([
    listExercises(search),
    getTranslations("Exercises"),
    getTranslations("Library"),
    getTranslations("Common"),
  ]);

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.exercises") }]}>
      <LibraryTabs current="exercises" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LibrarySearch action="/library/exercises" label={t("searchLabel")} search={search} />
        <NameDialog
          trigger={
            <Button className="h-11 px-4">
              <PlusIcon data-icon="inline-start" />
              {t("new")}
            </Button>
          }
          title={t("createTitle")}
          label={tl("nameLabel")}
          placeholder={t("namePlaceholder")}
          submitLabel={tc("create")}
          action={createExerciseAction}
        />
      </div>

      {exercises.length === 0 ? (
        search ? (
          <p className="text-muted-foreground">{tl("noResults", { search })}</p>
        ) : (
          <div className="grid gap-1 rounded-xl border bg-muted/40 p-4">
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="text-muted-foreground">{t("emptyText")}</p>
          </div>
        )
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <Link
                href={`/library/exercises/${exercise.id}`}
                className="grid h-full gap-1 rounded-xl border bg-card px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {exercise.name}
                  {exercise.scope === "global" && <ScopeBadge />}
                </span>
                {exercise.disciplineName && <span>{exercise.disciplineName}</span>}
                <span className="text-muted-foreground">
                  {exercise.stations.length > 0
                    ? exercise.stations.map((s) => s.name).join(", ")
                    : t("noStations")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
