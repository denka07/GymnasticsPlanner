"use client";

import { ArrowRightIcon, PlusIcon, TypeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useState } from "react";

import { CommitField, parseNumber } from "@/components/drawing/commit-field";
import { DrawingEditor, type EditorApi } from "@/components/drawing/drawing-editor";
import { DrawingLabel } from "@/components/drawing/hall-drawing";
import { LAYOUT_LABEL_SIZE, LayoutItemShape } from "@/components/drawing/station-layout-drawing";
import type { CatalogueEntry } from "@/components/halls/hall-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  ARROW_MAX_CM,
  ARROW_MIN_CM,
  arrowSize,
  cleanText,
  DEFAULT_ARROW_CM,
  MAX_TEXT_LENGTH,
  textSize,
} from "@/lib/drawing/annotations";
import type { Placed } from "@/lib/drawing/editor";
import { MAX_LABEL_LENGTH, normalizeDegrees } from "@/lib/halls";
import {
  layoutView,
  placementsLeft,
  STATION_LAYOUT_HALF_CM,
  type DrawnLayoutItem,
  type LayoutItemInput,
  type LayoutItemKind,
} from "@/lib/station-layouts";

/*
 * The station layout editor (docs/data-model.md, "Station layout item"): the
 * shared drawing editor around the station's centre, with the station's own
 * equipment, arrows and texts. The layout is kept by the station editor and
 * saved with the station.
 */

/** The station's centre in the editor's drawing, which runs from 0 to twice this, in metres. */
const CENTRE = STATION_LAYOUT_HALF_CM / 100;
const AREA = { width: 2 * CENTRE, height: 2 * CENTRE };
/** At first the editor shows at least this much around the centre, in metres. */
const START_VIEW = 10;

/** A layout item in the editor: placed in metres from the drawing's corner. */
export type LayoutEditorItem = Placed & {
  kind: LayoutItemKind;
  label: string | null;
  /** Equipment: the configuration's look. */
  equipmentId: string | null;
  configurationId: string | null;
  color: string | null;
  imageUrl: string | null;
  /** Equipment: the configuration's size; arrow: its length (widthCm). */
  widthCm: number;
  lengthCm: number;
  /** Text items only. */
  text: string;
};

/** A line of the station's equipment, as the form has it now. */
export type LayoutLine = {
  equipmentId: string;
  name: string;
  quantity: number;
};

function boxOf(kind: LayoutItemKind, widthCm: number, lengthCm: number, text: string) {
  if (kind === "equipment") {
    return { width: widthCm / 100, height: lengthCm / 100 };
  }
  return kind === "arrow" ? arrowSize(widthCm) : textSize(text);
}

/** What the shared shapes need to draw an editor item. */
function drawableOf(item: LayoutEditorItem) {
  if (item.kind === "equipment") {
    const { widthCm, lengthCm, color, imageUrl } = item;
    return { kind: "equipment" as const, widthCm, lengthCm, color, imageUrl };
  }
  return item.kind === "arrow"
    ? { kind: "arrow" as const, lengthCm: item.widthCm }
    : { kind: "text" as const, text: item.text };
}

export function toEditorItem(item: DrawnLayoutItem): LayoutEditorItem {
  const common = {
    id: item.id,
    x: CENTRE + item.xCm / 100,
    y: CENTRE + item.yCm / 100,
    rotation: item.rotation,
    label: item.label,
    kind: item.kind,
    equipmentId: null,
    configurationId: null,
    color: null,
    imageUrl: null,
    widthCm: 0,
    lengthCm: 0,
    text: "",
  };
  if (item.kind === "equipment") {
    return {
      ...common,
      ...boxOf("equipment", item.widthCm, item.lengthCm, ""),
      equipmentId: item.equipmentId,
      configurationId: item.configurationId,
      color: item.color,
      imageUrl: item.imageUrl,
      widthCm: item.widthCm,
      lengthCm: item.lengthCm,
    };
  }
  if (item.kind === "arrow") {
    return { ...common, ...arrowSize(item.lengthCm), widthCm: item.lengthCm };
  }
  return { ...common, ...textSize(item.text), text: item.text };
}

function placementOf(item: LayoutEditorItem) {
  return {
    id: item.id,
    xCm: Math.round((item.x - CENTRE) * 100),
    yCm: Math.round((item.y - CENTRE) * 100),
    rotation: normalizeDegrees(Math.round(item.rotation * 10) / 10),
    label: item.label,
  };
}

/** What a save sends for an item. */
export function toLayoutInput(item: LayoutEditorItem): LayoutItemInput {
  const placed = placementOf(item);
  if (item.kind === "equipment") {
    return {
      ...placed,
      kind: "equipment",
      equipmentId: item.equipmentId ?? "",
      configurationId: item.configurationId ?? "",
    };
  }
  if (item.kind === "arrow") {
    return { ...placed, kind: "arrow", lengthCm: item.widthCm };
  }
  return { ...placed, kind: "text", text: item.text };
}

