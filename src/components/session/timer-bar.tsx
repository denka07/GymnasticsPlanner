"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { clockTime, formatRemaining, type TimerMode } from "@/lib/part-timer";
import { cn } from "@/lib/utils";

/** CSS variable with the bar's height, used as bottom padding by the page. */
const SPACE_VAR = "--part-timer-space";

/**
 * The running timer, fixed to the bottom of the screen: the part, the time
 * left and "+1 min" / "Stoppa". When the time is up it turns into an alert
 * with "Bocka av", "Starta nästa" and "Stäng".
 */
export function TimerBar({
  partTitle,
  nextTitle,
  mode,
  endsAt,
  remaining,
  expired,
  minutesAgo,
  canTick,
  onAddMinute,
  onStop,
  onTick,
  onStartNext,
}: {
  partTitle: string;
  nextTitle: string | null;
  mode: TimerMode;
  endsAt: number;
  remaining: number;
  expired: boolean;
  minutesAgo: number;
  canTick: boolean;
  onAddMinute: () => void;
  onStop: () => void;
  onTick: () => void;
  onStartNext: (() => void) | null;
}) {
  const t = useTranslations("PartTimer");
  const ref = useRef<HTMLDivElement>(null);

  // Keep the page's last part and note clear of the bar.
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const root = document.documentElement;
    const update = () => root.style.setProperty(SPACE_VAR, `${el.offsetHeight + 16}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(SPACE_VAR);
    };
  }, []);

  const buttonClass = "h-11 min-w-11 px-4 text-base";

  return (
    <div
      ref={ref}
      data-timer-bar
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.12)]",
        expired ? "bg-primary text-primary-foreground" : "bg-background text-foreground",
      )}
    >
      <section
        aria-label={t("barLabel")}
        className="mx-auto grid w-full max-w-2xl gap-3 px-4 py-3 sm:px-6"
      >
        {expired ? (
          <>
            <div className="grid gap-0.5">
              <p className="flex flex-wrap items-baseline gap-x-3 text-2xl font-bold">
                {t("timeUp")}
                {minutesAgo > 0 && (
                  <span className="text-base font-normal">{t("ago", { minutes: minutesAgo })}</span>
                )}
              </p>
              <p className="text-lg font-semibold break-words">{partTitle}</p>
              {nextTitle && <p className="text-base break-words">{t("next", { part: nextTitle })}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canTick && (
                <Button variant="secondary" className={buttonClass} onClick={onTick}>
                  {t("tick")}
                </Button>
              )}
              {onStartNext && (
                <Button variant="secondary" className={buttonClass} onClick={onStartNext}>
                  {t("startNext")}
                </Button>
              )}
              <Button
                variant="outline"
                className={cn(buttonClass, "border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 dark:bg-transparent")}
                onClick={onStop}
              >
                {t("close")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{partTitle}</p>
              {mode === "plan" && (
                <p className="truncate text-base text-muted-foreground">
                  {t("planText", { time: clockTime(endsAt) })}
                </p>
              )}
              <p
                role="timer"
                aria-label={t("remainingLabel", { part: partTitle })}
                className="text-4xl leading-tight font-bold tabular-nums"
              >
                {formatRemaining(remaining)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 min-[400px]:flex-row">
              <Button variant="outline" className={buttonClass} onClick={onAddMinute}>
                {t("addMinute")}
              </Button>
              <Button variant="secondary" className={buttonClass} onClick={onStop}>
                {t("stop")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
