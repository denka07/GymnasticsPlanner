"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  createDisciplineAction,
  createFocusItemAction,
  deleteDisciplineAction,
  deleteFocusItemAction,
  moveDisciplineAction,
  moveFocusItemAction,
  moveFocusItemToDisciplineAction,
  renameDisciplineAction,
  updateFocusItemAction,
} from "@/app/plan-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ActionResult } from "@/lib/action-result";

import { ConfirmDelete } from "./confirm-delete";
import { FocusItemDialog } from "./focus-item-dialog";
import { NameDialog } from "./name-dialog";
import { useErrorMessage } from "./use-error-message";

export type EditorFocusItem = { id: string; name: string; category: string | null };
export type EditorDiscipline = { id: string; name: string; focusItems: EditorFocusItem[] };

/** Manages a season's disciplines and their focus items. */
export function StructureEditor({
  seasonId,
  disciplines,
  categories,
}: {
  seasonId: string;
  disciplines: EditorDiscipline[];
  categories: string[];
}) {
  const t = useTranslations("Disciplines");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Runs a quick action (move, delete) and shows its error, if any. */
  function quick(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await work();
      setError(result.ok ? null : errorMessage(result.error));
    });
  }

  return (
    <section className="grid gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="font-heading text-xl font-semibold">{t("heading")}</h2>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <NameDialog
          trigger={
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t("add")}
            </Button>
          }
          title={t("addTitle")}
          label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          submitLabel={tc("add")}
          action={(name) => createDisciplineAction(seasonId, name)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {disciplines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="grid gap-4">
          {disciplines.map((discipline, index) => (
            <li key={discipline.id}>
              <DisciplineCard
                discipline={discipline}
                isFirst={index === 0}
                isLast={index === disciplines.length - 1}
                disciplines={disciplines}
                categories={categories}
                pending={pending}
                quick={quick}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DisciplineCard({
  discipline,
  isFirst,
  isLast,
  disciplines,
  categories,
  pending,
  quick,
}: {
  discipline: EditorDiscipline;
  isFirst: boolean;
  isLast: boolean;
  disciplines: EditorDiscipline[];
  categories: string[];
  pending: boolean;
  quick: (work: () => Promise<ActionResult>) => void;
}) {
  const t = useTranslations("Disciplines");
  const tf = useTranslations("FocusItems");
  const tc = useTranslations("Common");
  const items = discipline.focusItems;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{discipline.name}</CardTitle>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tc("moveUp")}: ${discipline.name}`}
            title={tc("moveUp")}
            disabled={isFirst || pending}
            onClick={() => quick(() => moveDisciplineAction(discipline.id, "up"))}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tc("moveDown")}: ${discipline.name}`}
            title={tc("moveDown")}
            disabled={isLast || pending}
            onClick={() => quick(() => moveDisciplineAction(discipline.id, "down"))}
          >
            <ChevronDownIcon />
          </Button>
          <NameDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${tc("rename")}: ${discipline.name}`}
                title={tc("rename")}
              >
                <PencilIcon />
              </Button>
            }
            title={t("renameTitle")}
            label={t("nameLabel")}
            initialName={discipline.name}
            submitLabel={tc("save")}
            action={(name) => renameDisciplineAction(discipline.id, name)}
          />
          <ConfirmDelete
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${tc("delete")}: ${discipline.name}`}
                title={tc("delete")}
              >
                <Trash2Icon />
              </Button>
            }
            title={t("deleteTitle", { name: discipline.name })}
            description={t("deleteText", { name: discipline.name, count: items.length })}
            action={() => deleteDisciplineAction(discipline.id)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tf("empty")}</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {items.map((item, index) => (
              <FocusItemRow
                key={item.id}
                item={item}
                disciplineId={discipline.id}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                disciplines={disciplines}
                categories={categories}
                pending={pending}
                quick={quick}
              />
            ))}
          </ol>
        )}
        <div>
          <FocusItemDialog
            trigger={
              <Button variant="outline" size="sm">
                <PlusIcon data-icon="inline-start" />
                {tf("add")}
              </Button>
            }
            title={tf("addTitle", { discipline: discipline.name })}
            submitLabel={tc("add")}
            categories={categories}
            action={(input) => createFocusItemAction(discipline.id, input)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FocusItemRow({
  item,
  disciplineId,
  isFirst,
  isLast,
  disciplines,
  categories,
  pending,
  quick,
}: {
  item: EditorFocusItem;
  disciplineId: string;
  isFirst: boolean;
  isLast: boolean;
  disciplines: EditorDiscipline[];
  categories: string[];
  pending: boolean;
  quick: (work: () => Promise<ActionResult>) => void;
}) {
  const tf = useTranslations("FocusItems");
  const tc = useTranslations("Common");
  const others = disciplines.filter((d) => d.id !== disciplineId);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-2">
        <span className="break-words">{item.name}</span>
        {item.category && <Badge variant="secondary">{item.category}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${tc("moveUp")}: ${item.name}`}
          title={tc("moveUp")}
          disabled={isFirst || pending}
          onClick={() => quick(() => moveFocusItemAction(item.id, "up"))}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${tc("moveDown")}: ${item.name}`}
          title={tc("moveDown")}
          disabled={isLast || pending}
          onClick={() => quick(() => moveFocusItemAction(item.id, "down"))}
        >
          <ChevronDownIcon />
        </Button>
        <FocusItemDialog
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${tc("edit")}: ${item.name}`}
              title={tc("edit")}
            >
              <PencilIcon />
            </Button>
          }
          title={tf("editTitle")}
          submitLabel={tc("save")}
          categories={categories}
          initial={{ name: item.name, category: item.category ?? "" }}
          action={(input) => updateFocusItemAction(item.id, input)}
        />
        <ConfirmDelete
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${tc("delete")}: ${item.name}`}
              title={tc("delete")}
            >
              <Trash2Icon />
            </Button>
          }
          title={tf("deleteTitle", { name: item.name })}
          description={tf("deleteText", { name: item.name })}
          action={() => deleteFocusItemAction(item.id)}
        />
        {others.length > 0 && (
          <NativeSelect
            size="sm"
            value=""
            disabled={pending}
            aria-label={tf("moveToLabel", { name: item.name })}
            onChange={(e) => {
              const target = e.target.value;
              if (target) {
                quick(() => moveFocusItemToDisciplineAction(item.id, target));
              }
            }}
          >
            <NativeSelectOption value="">{tf("moveTo")}</NativeSelectOption>
            {others.map((d) => (
              <NativeSelectOption key={d.id} value={d.id}>
                {d.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </div>
    </li>
  );
}
