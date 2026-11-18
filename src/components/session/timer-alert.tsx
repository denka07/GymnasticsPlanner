"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * Full-screen red alert shown when a timer has run out, until the coach
 * handles it with "Bocka av", "Starta nästa" or "Stäng" (or Escape). Sound,
 * vibration and the wake lock are handled by the checklist.
 */
export function TimerAlert({
  partTitle,
  nextTitle,
  minutesAgo,
  canTick,
  onStop,
  onTick,
  onStartNext,
}: {
  partTitle: string;
  nextTitle: string | null;
  minutesAgo: number;
  canTick: boolean;
  onStop: () => void;
  onTick: () => void;
  onStartNext: (() => void) | null;
}) {
  const t = useTranslations("PartTimer");
  const ref = useRef<HTMLDivElement>(null);
  const stopRef = useRef(onStop);
  useEffect(() => {
    stopRef.current = onStop;
  });

  // Move focus here, and let Escape close it like "Stäng".
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopRef.current();
      } else if (event.key === "Tab" && ref.current) {
        // Keep focus inside the alert.
        const buttons = Array.from(ref.current.querySelectorAll<HTMLElement>("button"));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === ref.current || active === first)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        } else if (!ref.current.contains(active)) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  const buttonClass = "h-14 w-full px-6 text-xl font-semibold";
  const solid = `${buttonClass} bg-white text-alert hover:bg-white/90`;

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="timer-alert-title timer-alert-part"
      tabIndex={-1}
      data-timer-alert
      className="timer-alert-pulse fixed inset-0 z-[100] overflow-y-auto bg-alert text-alert-foreground outline-none"
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-8 px-6 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-3">
          <h2 id="timer-alert-title" className="text-5xl leading-tight font-extrabold break-words">
            {t("timeUp")}
          </h2>
          {minutesAgo > 0 && <p className="text-xl">{t("ago", { minutes: minutesAgo })}</p>}
          <p id="timer-alert-part" className="text-4xl leading-tight font-bold break-words">
            {partTitle}
          </p>
          {nextTitle && <p className="text-2xl break-words">{t("next", { part: nextTitle })}</p>}
        </div>
        <div className="grid gap-3">
          {canTick && (
            <Button className={solid} onClick={onTick}>
              {t("tick")}
            </Button>
          )}
          {onStartNext && (
            <Button className={solid} onClick={onStartNext}>
              {t("startNext")}
            </Button>
          )}
          <Button
            variant="outline"
            className={`${buttonClass} border-white bg-transparent text-white hover:bg-white/15 hover:text-white dark:border-white dark:bg-transparent`}
            onClick={onStop}
          >
            {t("close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
