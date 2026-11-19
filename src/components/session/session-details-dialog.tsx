"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SessionDetailsInput } from "@/lib/data/schemas";

export type DetailsValues = {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  /** "" for no hall. */
  hallId: string;
};

/** A hall a session can be held in. */
export type HallChoice = { id: string; name: string };

/**
 * Date, start and end time, location and hall of a session, for editing a
 * session or adding an extra one. The date is limited to the week (`minDate` to
 * `maxDate`). `submit` returns an error key or null.
 */
export function SessionDetailsDialog({
  open,
  onOpenChange,
  title,
  initial,
  minDate,
  maxDate,
  halls = [],
  submit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: DetailsValues;
  minDate: string;
  maxDate: string;
  halls?: HallChoice[];
  submit: (values: SessionDetailsInput) => Promise<string | null>;
}) {
  const t = useTranslations("Session");
  const tc = useTranslations("Common");
  const th = useTranslations("Halls");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);

  // Start from the session's current values each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(initial);
      setError(null);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const key = await submit({ ...values, hallId: values.hallId || null });
      if (key === null) {
        onOpenChange(false);
      } else {
        setError(errorMessage(key));
      }
    });
  }

  const field = (key: Exclude<keyof DetailsValues, "hallId">) => ({
    id: `${id}-${key}`,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>{t("dateLabel")}</Label>
            <Input type="date" required min={minDate} max={maxDate} {...field("date")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-startTime`}>{t("startLabel")}</Label>
              <Input type="time" {...field("startTime")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-endTime`}>{t("endLabel")}</Label>
              <Input type="time" {...field("endTime")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-location`}>{t("locationLabel")}</Label>
            <Input maxLength={100} placeholder={t("locationPlaceholder")} {...field("location")} />
          </div>
          {(halls.length > 0 || values.hallId) && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-hall`}>{th("hallLabel")}</Label>
              <NativeSelect
                id={`${id}-hall`}
                className="w-full"
                value={values.hallId}
                onChange={(e) => setValues((v) => ({ ...v, hallId: e.target.value }))}
              >
                <NativeSelectOption value="">{th("noHall")}</NativeSelectOption>
                {halls.map((h) => (
                  <NativeSelectOption key={h.id} value={h.id}>
                    {h.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
