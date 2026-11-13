import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { ReadOnlyNotice } from "@/components/library/read-only-notice";
import { ScopeBadge } from "@/components/library/scope-badge";
import { StationEditor } from "@/components/library/station-editor";
import { PageLoading, PageShell } from "@/components/page-shell";
import { listEquipment } from "@/lib/data/equipment";
import { listVisibleExerciseNames } from "@/lib/data/exercises";
import { getStation, type StationDetails } from "@/lib/data/stations";
import { formatEquipmentLines } from "@/lib/library";

export default function StationPage({ params }: PageProps<"/library/stations/[stationId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <StationContent params={params} />
    </Suspense>
  );
}

async function StationContent({
  params,
}: {
  params: PageProps<"/library/stations/[stationId]">["params"];
}) {
  const { stationId } = await params;
  const details = await getStation(stationId);
  const { station } = details;
  const [tl, t] = await Promise.all([getTranslations("Library"), getTranslations("Stations")]);

  return (
    <PageShell
      crumbs={[
        { label: tl("heading"), href: "/library" },
        { label: tl("tabs.stations"), href: "/library/stations" },
        { label: station.name },
      ]}
    >
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <h1 className="flex flex-wrap items-center gap-3 font-heading text-[1.75rem] leading-tight font-semibold tracking-tight break-words">
          {station.name}
          {station.scope === "global" && <ScopeBadge />}
        </h1>
        <p className="-mt-4 text-muted-foreground">{t("usage", { count: details.activityCount })}</p>
        {details.access === "edit" ? (
          <EditableStation details={details} />
        ) : (
          <div className="grid gap-6">
            <ReadOnlyNotice />
            {station.description && <p className="whitespace-pre-line">{station.description}</p>}
            <section className="grid gap-2">
              <h2 className="font-heading text-xl font-semibold">{t("equipmentHeading")}</h2>
              <p>
                {details.equipment.length > 0
                  ? formatEquipmentLines(details.equipment)
                  : t("equipmentEmpty")}
              </p>
            </section>
            <section className="grid gap-2">
              <h2 className="font-heading text-xl font-semibold">{t("exercisesHeading")}</h2>
              {details.exercises.length === 0 ? (
                <p>{t("exercisesEmpty")}</p>
              ) : (
                <ul className="grid gap-1">
                  {details.exercises.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/library/exercises/${e.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {e.name}
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

async function EditableStation({ details }: { details: StationDetails }) {
  const [catalogue, exercises] = await Promise.all([listEquipment(), listVisibleExerciseNames()]);
  const { station } = details;
  return (
    <StationEditor
      key={station.id}
      station={{ id: station.id, name: station.name, description: station.description }}
      initialEquipment={details.equipment}
      initialExercises={details.exercises}
      catalogue={catalogue.map(({ id, name }) => ({ id, name }))}
      exercises={exercises}
      activityCount={details.activityCount}
    />
  );
}
