"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { clockTime, formatRemaining, type TimerMode } from "@/lib/part-timer";

/** CSS variable with the bar's height, used as bottom padding by the page. */
const SPACE_VAR = "--part-timer-space";

/**
 * The running timer, fixed to the bottom of the screen: the part, the time
 * left and "+1 min" / "Stoppa". When the time is up the TimerAlert takes over.
 */
export function TimerBar({
  partTitle,
  mode,
  endsAt,
  remaining,
  onAddMinute,
  onStop,
}: {
  partTitle: string;
  mode: TimerMode;
  endsAt: number;
  remaining: number;
  onAddMinute: () => void;
  onStop: () => void;
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_-4px_16px_rgb(0_0_0/0.12)]"
    >
      <section
        aria-label={t("barLabel")}
        className="mx-auto grid w-full max-w-2xl gap-3 px-4 py-3 sm:px-6"
      >
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
      </section>
    </div>
  );
}
