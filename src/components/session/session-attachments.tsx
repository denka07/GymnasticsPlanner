"use client";

import { upload } from "@vercel/blob/client";
import { FileTextIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteAttachmentAction,
  prepareAttachmentUploadAction,
  registerAttachmentAction,
} from "@/app/session-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  declaredType,
  formatFileSize,
} from "@/lib/attachments";
import type { AttachmentItem } from "@/lib/data/attachment-files";
import type { SessionTarget } from "@/lib/data/schemas";
import { cn } from "@/lib/utils";

type Upload = { name: string; percent: number };

/** The URL that serves an attachment; it checks access on every request. */
export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}

/** The attachments of a session as links that open them in a new tab. */
export function AttachmentList({
  items,
  onDelete,
  disabled,
}: {
  items: AttachmentItem[];
  /** Shown with a delete button per file when set (edit access). */
  onDelete?: (item: AttachmentItem) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Attachments");
  const locale = useLocale();
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const Icon = item.contentType === "application/pdf" ? FileTextIcon : ImageIcon;
        return (
          <li key={item.id} className="flex min-w-0 items-center gap-1">
            <a
              href={attachmentUrl(item.id)}
              target="_blank"
              rel="noopener"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate underline-offset-4 hover:underline">
                {item.fileName}
              </span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {formatFileSize(item.sizeBytes, locale)}
              </span>
            </a>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t("delete", { name: item.fileName })}
                disabled={disabled}
                onClick={() => onDelete(item)}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Bilagor" on a session card: the session's files and, with edit access, an
 * upload button and delete buttons. Uploading to a slot's placeholder stores
 * the session first; `onStored` then tells the card its id.
 */
export function SessionAttachments({
  initial,
  editable,
  target,
  onStored,
  className,
}: {
  initial: AttachmentItem[];
  editable: boolean;
  /** Where an upload goes, read when it starts. */
  target: () => SessionTarget;
  onStored: (sessionId: string) => void;
  className?: string;
}) {
  const t = useTranslations("Attachments");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Follows the server's list, and adds or removes rows right away meanwhile.
  const [items, setItems] = useState(initial);
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setItems(initial);
  }
  const [uploading, setUploading] = useState<Upload | null>(null);
  const [toDelete, setToDelete] = useState<AttachmentItem | null>(null);
  const [deleting, startDelete] = useTransition();

  if (!editable && items.length === 0) {
    return null;
  }

  async function uploadOne(file: File): Promise<boolean> {
    const type = declaredType(file);
    const problem = checkAttachment({ type, size: file.size });
    if (problem) {
      toast.error(t(problem === "tooLarge" ? "tooLarge" : problem === "empty" ? "empty" : "wrongType"), {
        description: file.name,
      });
      return false;
    }
    setUploading({ name: file.name, percent: 0 });
    let error: string | null = null;
    try {
      const prepared = await prepareAttachmentUploadAction(target(), {
        name: file.name,
        type,
        size: file.size,
      });
      if (!prepared.ok) {
        error = prepared.error;
      } else {
        onStored(prepared.sessionId);
        await upload(prepared.pathname, file, {
          access: "private",
          handleUploadUrl: "/api/attachments/upload",
          clientPayload: JSON.stringify({ sessionId: prepared.sessionId }),
          contentType: type,
          onUploadProgress: ({ percentage }) =>
            setUploading({ name: file.name, percent: Math.round(percentage) }),
        });
        const registered = await registerAttachmentAction(prepared.sessionId, {
          pathname: prepared.pathname,
          fileName: file.name,
        });
        if (registered.ok) {
          const added = registered.attachment;
          setItems((list) => (list.some((i) => i.id === added.id) ? list : [...list, added]));
        } else {
          error = registered.error;
        }
      }
    } catch {
      error = "uploadFailed";
    }
    if (error) {
      toast.error(t("uploadFailedTitle"), {
        description: `${file.name}: ${error === "uploadFailed" ? t("uploadFailed") : errorMessage(error)}`,
      });
    }
    return error === null;
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      await uploadOne(file);
    }
    setUploading(null);
  }

  function confirmDelete() {
    const item = toDelete;
    if (!item) {
      return;
    }
    startDelete(async () => {
      const result = await deleteAttachmentAction(item.id).catch(() => ({
        ok: false as const,
        error: "unexpected",
      }));
      if (result.ok) {
        setItems((list) => list.filter((i) => i.id !== item.id));
        setToDelete(null);
      } else {
        toast.error(errorMessage(result.error));
      }
    });
  }

  return (
    <section aria-labelledby={headingId} className={cn("grid gap-1.5", className)}>
      <h4 id={headingId} className="text-sm font-semibold text-muted-foreground">
        {t("heading")}
      </h4>
      {items.length > 0 ? (
        <AttachmentList
          items={items}
          onDelete={editable ? setToDelete : undefined}
          disabled={deleting || uploading !== null}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {editable && (
        <>
          {uploading && (
            <div className="grid gap-1" role="status" aria-live="polite">
              <p className="truncate text-sm">
                {t("uploading", { name: uploading.name, percent: uploading.percent })}
              </p>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={t("progress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploading.percent}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${uploading.percent}%` }}
                />
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            hidden
            aria-label={t("choose")}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length > 0) {
                void uploadFiles(files);
              }
            }}
          />
          <Button
            variant="outline"
            className="min-h-11 justify-self-start"
            disabled={uploading !== null}
            onClick={() => inputRef.current?.click()}
          >
            <PaperclipIcon data-icon="inline-start" />
            {uploading ? t("busy") : t("add")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteText", { name: toDelete?.fileName ?? "" })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
                  {t("deleteConfirm")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
