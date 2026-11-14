"use client";

import { ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { createExerciseInlineAction, createStationInlineAction } from "@/app/library-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LibraryPickItem } from "@/lib/data/sessions";
import { hasName, pickerMatches, type ScopeFilter } from "@/lib/library";
import { cn } from "@/lib/utils";
import { exerciseOptions, MAX_EXERCISES_PER_ACTIVITY, type LinkedItem } from "@/lib/outline";

import { useActivityLibrary } from "./activity-library";

export type ActivityLinks = { station: LinkedItem | null; exercises: LinkedItem[] };

const OPTION_CLASS = "h-auto min-h-11 max-w-full px-3 text-left text-base whitespace-normal";

/**
 * Picks an activity's station and exercises. Every choice is applied to the
 * line at once (and saved with the outline), so closing needs no confirming.
 * A station or exercise that does not exist can be created by name.
 */
export function ActivityLinkDialog({
  open,
  onOpenChange,
  links,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: ActivityLinks;
  onChange: (links: ActivityLinks) => void;
}) {
  const t = useTranslations("Session");
  const errorMessage = useErrorMessage();
  const library = useActivityLibrary();
  const stationInputId = useId();
  const exerciseInputId = useId();
  const [stationSearch, setStationSearch] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ScopeFilter>("all");

  if (!library) {
    return null;
  }
  const { station, exercises } = links;
  const inFilter = (item: LibraryPickItem) =>
    filter === "all" || (filter === "global") === item.global;
  const shownStations = library.stations.filter(inFilter);
  const shownExercises = library.exercises.filter(inFilter);
  const stationTrimmed = stationSearch.trim();
  const exerciseTrimmed = exerciseSearch.trim();
  const stationMatches = station ? [] : pickerMatches(shownStations, [], stationSearch);
  const canCreateStation =
    stationTrimmed !== "" && !hasName(library.stations.map((s) => s.name), stationTrimmed);
  const supported = new Set(station ? (library.supports[station.id] ?? []) : []);
  const exerciseMatches = exerciseOptions(
    shownExercises,
    supported,
    exercises.map((e) => e.id),
    exerciseSearch,
  );
  const full = exercises.length >= MAX_EXERCISES_PER_ACTIVITY;
  const canCreateExercise =
    !full && exerciseTrimmed !== "" && !hasName(library.exercises.map((e) => e.name), exerciseTrimmed);
  const stationEditable = station !== null && library.editableStationIds.includes(station.id);

  function chooseStation(item: LinkedItem) {
    onChange({ station: { id: item.id, name: item.name }, exercises });
    setStationSearch("");
    // Next step: the exercises, with the station's own listed first.
    requestAnimationFrame(() => document.getElementById(exerciseInputId)?.focus());
  }

  function addExercise(item: LinkedItem) {
    onChange({ station, exercises: [...exercises, { id: item.id, name: item.name }] });
    setExerciseSearch("");
    document.getElementById(exerciseInputId)?.focus();
  }

  function moveUp(index: number) {
    const next = [...exercises];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange({ station, exercises: next });
  }

  function createStation() {
    const name = stationTrimmed;
    startTransition(async () => {
      try {
        const result = await createStationInlineAction(name);
        if (!result.ok) {
          toast.error(t("createFailed"), { description: errorMessage(result.error) });
          return;
        }
        library!.addStation(result.station);
        chooseStation(result.station);
      } catch {
        toast.error(t("createFailed"), { description: errorMessage("unexpected") });
      }
    });
  }

  function createExercise() {
    const name = exerciseTrimmed;
    const linkTo = stationEditable ? station!.id : null;
    startTransition(async () => {
      try {
        const result = await createExerciseInlineAction(name, linkTo);
        if (!result.ok) {
          toast.error(t("createFailed"), { description: errorMessage(result.error) });
          return;
        }
        library!.addExercise(result.exercise, linkTo);
        addExercise(result.exercise);
      } catch {
        toast.error(t("createFailed"), { description: errorMessage("unexpected") });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto text-base sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("linkTitle")}</DialogTitle>
          <DialogDescription>{t("linkIntro")}</DialogDescription>
        </DialogHeader>

        <div role="group" aria-label={t("filterLabel")} className="inline-flex w-fit rounded-lg border p-0.5">
          {([
            ["all", t("filterAll")],
            ["mine", t("filterMine")],
            ["global", t("filterGlobal")],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "min-h-10 rounded-md px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="grid gap-2">
          {station ? (
            <>
              <h3 className="font-semibold">{t("stationHeading")}</h3>
              <div className="flex items-center gap-2 rounded-md border px-3 py-1">
                <span className="min-w-0 flex-1 break-words">{station.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={t("removeStation", { name: station.name })}
                  onClick={() => onChange({ station: null, exercises })}
                >
                  <XIcon />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Label htmlFor={stationInputId} className="text-base font-semibold">
                {t("findStation")}
              </Label>
              <Input
                id={stationInputId}
                type="search"
                value={stationSearch}
                maxLength={100}
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => setStationSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (stationMatches[0] && stationTrimmed !== "") chooseStation(stationMatches[0]);
                    else if (canCreateStation) createStation();
                  }
                }}
              />
              <ul className="flex flex-wrap gap-2">
                {stationMatches.map((item) => (
                  <li key={item.id} className="max-w-full">
                    <Button
                      type="button"
                      variant="outline"
                      className={OPTION_CLASS}
                      aria-label={t("chooseStation", { name: item.name })}
                      onClick={() => chooseStation(item)}
                    >
                      {item.name}
                      {item.global && (
                        <Badge variant="secondary" className="ml-1">
                          {t("global")}
                        </Badge>
                      )}
                    </Button>
                  </li>
                ))}
                {stationMatches.length === 0 && !canCreateStation && stationTrimmed !== "" && (
                  <li className="text-muted-foreground">{t("noStations")}</li>
                )}
                {canCreateStation && (
                  <li className="max-w-full">
                    <Button
                      type="button"
                      variant="secondary"
                      className={OPTION_CLASS}
                      disabled={pending}
                      onClick={createStation}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {t("createStation", { name: stationTrimmed })}
                    </Button>
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="font-semibold">{t("exercisesHeading")}</h3>
          {exercises.length === 0 ? (
            <p className="text-muted-foreground">{t("noneChosen")}</p>
          ) : (
            <ol className="grid gap-1">
              {exercises.map((e, i) => (
                <li key={e.id} className="flex items-center gap-1 rounded-md border pl-3">
                  <span className="min-w-0 flex-1 break-words">{e.name}</span>
                  {i > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={t("moveExerciseUp", { name: e.name })}
                      onClick={() => moveUp(i)}
                    >
                      <ArrowUpIcon />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t("removeExercise", { name: e.name })}
                    onClick={() => onChange({ station, exercises: exercises.filter((x) => x.id !== e.id) })}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          {!full && (
            <>
              <Label htmlFor={exerciseInputId} className="mt-1">
                {t("findExercise")}
              </Label>
              <Input
                id={exerciseInputId}
                type="search"
                value={exerciseSearch}
                maxLength={100}
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => setExerciseSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (exerciseMatches[0] && exerciseTrimmed !== "") addExercise(exerciseMatches[0].item);
                    else if (canCreateExercise) createExercise();
                  }
                }}
              />
              <ul className="flex flex-wrap gap-2">
                {exerciseMatches.map(({ item, supported }) => (
                  <li key={item.id} className="max-w-full">
                    <Button
                      type="button"
                      variant="outline"
                      className={OPTION_CLASS}
                      aria-label={t("addExercise", { name: item.name })}
                      onClick={() => addExercise(item)}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {item.name}
                      {item.global && (
                        <Badge variant="secondary" className="ml-1">
                          {t("global")}
                        </Badge>
                      )}
                      {supported && (
                        <Badge variant="secondary" className="ml-1">
                          {t("supported")}
                        </Badge>
                      )}
                    </Button>
                  </li>
                ))}
                {exerciseMatches.length === 0 && !canCreateExercise && exerciseTrimmed !== "" && (
                  <li className="text-muted-foreground">{t("noExercises")}</li>
                )}
                {canCreateExercise && (
                  <li className="max-w-full">
                    <Button
                      type="button"
                      variant="secondary"
                      className={OPTION_CLASS}
                      disabled={pending}
                      onClick={createExercise}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {stationEditable
                        ? t("createExerciseAtStation", { name: exerciseTrimmed })
                        : t("createExercise", { name: exerciseTrimmed })}
                    </Button>
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        <DialogFooter>
          <Button type="button" className="h-11 px-5 text-base" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
