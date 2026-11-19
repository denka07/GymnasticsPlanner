import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ScaleBar } from "@/components/drawing/configuration-drawing";
import {
  ConfigurationPreviews,
  previewScale,
} from "@/components/library/configuration-previews";
import { ConfigurationsEditor } from "@/components/library/configurations-editor";
import { PageLoading, PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { getEquipmentDetails } from "@/lib/data/equipment-configurations";

/** Each drawing fits this box, in pixels (narrow enough for a 375 px phone); at most this many pixels per metre. */
const PREVIEW_BOX = { width: 300, height: 220 };
const PREVIEW_MAX_SCALE = 150;

export default function EquipmentDetailsPage({
  params,
}: PageProps<"/library/equipment/[equipmentId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EquipmentDetailsContent params={params} />
    </Suspense>
  );
}

async function EquipmentDetailsContent({
  params,
}: {
  params: PageProps<"/library/equipment/[equipmentId]">["params"];
}) {
  const { equipmentId } = await params;
  const [user, details, tl, te, t] = await Promise.all([
    requireUser(),
    getEquipmentDetails(equipmentId),
    getTranslations("Library"),
    getTranslations("Equipment"),
    getTranslations("Configurations"),
  ]);
  const scale = previewScale(details.configurations, PREVIEW_BOX, PREVIEW_MAX_SCALE);

  return (
    <PageShell
      crumbs={[
        { label: tl("heading"), href: "/library" },
        { label: tl("tabs.equipment"), href: "/library/equipment" },
        { label: details.name },
      ]}
    >
      <div className="grid w-full gap-6">
        <div className="grid gap-1">
          <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight break-words">
            {details.name}
          </h1>
          <p className="text-muted-foreground">{te("usedBy", { count: details.stationCount })}</p>
        </div>
        <p className="max-w-3xl">{t("intro")}</p>
        {!user.isAdmin && (
          <p className="max-w-3xl rounded-lg border bg-muted/40 px-3 py-2.5">{t("readOnly")}</p>
        )}

        {details.configurations.length > 0 ? (
          <section aria-labelledby="preview-heading" className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="preview-heading" className="font-heading text-xl font-semibold">
                {t("preview")}
              </h2>
              <ScaleBar scale={scale} label={t("scaleBar")} />
            </div>
            <div className="rounded-lg border bg-card p-4 sm:p-5">
              <ConfigurationPreviews
                configurations={details.configurations}
                scale={scale}
                className="gap-x-8 gap-y-5"
              />
            </div>
          </section>
        ) : (
          // Administrators are told in the list of configurations below.
          !user.isAdmin && <p>{t("empty")}</p>
        )}

        {user.isAdmin && (
          <ConfigurationsEditor equipmentId={details.id} configurations={details.configurations} />
        )}
      </div>
    </PageShell>
  );
}