/** An editor item as read-only drawings take it. */
export function toDrawnItem(
  item: LayoutEditorItem,
  catalogue: readonly CatalogueEntry[],
): DrawnLayoutItem {
  const placed = placementOf(item);
  if (item.kind === "equipment") {
    const entry = catalogue.find((e) => e.id === item.equipmentId);
    const configuration = entry?.configurations.find((c) => c.id === item.configurationId);
    return {
      ...placed,
      kind: "equipment",
      equipmentId: item.equipmentId ?? "",
      configurationId: item.configurationId ?? "",
      equipmentName: entry?.name ?? "",
      configurationName: configuration?.name ?? "",
      widthCm: item.widthCm,
      lengthCm: item.lengthCm,
      color: item.color,
      imageUrl: item.imageUrl,
    };
  }
  if (item.kind === "arrow") {
    return { ...placed, kind: "arrow", lengthCm: item.widthCm };
  }
  return { ...placed, kind: "text", text: item.text };
}

export function StationLayoutEditor({
  stationName,
  initialItems,
  onItemsChange,
  lines,
  catalogue,
  removedIds,
}: {
  stationName: string;
  initialItems: LayoutEditorItem[];
  onItemsChange: (items: LayoutEditorItem[]) => void;
  /** The station's equipment as the form has it now. */
  lines: readonly LayoutLine[];
  /** Equipment with its configurations. */
  catalogue: readonly CatalogueEntry[];
  /** Items the next save removes, drawn faded. */
  removedIds: ReadonlySet<string>;
}) {
  const t = useTranslations("StationLayout");
  // At first: the drawn items with room around them, or the middle of the area.
  const [initialView] = useState(() => {
    const items = initialItems.map((i) => toDrawnItem(i, catalogue));
    const view = layoutView(items, 1.5, START_VIEW) ?? {
      x: -START_VIEW / 2,
      y: -START_VIEW / 2,
      width: START_VIEW,
      height: START_VIEW,
    };
    return { ...view, x: view.x + CENTRE, y: view.y + CENTRE };
  });

  const itemLabel = useCallback(
    (item: LayoutEditorItem) => {
      let name: string;
      if (item.kind === "equipment") {
        const entry = catalogue.find((e) => e.id === item.equipmentId);
        const configuration = entry?.configurations.find((c) => c.id === item.configurationId);
        name = entry
          ? `${entry.name}${configuration ? `, ${configuration.name}` : ""}`
          : t("equipment");
      } else if (item.kind === "arrow") {
        name = t("arrow");
      } else {
        name = t("textItem", { text: item.text });
      }
      return item.label ? `${name}: ${item.label}` : name;
    },
    [catalogue, t],
  );

  return (
    <DrawingEditor<LayoutEditorItem>
      area={AREA}
      initialView={initialView}
      initialItems={initialItems}
      onItemsChange={onItemsChange}
      label={t("editorLabel", { name: stationName })}
      itemLabel={itemLabel}
      background={<CentreMark />}
      renderItem={(item) => (
        <g opacity={removedIds.has(item.id) ? 0.35 : 1}>
          <LayoutItemShape item={drawableOf(item)} width={item.width} height={item.height} />
        </g>
      )}
      overlay={(shown) =>
        shown.map((item) =>
          item.label ? (
            <DrawingLabel
              key={`label-${item.id}`}
              x={item.x}
              y={item.y}
              text={item.label}
              size={LAYOUT_LABEL_SIZE}
            />
          ) : null,
        )
      }
      palette={(api) => <Palette api={api} lines={lines} catalogue={catalogue} />}
      properties={(api) => <Properties api={api} catalogue={catalogue} itemLabel={itemLabel} />}
    />
  );
}

