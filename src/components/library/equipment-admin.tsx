"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";

import {
  createEquipmentAction,
  deleteEquipmentAction,
  renameEquipmentAction,
} from "@/app/library-actions";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { NameDialog } from "@/components/plan/name-dialog";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import type { ConfigurationItem } from "@/lib/data/equipment-configurations";

import { ConfigurationPreviews } from "./configuration-previews";

type Entry = {
  id: string;
  name: string;
  stationCount: number;
  configurations: ConfigurationItem[];
};

/** One catalogue entry: its name (a link to its page), its use and its configurations drawn to `scale`. */
function EntryCard({ entry, scale, actions }: { entry: Entry; scale: number; actions?: ReactNode }) {
  const t = useTranslations("Equipment");
  return (
    <li className="grid content-start gap-3 rounded-lg border bg-card py-2 pr-1.5 pl-4">
      <div className="flex items-center gap-2">
        <span className="grid min-w-0 flex-1">
          <Link
            href={`/library/equipment/${entry.id}`}
            className="flex min-h-11 items-center self-start rounded-sm font-medium break-words text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {entry.name}
          </Link>
          <span className="text-[0.9375rem] text-muted-foreground">
            {t("usedBy", { count: entry.stationCount })}
          </span>
        </span>
        {actions}
      </div>
      <div className="pr-2.5 pb-2">
        {entry.configurations.length > 0 ? (
          <ConfigurationPreviews configurations={entry.configurations} scale={scale} />
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">{t("noConfigurations")}</p>
        )}
      </div>
    </li>
  );
}

/** The catalogue as others see it: each entry with its configurations, no editing. */
export function EquipmentList({ entries, scale }: { entries: Entry[]; scale: number }) {
  const t = useTranslations("Equipment");
  if (entries.length === 0) {
    return <p>{t("empty")}</p>;
  }
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} scale={scale} />
      ))}
    </ul>
  );
}

/** The equipment catalogue with add, rename and delete, for administrators. */
export function EquipmentAdmin({
  entries,
  scale,
  scaleBar,
}: {
  entries: Entry[];
  scale: number;
  scaleBar?: ReactNode;
}) {
  const t = useTranslations("Equipment");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();

  async function remove(entry: Entry) {
    const result = await deleteEquipmentAction(entry.id);
    if (!result.ok) {
      toast.error(t("deleteFailed"), { description: errorMessage(result.error) });
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{t("adminIntro")}</p>
        <NameDialog
          trigger={
            <Button className="h-11 px-4">
              <PlusIcon data-icon="inline-start" />
              {t("new")}
            </Button>
          }
          title={t("createTitle")}
          label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          submitLabel={tc("create")}
          action={createEquipmentAction}
        />
      </div>
      {scaleBar}
      {entries.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              scale={scale}
              actions={
                <>
                  <NameDialog
                    trigger={
                      <Button
                        variant="ghost"
                        className="size-11 shrink-0"
                        aria-label={t("rename", { name: entry.name })}
                      >
                        <PencilIcon />
                      </Button>
                    }
                    title={t("renameTitle")}
                    label={t("nameLabel")}
                    initialName={entry.name}
                    submitLabel={tc("save")}
                    action={(name) => renameEquipmentAction(entry.id, name)}
                  />
                  <ConfirmDelete
                    trigger={
                      <Button
                        variant="ghost"
                        className="size-11 shrink-0 text-destructive"
                        aria-label={t("delete", { name: entry.name })}
                      >
                        <Trash2Icon />
                      </Button>
                    }
                    title={t("deleteTitle")}
                    description={t("deleteText", { name: entry.name })}
                    action={() => remove(entry)}
                  />
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
