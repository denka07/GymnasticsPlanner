import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageLoading, PageShell } from "@/components/page-shell";
import { PlanDrawing } from "@/components/plans/plan-drawing";
import { personInitials, planName, planNumbers, planParts } from "@/components/plans/plan-names";
import { PlanText } from "@/components/plans/plan-text";
import { PrintToolbar } from "@/components/plans/print-toolbar";
import { formatDayMonthLong, shortTime, weekdayOf } from "@/lib/dates";
import { getSessionPlansPage } from "@/lib/data/session-plans";
import { pageOrientation, printChoice, printedPlans, readingOrder } from "@/lib/plan-reading";

/**
 * A session's plans for printing or saving as PDF (docs/implementation-plan.md,
 * step 11): every plan, or the one in `?plan=`, each on its own page with
 * its drawing as large as fits and then its parts' numbered activities.
 * Anyone with view access may print.
 */
export default function PrintPlansPage({ params, searchParams }: PageProps<"/sessions/[sessionId]/plans/print">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PrintPlansContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintPlansContent({
  params,
  searchParams,
}: {
  params: PageProps<"/sessions/[sessionId]/plans/print">["params"];
  searchParams: PageProps<"/sessions/[sessionId]/plans/print">["searchParams"];
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const page = await getSessionPlansPage(sessionId, { reading: true });
  const { session, group, season, hall, parts, plans } = page;
  const [t, tp, tw] = await Promise.all([
    getTranslations("PlanPrint"),
    getTranslations("Plans"),
    getTranslations("Weekdays"),
  ]);

  const partIds = parts.map((p) => p.id);
  const choice = printChoice(query.plan, plans);
  const printed = printedPlans(plans, partIds, choice);
  const initials = personInitials(tp);
  const day = `${tw(`d${weekdayOf(session.date)}` as "d1")} ${formatDayMonthLong(session.date)}`;
  const start = shortTime(session.startTime);
  const end = shortTime(session.endTime);
  const time = start && end ? `${start}–${end}` : (start ?? end);

  return (
    <PageShell
      wide
      crumbs={[
        { label: group.name, href: `/groups/${group.id}` },
        { label: season.name, href: page.canOpenSeason ? `/seasons/${season.id}` : undefined },
        { label: day, href: `/sessions/${session.id}` },
        { label: tp("heading"), href: `/sessions/${session.id}/plans` },
        { label: t("heading") },
      ]}
    >
      <div className="mx-auto grid w-full max-w-5xl gap-6 print:max-w-none print:gap-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight print:hidden">
          {t("pageTitle", { session: day })}
        </h1>
        {plans.length > 0 && (
          <PrintToolbar
            sessionId={session.id}
            plans={readingOrder(plans, partIds).map((p) => ({ id: p.id, name: planName(p, parts, tp) }))}
            choice={choice}
            backHref={`/sessions/${session.id}/plans`}
          />
        )}
        {plans.length === 0 ? (
          <p className="text-muted-foreground">{t("noPlans")}</p>
        ) : !hall ? (
          <p className="text-muted-foreground">{t("noHall")}</p>
        ) : (
          <div className="grid gap-8 print:block">
            {printed.map((plan) => {
              const name = planName(plan, parts, tp);
              const headingId = `print-plan-${plan.id}`;
              return (
                <section
                  key={plan.id}
                  aria-labelledby={headingId}
                  data-orientation={pageOrientation(hall)}
                  className="print-plan grid gap-3 rounded-lg border p-4 print:block print:rounded-none print:border-0 print:p-0"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-x-4 print:mb-2">
                    <h2 id={headingId} className="font-heading text-xl font-semibold">
                      {name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {[day, time, group.name, tp("hallLabel") + ": " + hall.name].filter(Boolean).join(" · ")}
                    </p>
                  </header>
                  <div className="print-drawing">
                    <PlanDrawing
                      hall={hall}
                      items={plan.items}
                      numbers={planNumbers(plan, plans, parts)}
                      initials={initials}
                      label={tp("drawingLabel", { plan: name, hall: hall.name })}
                      turned={false}
                      className="max-h-[80vh]"
                    />
                  </div>
                  <PlanText parts={planParts(plan, plans, parts)} numbers={planNumbers(plan, plans, parts)} className="print-text" />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
