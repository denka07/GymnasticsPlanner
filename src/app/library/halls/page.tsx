import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { HallDrawing } from "@/components/drawing/hall-drawing";
import { NewHallDialog } from "@/components/halls/new-hall-dialog";
import { LibraryTabs } from "@/components/library/library-tabs";
import { PageLoading, PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { listHalls } from "@/lib/data/halls";
import { formatHallSize } from "@/lib/halls";

export default function HallsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HallsContent />
    </Suspense>
  );
}

async function HallsContent() {
  const [user, halls, t, tl, locale] = await Promise.all([
    requireUser(),
    listHalls(),
    getTranslations("Halls"),
    getTranslations("Library"),
    getLocale(),
  ]);

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.halls") }]}>
      <LibraryTabs current="halls" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-muted-foreground">{user.isAdmin ? t("introAdmin") : t("intro")}</p>
        {user.isAdmin && <NewHallDialog />}
      </div>
      {halls.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((hall) => {
            const size = formatHallSize(hall.widthCm, hall.lengthCm, locale);
            return (
              <li key={hall.id}>
                <Link
                  href={`/library/halls/${hall.id}`}
                  className="grid gap-3 rounded-xl border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="grid gap-0.5">
                    <span className="font-heading text-lg font-semibold break-words">{hall.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {size}, {t("featureCount", { count: hall.features.length })}
                    </span>
                  </span>
                  <span className="mx-auto block w-full max-w-56">
                    <HallDrawing
                      hall={hall}
                      labels={false}
                      label={t("drawingLabel", { name: hall.name, size })}
                      className="max-h-64"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
