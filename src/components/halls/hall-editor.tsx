"use client";

import { upload } from "@vercel/blob/client";
import { ImageIcon, ImageOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  checkHallImageAction,
  deleteHallAction,
  prepareHallImageUploadAction,
  saveHallAction,
} from "@/app/library-actions";
import { CommitField, parseNumber } from "@/components/drawing/commit-field";
import { DrawingEditor, type EditorApi } from "@/components/drawing/drawing-editor";
import { DrawingLabel, FeatureShape, HallFloor, labelSize } from "@/components/drawing/hall-drawing";
import { SaveBar } from "@/components/library/save-bar";
import { useLibraryForm } from "@/components/library/use-library-form";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DrawnFeature, HallDrawing } from "@/lib/data/halls";
import type { Placed } from "@/lib/drawing/editor";
import { checkEquipmentImage, EQUIPMENT_IMAGE_ACCEPT } from "@/lib/equipment-configurations";
import {
  DEFAULT_FLOOR_COLOR,
  formatMetres,
  HALL_MAX_CM,
  isShapeKind,
  KIND_DEFAULTS,
  MAX_LABEL_LENGTH,
  normalizeDegrees,
  parseMetres,
  SHAPE_KINDS,
  type FeatureKind,
  type HallInput,
  type ShapeKind,
} from "@/lib/halls";

/** A configuration that can be fixed in a hall. */
export type CatalogueConfiguration = {
  id: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imageUrl: string | null;
  isDefault: boolean;
};

/** Equipment with at least one configuration. */
export type CatalogueEntry = { id: string; name: string; configurations: CatalogueConfiguration[] };

/** A feature in the editor: drawn in metres, stored in centimetres. */
type HallItem = Placed & {
  kind: FeatureKind;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imageUrl: string | null;
  imagePathname: string | null;
  label: string | null;
  equipmentId: string | null;
  configurationId: string | null;
};

function toItem(f: DrawnFeature): HallItem {
  return {
    id: f.id,
    x: f.xCm / 100,
    y: f.yCm / 100,
    rotation: f.rotation,
    width: f.widthCm / 100,
    height: f.lengthCm / 100,
    kind: f.kind,
    widthCm: f.widthCm,
    lengthCm: f.lengthCm,
    color: f.color,
    imageUrl: f.imageUrl,
    imagePathname: f.imagePathname,
    label: f.label,
    equipmentId: f.equipmentId,
    configurationId: f.configurationId,
  };
}

type Floor = { color: string; imagePathname: string | null; imageUrl: string | null };

/** What a save sends: the hall, its floor and its features, positions in whole centimetres. */
function toInput(
  name: string,
  widthCm: number,
  lengthCm: number,
  floor: Floor,
  items: readonly HallItem[],
): HallInput {
  return {
    name,
    widthCm,
    lengthCm,
    floorColor: floor.color,
    floorImagePathname: floor.imagePathname,
    features: items.map((i) => {
      const placed = {
        id: i.id,
        xCm: Math.round(i.x * 100),
        yCm: Math.round(i.y * 100),
        rotation: normalizeDegrees(Math.round(i.rotation * 10) / 10),
        label: i.label,
      };
      return i.kind === "equipment"
        ? {
            ...placed,
            kind: "equipment" as const,
            equipmentId: i.equipmentId ?? "",
            configurationId: i.configurationId ?? "",
          }
        : {
            ...placed,
            kind: i.kind,
            widthCm: i.widthCm,
            lengthCm: i.lengthCm,
            color: i.color ?? KIND_DEFAULTS[i.kind].color,
            imagePathname: i.imagePathname,
          };
    }),
  };
}

function sizeOf(widthCm: number, lengthCm: number) {
  return { widthCm, lengthCm, width: widthCm / 100, height: lengthCm / 100 };
}

/**
 * The hall editor for administrators: name, size and the features, drawn in
 * the shared drawing editor and saved as a whole.
 */
