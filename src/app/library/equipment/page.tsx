import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ScaleBar } from "@/components/drawing/configuration-drawing";
import { previewScale } from "@/components/library/configuration-previews";
import { EquipmentAdmin, EquipmentList } from "@/components/library/equipment-admin";
import { LibraryTabs } from "@/components/library/library-tabs";
import { PageLoading, PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { listEquipment } from "@/lib/data/equipment";
import { listAllConfigurations } from "@/lib/data/equipment-configurations";

/** Each preview fits this box, in pixels; at most this many pixels per metre. */
const PREVIEW_BOX = { width: 150, height: 90 };
const PREVIEW_MAX_SCALE = 60;

export default function EquipmentPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <EquipmentContent />
    </Suspense>
  );
}

async function EquipmentContent() {
  const [user, entries, configurations, t, tl, tc] = await Promise.all([
    requireUser(),
    listEquipment(),
    listAllConfigurations(),
    getTranslations("Equipment"),
    getTranslations("Library"),
    getTranslations("Configurations"),
  ]);
  const withConfigurations = entries.map((entry) => ({
    ...entry,
    configurations: configurations.get(entry.id) ?? [],
  }));
  // One scale for the whole list, so sizes compare.
  const scale = previewScale([...configurations.values()].flat(), PREVIEW_BOX, PREVIEW_MAX_SCALE);
  const scaleBar =
    configurations.size > 0 ? (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {t("scale")}
        <ScaleBar scale={scale} label={tc("scaleBar")} />
      </p>
    ) : null;

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.equipment") }]}>
      <LibraryTabs current="equipment" />
      {user.isAdmin ? (
        <EquipmentAdmin entries={withConfigurations} scale={scale} scaleBar={scaleBar} />
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground">{t("intro")}</p>
          {scaleBar}
          <EquipmentList entries={withConfigurations} scale={scale} />
        </div>
      )}
    </PageShell>
  );
}
