"use client";

import {
  ArrowRightIcon,
  ExternalLinkIcon,
  PlusIcon,
  SearchIcon,
  SquareDashedIcon,
  TypeIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { savePlanItemsAction } from "@/app/session-plan-actions";
import { CommitField, parseNumber } from "@/components/drawing/commit-field";
import { DrawingEditor, type EditorApi } from "@/components/drawing/drawing-editor";
import { hallExtent, HallFeatures, HallFloor, labelSize } from "@/components/drawing/hall-drawing";
import { StationThumbnail } from "@/components/drawing/station-layout-drawing";
import type { CatalogueEntry } from "@/components/halls/hall-editor";
import { SaveBar } from "@/components/library/save-bar";
import {
  StationLayoutEditor,
  toDrawnItem,
  toEditorItem,
  type LayoutEditorItem,
  type LayoutLine,
} from "@/components/library/station-layout-editor";
import { useLibraryForm } from "@/components/library/use-library-form";
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
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import type { HallDrawing } from "@/lib/data/halls";
import type { LoadedPlan, PickStation } from "@/lib/data/session-plans";
import { ARROW_MAX_CM, ARROW_MIN_CM, cleanText, DEFAULT_ARROW_CM, MAX_TEXT_LENGTH } from "@/lib/drawing/annotations";
import { boundsOf, type Placed } from "@/lib/drawing/editor";
import { HALL_MAX_CM, MAX_LABEL_LENGTH, normalizeDegrees } from "@/lib/halls";
import type { LoadedPart } from "@/lib/outline";
import {
  autoLinkActivity,
  contentSize,
  DEFAULT_AREA_CM,
  linkedActivityIds,
  stationNumbers,
  stationsOfParts,
  toPlanInput,
  type DrawnPlanItem,
  type OutlinePart,
  type PersonRole,
  type PlanItemContent,
} from "@/lib/session-plans";

import { activityTitle } from "./plan-text";
import { overlayExtent, PlanItemShape, PlanOverlay, placedPlanItem, type PersonInitials } from "./plan-drawing";

/*
 * The session plan editor (docs/data-model.md, "Plan item"): the shared
 * drawing editor on the session's hall, whose floor and fixed features are
 * drawn underneath and cannot be moved. Stations, equipment, texts, areas,
 * people and arrows are placed; a station is numbered by the activity it is
 * linked to. The plan is saved as a whole.
 */

/** An item in the editor: placed in metres, with what it is. */
type PlanEditorItem = Placed & { label: string | null; content: PlanItemContent };

function toDrawn(item: PlanEditorItem): DrawnPlanItem {
  const clamp = (m: number) => Math.min(Math.max(Math.round(m * 100), 0), HALL_MAX_CM);
  return {
    id: item.id,
    xCm: clamp(item.x),
    yCm: clamp(item.y),
    rotation: normalizeDegrees(Math.round(item.rotation * 10) / 10),
    label: item.label,
    content: item.content,
  };
}

/** An item with its content changed, its box following the new content. */
function withContent(content: PlanItemContent): Partial<PlanEditorItem> {
  return { content, ...contentSize(content) };
}

export function outlineOf(parts: readonly LoadedPart[]): OutlinePart[] {
  return parts.map((p) => ({
    id: p.id,
    activities: p.activities.map((a) => ({ id: a.id, stationId: a.station?.id ?? null })),
  }));
}

export function PlanEditor({
  plan,
  planName,
  hall,
  parts,
  stations,
  catalogue,
  onDirtyChange,
  onItemsChange,
}: {
  plan: LoadedPlan;
  planName: string;
  hall: HallDrawing;
  /** The parts the plan applies to, in order. */
  parts: readonly LoadedPart[];
  stations: readonly PickStation[];
  catalogue: readonly CatalogueEntry[];
  onDirtyChange: (dirty: boolean) => void;
  /** The items as drawn now, for the numbers next to the activities. */
  onItemsChange: (items: DrawnPlanItem[]) => void;
}) {
  const t = useTranslations("Plans");
  const [items, setItems] = useState<PlanEditorItem[]>(() => plan.items.map(placedPlanItem));
  const drawn = useMemo(() => items.map(toDrawn), [items]);
  const payload = useMemo(() => drawn.map(toPlanInput), [drawn]);
  const form = useLibraryForm(payload, (input) => savePlanItemsAction(plan.id, input));

  useEffect(() => onDirtyChange(form.dirty), [form.dirty, onDirtyChange]);
  useEffect(() => onItemsChange(drawn), [drawn, onItemsChange]);

  const outline = useMemo(() => outlineOf(parts), [parts]);
  const numbers = useMemo(() => stationNumbers(outline, linkedActivityIds(items)), [outline, items]);
  const initials: PersonInitials = { coach: t("initials.coach"), passare: t("initials.passare") };
  const size = labelSize(hall);

  const itemLabel = useCallback(
    (item: PlanEditorItem) => {
      const c = item.content;
      let name: string;
      switch (c.kind) {
        case "station": {
          const number = c.activityId ? numbers.get(c.activityId) : undefined;
          name =
            number === undefined
              ? t("names.station", { name: c.name })
              : t("names.stationNumbered", { number, name: c.name });
          break;
        }
        case "equipment":
          name = `${c.equipmentName}, ${c.configurationName}`;
          break;
        case "text":
          name = t("names.text", { text: c.text });
          break;
        case "person":
          name = t(`roles.${c.role}`);
          break;
        default:
          name = t(`names.${c.kind}`);
      }
      return item.label ? `${name}: ${item.label}` : name;
    },
    [numbers, t],
  );

  return (
    <form onSubmit={form.submit} className="grid gap-4">
      <DrawingEditor<PlanEditorItem>
        area={{ width: hall.widthCm / 100, height: hall.lengthCm / 100 }}
        initialItems={items}
        onItemsChange={setItems}
        label={t("editorLabel", { plan: planName, hall: hall.name })}
        viewKey={`plan:${plan.id}`}
        itemLabel={itemLabel}
        extent={(shown) => {
          const fixed = hallExtent(hall);
          const overlay = overlayExtent(shown, numbers, size);
          return {
            boxes: [...(fixed.items ?? []).map(boundsOf), ...(overlay.boxes ?? [])],
            labels: [...(fixed.labels ?? []), ...(overlay.labels ?? [])],
          };
        }}
        background={
          <g className="pointer-events-none">
            <HallFloor floor={hall} />
            <HallFeatures features={hall.features} labels hall={hall} />
          </g>
        }
        renderItem={(item) => (
          <PlanItemShape
            content={item.content}
            width={item.width}
            height={item.height}
            rotation={item.rotation}
            initials={initials}
          />
        )}
        overlay={(shown) => <PlanOverlay items={shown} numbers={numbers} size={size} />}
        palette={(api) => <Palette api={api} outline={outline} stations={stations} catalogue={catalogue} />}
        properties={(api) => (
          <Properties
            api={api}
            parts={parts}
            numbers={numbers}
            stations={stations}
            catalogue={catalogue}
            itemLabel={itemLabel}
            hall={hall}
          />
        )}
      />
      <SaveBar dirty={form.dirty} pending={form.pending} error={form.error} status={form.status} />
    </form>
  );
}

// --- Palette -------------------------------------------------------------------------

function Palette({
  api,
  outline,
  stations,
  catalogue,
}: {
  api: EditorApi<PlanEditorItem>;
  outline: readonly OutlinePart[];
  stations: readonly PickStation[];
  catalogue: readonly CatalogueEntry[];
}) {
  const t = useTranslations("Plans");
  const id = useId();
  const [query, setQuery] = useState("");
  const [equipmentId, setEquipmentId] = useState("");

  const used = useMemo(() => stationsOfParts(outline), [outline]);
  const q = query.trim().toLocaleLowerCase("sv");
  const matches = (s: PickStation) => q === "" || s.name.toLocaleLowerCase("sv").includes(q);
  const own = used.flatMap((sid) => stations.filter((s) => s.id === sid && matches(s)));
  const rest = stations.filter((s) => !used.includes(s.id) && matches(s));

  function add(content: PlanItemContent) {
    api.add({ id: crypto.randomUUID(), rotation: 0, label: null, ...withContent(content) } as PlanEditorItem);
  }

  function placeStation(station: PickStation) {
    const taken = new Set(linkedActivityIds(api.items));
    add({
      kind: "station",
      stationId: station.id,
      activityId: autoLinkActivity(station.id, outline, taken),
      adapted: false,
      name: station.name,
      layout: station.layout,
    });
  }

  function placeEquipment() {
    const entry = catalogue.find((e) => e.id === equipmentId);
    const c = entry?.configurations.find((x) => x.isDefault) ?? entry?.configurations[0];
    if (!entry || !c) {
      return;
    }
    add({
      kind: "equipment",
      equipmentId: entry.id,
      configurationId: c.id,
      equipmentName: entry.name,
      configurationName: c.name,
      widthCm: c.widthCm,
      lengthCm: c.lengthCm,
      color: c.color,
      imageUrl: c.imageUrl,
    });
  }

  const stationRow = (s: PickStation) => (
    <li key={s.id} className="flex items-center gap-2">
      <StationThumbnail items={s.layout} label={t("thumbnailLabel", { name: s.name })} className="size-10" />
      <span className="min-w-0 flex-1 text-sm break-words">{s.name}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t("placeStation", { name: s.name })}
        onClick={() => placeStation(s)}
      >
        <PlusIcon data-icon="inline-start" />
        {t("place")}
      </Button>
    </li>
  );

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-3 rounded-lg border bg-card p-3">
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold">
        {t("add")}
      </h2>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("stationsHeading")}</h3>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("searchStations")}
            placeholder={t("searchStations")}
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
          {own.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("sessionStations")}
              </p>
              <ul className="grid gap-1.5" aria-label={t("sessionStations")}>
                {own.map(stationRow)}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("libraryStations")}
              </p>
              <ul className="grid gap-1.5" aria-label={t("libraryStations")}>
                {rest.map(stationRow)}
              </ul>
            </div>
          )}
          {own.length === 0 && rest.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noStationsFound")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-2 border-t pt-3">
        <Label htmlFor={`${id}-equipment`} className="text-sm font-semibold">
          {t("equipmentHeading")}
        </Label>
        {catalogue.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noEquipment")}</p>
        ) : (
          <div className="flex gap-2">
            <NativeSelect
              id={`${id}-equipment`}
              className="w-full"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
            >
              <NativeSelectOption value="">{t("chooseEquipment")}</NativeSelectOption>
              {catalogue.map((e) => (
                <NativeSelectOption key={e.id} value={e.id}>
                  {e.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="button" variant="outline" disabled={!equipmentId} onClick={placeEquipment}>
              <PlusIcon data-icon="inline-start" />
              {t("place")}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        <Button type="button" variant="outline" onClick={() => add({ kind: "text", text: t("newText") })}>
          <TypeIcon data-icon="inline-start" />
          {t("addText")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => add({ kind: "area", widthCm: DEFAULT_AREA_CM.width, lengthCm: DEFAULT_AREA_CM.length })}
        >
          <SquareDashedIcon data-icon="inline-start" />
          {t("addArea")}
        </Button>
        <Button type="button" variant="outline" onClick={() => add({ kind: "person", role: "coach" })}>
          <UserIcon data-icon="inline-start" />
          {t("roles.coach")}
        </Button>
        <Button type="button" variant="outline" onClick={() => add({ kind: "person", role: "passare" })}>
          <UserIcon data-icon="inline-start" />
          {t("roles.passare")}
        </Button>
        <Button type="button" variant="outline" onClick={() => add({ kind: "arrow", lengthCm: DEFAULT_ARROW_CM })}>
          <ArrowRightIcon data-icon="inline-start" />
          {t("addArrow")}
        </Button>
      </div>
    </section>
  );
}

// --- Properties ----------------------------------------------------------------------

function Properties({
  api,
  parts,
  numbers,
  stations,
  catalogue,
  itemLabel,
  hall,
}: {
  api: EditorApi<PlanEditorItem>;
  parts: readonly LoadedPart[];
  numbers: ReadonlyMap<string, number>;
  stations: readonly PickStation[];
  catalogue: readonly CatalogueEntry[];
  itemLabel: (item: PlanEditorItem) => string;
  hall: HallDrawing;
}) {
  const t = useTranslations("Plans");
  const locale = useLocale();
  const id = useId();
  const [adapting, setAdapting] = useState(false);
  const decimal = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(n);

  if (api.selected.length === 0) {
    return (
      <section className="grid gap-1 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <p>{t("nothingSelected")}</p>
      </section>
    );
  }
  if (api.selected.length > 1) {
    return (
      <section className="grid gap-1 rounded-lg border bg-card p-3">
        <p className="font-medium">{t("manySelected", { count: api.selected.length })}</p>
      </section>
    );
  }
  const item = api.selected[0];
  const c = item.content;
  const update = (patch: Partial<PlanEditorItem>, merge?: string) => api.update(item.id, patch, merge);
  const setContent = (content: PlanItemContent) => update(withContent(content));
  const maxM = HALL_MAX_CM / 100;

  return (
    <section key={item.id} aria-labelledby={`${id}-heading`} className="grid gap-3 rounded-lg border bg-card p-3">
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold break-words">
        {itemLabel(item)}
      </h2>

      {c.kind === "station" && (
        <StationProperties
          api={api}
          item={item}
          content={c}
          parts={parts}
          numbers={numbers}
          stations={stations}
          onAdapt={() => setAdapting(true)}
        />
      )}

      {c.kind === "equipment" && (
        <EquipmentProperties content={c} catalogue={catalogue} onChange={setContent} />
      )}

      {c.kind === "text" && (
        <CommitField
          label={t("textLabel")}
          value={c.text}
          maxLength={MAX_TEXT_LENGTH}
          parse={(text) => cleanText(text) || undefined}
          onCommit={(v) => setContent({ kind: "text", text: cleanText(String(v)) })}
        />
      )}

      {c.kind === "area" && (
        <div className="grid grid-cols-2 gap-2">
          <CommitField
            label={t("widthLabel")}
            value={String(c.widthCm)}
            inputMode="numeric"
            parse={(text) => {
              const v = parseNumber(text, 1, HALL_MAX_CM);
              return v === undefined ? undefined : Math.round(v);
            }}
            onCommit={(v) => setContent({ ...c, widthCm: Number(v) })}
          />
          <CommitField
            label={t("lengthLabel")}
            value={String(c.lengthCm)}
            inputMode="numeric"
            parse={(text) => {
              const v = parseNumber(text, 1, HALL_MAX_CM);
              return v === undefined ? undefined : Math.round(v);
            }}
            onCommit={(v) => setContent({ ...c, lengthCm: Number(v) })}
          />
        </div>
      )}

      {c.kind === "person" && (
        <div className="grid gap-1">
          <Label htmlFor={`${id}-role`} className="text-sm">
            {t("roleLabel")}
          </Label>
          <NativeSelect
            id={`${id}-role`}
            className="w-full"
            value={c.role}
            onChange={(e) => setContent({ kind: "person", role: e.target.value as PersonRole })}
          >
            <NativeSelectOption value="coach">{t("roles.coach")}</NativeSelectOption>
            <NativeSelectOption value="passare">{t("roles.passare")}</NativeSelectOption>
          </NativeSelect>
        </div>
      )}

      {c.kind === "arrow" && (
        <CommitField
          label={t("arrowLength")}
          value={String(c.lengthCm)}
          inputMode="numeric"
          parse={(text) => {
            const v = parseNumber(text, ARROW_MIN_CM, ARROW_MAX_CM);
            return v === undefined ? undefined : Math.round(v);
          }}
          onCommit={(v) => setContent({ kind: "arrow", lengthCm: Number(v) })}
        />
      )}

      <CommitField
        label={t("labelLabel")}
        value={item.label ?? ""}
        maxLength={MAX_LABEL_LENGTH}
        parse={(text) => text.trim() || null}
        onCommit={(v) => update({ label: (v as string | null) || null })}
      />
      <div className="grid grid-cols-3 gap-2">
        <CommitField
          label={t("xLabel")}
          value={decimal(item.x)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, 0, Math.min(maxM, hall.widthCm / 100))}
          onCommit={(v) => update({ x: Math.round(Number(v) * 100) / 100 })}
        />
        <CommitField
          label={t("yLabel")}
          value={decimal(item.y)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, 0, Math.min(maxM, hall.lengthCm / 100))}
          onCommit={(v) => update({ y: Math.round(Number(v) * 100) / 100 })}
        />
        <CommitField
          label={t("rotationLabel")}
          value={decimal(item.rotation)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, -360, 360)}
          onCommit={(v) => update({ rotation: normalizeDegrees(Number(v)) })}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t("positionHint")}</p>

      {c.kind === "station" && c.adapted && (
        <AdaptDialog
          open={adapting}
          onOpenChange={setAdapting}
          content={c}
          lines={linesFor(c, stations, catalogue)}
          catalogue={catalogue}
          onDone={(layout) => setContent({ ...c, layout })}
        />
      )}
    </section>
  );
}

