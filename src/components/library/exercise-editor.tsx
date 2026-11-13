"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";

import { deleteExerciseAction, updateExerciseAction } from "@/app/library-actions";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_FOCUS_CUE_LENGTH, MAX_FOCUS_CUES } from "@/lib/data/schemas";
import { byName } from "@/lib/library";

import { LinkPicker } from "./link-picker";
import { SaveBar } from "./save-bar";
import { useLibraryForm } from "./use-library-form";

type Item = { id: string; name: string };
type Cue = { key: string; text: string };

/** Edits an exercise: texts, focus cues and the stations that support it. */
export function ExerciseEditor({
  exercise,
  initialStations,
  stations,
}: {
  exercise: {
    id: string;
    name: string;
    description: string | null;
    focusCues: string[];
    easierVariant: string | null;
    harderVariant: string | null;
    disciplineName: string | null;
  };
  initialStations: Item[];
  /** Every station the user may see. */
  stations: Item[];
}) {
  const t = useTranslations("Exercises");
  const tl = useTranslations("Library");
  const tc = useTranslations("Common");
  const id = useId();

  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [cues, setCues] = useState<Cue[]>(() =>
    exercise.focusCues.map((text) => ({ key: crypto.randomUUID(), text })),
  );
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [easier, setEasier] = useState(exercise.easierVariant ?? "");
  const [harder, setHarder] = useState(exercise.harderVariant ?? "");
  const [discipline, setDiscipline] = useState(exercise.disciplineName ?? "");
  const [chosen, setChosen] = useState<Item[]>(initialStations);

  const form = useLibraryForm(
    {
      name,
      description,
      focusCues: cues.map((c) => c.text),
      easierVariant: easier,
      harderVariant: harder,
      disciplineName: discipline,
      stationIds: chosen.map((s) => s.id),
    },
    (payload) => updateExerciseAction(exercise.id, payload),
  );

  function addCue() {
    const key = crypto.randomUUID();
    setCues((prev) => [...prev, { key, text: "" }]);
    setFocusKey(key);
  }

  function moveCue(index: number, by: -1 | 1) {
    setCues((prev) => {
      const next = [...prev];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  return (
    <form onSubmit={form.submit} className="grid gap-8">
      <section className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`}>{tl("nameLabel")}</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={100}
            autoComplete="off"
            className="h-11"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-discipline`}>
            {t("disciplineLabel")}{" "}
            <span className="font-normal text-muted-foreground">({tc("optional")})</span>
          </Label>
          <Input
            id={`${id}-discipline`}
            value={discipline}
            maxLength={100}
            placeholder={t("disciplinePlaceholder")}
            className="h-11 sm:max-w-xs"
            onChange={(e) => setDiscipline(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-description`}>{tl("descriptionLabel")}</Label>
          <Textarea
            id={`${id}-description`}
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      <section aria-labelledby={`${id}-cues`} className="grid gap-3">
        <div className="grid gap-1">
          <h2 id={`${id}-cues`} className="font-heading text-xl font-semibold">
            {t("cuesHeading")}
          </h2>
          <p className="text-muted-foreground">{t("cuesHint")}</p>
        </div>
        {cues.length === 0 ? (
          <p className="text-muted-foreground">{t("cuesEmpty")}</p>
        ) : (
          <ol className="grid gap-2">
            {cues.map((cue, index) => {
              const n = index + 1;
              return (
                <li key={cue.key} className="flex items-center gap-1">
                  <span aria-hidden="true" className="w-6 shrink-0 text-right text-muted-foreground">
                    {n}.
                  </span>
                  <Input
                    value={cue.text}
                    maxLength={MAX_FOCUS_CUE_LENGTH}
                    aria-label={t("cueLabel", { n })}
                    autoFocus={cue.key === focusKey}
                    className="h-11 min-w-0 flex-1"
                    onChange={(e) =>
                      setCues((prev) =>
                        prev.map((c) => (c.key === cue.key ? { ...c, text: e.target.value } : c)),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (cues.length < MAX_FOCUS_CUES) {
                          addCue();
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-11 shrink-0"
                    aria-label={t("moveCueUp", { n })}
                    disabled={index === 0}
                    onClick={() => moveCue(index, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-11 shrink-0"
                    aria-label={t("moveCueDown", { n })}
                    disabled={index === cues.length - 1}
                    onClick={() => moveCue(index, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-11 shrink-0"
                    aria-label={t("removeCue", { n })}
                    onClick={() => setCues((prev) => prev.filter((c) => c.key !== cue.key))}
                  >
                    <XIcon />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            disabled={cues.length >= MAX_FOCUS_CUES}
            onClick={addCue}
          >
            <PlusIcon data-icon="inline-start" />
            {t("addCue")}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-easier`}>{t("easierLabel")}</Label>
          <Textarea
            id={`${id}-easier`}
            value={easier}
            maxLength={1000}
            rows={2}
            onChange={(e) => setEasier(e.target.value)}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-harder`}>{t("harderLabel")}</Label>
          <Textarea
            id={`${id}-harder`}
            value={harder}
            maxLength={1000}
            rows={2}
            onChange={(e) => setHarder(e.target.value)}
          />
        </div>
      </section>

      <section aria-labelledby={`${id}-stations`} className="grid gap-3">
        <h2 id={`${id}-stations`} className="font-heading text-xl font-semibold">
          {t("stationsHeading")}
        </h2>
        {chosen.length === 0 ? (
          <p className="text-muted-foreground">{t("stationsEmpty")}</p>
        ) : (
          <ul className="grid gap-2">
            {chosen.map((station) => (
              <li
                key={station.id}
                className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-3"
              >
                <Link
                  href={`/library/stations/${station.id}`}
                  className="min-w-0 flex-1 rounded-sm break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {station.name}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-11 shrink-0"
                  aria-label={t("removeStation", { name: station.name })}
                  onClick={() => setChosen((prev) => prev.filter((s) => s.id !== station.id))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <LinkPicker
          label={t("findStation")}
          items={stations}
          chosenIds={chosen.map((s) => s.id)}
          onAdd={(item) => setChosen((prev) => [...prev, item].sort(byName))}
          addLabel={(n) => t("addStation", { name: n })}
          noMatches={t("noMatches")}
        />
      </section>

      <div>
        <ConfirmDelete
          trigger={
            <Button type="button" variant="outline" className="h-11 px-4 text-destructive">
              <Trash2Icon data-icon="inline-start" />
              {t("deleteExercise")}
            </Button>
          }
          title={t("deleteTitle")}
          description={t("deleteText", { name: exercise.name })}
          action={() => deleteExerciseAction(exercise.id)}
        />
      </div>

      <SaveBar {...form} />
    </form>
  );
}
