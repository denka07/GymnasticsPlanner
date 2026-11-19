"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useState, useTransition } from "react";

import {
  createPlanAction,
  deletePlanAction,
  setSessionHallAction,
  updatePlanSettingsAction,
} from "@/app/session-plan-actions";
import type { CatalogueEntry } from "@/components/halls/hall-editor";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { useErrorMessage } from "@/components/plan/use-error-message";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SessionPlansPage } from "@/lib/data/session-plans";
import type { LoadedPlan } from "@/lib/data/session-plans";
import type { LoadedPart } from "@/lib/outline";
import {
  linkedActivityIds,
  MAX_PLAN_NAME_LENGTH,
  partsOfPlan,
  stationNumbers,
  type DrawnPlanItem,
} from "@/lib/session-plans";
import { cn } from "@/lib/utils";

import { PlanDrawing } from "./plan-drawing";
import { outlineOf, PlanEditor } from "./plan-editor";
import { PlanText } from "./plan-text";

/*
 * The body of a session's plans page (docs/implementation-plan.md, step 10):
 * the session's hall, its plans, the selected plan in the editor (on a
 * desktop with edit access) or drawn read-only, and the text of the parts it
 * applies to with the stations' numbers.
 */

type Translate = ReturnType<typeof useTranslations<"Plans">>;

/** A plan's name as lists show it. */
function nameOf(plan: LoadedPlan, parts: readonly LoadedPart[], t: Translate): string {
  if (plan.name) {
    return plan.name;
  }
  if (plan.isMain) {
    return t("mainPlan");
  }
  const titles = parts.filter((p) => plan.partIds.includes(p.id)).map((p) => p.title);
  return titles.length > 0 ? t("partPlan", { parts: titles.join(", ") }) : t("partPlanUnnamed");
}