function StationProperties({
  api,
  item,
  content: c,
  parts,
  numbers,
  stations,
  onAdapt,
}: {
  api: EditorApi<PlanEditorItem>;
  item: PlanEditorItem;
  content: Extract<PlanItemContent, { kind: "station" }>;
  parts: readonly LoadedPart[];
  numbers: ReadonlyMap<string, number>;
  stations: readonly PickStation[];
  onAdapt: () => void;
}) {
  const t = useTranslations("Plans");
  const id = useId();
  const library = stations.find((s) => s.id === c.stationId);
  const number = c.activityId ? numbers.get(c.activityId) : undefined;

  /** Links the station to an activity; another station linked to it loses the link (one undo step). */
  function link(activityId: string | null) {
    api.replace(
      api.items.map((other) => {
        const oc = other.content;
        if (other.id === item.id) {
          return { ...other, content: { ...c, activityId } };
        }
        if (activityId && oc.kind === "station" && oc.activityId === activityId) {
          return { ...other, content: { ...oc, activityId: null } };
        }
        return other;
      }),
    );
  }

  function adapt() {
    api.update(item.id, {
      content: { ...c, adapted: true, layout: c.layout.map((l) => ({ ...l, id: crypto.randomUUID() })) },
    });
    onAdapt();
  }

  function followLibrary() {
    if (library) {
      api.update(item.id, withContent({ ...c, adapted: false, name: library.name, layout: library.layout }));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor={`${id}-activity`} className="text-sm">
          {t("activityLabel")}
        </Label>
        <NativeSelect
          id={`${id}-activity`}
          className="w-full"
          value={c.activityId ?? ""}
          onChange={(e) => link(e.target.value || null)}
        >
          <NativeSelectOption value="">{t("noActivity")}</NativeSelectOption>
          {parts.map((part) =>
            part.activities.length === 0 ? null : (
              <NativeSelectOptGroup key={part.id} label={part.title}>
                {part.activities.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.station?.id === c.stationId && c.stationId
                      ? t("activityWithStation", { text: activityTitle(a) })
                      : activityTitle(a)}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ),
          )}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          {number === undefined ? t("activityHint") : t("numberIs", { number })}
        </p>
      </div>

      {c.adapted ? (
        <div className="grid gap-2 rounded-md bg-muted/50 p-2.5">
          <p className="text-sm">{t("adapted")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onAdapt}>
              {t("editAdapted")}
            </Button>
            {library && (
              <Button type="button" variant="ghost" size="sm" onClick={followLibrary}>
                {t("followLibrary")}
              </Button>
            )}
          </div>
          {c.stationId === null && <p className="text-sm text-muted-foreground">{t("deletedStation")}</p>}
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Button type="button" variant="outline" onClick={adapt}>
            {t("adapt")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("adaptHint")}</p>
        </div>
      )}

      {library && (
        <Link
          href={`/library/stations/${library.id}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ExternalLinkIcon className="size-4" />
          {t("openStation")}
        </Link>
      )}
    </div>
  );
}

function EquipmentProperties({
  content: c,
  catalogue,
  onChange,
}: {
  content: Extract<PlanItemContent, { kind: "equipment" }>;
  catalogue: readonly CatalogueEntry[];
  onChange: (content: PlanItemContent) => void;
}) {
  const t = useTranslations("Plans");
  const id = useId();
  const entry = catalogue.find((e) => e.id === c.equipmentId);
  if (!entry) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor={`${id}-configuration`} className="text-sm">
        {t("configurationLabel")}
      </Label>
      <NativeSelect
        id={`${id}-configuration`}
        className="w-full"
        value={c.configurationId}
        onChange={(e) => {
          const x = entry.configurations.find((cfg) => cfg.id === e.target.value);
          if (x) {
            onChange({
              ...c,
              configurationId: x.id,
              configurationName: x.name,
              widthCm: x.widthCm,
              lengthCm: x.lengthCm,
              color: x.color,
              imageUrl: x.imageUrl,
            });
          }
        }}
      >
        {entry.configurations.map((x) => (
          <NativeSelectOption key={x.id} value={x.id}>
            {t("configurationOption", { name: x.name, width: x.widthCm, length: x.lengthCm })}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * What an adapted station may hold: the library station's needed equipment
 * when it can be seen, else as many of each equipment as the copy has.
 */
function linesFor(
  c: Extract<PlanItemContent, { kind: "station" }>,
  stations: readonly PickStation[],
  catalogue: readonly CatalogueEntry[],
): LayoutLine[] {
  const library = stations.find((s) => s.id === c.stationId);
  const counts = new Map<string, number>();
  for (const l of c.layout) {
    if (l.kind === "equipment") {
      counts.set(l.equipmentId, (counts.get(l.equipmentId) ?? 0) + 1);
    }
  }
  const lines = new Map<string, LayoutLine>(
    (library?.lines ?? []).map((l) => [l.equipmentId, { ...l }]),
  );
  for (const [equipmentId, n] of counts) {
    const line = lines.get(equipmentId);
    if (line) {
      line.quantity = Math.max(line.quantity, n);
    } else {
      const name = catalogue.find((e) => e.id === equipmentId)?.name ?? "";
      lines.set(equipmentId, { equipmentId, name, quantity: n });
    }
  }
  return [...lines.values()];
}

/** Changes an adapted station's own layout in the station layout editor. */
function AdaptDialog({
  open,
  onOpenChange,
  content,
  lines,
  catalogue,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: Extract<PlanItemContent, { kind: "station" }>;
  lines: LayoutLine[];
  catalogue: readonly CatalogueEntry[];
  onDone: (layout: Extract<PlanItemContent, { kind: "station" }>["layout"]) => void;
}) {
  const t = useTranslations("Plans");
  const tc = useTranslations("Common");
  const [items, setItems] = useState<LayoutEditorItem[] | null>(null);
  const removed = useMemo(() => new Set<string>(), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setItems(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-[min(96vw,80rem)]">
        <DialogHeader>
          <DialogTitle>{t("adaptTitle", { name: content.name })}</DialogTitle>
          <DialogDescription>{t("adaptIntro")}</DialogDescription>
        </DialogHeader>
        {open && (
          <StationLayoutEditor
            stationName={content.name}
            initialItems={content.layout.map(toEditorItem)}
            onItemsChange={setItems}
            lines={lines}
            catalogue={catalogue}
            removedIds={removed}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (items) {
                onDone(items.map((i) => toDrawnItem(i, catalogue)));
              }
              setItems(null);
              onOpenChange(false);
            }}
          >
            {t("adaptDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
