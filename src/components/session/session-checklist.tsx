"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resetTicksAction, setItemDoneAction } from "@/app/session-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { partClockTimes } from "@/lib/outline";
import { progress } from "@/lib/session-view";
import { cn } from "@/lib/utils";

export type ChecklistPart = {
  id: string;
  title: string;
  durationMinutes: number | null;
  isDone: boolean;
  activities: { id: string; text: string; isDone: boolean }[];
};

/**
 * The parts and activities of a session with a checkbox on each. A tick is
 * shown at once and saved on its own; if saving fails only that tick goes
 * back. Parts and activities are ticked independently of each other.
 */
export function SessionChecklist({
  sessionId,
  parts,
  startTime,
  editable,
}: {
  sessionId: string;
  parts: ChecklistPart[];
  startTime: string | null;
  editable: boolean;
}) {
  const t = useTranslations("SessionPage");
  const tm = useTranslations("Session");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  // Done flags by item id; parts and activities have different ids.
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of parts) {
      initial[p.id] = p.isDone;
      for (const a of p.activities) {
        initial[a.id] = a.isDone;
      }
    }
    return initial;
  });
  const [resetting, startReset] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);

  const current = parts.map((p) => ({
    isDone: done[p.id] ?? false,
    activities: p.activities.map((a) => ({ isDone: done[a.id] ?? false })),
  }));
  const { done: doneCount, total } = progress(current);
  const clocks = partClockTimes(
    startTime,
    parts.map((p) => p.durationMinutes),
  );

  async function toggle(kind: "part" | "activity", itemId: string, value: boolean) {
    setDone((d) => ({ ...d, [itemId]: value }));
    let error: string | null = null;
    try {
      const result = await setItemDoneAction(sessionId, kind, itemId, value);
      error = result.ok ? null : result.error;
    } catch {
      error = "unexpected";
    }
    if (error !== null) {
      // Only this tick goes back; others in flight are left alone.
      setDone((d) => ({ ...d, [itemId]: !value }));
      toast.error(t("tickFailed"), { description: errorMessage(error) });
    }
  }

  function reset() {
    const before = done;
    setDone(Object.fromEntries(Object.keys(done).map((id) => [id, false])));
    setResetOpen(false);
    startReset(async () => {
      let error: string | null = null;
      try {
        const result = await resetTicksAction(sessionId);
        error = result.ok ? null : result.error;
      } catch {
        error = "unexpected";
      }
      if (error !== null) {
        setDone(before);
        toast.error(t("resetFailed"), { description: errorMessage(error) });
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="text-lg font-semibold tabular-nums" role="status" aria-live="polite">
          {t("progress", { done: doneCount, total })}
        </p>
        {editable && (
          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" className="h-11 px-3 text-base" disabled={resetting || doneCount === 0}>
                  {t("resetTicks")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("resetTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("resetText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <Button onClick={reset}>{t("resetConfirm")}</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <ul aria-label={t("checklistLabel")} className="grid gap-3">
        {parts.map((p, index) => (
          <li key={p.id} className="grid gap-0.5">
            <TickRow
              checked={done[p.id] ?? false}
              editable={editable}
              onChange={(value) => toggle("part", p.id, value)}
              className="font-semibold"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                {clocks[index] && (
                  <span className="font-normal text-muted-foreground tabular-nums">{clocks[index]}</span>
                )}
                <span className="min-w-0 break-words">{p.title}</span>
              </span>
              {p.durationMinutes !== null && (
                <span className="font-normal whitespace-nowrap text-muted-foreground tabular-nums">
                  {p.durationMinutes} {tm("minutes")}
                </span>
              )}
            </TickRow>
            {p.activities.length > 0 && (
              <ul className="ml-6 grid gap-0.5 border-l pl-2">
                {p.activities.map((a) => (
                  <li key={a.id}>
                    <TickRow
                      checked={done[a.id] ?? false}
                      editable={editable}
                      onChange={(value) => toggle("activity", a.id, value)}
                    >
                      <span className="min-w-0 flex-1 break-words">{a.text}</span>
                    </TickRow>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One row; the whole row is the tap target. Ticked rows are subdued, not hidden. */
function TickRow({
  checked,
  editable,
  onChange,
  className,
  children,
}: {
  checked: boolean;
  editable: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-start gap-3 rounded-lg px-2 py-2.5 text-lg leading-relaxed transition-opacity",
        editable && "cursor-pointer active:bg-muted",
        checked && "text-muted-foreground opacity-60 [&_span]:line-through",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        readOnly={!editable}
        onCheckedChange={(value) => editable && onChange(value)}
        className="mt-1 size-6 rounded-md"
      />
      {children}
    </label>
  );
}
