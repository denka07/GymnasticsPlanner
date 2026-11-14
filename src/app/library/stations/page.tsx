import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { createStationAction } from "@/app/library-actions";
import { CreateItemDialog } from "@/components/library/create-item-dialog";
import { LibrarySearch } from "@/components/library/library-search";
import { LibraryTabs } from "@/components/library/library-tabs";
import { ScopeBadge } from "@/components/library/scope-badge";
import { ScopeFilterNav, SubmissionBadge } from "@/components/library/scope-filter";
import { PageLoading, PageShell } from "@/components/page-shell";
import { searchInput } from "@/lib/data/schemas";
import { listStations } from "@/lib/data/stations";
import { requireUser } from "@/lib/auth";
import { formatEquipmentLines, parseScopeFilter } from "@/lib/library";

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
  const params = await searchParams;
  const search = searchInput.parse(params.q);
  const filter = parseScopeFilter(params.scope);
  const [stations, user, t, tl] = await Promise.all([
    listStations(search, filter),
    requireUser(),
    getTranslations("Stations"),
    getTranslations("Library"),
  ]);

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.stations") }]}>
      <LibraryTabs current="stations" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LibrarySearch
          action="/library/stations"
          label={t("searchLabel")}
          search={search}
          scope={filter}
        />
        <CreateItemDialog
          buttonLabel={t("new")}
          title={t("createTitle")}
          placeholder={t("namePlaceholder")}
          canChooseScope={user.isAdmin}
          action={createStationAction}
        />
      </div>
      <ScopeFilterNav action="/library/stations" filter={filter} search={search} />

      {stations.length === 0 ? (
        search ? (
          <p className="text-muted-foreground">{tl("noResults", { search })}</p>
        ) : filter !== "all" ? (
          <p className="text-muted-foreground">{tl("noneInFilter")}</p>
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
                  <SubmissionBadge status={station.status} />
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
