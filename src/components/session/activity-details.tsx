import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { ViewActivity } from "@/lib/data/session-view";

/** A tap-to-unfold row; collapsed by default, with a large touch target. */
function Unfold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded-lg px-2 py-2 active:bg-muted [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden
          className="mt-1.5 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1 break-words">{summary}</span>
      </summary>
      <div className="grid gap-2 pb-2 pl-9 text-base leading-relaxed">{children}</div>
    </details>
  );
}

/**
 * One activity on the session page: its station, the exercises under it and
 * the free text. Tapping a station shows its description and equipment;
 * tapping an exercise shows its description, focus cues and variants.
 */
export function ActivityDetails({ activity }: { activity: ViewActivity }) {
  const t = useTranslations("SessionPage");
  const { station, exercises, text } = activity;
  if (!station && exercises.length === 0) {
    return <p className="break-words">{text}</p>;
  }
  return (
    <div className="grid gap-0.5">
      {station && (
        <Unfold
          summary={
            <>
              <span className="sr-only">{t("stationLabel")}: </span>
              <span className="font-semibold">{station.name}</span>
            </>
          }
        >
          {station.description && <p className="whitespace-pre-line">{station.description}</p>}
          <p className="font-semibold">{t("equipmentHeading")}</p>
          {station.equipment.length === 0 ? (
            <p className="text-muted-foreground">{t("noEquipment")}</p>
          ) : (
            <ul className="grid gap-0.5">
              {station.equipment.map((e) => (
                <li key={e.name}>
                  {e.quantity > 1 ? `${e.quantity} × ${e.name}` : e.name}
                </li>
              ))}
            </ul>
          )}
        </Unfold>
      )}
      {exercises.length > 0 && (
        <ul className={station ? "ml-4 grid border-l pl-2" : "grid"}>
          {exercises.map((e) => {
            const empty =
              !e.description && e.focusCues.length === 0 && !e.easierVariant && !e.harderVariant;
            return (
              <li key={e.id}>
                <Unfold summary={e.name}>
                  {empty && <p className="text-muted-foreground">{t("noDetails")}</p>}
                  {e.description && <p className="whitespace-pre-line">{e.description}</p>}
                  {e.focusCues.length > 0 && (
                    <>
                      <p className="font-semibold">{t("cuesHeading")}</p>
                      <ul className="ml-5 list-disc">
                        {e.focusCues.map((cue, i) => (
                          <li key={i}>{cue}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {e.easierVariant && (
                    <p>
                      <span className="font-semibold">{t("easierLabel")}: </span>
                      {e.easierVariant}
                    </p>
                  )}
                  {e.harderVariant && (
                    <p>
                      <span className="font-semibold">{t("harderLabel")}: </span>
                      {e.harderVariant}
                    </p>
                  )}
                </Unfold>
              </li>
            );
          })}
        </ul>
      )}
      {text && <p className="px-2 break-words">{text}</p>}
    </div>
  );
}
