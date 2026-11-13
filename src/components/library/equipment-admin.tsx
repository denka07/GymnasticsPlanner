"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
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

type Entry = { id: string; name: string; stationCount: number };

/** The equipment catalogue with add, rename and delete, for administrators. */
export function EquipmentAdmin({ entries }: { entries: Entry[] }) {
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
      {entries.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-4"
            >
              <span className="grid min-w-0 flex-1">
                <span className="break-words">{entry.name}</span>
                <span className="text-[0.9375rem] text-muted-foreground">
                  {t("usedBy", { count: entry.stationCount })}
                </span>
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
