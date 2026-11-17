"use client";

import { TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { resetTicksAction, setPartDoneAction } from "@/app/session-actions";
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
import type { ViewActivity } from "@/lib/data/session-view";
import { partClockTimes } from "@/lib/outline";
import { minutesSinceEnd, plannedEnd, remainingMs } from "@/lib/part-timer";
import { progress } from "@/lib/session-view";
import { cn } from "@/lib/utils";

import { ActivityDetails } from "./activity-details";
import { TimerBar } from "./timer-bar";
import { clockNow, playChime, prepareNotifications, ScreenAwake, showTimerNotification, vibrate } from "./timer-effects";
import { TimerStartDialog, type TimerTarget } from "./timer-start-dialog";
import { usePartTimer } from "./use-part-timer";

export type ChecklistPart = {
  id: string;
  title: string;
  durationMinutes: number | null;
  isDone: boolean;
  activities: ViewActivity[];
};

/**
 * The parts of a session with a checkbox on each, and their activities as a
 * list whose activities unfold to show their details. A tick is shown at once and saved on its own; if saving fails
 * only that tick goes back. Activities have no tick: they all happen at once.
 *
 * Each part also has a timer that tells when to move on (see TimerBar). The
 * timer lives only on this device, in localStorage; anyone who can view the
 * session may use it.
 */
export function SessionChecklist({
  sessionId,
  parts,
  date,
  startTime,
  editable,
}: {
  sessionId: string;
  parts: ChecklistPart[];
  /** The session's date, `YYYY-MM-DD`, for the timer's planned end times. */
  date: string;
  startTime: string | null;
  editable: boolean;
}) {
  const tt = useTranslations("PartTimer");
  const t = useTranslations("SessionPage");
  const tm = useTranslations("Session");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  // Done flags by part id.
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of parts) {
      initial[p.id] = p.isDone;
    }
    return initial;
  });
  const [resetting, startReset] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);

  const { done: doneCount, total } = progress(parts.map((p) => ({ isDone: done[p.id] ?? false })));
  const durations = parts.map((p) => p.durationMinutes);
  const clocks = partClockTimes(startTime, durations);

  const { timer: storedTimer, now, visible, start, stop, extend, mark } = usePartTimer(sessionId);
  // A timer for a part that no longer exists is ignored.
  const timedIndex = storedTimer ? parts.findIndex((p) => p.id === storedTimer.partId) : -1;
  const timer = timedIndex === -1 ? null : storedTimer;
  const timedPart = timer ? parts[timedIndex] : null;
  const nextPart = timer ? (parts[timedIndex + 1] ?? null) : null;
  const expired = timer !== null && now >= timer.endsAt;
  const running = timer !== null && !expired;
  const [target, setTarget] = useState<TimerTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [awake] = useState(() => new ScreenAwake());

  function openTimer(index: number) {
    const p = parts[index];
    setTarget({
      partId: p.id,
      title: p.title,
      durationMinutes: p.durationMinutes,
      plannedEnd: plannedEnd(date, startTime, durations, index),
      openedAt: clockNow(),
    });
    setDialogOpen(true);
  }

  useEffect(() => {
    prepareNotifications();
  }, []);

  // Keep the screen on while a timer runs and the page is shown. The browser
  // drops the lock when the page is hidden; it is taken again on return.
  useEffect(() => {
    if (running && visible) {
      void awake.acquire();
    } else {
      awake.release();
    }
  }, [awake, running, visible]);
  useEffect(() => () => awake.release(), [awake]);

  // Signal the end once: sound and vibration on the page, or a notification
  // while the page is hidden. Returning to the page later still plays the sound.
  const alertTitle = timedPart?.title ?? "";
  const alertNext = nextPart?.title ?? null;
  const rang = timer?.rang ?? true;
  const notified = timer?.notified ?? true;
  useEffect(() => {
    if (!expired) {
      return;
    }
    if (visible && !rang) {
      mark("rang");
      playChime();
      vibrate();
    } else if (!visible && !notified) {
      mark("notified");
      void showTimerNotification(
        tt("notificationTitle", { part: alertTitle }),
        alertNext ? tt("next", { part: alertNext }) : tt("notificationBody"),
        sessionId,
      );
    }
  }, [expired, visible, rang, notified, mark, tt, alertTitle, alertNext, sessionId]);

  async function toggle(itemId: string, value: boolean) {
    setDone((d) => ({ ...d, [itemId]: value }));
    let error: string | null = null;
    try {
      const result = await setPartDoneAction(sessionId, itemId, value);
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

  const announcement =
    expired && timedPart
      ? `${tt("timeUpFor", { part: timedPart.title })}${nextPart ? ` ${tt("next", { part: nextPart.title })}` : ""}`
      : "";

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
        {parts.map((p, index) => {
          const checked = done[p.id] ?? false;
          const timed = timer?.partId === p.id;
          return (
            <li
              key={p.id}
              data-timed={timed || undefined}
              className={cn(
                "grid gap-0.5 rounded-lg transition-opacity",
                checked && !timed && "opacity-60",
                timed && "bg-muted/60 ring-2 ring-primary",
              )}
            >
              <div className="flex items-start gap-1">
                <label
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 text-lg leading-relaxed font-semibold",
                    editable && "cursor-pointer active:bg-muted",
                  )}
                >
                <Checkbox
                  checked={checked}
                  readOnly={!editable}
                  onCheckedChange={(value) => editable && toggle(p.id, value)}
                  className="mt-1 size-6 rounded-md"
                />
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
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={tt("start", { part: p.title })}
                  aria-pressed={timed}
                  onClick={() => openTimer(index)}
                >
                  <TimerIcon className="size-6" />
                </Button>
              </div>
              {p.activities.length > 0 && (
                <ul className="ml-6 grid divide-y divide-border/60 border-l pl-2 text-base leading-snug">
                  {p.activities.map((a) => (
                    <li key={a.id} className="py-1 first:pt-0 last:pb-0">
                      <ActivityDetails activity={a} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      <TimerStartDialog
        open={dialogOpen}
        target={target}
        replacing={running && timedPart && timedPart.id !== target?.partId ? timedPart.title : null}
        onOpenChange={setDialogOpen}
        onStart={(next) => {
          start(next);
          setDialogOpen(false);
        }}
      />

      {timer && timedPart && now !== 0 && (
        <TimerBar
          partTitle={timedPart.title}
          nextTitle={nextPart?.title ?? null}
          mode={timer.mode}
          endsAt={timer.endsAt}
          remaining={remainingMs(timer.endsAt, now)}
          expired={expired}
          minutesAgo={minutesSinceEnd(timer.endsAt, now)}
          canTick={editable && !(done[timedPart.id] ?? false)}
          onAddMinute={extend}
          onStop={stop}
          onTick={() => {
            stop();
            void toggle(timedPart.id, true);
          }}
          onStartNext={
            nextPart
              ? () => {
                  stop();
                  openTimer(timedIndex + 1);
                }
              : null
          }
        />
      )}
    </div>
  );
}
