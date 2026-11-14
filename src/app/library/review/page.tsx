import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { LibraryTabs } from "@/components/library/library-tabs";
import { PageLoading, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { listPendingSubmissions } from "@/lib/data/submissions";
import { formatSubmissionDate } from "@/lib/library";

/** Administrators' list of pending submissions. Others get "not found". */
export default function ReviewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ReviewContent />
    </Suspense>
  );
}

async function ReviewContent() {
  // Checks that the user is an administrator before anything is shown.
  const submissions = await listPendingSubmissions();
  const tl = await getTranslations("Library");

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.review") }]}>
      <LibraryTabs current="review" />
      {submissions.length === 0 ? (
        <div className="grid gap-1 rounded-xl border bg-muted/40 p-4">
          <p className="font-semibold">{tl("reviewEmptyTitle")}</p>
          <p className="text-muted-foreground">{tl("reviewEmptyText")}</p>
        </div>
      ) : (
        <ul aria-label={tl("reviewListLabel")} className="grid gap-3 lg:grid-cols-2">
          {submissions.map((s) => (
            <li key={s.id}>
              <Link
                href={
                  s.kind === "station"
                    ? `/library/stations/${s.itemId}`
                    : `/library/exercises/${s.itemId}`
                }
                className="grid h-full gap-1 rounded-xl border bg-card px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.itemName}
                  <Badge variant="outline">
                    {s.kind === "station" ? tl("kindStation") : tl("kindExercise")}
                  </Badge>
                </span>
                <span className="text-muted-foreground">
                  {tl("submittedBy", {
                    name: s.submitterName,
                    date: formatSubmissionDate(s.submittedAt),
                  })}
                </span>
                {s.includedCount > 0 && (
                  <span className="text-muted-foreground">
                    {tl("reviewIncludedCount", { count: s.includedCount })}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
