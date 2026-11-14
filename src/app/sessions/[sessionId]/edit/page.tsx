import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageLoading, PageShell } from "@/components/page-shell";
import { ActivityLibraryProvider } from "@/components/session/activity-library";
import { SessionColumn } from "@/components/session/session-column";
import { Button } from "@/components/ui/button";
import { formatDayMonthLong, weekdayOf } from "@/lib/dates";
import { getSessionEditor } from "@/lib/data/sessions";
import { weekdayDate } from "@/lib/weeks";

/**
 * Edits one session on its own, for a help coach who has edit access to just
 * this session (not its season). Whoever can open the season edits on the
 * week page instead and is sent there.
 */
export default function SessionEditPage({ params }: PageProps<"/sessions/[sessionId]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SessionEditContent params={params} />
    </Suspense>
  );
}

async function SessionEditContent({
  params,
}: {
  params: PageProps<"/sessions/[sessionId]/edit">["params"];
}) {
  const { sessionId } = await params;
  const editor = await getSessionEditor(sessionId);
  const { session, season, group, weekStart } = editor;
  if (editor.canOpenSeason) {
    redirect(`/seasons/${season.id}/weeks/${weekStart}`);
  }
  const t = await getTranslations();
  const heading = `${t(`Weekdays.d${weekdayOf(session.date)}` as "Weekdays.d1")} ${formatDayMonthLong(session.date)}`;

  return (
    <PageShell
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name },
        { label: heading, href: `/sessions/${session.id}` },
        { label: t("SessionPage.edit") },
      ]}
    >
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
            {heading}
          </h1>
          <Button variant="outline" nativeButton={false} render={<Link href={`/sessions/${session.id}`} />}>
            {t("Session.openSession")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("Session.hint")}</p>
        <ActivityLibraryProvider library={editor.library}>
          <SessionColumn
            data={{
              sessionId: session.id,
              trainingSlotId: session.trainingSlotId,
              date: session.date,
              startTime: session.startTime,
              endTime: session.endTime,
              location: session.location,
              isCancelled: session.isCancelled,
              noteAfter: session.noteAfter,
              parts: session.parts,
            }}
            seasonId={season.id}
            weekStart={weekStart}
            weekEnd={weekdayDate(weekStart, 7)}
            editable
            copySources={[]}
            canCopy={false}
            canDelete={false}
            showOpenLink={false}
          />
        </ActivityLibraryProvider>
      </div>
    </PageShell>
  );
}
