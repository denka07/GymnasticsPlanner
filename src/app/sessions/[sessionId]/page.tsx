import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { PageLoading, PageShell } from "@/components/page-shell";
import { SessionChecklist } from "@/components/session/session-checklist";
import { SessionNote } from "@/components/session/session-note";
import { ShareDialog } from "@/components/share/share-dialog";
import { Button } from "@/components/ui/button";
import { canEdit, canParticipate, isOwner } from "@/lib/access";
import { formatDayMonth, formatDayMonthLong, shortTime, weekdayOf } from "@/lib/dates";
import { getSessionView, type SessionNeighbour } from "@/lib/data/session-view";
import { mondayOf } from "@/lib/weeks";

export default function SessionPage({ params }: PageProps<"/sessions/[sessionId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SessionContent params={params} />
    </Suspense>
  );
}

async function SessionContent({ params }: { params: PageProps<"/sessions/[sessionId]">["params"] }) {
  const { sessionId } = await params;
  const view = await getSessionView(sessionId);
  const { session, group, season } = view;
  const t = await getTranslations("SessionPage");
  const tw = await getTranslations("Weekdays");
  const editable = canEdit(view.access);
  // Everyone who can view the session may tick parts and write the note.
  const participate = canParticipate(view.access);

  const weekday = tw(`d${weekdayOf(session.date)}` as "d1");
  const heading = `${weekday} ${formatDayMonthLong(session.date)}`;
  const start = shortTime(session.startTime);
  const end = shortTime(session.endTime);
  const time = start && end ? `${start}–${end}` : (start ?? end);
  // With only this session shared, edit it on its own page instead of the week page.
  const weekHref = view.canOpenSeason
    ? `/seasons/${season.id}/weeks/${mondayOf(session.date)}`
    : `/sessions/${session.id}/edit`;
  const hasParts = view.parts.length > 0;

  return (
    <PageShell
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name, href: view.canOpenSeason ? `/seasons/${season.id}` : undefined },
        { label: heading },
      ]}
    >
      <div className="mx-auto grid w-full max-w-2xl gap-5">
        <header className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
              {heading}
            </h1>
            <div className="flex flex-wrap justify-end gap-2">
              {isOwner(view.access) && (
                <ShareDialog kind="session" id={session.id} name={heading} />
              )}
              {editable && (
                <Button
                  variant="outline"
                  className="h-11 px-4 text-base"
                  nativeButton={false}
                  render={<Link href={weekHref} />}
                >
                  {t("edit")}
                </Button>
              )}
            </div>
          </div>
          {(time || session.location) && (
            <p className="text-lg">{[time, session.location].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-muted-foreground">
            {t("groupLine", { group: group.name, season: season.name })}
          </p>
          {session.isCancelled && (
            <div
              role="status"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-lg font-semibold text-destructive"
            >
              {t("cancelled")}
              <span className="sr-only">. {t("cancelledText")}</span>
            </div>
          )}
          <nav aria-label={t("navLabel")} className="grid grid-cols-2 gap-2">
            <NeighbourLink target={view.previous} direction="previous" />
            <NeighbourLink target={view.next} direction="next" />
          </nav>
        </header>

        {hasParts ? (
          <SessionChecklist
            key={`checklist-${session.id}`}
            sessionId={session.id}
            parts={view.parts}
            startTime={session.startTime}
            editable={participate}
          />
        ) : (
          <div className="grid justify-items-start gap-3 rounded-xl border bg-muted/40 p-4">
            <p className="text-lg">{t("empty")}</p>
            {editable && (
              <Button
                variant="outline"
                className="h-11 px-4 text-base"
                nativeButton={false}
                render={<Link href={weekHref} />}
              >
                {t("plan")}
              </Button>
            )}
          </div>
        )}

        {(participate || session.noteAfter) && (
          <SessionNote
            key={`note-${session.id}`}
            sessionId={session.id}
            initial={session.noteAfter ?? ""}
            editable={participate}
          />
        )}
      </div>
    </PageShell>
  );
}

async function NeighbourLink({
  target,
  direction,
}: {
  target: SessionNeighbour | null;
  direction: "previous" | "next";
}) {
  const t = await getTranslations("SessionPage");
  const tw = await getTranslations("Weekdays");
  const isPrevious = direction === "previous";
  const label = isPrevious ? t("previous") : t("next");
  const icon = isPrevious ? <ChevronLeftIcon data-icon="inline-start" /> : <ChevronRightIcon data-icon="inline-end" />;
  const className = "h-11 w-full px-3 text-base " + (isPrevious ? "justify-start" : "justify-end");

  if (!target) {
    return (
      <Button variant="outline" className={className} disabled>
        {isPrevious && icon}
        {label}
        {!isPrevious && icon}
      </Button>
    );
  }
  const date = `${tw(`d${weekdayOf(target.date)}` as "d1")} ${formatDayMonth(target.date)}`;
  return (
    <Button
      variant="outline"
      className={className}
      aria-label={isPrevious ? t("previousLabel", { date }) : t("nextLabel", { date })}
      nativeButton={false}
      render={<Link href={`/sessions/${target.id}`} />}
    >
      {isPrevious && icon}
      {label}
      {!isPrevious && icon}
    </Button>
  );
}
