import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EquipmentAdmin } from "@/components/library/equipment-admin";
import { LibraryTabs } from "@/components/library/library-tabs";
import { PageLoading, PageShell } from "@/components/page-shell";
import { requireUser } from "@/lib/auth";
import { listEquipment } from "@/lib/data/equipment";

export default function EquipmentPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <EquipmentContent />
    </Suspense>
  );
}

async function EquipmentContent() {
  const [user, entries, t, tl] = await Promise.all([
    requireUser(),
    listEquipment(),
    getTranslations("Equipment"),
    getTranslations("Library"),
  ]);

  return (
    <PageShell crumbs={[{ label: tl("heading"), href: "/library" }, { label: tl("tabs.equipment") }]}>
      <LibraryTabs current="equipment" />
      {user.isAdmin ? (
        <EquipmentAdmin entries={entries} />
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground">{t("intro")}</p>
          {entries.length === 0 ? (
            <p>{t("empty")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border bg-card px-4 py-3">
                  {entry.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageShell>
  );
}
