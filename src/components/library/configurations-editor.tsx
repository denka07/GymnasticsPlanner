"use client";

import { upload } from "@vercel/blob/client";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ImageIcon,
  ImageOffIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";

import {
  createConfigurationAction,
  deleteConfigurationAction,
  moveConfigurationAction,
  prepareEquipmentImageUploadAction,
  registerEquipmentImageAction,
  removeEquipmentImageAction,
  setDefaultConfigurationAction,
  updateConfigurationAction,
} from "@/app/library-actions";
import { ConfirmDelete } from "@/components/plan/confirm-delete";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import type { ConfigurationItem } from "@/lib/data/equipment-configurations";
import {
  checkEquipmentImage,
  EQUIPMENT_IMAGE_ACCEPT,
  formatSize,
  PALETTE,
  parseCentimetres,
} from "@/lib/equipment-configurations";
import { cn } from "@/lib/utils";

/**
 * The configurations of one piece of equipment with add, edit, reorder, set
 * default, delete and image upload, for administrators. The server checks
 * every change again.
 */
export function ConfigurationsEditor({
  equipmentId,
  configurations,
}: {
  equipmentId: string;
  configurations: ConfigurationItem[];
}) {
  const t = useTranslations("Configurations");
  return (
    <section aria-labelledby="configurations-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="configurations-heading" className="font-heading text-xl font-semibold">
          {t("heading")}
        </h2>
        <ConfigurationDialog
          trigger={
            <Button className="h-11 px-4">
              <PlusIcon data-icon="inline-start" />
              {t("new")}
            </Button>
          }
          title={t("createTitle")}
          action={(input) => createConfigurationAction(equipmentId, input)}
        />
      </div>
      <p className="max-w-3xl text-[0.9375rem] text-muted-foreground">{t("imageHint")}</p>
      {configurations.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ol className="grid gap-2 lg:grid-cols-2">
          {configurations.map((c, index) => (
            <ConfigurationRow
              key={c.id}
              configuration={c}
              first={index === 0}
              last={index === configurations.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ConfigurationRow({
  configuration: c,
  first,
  last,
}: {
  configuration: ConfigurationItem;
  first: boolean;
  last: boolean;
}) {
  const t = useTranslations("Configurations");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<number | null>(null);
  const busy = pending || progress !== null;

  function act(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await work().catch(() => ({ ok: false as const, error: "unexpected" }));
      if (!result.ok) {
        toast.error(t("failed"), { description: errorMessage(result.error) });
      }
    });
  }

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
      const prepared = await prepareEquipmentImageUploadAction(c.id, { name: file.name, type, size: file.size });
      if (!prepared.ok) {
        error = errorMessage(prepared.error);
      } else {
        await upload(prepared.pathname, file, {
          access: "private",
          handleUploadUrl: "/api/equipment-images/upload",
          clientPayload: JSON.stringify({ configurationId: c.id }),
          contentType: type,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
        const registered = await registerEquipmentImageAction(c.id, { pathname: prepared.pathname });
        if (!registered.ok) {
          error = errorMessage(registered.error);
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

  const size = formatSize(c.widthCm, c.lengthCm, locale);

  return (
    <li className="grid content-start gap-2 rounded-lg border bg-card py-2 pr-1.5 pl-4" aria-busy={busy}>
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5 py-1.5">
          <h3 className="flex flex-wrap items-center gap-2 font-medium break-words">
            {c.name}
            {c.isDefault && <Badge variant="secondary">{t("default")}</Badge>}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted-foreground">
            <span className="tabular-nums">{size}</span>
            {c.imageUrl ? (
              <span className="inline-flex items-center gap-1">
                <ImageIcon aria-hidden className="size-4" />
                {t("hasImage")}
              </span>
            ) : c.color ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-4 rounded-sm border" style={{ backgroundColor: c.color }} />
                {colorName(c.color, t)}
              </span>
            ) : (
              <span>{t("noColor")}</span>
            )}
          </p>
          {progress !== null && (
            <p role="status" className="text-[0.9375rem]">
              {t("uploading", { percent: progress })}
            </p>
          )}
        </div>
        <ConfigurationDialog
          trigger={
            <Button variant="ghost" className="size-11 shrink-0" aria-label={t("edit", { name: c.name })}>
              <PencilIcon />
            </Button>
          }
          title={t("editTitle")}
          initial={c}
          action={(input) => updateConfigurationAction(c.id, input)}
        />
        <ConfirmDelete
          trigger={
            <Button
              variant="ghost"
              className="size-11 shrink-0 text-destructive"
              aria-label={t("delete", { name: c.name })}
            >
              <Trash2Icon />
            </Button>
          }
          title={t("deleteTitle")}
          description={t(c.isDefault ? "deleteDefaultText" : "deleteText", { name: c.name })}
          action={async () => act(() => deleteConfigurationAction(c.id))}
        />
      </div>
      <div className="flex flex-wrap gap-1 pb-1">
        <input
          ref={inputRef}
          type="file"
          accept={EQUIPMENT_IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("imageFor", { name: c.name })}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              void uploadImage(file);
            }
          }}
        />
        <Button variant="outline" className="h-11 px-3" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImageIcon data-icon="inline-start" />
          {c.imageUrl ? t("replaceImage") : t("uploadImage")}
        </Button>
        {c.imageUrl && (
          <Button
            variant="outline"
            className="h-11 px-3"
            disabled={busy}
            aria-label={t("removeImageLabel", { name: c.name })}
            onClick={() => act(() => removeEquipmentImageAction(c.id))}
          >
            <ImageOffIcon data-icon="inline-start" />
            {t("removeImage")}
          </Button>
        )}
        {!c.isDefault && (
          <Button
            variant="outline"
            className="h-11 px-3"
            disabled={busy}
            aria-label={t("makeDefaultLabel", { name: c.name })}
            onClick={() => act(() => setDefaultConfigurationAction(c.id))}
          >
            {t("makeDefault")}
          </Button>
        )}
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            className="size-11"
            disabled={busy || first}
            aria-label={t("moveUp", { name: c.name })}
            onClick={() => act(() => moveConfigurationAction(c.id, "up"))}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            className="size-11"
            disabled={busy || last}
            aria-label={t("moveDown", { name: c.name })}
            onClick={() => act(() => moveConfigurationAction(c.id, "down"))}
          >
            <ArrowDownIcon />
          </Button>
        </span>
      </div>
    </li>
  );
}

type Translate = ReturnType<typeof useTranslations<"Configurations">>;

/** The palette name of a colour, or "Egen färg" for any other. */
function colorName(color: string, t: Translate): string {
  const match = PALETTE.find((p) => p.value === color);
  return match ? t(`colors.${match.key}`) : t("customColor");
}

/** A dialog with a configuration's name, size and colour, for adding or changing one. */
function ConfigurationDialog({
  trigger,
  title,
  initial,
  action,
}: {
  trigger: ReactElement;
  title: string;
  initial?: ConfigurationItem;
  action: (input: { name: string; widthCm: number; lengthCm: number; color: string | null }) => Promise<ActionResult>;
}) {
  const t = useTranslations("Configurations");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [custom, setCustom] = useState("#888888");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suggestions = t.raw("nameSuggestions") as string[];

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(initial?.name ?? "");
      setWidth(initial ? String(initial.widthCm) : "");
      setLength(initial ? String(initial.lengthCm) : "");
      setColor(initial?.color ?? null);
      if (initial?.color && !PALETTE.some((p) => p.value === initial.color)) {
        setCustom(initial.color);
      }
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const widthCm = parseCentimetres(width);
    const lengthCm = parseCentimetres(length);
    if (widthCm === null || lengthCm === null) {
      setError(errorMessage("sizeInvalid"));
      return;
    }
    startTransition(async () => {
      const result = await action({ name, widthCm, lengthCm, color }).catch(() => ({
        ok: false as const,
        error: "unexpected",
      }));
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;
  const swatch =
    "relative flex size-11 cursor-pointer items-center justify-center rounded-lg border has-checked:ring-3 has-checked:ring-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("sizeHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              className="h-11"
              value={name}
              list={`${id}-suggestions`}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-name-hint ${describedBy ?? ""}`.trim()}
            />
            <datalist id={`${id}-suggestions`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p id={`${id}-name-hint`} className="text-sm text-muted-foreground">
              {t("nameHint")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-width`}>{t("widthLabel")}</Label>
              <Input
                id={`${id}-width`}
                className="h-11"
                inputMode="numeric"
                autoComplete="off"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                aria-describedby={describedBy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-length`}>{t("lengthLabel")}</Label>
              <Input
                id={`${id}-length`}
                className="h-11"
                inputMode="numeric"
                autoComplete="off"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                aria-describedby={describedBy}
              />
            </div>
          </div>
          <fieldset className="grid gap-2" aria-describedby={`${id}-color-hint`}>
            <legend className="mb-2 text-sm leading-none font-medium">{t("colorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              <label className={swatch} title={t("noColor")}>
                <input
                  type="radio"
                  name={`${id}-color`}
                  className="sr-only"
                  checked={color === null}
                  onChange={() => setColor(null)}
                  aria-label={t("noColor")}
                />
                <span aria-hidden className="size-7 rounded-md border border-foreground/40 bg-muted" />
              </label>
              {PALETTE.map((p) => (
                <label key={p.key} className={swatch} title={t(`colors.${p.key}`)}>
                  <input
                    type="radio"
                    name={`${id}-color`}
                    className="sr-only"
                    checked={color === p.value}
                    onChange={() => setColor(p.value)}
                    aria-label={t(`colors.${p.key}`)}
                  />
                  <span aria-hidden className="size-7 rounded-md" style={{ backgroundColor: p.value }} />
                  {color === p.value && (
                    <CheckIcon aria-hidden className="absolute size-4 text-white drop-shadow" />
                  )}
                </label>
              ))}
              <label className={cn(swatch, "w-auto gap-2 px-2")}>
                <input
                  type="radio"
                  name={`${id}-color`}
                  className="sr-only"
                  checked={color !== null && !PALETTE.some((p) => p.value === color)}
                  onChange={() => setColor(custom)}
                  aria-label={t("customColor")}
                />
                <input
                  type="color"
                  value={custom}
                  aria-label={t("customColor")}
                  className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setColor(e.target.value);
                  }}
                />
                <span className="text-sm">{t("customColor")}</span>
              </label>
            </div>
            <p id={`${id}-color-hint`} className="text-sm text-muted-foreground">
              {t("colorHint")}
            </p>
          </fieldset>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? tc("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
