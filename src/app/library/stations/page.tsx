import { PlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { createStationAction } from "@/app/library-actions";
import { LibrarySearch } from "@/components/library/library-search";
import { LibraryTabs } from "@/components/library/library-tabs";
import { ScopeBadge } from "@/components/library/scope-badge";
import { PageLoading, PageShell } from "@/components/page-shell";
import { NameDialog } from "@/components/plan/name-dialog";
import { Button } from "@/components/ui/button";
import { searchInput } from "@/lib/data/schemas";
import { listStations } from "@/lib/data/stations";
import { formatEquipmentLines } from "@/lib/library";

export default function StationsPage({ searchParams }: PageProps<"/library/stations">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <StationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StationsContent({
  searchParams,
}: {
  searchParams: PageProps<"/library/stations">["searchParams"];
}) {
  const search = searchInput.parse((await searchParams).q);
  const [stations, t, tl, tc] = await Promise.all([
    listStations(search),
    getTranslations("Stations"),
    getTranslations("Library"),
    getTranslations("Common"),
  ]);

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.stations") }]}>
      <LibraryTabs current="stations" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LibrarySearch action="/library/stations" label={t("searchLabel")} search={search} />
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
          action={createStationAction}
        />
      </div>

      {stations.length === 0 ? (
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
          {stations.map((station) => (
            <li key={station.id}>
              <Link
                href={`/library/stations/${station.id}`}
                className="grid h-full gap-1 rounded-xl border bg-card px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {station.name}
                  {station.scope === "global" && <ScopeBadge />}
                </span>
                <span className="text-muted-foreground">
                  {station.equipment.length > 0
                    ? formatEquipmentLines(station.equipment)
                    : t("noEquipment")}
                </span>
                <span className="text-muted-foreground">
                  {t("exerciseCount", { count: station.exerciseCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
