"use client";

import { Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";

import { deleteExerciseAction, updateExerciseAction } from "@/app/library-actions";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { byName } from "@/lib/library";

import { LinkPicker } from "./link-picker";
import { SaveBar } from "./save-bar";
import { useLibraryForm } from "./use-library-form";

type Item = { id: string; name: string };

/** Edits an exercise: texts and the stations that support it. */
export function ExerciseEditor({
  exercise,
  initialStations,
  stations,
  activityCount,
}: {
  exercise: {
    id: string;
    name: string;
    description: string | null;
    disciplineName: string | null;
  };
  initialStations: Item[];
  /** Every station the user may see. */
  stations: Item[];
  /** How many session activities use the exercise. */
  activityCount: number;
}) {
  const t = useTranslations("Exercises");
  const tl = useTranslations("Library");
  const tc = useTranslations("Common");
  const id = useId();

  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [discipline, setDiscipline] = useState(exercise.disciplineName ?? "");
  const [chosen, setChosen] = useState<Item[]>(initialStations);

  const form = useLibraryForm(
    {
      name,
      description,
      disciplineName: discipline,
      stationIds: chosen.map((s) => s.id),
    },
    (payload) => updateExerciseAction(exercise.id, payload),
  );

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
          description={t("deleteText", { name: exercise.name, count: activityCount })}
          action={() => deleteExerciseAction(exercise.id)}
        />
      </div>

      <SaveBar {...form} />
    </form>
  );
}
