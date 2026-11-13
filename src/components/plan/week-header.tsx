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
import Link from "next/link";

import { useErrorMessage } from "./use-error-message";

/**
 * The content of a week's column header: the week number, linking to the
 * week page, and a marker when the week has a note. The break flag and note
 * are set from the week page (WeekSettingsPopover).
 */
export function WeekHeaderContent({
  seasonId,
  weekStart,
  week,
  isBreak,
  note,
}: {
  seasonId: string;
  weekStart: string;
  week: number;
  isBreak: boolean;
  note: string | null;
}) {
  const t = useTranslations("Plan");
  return (
    <Link
      href={`/seasons/${seasonId}/weeks/${weekStart}`}
      className="relative block w-full px-1 py-1 outline-none hover:bg-foreground/10 hover:underline focus-visible:shadow-[inset_0_0_0_2px_var(--foreground),inset_0_0_0_4px_var(--background)]"
    >
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
    </Link>
  );
}

/**
 * A popover to set a week's break flag and note, opened by `trigger`.
 * Requires edit access; the server checks it again.
 */
export function WeekSettingsPopover({
  seasonId,
  weekStart,
  week,
  isBreak,
  note,
  paintedCount,
  trigger,
}: {
  seasonId: string;
  weekStart: string;
  week: number;
  isBreak: boolean;
  note: string | null;
  /** Cells of this week that have a focus level; they are removed if it becomes a break. */
  paintedCount: number;
  trigger: React.ReactElement;
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
      <PopoverTrigger render={trigger} />
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
