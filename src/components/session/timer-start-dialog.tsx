"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  clockTime,
  countdownTimer,
  parseMinutes,
  planTimer,
  type StoredTimer,
  type TimerMode,
} from "@/lib/part-timer";
import { cn } from "@/lib/utils";

import { askForNotifications, clockNow, unlockAudio } from "./timer-effects";

export type TimerTarget = {
  partId: string;
  title: string;
  durationMinutes: number | null;
  /** The part's planned end moment, or null when it cannot be computed. */
  plannedEnd: number | null;
  /** When the dialog was opened, to tell whether the planned end has passed. */
  openedAt: number;
};

/**
 * Asks how the timer for a part should run: a countdown of a number of
 * minutes, or until the part's planned end. When another timer is running,
 * it says that the new one replaces it.
 */
export function TimerStartDialog({
  open,
  target,
  replacing,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  /** The part last asked about; kept while the dialog closes, so it does not empty. */
  target: TimerTarget | null;
  /** The title of the part whose running timer would be replaced. */
  replacing: string | null;
  onOpenChange: (open: boolean) => void;
  onStart: (timer: StoredTimer) => void;
}) {
  const t = useTranslations("PartTimer");
  return (
    <Dialog open={open && target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 text-base">
        {target && (
          <StartForm
            key={`${target.partId}-${target.openedAt}`}
            target={target}
            replacing={replacing}
            onStart={onStart}
          />
        )}
        {!target && <DialogTitle className="sr-only">{t("dialogTitleEmpty")}</DialogTitle>}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({
  target,
  replacing,
  onStart,
}: {
  target: TimerTarget;
  replacing: string | null;
  onStart: (timer: StoredTimer) => void;
}) {
  const t = useTranslations("PartTimer");
  const tc = useTranslations("Common");
  const id = useId();
  const [mode, setMode] = useState<TimerMode>("countdown");
  const [minutes, setMinutes] = useState(target.durationMinutes?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  const planTime = target.plannedEnd === null ? null : clockTime(target.plannedEnd);
  const planPassed = target.plannedEnd !== null && target.plannedEnd <= target.openedAt;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const now = clockNow();
    let timer: StoredTimer | null;
    if (mode === "countdown") {
      const value = parseMinutes(minutes);
      if (value === null) {
        setError(t("minutesError"));
        return;
      }
      timer = countdownTimer(target.partId, value, now);
    } else {
      timer = target.plannedEnd === null ? null : planTimer(target.partId, target.plannedEnd, now);
      if (timer === null) {
        setError(t("planPassed", { time: planTime ?? "" }));
        return;
      }
    }
    // This tap is what lets the page play sound and ask about notifications.
    unlockAudio();
    askForNotifications();
    onStart(timer);
  }

  const optionClass =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-checked:border-primary has-checked:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-60";

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle className="text-lg leading-snug font-semibold">
          {t("dialogTitle", { part: target.title })}
        </DialogTitle>
        <DialogDescription className="text-base">{t("dialogText")}</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium">{t("modeLegend")}</legend>
        <label className={optionClass}>
          <input
            type="radio"
            name={`${id}-mode`}
            value="countdown"
            checked={mode === "countdown"}
            onChange={() => {
              setMode("countdown");
              setError(null);
            }}
            className="size-5 accent-primary"
          />
          <span className="font-medium">{t("countdown")}</span>
        </label>
        {mode === "countdown" && (
          <div className="grid gap-1 pl-3">
            <label htmlFor={`${id}-minutes`} className="font-medium">
              {t("minutesLabel")}
            </label>
            <Input
              id={`${id}-minutes`}
              inputMode="numeric"
              autoComplete="off"
              required
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                setError(null);
              }}
              aria-invalid={error !== null || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="h-11 w-28 text-lg tabular-nums"
            />
          </div>
        )}
        {planTime !== null && (
          <label className={optionClass}>
            <input
              type="radio"
              name={`${id}-mode`}
              value="plan"
              checked={mode === "plan"}
              disabled={planPassed}
              onChange={() => {
                setMode("plan");
                setError(null);
              }}
              className="size-5 accent-primary"
            />
            <span className="grid">
              <span className="font-medium">{t("plan")}</span>
              <span className={cn("text-muted-foreground", planPassed && "text-destructive")}>
                {planPassed ? t("planPassed", { time: planTime }) : t("planText", { time: planTime })}
              </span>
            </span>
          </label>
        )}
      </fieldset>

      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {replacing && <p className="rounded-lg bg-muted px-3 py-2">{t("replaceWarning", { part: replacing })}</p>}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" className="h-11 px-4 text-base" />}>
          {tc("cancel")}
        </DialogClose>
        <Button type="submit" className="h-11 px-4 text-base">
          {replacing ? t("replaceButton") : t("startButton")}
        </Button>
      </DialogFooter>
    </form>
  );
}
