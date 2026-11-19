"use client";

import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createExerciseInlineAction,
  deleteStationAction,
  updateStationAction,
} from "@/app/library-actions";
import { StationLayoutDrawing } from "@/components/drawing/station-layout-drawing";
import type { CatalogueEntry } from "@/components/halls/hall-editor";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EQUIPMENT_QUANTITY } from "@/lib/data/schemas";
import { byName } from "@/lib/library";
import { pruneLayout, type DrawnLayoutItem } from "@/lib/station-layouts";

import { LinkPicker } from "./link-picker";
import {
  StationLayoutEditor,
  toDrawnItem,
  toEditorItem,
  toLayoutInput,
  type LayoutEditorItem,
} from "./station-layout-editor";
import { SaveBar } from "./save-bar";
import { useLibraryForm } from "./use-library-form";

type Item = { id: string; name: string };
type Line = { equipmentId: string; name: string; quantity: string };

const READING = "mx-auto w-full max-w-3xl";

/**
 * Edits a station: name, description, needed equipment, supported exercises
 * and its layout, all saved together.
 */
export function StationEditor({
  station,
  initialEquipment,
  initialExercises,
  catalogue,
  exercises: initialAllExercises,
  activityCount,
  isGlobal = false,
  initialLayout,
  configurations,
}: {
  station: { id: string; name: string; description: string | null };
  initialEquipment: { equipmentId: string; name: string; quantity: number }[];
  initialExercises: Item[];
  /** The whole equipment catalogue. */
  catalogue: Item[];
  /** Every exercise the user may see. */
  exercises: Item[];
  /** How many session activities use the station. */
  activityCount: number;
  /** A global item: its usage counts activities of all users. */
  isGlobal?: boolean;
  /** The stored layout in layer order. */
  initialLayout: DrawnLayoutItem[];
  /** Equipment that has configurations, with them: what can be drawn. */
  configurations: CatalogueEntry[];
}) {
  const tLayout = useTranslations("StationLayout");
  const t = useTranslations("Stations");
  const tl = useTranslations("Library");
  const errorMessage = useErrorMessage();
  const nameId = useId();
  const descriptionId = useId();
  const addEquipmentId = useId();

  const [name, setName] = useState(station.name);
  const [description, setDescription] = useState(station.description ?? "");
  const [lines, setLines] = useState<Line[]>(
    initialEquipment.map((l) => ({ ...l, quantity: String(l.quantity) })),
  );
  const [chosen, setChosen] = useState<Item[]>(initialExercises);
  const [allExercises, setAllExercises] = useState<Item[]>(initialAllExercises);
  const [toAdd, setToAdd] = useState("");
  const [layout, setLayout] = useState<LayoutEditorItem[]>(() => initialLayout.map(toEditorItem));
  // A new key starts the drawing editor afresh, after a save removed items.
  const [editorKey, setEditorKey] = useState(0);

  const layoutLines = useMemo(
    () =>
      lines.map((l) => ({
        equipmentId: l.equipmentId,
        name: l.name,
        quantity: Math.max(0, Math.trunc(Number(l.quantity)) || 0),
      })),
    [lines],
  );
  const pruned = useMemo(() => pruneLayout(layout, layoutLines), [layout, layoutLines]);
  const removedIds = useMemo(() => new Set(pruned.removed.map((i) => i.id)), [pruned]);

  const form = useLibraryForm(
    {
      name,
      description,
      equipment: lines.map((l) => ({
        equipmentId: l.equipmentId,
        quantity: Number(l.quantity),
      })),
      exerciseIds: chosen.map((e) => e.id),
      // What the layout will be once saved; the save sends it all, and the
      // server removes what no longer fits and says how much.
      layout: pruned.kept.map(toLayoutInput),
    },
    async (payload) => {
      const result = await updateStationAction(station.id, {
        ...payload,
        layout: layout.map(toLayoutInput),
      });
      if (result.ok && result.removed > 0) {
        setLayout(pruned.kept);
        setEditorKey((k) => k + 1);
        toast.info(tLayout("removed", { count: result.removed }));
      }
      return result;
    },
  );

  const unused = catalogue.filter((c) => !lines.some((l) => l.equipmentId === c.id));

  function addLine() {
    const entry = catalogue.find((c) => c.id === toAdd);
    if (!entry) {
      return;
    }
    setLines((prev) => [...prev, { equipmentId: entry.id, name: entry.name, quantity: "1" }]);
    setToAdd("");
  }

  async function createExercise(exerciseName: string): Promise<boolean> {
    const result = await createExerciseInlineAction(exerciseName);
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return false;
    }
    setAllExercises((prev) => [...prev, result.exercise]);
    setChosen((prev) => [...prev, result.exercise].sort(byName));
    return true;
  }

  return (
    <form onSubmit={form.submit} className="grid gap-8">
      <section className={`grid gap-4 ${READING}`}>
        <div className="grid gap-2">
          <Label htmlFor={nameId}>{tl("nameLabel")}</Label>
          <Input
            id={nameId}
            value={name}
            maxLength={100}
            autoComplete="off"
            className="h-11"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={descriptionId}>{tl("descriptionLabel")}</Label>
          <Textarea
            id={descriptionId}
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      <section aria-labelledby={`${nameId}-equipment`} className={`grid gap-3 ${READING}`}>
        <h2 id={`${nameId}-equipment`} className="font-heading text-xl font-semibold">
          {t("equipmentHeading")}
        </h2>
        {lines.length === 0 ? (
          <p className="text-muted-foreground">{t("equipmentEmpty")}</p>
        ) : (
          <ul className="grid gap-2">
            {lines.map((line) => (
              <li
                key={line.equipmentId}
                className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-3"
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_EQUIPMENT_QUANTITY}
                  step={1}
                  value={line.quantity}
                  aria-label={t("quantityLabel", { name: line.name })}
                  className="h-11 w-18 shrink-0 text-center"
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.equipmentId === line.equipmentId ? { ...l, quantity: e.target.value } : l,
                      ),
                    )
                  }
                />
                <span aria-hidden="true" className="text-muted-foreground">
                  ×
                </span>
                <span className="min-w-0 flex-1 break-words">{line.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-11 shrink-0"
                  aria-label={t("removeEquipment", { name: line.name })}
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.equipmentId !== line.equipmentId))
                  }
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {catalogue.length === 0 ? (
          <p className="text-muted-foreground">{t("catalogueEmpty")}</p>
        ) : unused.length === 0 ? (
          <p className="text-muted-foreground">{t("allEquipmentUsed")}</p>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={addEquipmentId}>{t("addEquipmentLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              <NativeSelect
                id={addEquipmentId}
                value={toAdd}
                onChange={(e) => setToAdd(e.target.value)}
                className="min-w-0 flex-1 sm:max-w-xs [&_select]:h-11 [&_select]:text-base"
              >
                <NativeSelectOption value="">{t("chooseEquipment")}</NativeSelectOption>
                {unused.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4"
                disabled={toAdd === ""}
                onClick={addLine}
              >
                <PlusIcon data-icon="inline-start" />
                {t("addEquipment")}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby={`${nameId}-layout`} className="grid gap-3">
        <div className={`grid gap-1 ${READING}`}>
          <h2 id={`${nameId}-layout`} className="font-heading text-xl font-semibold">
            {tLayout("heading")}
          </h2>
          <p className="text-muted-foreground">{tLayout("intro")}</p>
          {pruned.removed.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              {tLayout("willRemove", { count: pruned.removed.length })}
            </p>
          )}
        </div>
        {/* The editor is made for a desktop; on smaller screens the layout is shown read-only. */}
        <div className="hidden lg:block">
          <StationLayoutEditor
            key={editorKey}
            stationName={name}
            viewKey={`station:${station.id}`}
            initialItems={layout}
            onItemsChange={setLayout}
            lines={layoutLines}
            catalogue={configurations}
            removedIds={removedIds}
          />
        </div>
        <div className={`grid gap-3 lg:hidden ${READING}`}>
          <p className="rounded-lg border bg-muted/40 px-3 py-2.5">{tLayout("desktopOnly")}</p>
          {layout.length > 0 ? (
            <div className="rounded-lg border bg-card p-3">
              <StationLayoutDrawing
                items={layout.map((i) => toDrawnItem(i, configurations))}
                label={tLayout("drawingLabel", { name })}
                className="h-auto max-h-96 w-full"
              />
            </div>
          ) : (
            <p className="text-muted-foreground">{tLayout("empty")}</p>
          )}
        </div>
      </section>

      <section aria-labelledby={`${nameId}-exercises`} className={`grid gap-3 ${READING}`}>
        <h2 id={`${nameId}-exercises`} className="font-heading text-xl font-semibold">
          {t("exercisesHeading")}
        </h2>
        {chosen.length === 0 ? (
          <p className="text-muted-foreground">{t("exercisesEmpty")}</p>
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
                  aria-label={t("removeExercise", { name: exercise.name })}
                  onClick={() => setChosen((prev) => prev.filter((e) => e.id !== exercise.id))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <LinkPicker
          label={t("findExercise")}
          items={allExercises}
          chosenIds={chosen.map((e) => e.id)}
          onAdd={(item) => setChosen((prev) => [...prev, item].sort(byName))}
          addLabel={(n) => t("addExercise", { name: n })}
          noMatches={t("noMatches")}
          create={{
            label: (n) => t("createExercise", { name: n }),
            onCreate: createExercise,
          }}
        />
      </section>

      <div className={READING}>
        <ConfirmDelete
          trigger={
            <Button type="button" variant="outline" className="h-11 px-4 text-destructive">
              <Trash2Icon data-icon="inline-start" />
              {t("deleteStation")}
            </Button>
          }
          title={t("deleteTitle")}
          description={
            isGlobal
              ? `${t("deleteText", { name: station.name, count: activityCount })} ${tl("deleteGlobalNote")}`
              : t("deleteText", { name: station.name, count: activityCount })
          }
          action={() => deleteStationAction(station.id)}
        />
      </div>

      <SaveBar {...form} />
    </form>
  );
}
