"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactElement } from "react";

import { createEventAction, deleteEventAction, updateEventAction } from "@/app/plan-actions";
import { Button } from "@/components/ui/button";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EventType } from "@/db/schema";
import { EVENT_TYPE_ORDER } from "@/lib/events";

import { ConfirmDelete } from "./confirm-delete";
import { useErrorMessage } from "./use-error-message";

export type EventValuesForm = {
  id: string;
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
};

type FormState = { name: string; type: EventType; startDate: string; endDate: string };

/**
 * Creates an event, or with `event` edits or deletes it. `defaultDate` is the
 * start date suggested for a new event.
 */
export function EventDialog({
  trigger,
  seasonId,
  event,
  defaultDate,
}: {
  trigger: ReactElement;
  seasonId: string;
  event?: EventValuesForm;
  defaultDate?: string;
}) {
  const t = useTranslations("Events");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(() => initialState(event, defaultDate));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setState(initialState(event, defaultDate));
      setError(null);
    }
  }

  /** The end date follows the start date until it would end up before it. */
  function setStart(startDate: string) {
    setState((s) => ({
      ...s,
      startDate,
      endDate: s.endDate === "" || s.endDate < startDate || s.endDate === s.startDate ? startDate : s.endDate,
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const values = { ...state, endDate: state.endDate || state.startDate };
      const result = event
        ? await updateEventAction(event.id, values)
        : await createEventAction(seasonId, values);
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{event ? t("editTitle") : t("createTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              value={state.name}
              placeholder={t("namePlaceholder")}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-type`}>{t("typeLabel")}</Label>
            <NativeSelect
              id={`${id}-type`}
              value={state.type}
              onChange={(e) => setState((s) => ({ ...s, type: e.target.value as EventType }))}
            >
              {EVENT_TYPE_ORDER.map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {t(`types.${type}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-start`}>{t("startDate")}</Label>
              <Input
                id={`${id}-start`}
                type="date"
                value={state.startDate}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-end`}>{t("endDate")}</Label>
              <Input
                id={`${id}-end`}
                type="date"
                value={state.endDate}
                min={state.startDate || undefined}
                onChange={(e) => setState((s) => ({ ...s, endDate: e.target.value }))}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {event ? (
              <ConfirmDelete
                trigger={
                  <Button type="button" variant="destructive">
                    <Trash2Icon data-icon="inline-start" />
                    {t("deleteEvent")}
                  </Button>
                }
                title={t("deleteTitle", { name: event.name })}
                description={t("deleteText", { name: event.name })}
                action={() => deleteEventAction(event.id)}
              />
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? tc("saving") : event ? tc("save") : tc("create")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initialState(event: EventValuesForm | undefined, defaultDate: string | undefined): FormState {
  if (event) {
    return {
      name: event.name,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
    };
  }
  return {
    name: "",
    type: "competition",
    startDate: defaultDate ?? "",
    endDate: defaultDate ?? "",
  };
}