/** A neutral floor with the station's centre marked. */
function CentreMark() {
  const arm = 0.6;
  return (
    <g data-centre className="pointer-events-none">
      <rect x={0} y={0} width={AREA.width} height={AREA.height} className="fill-background" />
      <g className="stroke-foreground/40" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
        <line
          x1={CENTRE - arm}
          y1={CENTRE}
          x2={CENTRE + arm}
          y2={CENTRE}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={CENTRE}
          y1={CENTRE - arm}
          x2={CENTRE}
          y2={CENTRE + arm}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}

/** The station's equipment, each with how many more may be placed, and arrows and texts. */
function Palette({
  api,
  lines,
  catalogue,
}: {
  api: EditorApi<LayoutEditorItem>;
  lines: readonly LayoutLine[];
  catalogue: readonly CatalogueEntry[];
}) {
  const t = useTranslations("StationLayout");
  const id = useId();
  const left = useMemo(() => placementsLeft(api.items, lines), [api.items, lines]);
  const blank = {
    label: null,
    equipmentId: null,
    configurationId: null,
    color: null,
    imageUrl: null,
    rotation: 0,
  };

  function addEquipment(equipmentId: string) {
    const entry = catalogue.find((e) => e.id === equipmentId);
    const c = entry?.configurations.find((x) => x.isDefault) ?? entry?.configurations[0];
    if (!entry || !c) {
      return;
    }
    api.add({
      ...blank,
      id: crypto.randomUUID(),
      kind: "equipment",
      equipmentId: entry.id,
      configurationId: c.id,
      color: c.color,
      imageUrl: c.imageUrl,
      widthCm: c.widthCm,
      lengthCm: c.lengthCm,
      text: "",
      ...boxOf("equipment", c.widthCm, c.lengthCm, ""),
    });
  }

  function addArrow() {
    api.add({
      ...blank,
      id: crypto.randomUUID(),
      kind: "arrow",
      widthCm: DEFAULT_ARROW_CM,
      lengthCm: 0,
      text: "",
      ...arrowSize(DEFAULT_ARROW_CM),
    });
  }

  function addText() {
    const text = t("newText");
    api.add({
      ...blank,
      id: crypto.randomUUID(),
      kind: "text",
      widthCm: 0,
      lengthCm: 0,
      text,
      ...textSize(text),
    });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-2 rounded-lg border bg-card p-3">
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold">
        {t("add")}
      </h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEquipment")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {lines.map((line) => {
            const configured =
              (catalogue.find((e) => e.id === line.equipmentId)?.configurations.length ?? 0) > 0;
            const remaining = Math.max(left.get(line.equipmentId) ?? 0, 0);
            const placed = line.quantity - (left.get(line.equipmentId) ?? 0);
            return (
              <li key={line.equipmentId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm break-words">
                  <span className="block font-medium">{line.name}</span>
                  <span className="block text-muted-foreground">
                    {configured
                      ? t("placed", { placed, quantity: line.quantity })
                      : t("noConfiguration")}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!configured || remaining === 0}
                  aria-label={t("placeEquipment", { name: line.name })}
                  onClick={() => addEquipment(line.equipmentId)}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("place")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button type="button" variant="outline" onClick={addArrow}>
          <ArrowRightIcon data-icon="inline-start" />
          {t("addArrow")}
        </Button>
        <Button type="button" variant="outline" onClick={addText}>
          <TypeIcon data-icon="inline-start" />
          {t("addText")}
        </Button>
      </div>
    </section>
  );
}

/** The panel for the selection: one item's configuration, length or text, label and place. */
function Properties({
  api,
  catalogue,
  itemLabel,
}: {
  api: EditorApi<LayoutEditorItem>;
  catalogue: readonly CatalogueEntry[];
  itemLabel: (item: LayoutEditorItem) => string;
}) {
  const t = useTranslations("StationLayout");
  const locale = useLocale();
  const id = useId();
  const decimal = (n: number) =>
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(n);

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
  const update = (patch: Partial<LayoutEditorItem>, merge?: string) =>
    api.update(item.id, patch, merge);
  const entry =
    item.kind === "equipment" ? catalogue.find((e) => e.id === item.equipmentId) : undefined;
  const half = STATION_LAYOUT_HALF_CM / 100;

  return (
    <section
      key={item.id}
      aria-labelledby={`${id}-heading`}
      className="grid gap-3 rounded-lg border bg-card p-3"
    >
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold break-words">
        {itemLabel(item)}
      </h2>

      {entry && (
        <div className="grid gap-1">
          <Label htmlFor={`${id}-configuration`} className="text-sm">
            {t("configurationLabel")}
          </Label>
          <NativeSelect
            id={`${id}-configuration`}
            className="w-full"
            value={item.configurationId ?? ""}
            onChange={(e) => {
              const c = entry.configurations.find((x) => x.id === e.target.value);
              if (c) {
                update({
                  configurationId: c.id,
                  widthCm: c.widthCm,
                  lengthCm: c.lengthCm,
                  color: c.color,
                  imageUrl: c.imageUrl,
                  ...boxOf("equipment", c.widthCm, c.lengthCm, ""),
                });
              }
            }}
          >
            {entry.configurations.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {t("configurationOption", {
                  name: c.name,
                  width: c.widthCm,
                  length: c.lengthCm,
                })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      {item.kind === "arrow" && (
        <CommitField
          label={t("arrowLength")}
          value={String(item.widthCm)}
          inputMode="numeric"
          parse={(text) => {
            const value = parseNumber(text, ARROW_MIN_CM, ARROW_MAX_CM);
            return value === undefined ? undefined : Math.round(value);
          }}
          onCommit={(v) => update({ widthCm: Number(v), ...arrowSize(Number(v)) })}
        />
      )}

      {item.kind === "text" && (
        <CommitField
          label={t("textLabel")}
          value={item.text}
          maxLength={MAX_TEXT_LENGTH}
          parse={(text) => cleanText(text) || undefined}
          onCommit={(v) => {
            const text = cleanText(String(v));
            update({ text, ...textSize(text) });
          }}
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
          value={decimal(item.x - CENTRE)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, -half, half)}
          onCommit={(v) => update({ x: CENTRE + Math.round(Number(v) * 100) / 100 })}
        />
        <CommitField
          label={t("yLabel")}
          value={decimal(item.y - CENTRE)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, -half, half)}
          onCommit={(v) => update({ y: CENTRE + Math.round(Number(v) * 100) / 100 })}
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
    </section>
  );
}