export function HallEditor({ hall, catalogue }: { hall: HallDrawing; catalogue: CatalogueEntry[] }) {
  const t = useTranslations("Halls");
  const locale = useLocale();
  const id = useId();
  const [name, setName] = useState(hall.name);
  const [widthText, setWidthText] = useState(() => formatMetres(hall.widthCm, locale));
  const [lengthText, setLengthText] = useState(() => formatMetres(hall.lengthCm, locale));
  const [items, setItems] = useState<HallItem[]>(() => hall.features.map(toItem));
  const [floor, setFloor] = useState<Floor>({
    color: hall.floorColor,
    imagePathname: hall.floorImagePathname,
    imageUrl: hall.floorImageUrl,
  });

  const widthCm = parseMetres(widthText);
  const lengthCm = parseMetres(lengthText);
  // The drawing keeps the last valid size while a field is being typed in.
  const [area, setArea] = useState({ width: hall.widthCm / 100, height: hall.lengthCm / 100 });
  if (widthCm !== null && lengthCm !== null && (area.width !== widthCm / 100 || area.height !== lengthCm / 100)) {
    setArea({ width: widthCm / 100, height: lengthCm / 100 });
  }

  const payload = toInput(name, widthCm ?? Number.NaN, lengthCm ?? Number.NaN, floor, items);
  const form = useLibraryForm(payload, (input) => saveHallAction(hall.id, input));

  const equipmentName = useCallback(
    (item: HallItem) => {
      const entry = catalogue.find((e) => e.id === item.equipmentId);
      const configuration = entry?.configurations.find((c) => c.id === item.configurationId);
      return entry ? `${entry.name}${configuration ? `, ${configuration.name}` : ""}` : t("kinds.equipment");
    },
    [catalogue, t],
  );

  const itemLabel = useCallback(
    (item: HallItem) => {
      const kind = item.kind === "equipment" ? equipmentName(item) : t(`kinds.${item.kind}`);
      return item.label ? `${kind}: ${item.label}` : kind;
    },
    [equipmentName, t],
  );

  const size = labelSize({ widthCm: area.width * 100, lengthCm: area.height * 100 });

  return (
    <form onSubmit={form.submit} className="grid gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid w-32 gap-1.5">
          <Label htmlFor={`${id}-width`}>{t("widthLabel")}</Label>
          <Input
            id={`${id}-width`}
            inputMode="decimal"
            value={widthText}
            aria-invalid={widthCm === null}
            onChange={(e) => setWidthText(e.target.value)}
          />
        </div>
        <div className="grid w-32 gap-1.5">
          <Label htmlFor={`${id}-length`}>{t("lengthLabel")}</Label>
          <Input
            id={`${id}-length`}
            inputMode="decimal"
            value={lengthText}
            aria-invalid={lengthCm === null}
            onChange={(e) => setLengthText(e.target.value)}
          />
        </div>
        <ConfirmDelete
          trigger={
            <Button type="button" variant="destructive" className="h-9">
              <Trash2Icon data-icon="inline-start" />
              {t("delete")}
            </Button>
          }
          title={t("deleteTitle", { name: hall.name })}
          description={t("deleteText", { name: hall.name })}
          action={() => deleteHallAction(hall.id)}
        />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("sizeHint")}</p>

      <DrawingEditor<HallItem>
        area={area}
        initialItems={items}
        onItemsChange={setItems}
        label={t("editorLabel", { name })}
        itemLabel={itemLabel}
        background={
          <HallFloor
            floor={{
              widthCm: area.width * 100,
              lengthCm: area.height * 100,
              floorColor: floor.color,
              floorImageUrl: floor.imageUrl,
            }}
          />
        }
        renderItem={(item) => <FeatureShape feature={item} />}
        overlay={(shown) =>
          shown.map((item) =>
            item.label ? (
              <DrawingLabel key={`label-${item.id}`} x={item.x} y={item.y} text={item.label} size={size} />
            ) : null,
          )
        }
        palette={(api) => (
          <>
            <FloorPanel hallId={hall.id} floor={floor} onChange={setFloor} />
            <Palette api={api} catalogue={catalogue} />
          </>
        )}
        properties={(api) => (
          <Properties api={api} hallId={hall.id} catalogue={catalogue} itemLabel={itemLabel} />
        )}
      />

      <SaveBar dirty={form.dirty} pending={form.pending} error={form.error} status={form.status} />
    </form>
  );
}

