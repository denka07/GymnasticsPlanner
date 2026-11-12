"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactElement } from "react";

import { copySeasonAction } from "@/app/plan-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CopySeasonInput } from "@/lib/data/schemas";
import {
  isValidIsoWeek,
  weekCount,
  weekInputToMonday,
  type WeekInput,
} from "@/lib/season-weeks";

import { useErrorMessage } from "./use-error-message";
import { WeekFields } from "./season-dialog";

type FormState = {
  name: string;
  firstYear: string;
  firstWeek: string;
  lastYear: string;
  lastWeek: string;
  groupId: string;
  includeAllocations: boolean;
};

function toNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toInput(state: FormState): CopySeasonInput {
  return {
    name: state.name,
    firstWeek: { year: toNumber(state.firstYear), week: toNumber(state.firstWeek) },
    lastWeek: { year: toNumber(state.lastYear), week: toNumber(state.lastWeek) },
    groupId: state.groupId,
    includeAllocations: state.includeAllocations,
  };
}

/**
 * Copies a season: asks for the name, weeks and group of the copy, and
 * whether the focus planning comes along. Goes to the new season afterwards.
 * `groups` are the groups the person may add seasons to.
 */
export function CopySeasonDialog({
  trigger,
  sourceSeasonId,
  sourceName,
  firstWeek,
  lastWeek,
  groups,
  defaultGroupId,
}: {
  trigger: ReactElement;
  sourceSeasonId: string;
  sourceName: string;
  /** The weeks of the source season; the copy starts out a year later. */
  firstWeek: WeekInput;
  lastWeek: WeekInput;
  groups: { id: string; name: string }[];
  defaultGroupId: string;
}) {
  const t = useTranslations("Seasons");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => initialState());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function initialState(): FormState {
    const groupId = groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : (groups[0]?.id ?? "");
    return {
      name: t("copyDefaultName", { name: sourceName }),
      firstYear: String(firstWeek.year + 1),
      firstWeek: String(firstWeek.week),
      lastYear: String(lastWeek.year + 1),
      lastWeek: String(lastWeek.week),
      groupId,
      includeAllocations: false,
    };
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setState(initialState());
      setError(null);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      // On success the action redirects to the new season.
      const result = await copySeasonAction(sourceSeasonId, toInput(state));
      if (result && !result.ok) {
        setError(errorMessage(result.error));
      }
    });
  }

  const input = toInput(state);
  const count =
    isValidIsoWeek(input.firstWeek) && isValidIsoWeek(input.lastWeek)
      ? weekCount(weekInputToMonday(input.firstWeek), weekInputToMonday(input.lastWeek))
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t("copyTitle", { name: sourceName })}</DialogTitle>
            <DialogDescription>{t("copyIntro")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("copyNameLabel")}</Label>
            <Input
              id={`${id}-name`}
              value={state.name}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <WeekFields
              id={`${id}-first`}
              legend={t("firstWeek")}
              year={state.firstYear}
              week={state.firstWeek}
              onYear={(v) => set("firstYear", v)}
              onWeek={(v) => set("firstWeek", v)}
            />
            <WeekFields
              id={`${id}-last`}
              legend={t("lastWeek")}
              year={state.lastYear}
              week={state.lastWeek}
              onYear={(v) => set("lastYear", v)}
              onWeek={(v) => set("lastWeek", v)}
            />
          </div>
          {count > 0 && <p className="-mt-3 text-sm text-muted-foreground">{t("weekCount", { count })}</p>}

          <div className="grid gap-2">
            <Label htmlFor={`${id}-group`}>{t("copyGroupLabel")}</Label>
            <NativeSelect
              id={`${id}-group`}
              value={state.groupId}
              onChange={(e) => set("groupId", e.target.value)}
              className="w-full"
            >
              {groups.map((g) => (
                <NativeSelectOption key={g.id} value={g.id}>
                  {g.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`${id}-plan`} className="font-normal">
              <Checkbox
                id={`${id}-plan`}
                checked={state.includeAllocations}
                onCheckedChange={(checked) => set("includeAllocations", checked === true)}
              />
              {t("copyIncludePlan")}
            </Label>
            <p className="pl-6 text-xs text-muted-foreground">{t("copyIncludePlanHelp")}</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending || state.groupId === ""}>
              {pending ? t("copying") : t("copySubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
