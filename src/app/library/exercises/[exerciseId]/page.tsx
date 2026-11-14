import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { ExerciseEditor } from "@/components/library/exercise-editor";
import { ReadOnlyNotice } from "@/components/library/read-only-notice";
import { ReviewPanel } from "@/components/library/review-panel";
import { toPanelState } from "@/components/library/review-state";
import { ScopeBadge } from "@/components/library/scope-badge";
import { PageLoading, PageShell } from "@/components/page-shell";
import { getExercise, type ExerciseDetails } from "@/lib/data/exercises";
import { listVisibleStationNames } from "@/lib/data/stations";

export default function ExercisePage({ params }: PageProps<"/library/exercises/[exerciseId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ExerciseContent params={params} />
    </Suspense>
  );
}

async function ExerciseContent({
  params,
}: {
  params: PageProps<"/library/exercises/[exerciseId]">["params"];
}) {
  const { exerciseId } = await params;
  const details = await getExercise(exerciseId);
  const { exercise } = details;
  const [tl, t] = await Promise.all([getTranslations("Library"), getTranslations("Exercises")]);
  const isGlobal = exercise.scope === "global";

  return (
    <PageShell
      crumbs={[
        { label: tl("heading"), href: "/library" },
        { label: tl("tabs.exercises"), href: "/library/exercises" },
        { label: exercise.name },
      ]}
    >
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <h1 className="flex flex-wrap items-center gap-3 font-heading text-[1.75rem] leading-tight font-semibold tracking-tight break-words">
          {exercise.name}
          {isGlobal && <ScopeBadge />}
        </h1>
        {(details.creatorName !== null || details.activityCount !== null) && (
          <div className="-mt-4 grid gap-0.5 text-muted-foreground">
            {details.creatorName !== null && <p>{tl("createdBy", { name: details.creatorName })}</p>}
            {details.activityCount !== null && <p>{t("usage", { count: details.activityCount })}</p>}
          </div>
        )}
        <ReviewPanel
          kind="exercise"
          itemId={exercise.id}
          itemName={exercise.name}
          state={toPanelState(details.review)}
        />
        {details.access === "edit" ? (
          <EditableExercise details={details} />
        ) : (
          <div className="grid gap-6">
            {isGlobal && <ReadOnlyNotice />}
            {exercise.disciplineName && (
              <p className="text-muted-foreground">{exercise.disciplineName}</p>
            )}
            {exercise.description && <p className="whitespace-pre-line">{exercise.description}</p>}
            <section className="grid gap-2">
              <h2 className="font-heading text-xl font-semibold">{t("stationsHeading")}</h2>
              {details.stations.length === 0 ? (
                <p>{t("stationsEmpty")}</p>
              ) : (
                <ul className="grid gap-1">
                  {details.stations.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/library/stations/${s.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}

async function EditableExercise({ details }: { details: ExerciseDetails }) {
  const stations = await listVisibleStationNames();
  const { exercise } = details;
  return (
    <ExerciseEditor
      key={exercise.id}
      exercise={{
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        disciplineName: exercise.disciplineName,
      }}
      initialStations={details.stations
        .filter((s) => s.editable)
        .map(({ id, name }) => ({ id, name }))}
      stations={stations}
      activityCount={details.activityCount ?? 0}
      isGlobal={exercise.scope === "global"}
    />
  );
}
