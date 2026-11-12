"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { saveSeasonWeekAction } from "@/app/plan-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MAX_WEEK_NOTE_LENGTH } from "@/lib/data/schemas";
import { cn } from "@/lib/utils";

import { useErrorMessage } from "./use-error-message";

/**
 * The content of a week's column header: the week number, a marker when the
 * week has a note, and, with edit access, a popover to set the break flag and
 * note.
 */
export function WeekHeaderContent({
  seasonId,
  weekStart,
  week,
  isBreak,
  note,
  paintedCount,
  editable,
}: {
  seasonId: string;
  weekStart: string;
  week: number;
  isBreak: boolean;
  note: string | null;
  /** Cells of this week that have a focus level; they are removed if it becomes a break. */
  paintedCount: number;
  editable: boolean;
}) {
  const t = useTranslations("Plan");
  const label = (
    <>
      <span className="sr-only">{t("weekPrefix")} </span>
      {week}
      {isBreak && <span className="sr-only">, {t("weekBreak")}</span>}
      {note && <span className="sr-only">, {t("weekNote", { note })}</span>}
      {note && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-background"
        />
      )}
    </>
  );

  if (!editable) {
    return <span className="relative block px-1 py-1">{label}</span>;
  }
  return (
    <WeekPopover
      seasonId={seasonId}
      weekStart={weekStart}
      week={week}
      isBreak={isBreak}
      note={note}
      paintedCount={paintedCount}
    >
      {label}
    </WeekPopover>
  );
}

function WeekPopover({
  seasonId,
  weekStart,
  week,
  isBreak,
  note,
  paintedCount,
  children,
}: {
  seasonId: string;
  weekStart: string;
  week: number;
  isBreak: boolean;
  note: string | null;
  paintedCount: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("Plan");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [breakValue, setBreakValue] = useState(isBreak);
  const [noteValue, setNoteValue] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setBreakValue(isBreak);
      setNoteValue(note ?? "");
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveSeasonWeekAction(seasonId, {
        weekStart,
        isBreak: breakValue,
        note: noteValue,
      });
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-label={t("weekEditLabel", { week })}
        className={cn(
          "relative block w-full cursor-pointer px-1 py-1 outline-none hover:bg-foreground/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 font-normal text-foreground">
        <form onSubmit={submit} className="grid gap-3">
          <p className="font-heading text-sm font-medium">{t("weekTitle", { week })}</p>
          <Label htmlFor={`${id}-break`} className="flex items-center gap-2 font-normal">
            <Checkbox
              id={`${id}-break`}
              checked={breakValue}
              onCheckedChange={(checked) => setBreakValue(checked === true)}
            />
            {t("breakLabel")}
          </Label>
          {breakValue && paintedCount > 0 && (
            <p role="status" className="text-sm text-destructive">
              {t("breakClears", { count: paintedCount })}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-note`}>{t("noteLabel")}</Label>
            <Textarea
              id={`${id}-note`}
              value={noteValue}
              maxLength={MAX_WEEK_NOTE_LENGTH}
              placeholder={t("notePlaceholder")}
              rows={3}
              onChange={(e) => setNoteValue(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
