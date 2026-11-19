import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import type { CatalogueEntry } from "@/components/halls/hall-editor";
import { PageLoading, PageShell } from "@/components/page-shell";
import { SessionPlans } from "@/components/plans/session-plans";
import { formatDayMonthLong, shortTime, weekdayOf } from "@/lib/dates";
import { listEquipment } from "@/lib/data/equipment";
import { listAllConfigurations } from "@/lib/data/equipment-configurations";
import { getSessionPlansPage } from "@/lib/data/session-plans";

/**
 * A session's drawn plans (docs/implementation-plan.md, step 10): the main
 * plan and plans for chosen parts, drawn in the session's hall. Edited on a
 * desktop with edit access; shown read-only otherwise.
 */
export default function SessionPlansPage({ params }: PageProps<"/sessions/[sessionId]/plans">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SessionPlansContent params={params} />
    </Suspense>
  );
}

async function SessionPlansContent({
  params,
}: {
  params: PageProps<"/sessions/[sessionId]/plans">["params"];
}) {
  const { sessionId } = await params;
  const page = await getSessionPlansPage(sessionId);
  const { session, group, season } = page;
  const [t, tw] = await Promise.all([getTranslations("Plans"), getTranslations("Weekdays")]);

  let catalogue: CatalogueEntry[] = [];
  if (page.canEdit) {
    const [entries, configurations] = await Promise.all([listEquipment(), listAllConfigurations()]);
    catalogue = entries.flatMap((e) => {
      const list = configurations.get(e.id) ?? [];
      return list.length > 0 ? [{ id: e.id, name: e.name, configurations: list }] : [];
    });
  }

  const day = `${tw(`d${weekdayOf(session.date)}` as "d1")} ${formatDayMonthLong(session.date)}`;
  const start = shortTime(session.startTime);
  const end = shortTime(session.endTime);
  const time = start && end ? `${start}–${end}` : (start ?? end);
  const backHref = page.canOpenSeason
    ? `/seasons/${season.id}/weeks/${session.weekStart}`
    : `/sessions/${session.id}`;

  return (
    <PageShell
      wide
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name, href: page.canOpenSeason ? `/seasons/${season.id}` : undefined },
        { label: day, href: `/sessions/${session.id}` },
        { label: t("heading") },
      ]}
    >
      <SessionPlans
        page={page}
        catalogue={catalogue}
        header={{
          title: t("pageTitle", { session: day }),
          time,
          backHref,
          backLabel: page.canOpenSeason ? t("backToWeek") : t("backToSession"),
        }}
      />
    </PageShell>
  );
}