export function SessionPlans({
  page,
  catalogue,
}: {
  page: SessionPlansPage;
  catalogue: CatalogueEntry[];
}) {
  const t = useTranslations("Plans");
  const { plans, parts, hall } = page;
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [live, setLive] = useState<{ planId: string; items: DrawnPlanItem[] } | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const selected = plans.find((p) => p.id === selectedId) ?? plans[0] ?? null;
  const outline = useMemo(() => outlineOf(parts), [parts]);
  const partsOf = useCallback(
    (plan: LoadedPlan) => {
      const ids = new Set(partsOfPlan(plan, plans, outline).map((p) => p.id));
      return parts.filter((p) => ids.has(p.id));
    },
    [plans, outline, parts],
  );
  const selectedParts = selected ? partsOf(selected) : [];
  const shownItems = selected ? (live?.planId === selected.id ? live.items : selected.items) : [];
  const numbers = stationNumbers(outlineOf(selectedParts), linkedActivityIds(shownItems));
  const onItemsChange = useCallback(
    (items: DrawnPlanItem[]) => selected && setLive({ planId: selected.id, items }),
    [selected],
  );

  function select(planId: string) {
    if (planId === selected?.id) {
      return;
    }
    if (dirty) {
      setSwitchTo(planId);
    } else {
      setSelectedId(planId);
      setLive(null);
    }
  }

  const selectedName = selected ? nameOf(selected, parts, t) : "";
  const initials = { coach: t("initials.coach"), passare: t("initials.passare") };

  return (
    <div className="grid gap-5">
      <HallBar page={page} />

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-5">
          <nav aria-label={t("listLabel")} className="grid gap-2">
            {plans.length === 0 ? (
              <p className="text-muted-foreground">{page.canEdit ? t("empty") : t("emptyReadOnly")}</p>
            ) : (
              <ul className="grid gap-1.5">
                {plans.map((plan) => {
                  const own = partsOf(plan);
                  const orphan = !plan.isMain && plan.partIds.length === 0;
                  const current = plan.id === selected?.id;
                  return (
                    <li key={plan.id}>
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => select(plan.id)}
                        className={cn(
                          "grid w-full gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60",
                          current && "border-primary bg-primary/5 ring-1 ring-primary",
                        )}
                      >
                        <span className="font-medium break-words">{nameOf(plan, parts, t)}</span>
                        <span className="text-sm text-muted-foreground">
                          {orphan ? (
                            <Badge variant="destructive">{t("noParts")}</Badge>
                          ) : plan.isMain ? (
                            plans.some((p) => !p.isMain) ? (
                              t("appliesToRest", { count: own.length })
                            ) : (
                              t("appliesToAll")
                            )
                          ) : (
                            t("appliesTo", { parts: own.map((p) => p.title).join(", ") })
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t("itemCount", { count: plan.items.length })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {page.canEdit && (
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={!hall}
                onClick={() => setCreating(true)}
              >
                <PlusIcon data-icon="inline-start" />
                {t("newPlan")}
              </Button>
            )}
          </nav>
          {selected && <PlanText parts={selectedParts} numbers={numbers} />}
        </aside>

        <div className="grid min-w-0 content-start gap-4">
          {selected && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="font-heading text-xl font-semibold break-words">{selectedName}</h2>
                  {!selected.isMain && selected.partIds.length === 0 && (
                    <p className="max-w-prose text-sm text-muted-foreground">{t("noPartsHint")}</p>
                  )}
                </div>
                {page.canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={dirty}
                      title={dirty ? t("saveFirst") : undefined}
                      onClick={() => setEditing(true)}
                    >
                      <PencilIcon data-icon="inline-start" />
                      {selected.isMain ? t("rename") : t("settings")}
                    </Button>
                    <ConfirmDelete
                      trigger={
                        <Button type="button" variant="outline">
                          <Trash2Icon data-icon="inline-start" />
                          {t("delete")}
                        </Button>
                      }
                      title={t("deleteTitle", { plan: selectedName })}
                      description={t("deleteText")}
                      action={async () => {
                        await deletePlanAction(selected.id);
                        setDirty(false);
                        setLive(null);
                        setSelectedId(plans.find((p) => p.id !== selected.id)?.id ?? null);
                      }}
                    />
                  </div>
                )}
              </div>

              {!hall ? null : page.canEdit ? (
                <>
                  <div className="hidden lg:block">
                    <PlanEditor
                      key={`${selected.id}:${selected.partIds.join(",")}`}
                      plan={selected}
                      planName={selectedName}
                      hall={hall}
                      parts={selectedParts}
                      stations={page.stations}
                      catalogue={catalogue}
                      onDirtyChange={setDirty}
                      onItemsChange={onItemsChange}
                    />
                  </div>
                  <div className="grid gap-2 lg:hidden">
                    <p className="rounded-lg border bg-muted/40 px-3 py-2.5">{t("desktopOnly")}</p>
                    <PlanDrawing
                      hall={hall}
                      items={selected.items}
                      numbers={numbers}
                      initials={initials}
                      label={t("drawingLabel", { plan: selectedName, hall: hall.name })}
                      className="rounded-lg border"
                    />
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  <p className="rounded-lg border bg-muted/40 px-3 py-2.5">{t("readOnly")}</p>
                  <PlanDrawing
                    hall={hall}
                    items={selected.items}
                    numbers={numbers}
                    initials={initials}
                    label={t("drawingLabel", { plan: selectedName, hall: hall.name })}
                    className="max-w-5xl rounded-lg border"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {page.canEdit && (
        <PlanFormDialog
          open={creating}
          onOpenChange={setCreating}
          plans={plans}
          parts={parts}
          nameOf={(p) => nameOf(p, parts, t)}
          onCreated={(planId) => {
            setSelectedId(planId);
            setLive(null);
            setDirty(false);
          }}
          sessionId={page.session.id}
        />
      )}
      {page.canEdit && selected && (
        <PlanFormDialog
          key={`settings-${selected.id}`}
          open={editing}
          onOpenChange={setEditing}
          plans={plans}
          parts={parts}
          nameOf={(p) => nameOf(p, parts, t)}
          editing={selected}
          sessionId={page.session.id}
        />
      )}

      <AlertDialog open={switchTo !== null} onOpenChange={(open) => !open && setSwitchTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("discardText", { plan: selectedName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setSelectedId(switchTo);
                setSwitchTo(null);
                setDirty(false);
                setLive(null);
              }}
            >
              {t("discard")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The session's hall: shown, chosen when missing, changed with edit access. */
function HallBar({ page }: { page: SessionPlansPage }) {
  const t = useTranslations("Plans");
  const id = useId();
  const errorMessage = useErrorMessage();
  const [hallId, setHallId] = useState(page.session.hallId ?? "");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setSessionHallAction(page.session.id, hallId);
      if (result.ok) {
        setError(null);
        setChanging(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  const chooser = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-hall`}>{t("hallLabel")}</Label>
        <NativeSelect id={`${id}-hall`} value={hallId} onChange={(e) => setHallId(e.target.value)}>
          <NativeSelectOption value="">{t("chooseHall")}</NativeSelectOption>
          {page.halls.map((h) => (
            <NativeSelectOption key={h.id} value={h.id}>
              {h.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" disabled={!hallId || hallId === page.session.hallId || pending} onClick={save}>
        {pending ? t("savingHall") : t("setHall")}
      </Button>
      {page.hall && (
        <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
          {t("cancel")}
        </Button>
      )}
      {error && (
        <p role="alert" className="basis-full text-destructive">
          {error}
        </p>
      )}
    </div>
  );

  if (!page.hall) {
    return (
      <section className="grid max-w-3xl gap-3 rounded-lg border bg-muted/40 p-4">
        {page.canEdit ? (
          <>
            <p>{t("hallMissing")}</p>
            {page.halls.length === 0 ? <p className="text-muted-foreground">{t("noHalls")}</p> : chooser}
          </>
        ) : (
          <p>{t("hallMissingReadOnly")}</p>
        )}
      </section>
    );
  }
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {changing ? (
        <div className="grid gap-1">
          {chooser}
          <p className="text-sm text-muted-foreground">{t("hallHint")}</p>
        </div>
      ) : (
        <>
          <p>
            <span className="text-muted-foreground">{t("hallLabel")}: </span>
            <span className="font-medium">{page.hall.name}</span>
          </p>
          {page.canEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
              {t("changeHall")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/** Adds a plan, or changes a plan's name and parts. */
function PlanFormDialog({
  open,
  onOpenChange,
  plans,
  parts,
  nameOf,
  editing,
  onCreated,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: readonly LoadedPlan[];
  parts: readonly LoadedPart[];
  nameOf: (plan: LoadedPlan) => string;
  /** The plan whose settings are changed; a new plan without. */
  editing?: LoadedPlan;
  onCreated?: (planId: string) => void;
  sessionId: string;
}) {
  const t = useTranslations("Plans");
  const tc = useTranslations("Common");
  const id = useId();
  const errorMessage = useErrorMessage();
  const hasMain = plans.some((p) => p.isMain);
  const [wantsMain, setMain] = useState(!hasMain);
  // A main plan made meanwhile (or by this dialog) leaves only part plans to add.
  const main = editing ? editing.isMain : wantsMain && !hasMain;
  const [chosen, setChosen] = useState<string[]>(editing?.partIds ?? []);
  const [name, setName] = useState(editing?.name ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** The part plan that has the part now, other than the one edited. */
  const owner = (partId: string) => plans.find((p) => !p.isMain && p.id !== editing?.id && p.partIds.includes(partId));

  function reset() {
    setMain(true);
    setChosen(editing?.partIds ?? []);
    setName(editing?.name ?? "");
    setCopyFrom("");
    setError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const partIds = main ? [] : parts.filter((p) => chosen.includes(p.id)).map((p) => p.id);
      if (editing) {
        const result = await updatePlanSettingsAction(editing.id, {
          name: name || null,
          ...(editing.isMain ? {} : { partIds }),
        });
        if (!result.ok) {
          setError(errorMessage(result.error));
          return;
        }
      } else {
        const result = await createPlanAction(sessionId, {
          main,
          partIds,
          name: name || null,
          copyFromPlanId: copyFrom || null,
        });
        if (!result.ok) {
          setError(errorMessage(result.error));
          return;
        }
        onCreated?.(result.planId);
      }
      onOpenChange(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? t("settingsTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>{editing ? t("settingsIntro") : t("newIntro")}</DialogDescription>
          </DialogHeader>

          {!editing && (
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("kindLabel")}</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`${id}-kind`}
                  className="mt-1 accent-primary"
                  checked={main}
                  disabled={hasMain}
                  onChange={() => setMain(true)}
                />
                <span className={cn(hasMain && "text-muted-foreground")}>
                  {t("kindMain")}
                  {hasMain && <span className="block text-sm">{t("mainExists")}</span>}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`${id}-kind`}
                  className="mt-1 accent-primary"
                  checked={!main}
                  onChange={() => setMain(false)}
                />
                <span>{t("kindParts")}</span>
              </label>
            </fieldset>
          )}

          {!main && (
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t("partsLabel")}</legend>
              {parts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noPartsInSession")}</p>
              ) : (
                <ul className="grid gap-1.5">
                  {parts.map((part) => {
                    const other = owner(part.id);
                    return (
                      <li key={part.id}>
                        <Label className="flex items-start gap-2 font-normal">
                          <Checkbox
                            aria-label={part.title}
                            className="mt-0.5"
                            checked={chosen.includes(part.id)}
                            onCheckedChange={(checked) =>
                              setChosen((c) => (checked === true ? [...c, part.id] : c.filter((x) => x !== part.id)))
                            }
                          />
                          <span>
                            {part.title}
                            {other && (
                              <span className="block text-sm text-muted-foreground">
                                {t("partTaken", { plan: nameOf(other) })}
                              </span>
                            )}
                          </span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>
              {t("nameLabel")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={MAX_PLAN_NAME_LENGTH}
              placeholder={t("namePlaceholder")}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {!editing && plans.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-start`}>{t("startLabel")}</Label>
              <NativeSelect id={`${id}-start`} className="w-full" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <NativeSelectOption value="">{t("startEmpty")}</NativeSelectOption>
                {plans.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {t("startCopy", { plan: nameOf(p) })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}

          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending || (!main && chosen.length === 0)}>
              {pending ? tc("saving") : editing ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
