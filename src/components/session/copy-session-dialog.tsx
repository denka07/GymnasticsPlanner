"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDayMonth, shortTime, weekdayOf } from "@/lib/dates";
import { addWeeks, isoWeek } from "@/lib/weeks";

export type CopySourceOption = {
  id: string;
  date: string;
  startTime: string | null;
  location: string | null;
  partCount: number;
};

/**
 * Picks another session of the season to copy content from. The same weekday
 * one week earlier is chosen first when it exists. When the target already
 * has content, a second step asks before replacing it. `copy` returns an
 * error key or null.
 */
export function CopySessionDialog({
  open,
  onOpenChange,
  targetName,
  targetDate,
  targetHasContent,
  sources,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  targetDate: string;
  targetHasContent: boolean;
  /** Newest first; the target itself is already left out. */
  sources: CopySourceOption[];
  copy: (sourceId: string) => Promise<string | null>;
}) {
  const t = useTranslations("Session");
  const tc = useTranslations("Common");
  const tw = useTranslations("Weekdays");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const weekBefore = addWeeks(targetDate, -1);
      setSelected(sources.find((s) => s.date === weekBefore)?.id ?? sources[0]?.id ?? null);
      setConfirming(false);
      setError(null);
    }
  }

  const label = (s: CopySourceOption) =>
    t("copySourceLabel", {
      weekday: tw(`d${weekdayOf(s.date)}` as "d1"),
      date: formatDayMonth(s.date),
      week: isoWeek(s.date).week,
    });

  function run() {
    if (!selected) {
      return;
    }
    startTransition(async () => {
      const key = await copy(selected);
      if (key === null) {
        onOpenChange(false);
      } else {
        setConfirming(false);
        setError(errorMessage(key));
      }
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (targetHasContent && !confirming) {
      setConfirming(true);
      return;
    }
    run();
  }

  const source = sources.find((s) => s.id === selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {confirming ? t("copyConfirmTitle") : t("copyTitle", { name: targetName })}
            </DialogTitle>
            <DialogDescription>
              {confirming && source
                ? t("copyConfirmText", { name: targetName, source: label(source) })
                : t("copyIntro")}
            </DialogDescription>
          </DialogHeader>
          {!confirming &&
            (sources.length === 0 ? (
              <p className="text-muted-foreground">{t("copyNone")}</p>
            ) : (
              <fieldset className="grid max-h-80 gap-1 overflow-y-auto">
                <legend className="sr-only">{t("copySources")}</legend>
                {sources.map((s) => (
                  <label
                    key={s.id}
                    htmlFor={`${id}-${s.id}`}
                    className="flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 hover:bg-muted has-checked:bg-muted"
                  >
                    <input
                      type="radio"
                      id={`${id}-${s.id}`}
                      name={`${id}-source`}
                      value={s.id}
                      checked={selected === s.id}
                      onChange={() => setSelected(s.id)}
                      className="translate-y-0.5 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      {label(s)}
                      <span className="block text-sm text-muted-foreground">
                        {[shortTime(s.startTime), s.location, t("copyParts", { count: s.partCount })]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => (confirming ? setConfirming(false) : onOpenChange(false))}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              variant={confirming ? "destructive" : "default"}
              disabled={pending || !selected}
            >
              {pending ? t("copying") : confirming ? t("copyReplace") : t("copySubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
