"use client";

import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { summarize } from "@/lib/activity-summary";
import type { ViewActivity } from "@/lib/data/session-view";
import { cn } from "@/lib/utils";

/** Indent that puts text under the title, past the chevron. */
const INDENT = "pl-9";

/**
 * One activity on the session page, as compact as it can be. Line 1 is the
 * station (or the first exercises) in bold followed by the free text; line 2
 * summarises exercises and equipment. Tapping unfolds the details. An activity
 * with nothing more to show is plain text without a chevron.
 */
export function ActivityDetails({ activity }: { activity: ViewActivity }) {
  const t = useTranslations("SessionPage");
  const [open, setOpen] = useState(false);
  const { station, exercises, text } = activity;

  if (!station && exercises.length === 0) {
    return <p className={cn("px-2 py-2 break-words", INDENT)}>{text}</p>;
  }

  const more = (count: number) => t("more", { count });
  const names = (list: string[]) => {
    const { shown, more: rest } = summarize(list);
    return shown.join(t("listSeparator")) + (rest > 0 ? ` ${more(rest)}` : "");
  };

  const equipmentLines = (station?.equipment ?? []).map((e) =>
    e.quantity > 1 ? t("quantityLine", { quantity: e.quantity, name: e.name }) : e.name,
  );
  const exerciseNames = exercises.map((e) => e.name);

  const title = station ? station.name : names(exerciseNames);
  const exerciseSummary = station ? names(exerciseNames) : "";
  const equipmentSummary = names(equipmentLines);

  const hasDescription = Boolean(station?.description) || exercises.some((e) => e.description);
  const cutOff = station
    ? exerciseNames.length > 2 || equipmentLines.length > 2
    : exerciseNames.length > 2;
  const expandable = hasDescription || cutOff;

  const heading: ReactNode = (
    <span className="block break-words">
      {station && <span className="sr-only">{t("stationLabel")}: </span>}
      <span className="font-semibold">{title}</span>
      {text && (
        <>
          {t("textSeparator")}
          {text}
        </>
      )}
    </span>
  );
  const summary =
    exerciseSummary || equipmentSummary ? (
      <span className="mt-0.5 flex flex-wrap gap-x-8 text-sm text-muted-foreground">
        {exerciseSummary && <span className="min-w-0 break-words">{exerciseSummary}</span>}
        {equipmentSummary && <span className="min-w-0 break-words">{equipmentSummary}</span>}
      </span>
    ) : null;

  if (!expandable) {
    return (
      <div className={cn("px-2 py-2", INDENT)}>
        {heading}
        {summary}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1">
          {heading}
          {!open && summary}
        </span>
      </button>
      {open && (
        <div className={cn("grid gap-2 px-2 pb-2", INDENT)}>
          {station?.description && <p className="whitespace-pre-line">{station.description}</p>}
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {exercises.length > 0 && (
              <ul className="grid content-start gap-1">
                {exercises.map((e) => (
                  <li key={e.id}>
                    <span className="block break-words">{e.name}</span>
                    {e.description && (
                      <span className="block text-sm whitespace-pre-line text-muted-foreground">
                        {e.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {equipmentLines.length > 0 && (
              <ul className="grid content-start gap-1">
                {equipmentLines.map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
