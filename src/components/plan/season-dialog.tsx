"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import type { SeasonInput } from "@/lib/data/schemas";
import {
  isValidIsoWeek,
  weekCount,
  weekInputToMonday,
  type WeekInput,
} from "@/lib/season-weeks";
import { isoWeek } from "@/lib/weeks";

import { useErrorMessage } from "./use-error-message";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type DayState = { on: boolean; startTime: string; endTime: string; location: string };

type FormState = {
  name: string;
  firstYear: string;
  firstWeek: string;
  lastYear: string;
  lastWeek: string;
  days: Record<number, DayState>;
};

/** Initial values when editing; weeks as ISO year + week number. */
export type SeasonFormInitial = {
  name: string;
  firstWeek: WeekInput;
  lastWeek: WeekInput;
  trainingSlots: {
    weekday: number;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
  }[];
};

function emptyDay(): DayState {
  return { on: false, startTime: "", endTime: "", location: "" };
}

/**
 * Form state for the initial values. A new season defaults to 17 weeks from
 * the week of `today`; without `today` (during render) the weeks start empty.
 */
function toState(initial: SeasonFormInitial | undefined, today?: string): FormState {
  const days: Record<number, DayState> = {};
  for (const d of WEEKDAYS) {
    days[d] = emptyDay();
  }
  if (!initial) {
    const now = today ? isoWeek(today) : null;
    return {
      name: "",
      firstYear: now ? String(now.year) : "",
      firstWeek: now ? String(now.week) : "",
      lastYear: now ? String(now.year) : "",
      lastWeek: now ? String(Math.min(now.week + 16, 52)) : "",
      days,
    };
  }
  for (const slot of initial.trainingSlots) {
    days[slot.weekday] = {
      on: true,
      // Postgres returns times as hh:mm:ss.
      startTime: slot.startTime?.slice(0, 5) ?? "",
      endTime: slot.endTime?.slice(0, 5) ?? "",
      location: slot.location ?? "",
    };
  }
  return {
    name: initial.name,
    firstYear: String(initial.firstWeek.year),
    firstWeek: String(initial.firstWeek.week),
    lastYear: String(initial.lastWeek.year),
    lastWeek: String(initial.lastWeek.week),
    days,
  };
}

function toNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toInput(state: FormState): SeasonInput {
  return {
    name: state.name,
    firstWeek: { year: toNumber(state.firstYear), week: toNumber(state.firstWeek) },
    lastWeek: { year: toNumber(state.lastYear), week: toNumber(state.lastWeek) },
    trainingSlots: WEEKDAYS.filter((d) => state.days[d].on).map((weekday) => ({
      weekday,
      startTime: state.days[weekday].startTime,
      endTime: state.days[weekday].endTime,
      location: state.days[weekday].location,
    })),
  };
}

/** Number of weeks the form currently describes, or null if it is not valid yet. */
function previewCount(input: SeasonInput): number | null {
  if (!isValidIsoWeek(input.firstWeek) || !isValidIsoWeek(input.lastWeek)) {
    return null;
  }
  const n = weekCount(weekInputToMonday(input.firstWeek), weekInputToMonday(input.lastWeek));
  return n > 0 ? n : null;
}

/** Creates or edits a season: name, week range and training days. */
export function SeasonDialog({
  trigger,
  title,
  submitLabel,
  initial,
  action,
}: {
  trigger: ReactElement;
  title: string;
  submitLabel: string;
  initial?: SeasonFormInitial;
  action: (input: SeasonInput) => Promise<ActionResult>;
}) {
  const t = useTranslations("Seasons");
  const tc = useTranslations("Common");
  const tw = useTranslations("Weekdays");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => toState(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setState(toState(initial, new Date().toISOString().slice(0, 10)));
      setError(null);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function setDay(weekday: number, patch: Partial<DayState>) {
    setState((s) => ({
      ...s,
      days: { ...s.days, [weekday]: { ...s.days[weekday], ...patch } },
    }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await action(toInput(state));
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  const count = previewCount(toInput(state));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              value={state.name}
              placeholder={t("namePlaceholder")}
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
          {count !== null && (
            <p className="-mt-3 text-sm text-muted-foreground">{t("weekCount", { count })}</p>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-base font-medium">{t("trainingDays")}</legend>
            {WEEKDAYS.map((weekday) => {
              const day = state.days[weekday];
              const dayId = `${id}-day-${weekday}`;
              return (
                <div key={weekday} className="grid gap-2 rounded-lg border p-2">
                  <Label htmlFor={dayId} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      id={dayId}
                      aria-labelledby={`${dayId}-name`}
                      checked={day.on}
                      onCheckedChange={(checked) => setDay(weekday, { on: checked === true })}
                    />
                    <span id={`${dayId}-name`}>{tw(`d${weekday}`)}</span>
                  </Label>
                  {day.on && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr]">
                      <div className="grid gap-1">
                        <Label htmlFor={`${dayId}-start`} className="text-sm text-muted-foreground">
                          {t("startTime")}
                        </Label>
                        <Input
                          id={`${dayId}-start`}
                          type="time"
                          value={day.startTime}
                          onChange={(e) => setDay(weekday, { startTime: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`${dayId}-end`} className="text-sm text-muted-foreground">
                          {t("endTime")}
                        </Label>
                        <Input
                          id={`${dayId}-end`}
                          type="time"
                          value={day.endTime}
                          onChange={(e) => setDay(weekday, { endTime: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2 grid gap-1 sm:col-span-1">
                        <Label htmlFor={`${dayId}-location`} className="text-sm text-muted-foreground">
                          {t("location")} ({tc("optional")})
                        </Label>
                        <Input
                          id={`${dayId}-location`}
                          value={day.location}
                          maxLength={100}
                          onChange={(e) => setDay(weekday, { location: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tc("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WeekFields({
  id,
  legend,
  year,
  week,
  onYear,
  onWeek,
}: {
  id: string;
  legend: string;
  year: string;
  week: string;
  onYear: (value: string) => void;
  onWeek: (value: string) => void;
}) {
  const t = useTranslations("Seasons");
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-base font-medium">{legend}</legend>
      <div className="grid grid-cols-[5fr_4fr] gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-year`} className="text-sm text-muted-foreground">
            {t("year")}
          </Label>
          <Input
            id={`${id}-year`}
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => onYear(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-week`} className="text-sm text-muted-foreground">
            {t("week")}
          </Label>
          <Input
            id={`${id}-week`}
            type="number"
            inputMode="numeric"
            min={1}
            max={53}
            value={week}
            onChange={(e) => onWeek(e.target.value)}
          />
        </div>
      </div>
    </fieldset>
  );
}