/** Buttons that add a feature of each kind, and fixed equipment. */
function Palette({ api, catalogue }: { api: EditorApi<HallItem>; catalogue: CatalogueEntry[] }) {
  const t = useTranslations("Halls");
  const id = useId();
  const [equipmentId, setEquipmentId] = useState(catalogue[0]?.id ?? "");

  function addShape(kind: ShapeKind) {
    const d = KIND_DEFAULTS[kind];
    api.add({
      id: crypto.randomUUID(),
      rotation: 0,
      ...sizeOf(d.widthCm, d.lengthCm),
      kind,
      color: d.color,
      imageUrl: null,
      imagePathname: null,
      label: null,
      equipmentId: null,
      configurationId: null,
    });
  }

  function addEquipment() {
    const entry = catalogue.find((e) => e.id === equipmentId);
    const c = entry?.configurations.find((x) => x.isDefault) ?? entry?.configurations[0];
    if (!entry || !c) {
      return;
    }
    api.add({
      id: crypto.randomUUID(),
      rotation: 0,
      ...sizeOf(c.widthCm, c.lengthCm),
      kind: "equipment",
      color: c.color,
      imageUrl: c.imageUrl,
      imagePathname: null,
      label: null,
      equipmentId: entry.id,
      configurationId: c.id,
    });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-2 rounded-lg border bg-card p-3">
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold">
        {t("add")}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {SHAPE_KINDS.map((kind) => (
          <Button key={kind} type="button" variant="outline" onClick={() => addShape(kind)}>
            <PlusIcon data-icon="inline-start" />
            {t(`kinds.${kind}`)}
          </Button>
        ))}
      </div>
      {catalogue.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="grid min-w-0 flex-1 gap-1">
            <Label htmlFor={`${id}-equipment`} className="text-sm">
              {t("equipmentLabel")}
            </Label>
            <NativeSelect
              id={`${id}-equipment`}
              className="w-full"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
            >
              {catalogue.map((e) => (
                <NativeSelectOption key={e.id} value={e.id}>
                  {e.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button type="button" variant="outline" onClick={addEquipment}>
            <PlusIcon data-icon="inline-start" />
            {t("addEquipment")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noEquipment")}</p>
      )}
    </section>
  );
}

/** The panel for the selection: one feature's look, size, place and label. */
function Properties({
  api,
  hallId,
  catalogue,
  itemLabel,
}: {
  api: EditorApi<HallItem>;
  hallId: string;
  catalogue: CatalogueEntry[];
  itemLabel: (item: HallItem) => string;
}) {
  const t = useTranslations("Halls");
  const locale = useLocale();
  const id = useId();
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
        <p className="text-sm text-muted-foreground">{t("manySelectedHint")}</p>
      </section>
    );
  }
  const item = api.selected[0];
  const update = (patch: Partial<HallItem>, merge?: string) => api.update(item.id, patch, merge);
  const entry = catalogue.find((e) => e.id === item.equipmentId);

  return (
    <section
      key={item.id}
      aria-labelledby={`${id}-heading`}
      className="grid gap-3 rounded-lg border bg-card p-3"
    >
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold break-words">
        {itemLabel(item)}
      </h2>

      {isShapeKind(item.kind) ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor={`${id}-kind`} className="text-sm">
              {t("kindLabel")}
            </Label>
            <NativeSelect
              id={`${id}-kind`}
              className="w-full"
              value={item.kind}
              onChange={(e) => {
                const kind = e.target.value as ShapeKind;
                // Keeps a colour chosen by hand; a default colour follows the kind.
                const wasDefault = item.color === KIND_DEFAULTS[item.kind as ShapeKind].color;
                update({ kind, ...(wasDefault ? { color: KIND_DEFAULTS[kind].color } : {}) });
              }}
            >
              {SHAPE_KINDS.map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {t(`kinds.${k}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CommitField
              label={t("featureWidth")}
              value={String(item.widthCm)}
              inputMode="numeric"
              parse={(text) => parseFeatureCm(text) ?? undefined}
              onCommit={(v) => update(sizeOf(Number(v), item.lengthCm))}
            />
            <CommitField
              label={t("featureLength")}
              value={String(item.lengthCm)}
              inputMode="numeric"
              parse={(text) => parseFeatureCm(text) ?? undefined}
              onCommit={(v) => update(sizeOf(item.widthCm, Number(v)))}
            />
          </div>
          <ColorField item={item} update={update} />
          <ImageField
            hallId={hallId}
            label={t("imageLabel")}
            hint={t("imageHint")}
            hasImage={item.imageUrl !== null}
            onUploaded={(pathname, url) => update({ imagePathname: pathname, imageUrl: url })}
            onRemove={() => update({ imagePathname: null, imageUrl: null })}
          />
        </>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">{t("equipmentHint")}</p>
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
                      ...sizeOf(c.widthCm, c.lengthCm),
                      color: c.color,
                      imageUrl: c.imageUrl,
                    });
                  }
                }}
              >
                {entry.configurations.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
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
          parse={(text) => parseNumber(text, 0, HALL_MAX_CM / 100)}
          onCommit={(v) => update({ x: Math.round(Number(v) * 100) / 100 })}
        />
        <CommitField
          label={t("yLabel")}
          value={decimal(item.y)}
          inputMode="decimal"
          parse={(text) => parseNumber(text, 0, HALL_MAX_CM / 100)}
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
    </section>
  );
}

function parseFeatureCm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 1 && value <= HALL_MAX_CM ? value : null;
}

/** The floor's colour and image; not part of the drawing's undo history. */
function FloorPanel({
  hallId,
  floor,
  onChange,
}: {
  hallId: string;
  floor: Floor;
  onChange: (floor: Floor) => void;
}) {
  const t = useTranslations("Halls");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-2 rounded-lg border bg-card p-3">
      <h2 id={`${id}-heading`} className="font-heading text-base font-semibold">
        {t("floor")}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-color`} className="text-sm">
            {t("floorColor")}
          </Label>
          <input
            id={`${id}-color`}
            type="color"
            value={floor.color}
            className="h-9 w-16 cursor-pointer rounded-md border bg-background p-1"
            onChange={(e) => onChange({ ...floor, color: e.target.value.toLowerCase() })}
          />
        </div>
        {floor.color !== DEFAULT_FLOOR_COLOR && (
          <Button type="button" variant="outline" onClick={() => onChange({ ...floor, color: DEFAULT_FLOOR_COLOR })}>
            {t("defaultColor")}
          </Button>
        )}
      </div>
      <ImageField
        hallId={hallId}
        label={t("floorImage")}
        hint={t("floorImageHint")}
        hasImage={floor.imageUrl !== null}
        onUploaded={(pathname, url) => onChange({ ...floor, imagePathname: pathname, imageUrl: url })}
        onRemove={() => onChange({ ...floor, imagePathname: null, imageUrl: null })}
      />
    </section>
  );
}

function ColorField({
  item,
  update,
}: {
  item: HallItem;
  update: (patch: Partial<HallItem>, merge?: string) => void;
}) {
  const t = useTranslations("Halls");
  const id = useId();
  if (!isShapeKind(item.kind)) {
    return null;
  }
  const fallback = KIND_DEFAULTS[item.kind].color;
  const color = item.color ?? fallback;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor={`${id}-color`} className="text-sm">
          {t("colorLabel")}
        </Label>
        <input
          id={`${id}-color`}
          type="color"
          value={color}
          className="h-9 w-16 cursor-pointer rounded-md border bg-background p-1"
          onChange={(e) => update({ color: e.target.value.toLowerCase() }, "color")}
        />
      </div>
      {color !== fallback && (
        <Button type="button" variant="outline" onClick={() => update({ color: fallback })}>
          {t("defaultColor")}
        </Button>
      )}
      {item.imageUrl && <p className="w-full text-sm text-muted-foreground">{t("colorUnderImage")}</p>}
    </div>
  );
}

/** Uploads an image into the hall's folder (checked by its bytes), or removes it. */
function ImageField({
  hallId,
  label,
  hint,
  hasImage,
  onUploaded,
  onRemove,
}: {
  hallId: string;
  label: string;
  hint: string;
  hasImage: boolean;
  onUploaded: (pathname: string, url: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Halls");
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function uploadImage(file: File) {
    const type = file.type.toLowerCase();
    const problem = checkEquipmentImage({ type, size: file.size });
    if (problem) {
      toast.error(t("failed"), {
        description: errorMessage(problem === "tooLarge" ? "equipmentImageTooLarge" : "equipmentImageWrongType"),
      });
      return;
    }
    setProgress(0);
    let error: string | null = null;
    try {
      const prepared = await prepareHallImageUploadAction(hallId, { name: file.name, type, size: file.size });
      if (!prepared.ok) {
        error = errorMessage(prepared.error);
      } else {
        await upload(prepared.pathname, file, {
          access: "private",
          handleUploadUrl: "/api/hall-images/upload",
          clientPayload: JSON.stringify({ hallId }),
          contentType: type,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
        const checked = await checkHallImageAction(hallId, { pathname: prepared.pathname });
        if (checked.ok) {
          onUploaded(prepared.pathname, checked.url);
        } else {
          error = errorMessage(checked.error);
        }
      }
    } catch {
      error = t("uploadFailed");
    }
    setProgress(null);
    if (error) {
      toast.error(t("failed"), { description: `${file.name}: ${error}` });
    }
  }

  let status: ReactNode = null;
  if (progress !== null) {
    status = (
      <p role="status" className="w-full text-sm">
        {t("uploading", { percent: progress })}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={EQUIPMENT_IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            void uploadImage(file);
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={progress !== null}
        onClick={() => inputRef.current?.click()}
      >
        <ImageIcon data-icon="inline-start" />
        {hasImage ? t("replaceImage") : t("uploadImage")}
      </Button>
      {hasImage && (
        <Button type="button" variant="outline" disabled={progress !== null} onClick={onRemove}>
          <ImageOffIcon data-icon="inline-start" />
          {t("removeImage")}
        </Button>
      )}
      <p className="w-full text-sm text-muted-foreground">{hint}</p>
      {status}
    </div>
  );
}
