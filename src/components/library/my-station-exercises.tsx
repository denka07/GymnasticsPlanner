"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateMyStationLinksAction } from "@/app/library-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import { byName } from "@/lib/library";

import { LinkPicker } from "./link-picker";

type Item = { id: string; name: string };

/**
 * On a station the user may not edit (a global one, for a non-administrator):
 * adds or removes the user's own personal exercises. Each change is saved at
 * once; the server only touches links the user may change.
 */
export function MyStationExercises({
  stationId,
  initial,
  ownExercises,
}: {
  stationId: string;
  /** The user's own exercises the station supports now. */
  initial: Item[];
  /** All of the user's personal exercises. */
  ownExercises: Item[];
}) {
  const t = useTranslations("Library");
  const ts = useTranslations("Stations");
  const errorMessage = useErrorMessage();
  const [chosen, setChosen] = useState<Item[]>(initial);
  const [pending, startTransition] = useTransition();

  function save(next: Item[]) {
    const previous = chosen;
    setChosen(next);
    startTransition(async () => {
      try {
        const result = await updateMyStationLinksAction(
          stationId,
          next.map((e) => e.id),
        );
        if (!result.ok) {
          setChosen(previous);
          toast.error(errorMessage(result.error));
        }
      } catch {
        setChosen(previous);
        toast.error(errorMessage("unexpected"));
      }
    });
  }

  return (
    <section className="grid gap-3" aria-labelledby={`${stationId}-mine`} aria-busy={pending}>
      <h2 id={`${stationId}-mine`} className="font-heading text-xl font-semibold">
        {t("myExercisesHeading")}
      </h2>
      <p className="text-muted-foreground">{t("myExercisesIntro")}</p>
      {chosen.length === 0 ? (
        <p className="text-muted-foreground">{t("myExercisesEmpty")}</p>
      ) : (
        <ul className="grid gap-2">
          {chosen.map((exercise) => (
            <li
              key={exercise.id}
              className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-3"
            >
              <Link
                href={`/library/exercises/${exercise.id}`}
                className="min-w-0 flex-1 rounded-sm break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {exercise.name}
              </Link>
              <Button
                type="button"
                variant="ghost"
                className="size-11 shrink-0"
                disabled={pending}
                aria-label={ts("removeExercise", { name: exercise.name })}
                onClick={() => save(chosen.filter((e) => e.id !== exercise.id))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {ownExercises.length === 0 ? (
        <p className="text-muted-foreground">{t("noOwnExercises")}</p>
      ) : (
        <LinkPicker
          label={t("findMyExercise")}
          items={ownExercises}
          chosenIds={chosen.map((e) => e.id)}
          onAdd={(item) => save([...chosen, item].sort(byName))}
          addLabel={(n) => ts("addExercise", { name: n })}
          noMatches={ts("noMatches")}
        />
      )}
    </section>
  );
}
