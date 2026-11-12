import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import {
  createSeasonAction,
  deleteGroupAction,
  renameGroupAction,
} from "@/app/plan-actions";
import { PageLoading, PageShell } from "@/components/page-shell";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { CopySeasonDialog } from "@/components/plan/copy-season-dialog";
import { NameDialog } from "@/components/plan/name-dialog";
import { SeasonDialog } from "@/components/plan/season-dialog";
import { weekRangeText } from "@/components/plan/season-summary";
import { Button } from "@/components/ui/button";
import { canEdit } from "@/lib/access";
import { getGroup, listEditableGroups } from "@/lib/data/groups";
import { mondayToWeekInput } from "@/lib/season-weeks";

export default function GroupPage({ params }: PageProps<"/groups/[groupId]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupContent params={params} />
    </Suspense>
  );
}

async function GroupContent({ params }: { params: PageProps<"/groups/[groupId]">["params"] }) {
  const { groupId } = await params;
  const { group, access, seasons } = await getGroup(groupId);
  const t = await getTranslations();
  const editable = canEdit(access);
  const ranges = await Promise.all(seasons.map(weekRangeText));
  const targetGroups = await listEditableGroups();

  return (
    <PageShell crumbs={[{ label: group.name }]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 font-heading text-2xl font-semibold tracking-tight break-words">
          {group.name}
        </h1>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <NameDialog
              trigger={
                <Button variant="outline">
                  <PencilIcon data-icon="inline-start" />
                  {t("Common.rename")}
                </Button>
              }
              title={t("Groups.renameTitle")}
              label={t("Groups.nameLabel")}
              initialName={group.name}
              submitLabel={t("Common.save")}
              action={renameGroupAction.bind(null, group.id)}
            />
            {access === "owner" && (
              <ConfirmDelete
                trigger={
                  <Button variant="destructive">
                    <Trash2Icon data-icon="inline-start" />
                    {t("Groups.deleteGroup")}
                  </Button>
                }
                title={t("Groups.deleteTitle", { name: group.name })}
                description={t("Groups.deleteText", {
                  name: group.name,
                  count: seasons.length,
                  seasons: seasons.map((s) => s.name).join(", "),
                })}
                action={deleteGroupAction.bind(null, group.id)}
              />
            )}
          </div>
        )}
      </div>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">{t("Groups.seasonsHeading")}</h2>
          {editable && (
            <SeasonDialog
              trigger={
                <Button>
                  <PlusIcon data-icon="inline-start" />
                  {t("Seasons.newSeason")}
                </Button>
              }
              title={t("Seasons.createTitle")}
              submitLabel={t("Common.create")}
              action={createSeasonAction.bind(null, group.id)}
            />
          )}
        </div>
        {seasons.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {t("Groups.noSeasons")}
          </p>
        ) : (
          <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
            {seasons.map((season, i) => (
              <li key={season.id} className="flex items-center hover:bg-muted">
                <Link
                  href={`/seasons/${season.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="font-medium">{season.name}</span>
                  <span className="text-sm text-muted-foreground">{ranges[i]}</span>
                </Link>
                {targetGroups.length > 0 && (
                  <CopySeasonDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 shrink-0"
                        aria-label={t("Seasons.copyLabel", { name: season.name })}
                        title={t("Seasons.copySeason")}
                      >
                        <CopyIcon />
                      </Button>
                    }
                    sourceSeasonId={season.id}
                    sourceName={season.name}
                    firstWeek={mondayToWeekInput(season.firstWeek)}
                    lastWeek={mondayToWeekInput(season.lastWeek)}
                    groups={targetGroups}
                    defaultGroupId={group.id}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
