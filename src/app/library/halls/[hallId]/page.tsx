import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { HallDrawing } from "@/components/drawing/hall-drawing";
import { HallEditor, type CatalogueEntry } from "@/components/halls/hall-editor";
import { PageLoading, PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { listEquipment } from "@/lib/data/equipment";
import { listAllConfigurations } from "@/lib/data/equipment-configurations";
import { getHall } from "@/lib/data/halls";
import { formatHallSize } from "@/lib/halls";

export default function HallPage({ params }: PageProps<"/library/halls/[hallId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <HallContent params={params} />
    </Suspense>
  );
}

async function HallContent({ params }: { params: PageProps<"/library/halls/[hallId]">["params"] }) {
  const { hallId } = await params;
  const [user, hall, tl, t, locale] = await Promise.all([
    requireUser(),
    getHall(hallId),
    getTranslations("Library"),
    getTranslations("Halls"),
    getLocale(),
  ]);
  const size = formatHallSize(hall.widthCm, hall.lengthCm, locale);
  let catalogue: CatalogueEntry[] = [];
  if (user.isAdmin) {
    const [entries, configurations] = await Promise.all([listEquipment(), listAllConfigurations()]);
    catalogue = entries.flatMap((e) => {
      const list = configurations.get(e.id) ?? [];
      return list.length > 0 ? [{ id: e.id, name: e.name, configurations: list }] : [];
    });
  }

  const drawing = (
    <div className="grid gap-2">
      <div className="max-w-3xl rounded-lg border bg-card p-3">
        <HallDrawing hall={hall} label={t("drawingLabel", { name: hall.name, size })} />
      </div>
      <p className="text-sm text-muted-foreground">{t("zoomHint")}</p>
    </div>
  );

  return (
    <PageShell
      wide={user.isAdmin}
      crumbs={[
        { label: tl("heading"), href: "/library" },
        { label: tl("tabs.halls"), href: "/library/halls" },
        { label: hall.name },
      ]}
    >
      <div className="grid gap-1">
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight break-words">
          {hall.name}
        </h1>
        <p className="text-muted-foreground tabular-nums">{size}</p>
      </div>
      {user.isAdmin ? (
        <>
          {/* The editor is made for a desktop; on smaller screens the hall is shown read-only. */}
          <div className="hidden lg:block">
            <HallEditor hall={hall} catalogue={catalogue} />
          </div>
          <div className="grid gap-3 lg:hidden">
            <p className="max-w-3xl rounded-lg border bg-muted/40 px-3 py-2.5">{t("desktopOnly")}</p>
            {drawing}
          </div>
        </>
      ) : (
        <div className="grid gap-3">
          <p className="max-w-3xl rounded-lg border bg-muted/40 px-3 py-2.5">{t("readOnly")}</p>
          {drawing}
        </div>
      )}
    </PageShell>
  );
}
