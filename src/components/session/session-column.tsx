"use client";

import { EllipsisVerticalIcon, MapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  copySessionContentAction,
  deleteSessionAction,
  setSessionCancelledAction,
  updateSessionDetailsAction,
} from "@/app/session-actions";
import { openPlansAction } from "@/app/session-plan-actions";
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
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AttachmentItem } from "@/lib/data/attachment-files";
import type { SessionTarget } from "@/lib/data/schemas";
import { formatDayMonth, shortTime, weekdayOf } from "@/lib/dates";
import { fromLoadedParts, hasLinks, type LoadedPart } from "@/lib/outline";
import { placeParts } from "@/lib/halls";
import { cn } from "@/lib/utils";

import { CopySessionDialog, type CopySourceOption } from "./copy-session-dialog";
import { SessionAttachments } from "./session-attachments";
import { SessionDetailsDialog, type HallChoice } from "./session-details-dialog";
import { SessionOutlineEditor, SessionOutlineView } from "./session-outline-editor";
import { useSessionOutline } from "./use-session-outline";

/** One column of the week page: a stored session or a slot's placeholder. */
export type SessionColumnData = {
  sessionId: string | null;
  trainingSlotId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  /** The session's hall, or for a placeholder its slot's hall. */
  hallId: string | null;
  isCancelled: boolean;
  noteAfter: string | null;
  parts: LoadedPart[];
  attachments: AttachmentItem[];
  /** How many drawn plans the session has. */
  planCount: number;
};

export function SessionColumn({
  data,
  seasonId,
  weekStart,
  weekEnd,
  editable,
  copySources,
  canDelete = true,
  canCopy = true,
  showOpenLink = true,
  halls = [],
}: {
  data: SessionColumnData;
  seasonId: string;
  weekStart: string;
  weekEnd: string;
  editable: boolean;
  copySources: CopySourceOption[];
  /** False on the single-session editor, which would have nothing left to show. */
  canDelete?: boolean;
  /** False where no other sessions can be shown to copy from. */
  canCopy?: boolean;
  /** False where the session page is linked already. */
  showOpenLink?: boolean;
  /** Every hall, to name the session's and to choose another. */
  halls?: HallChoice[];
}) {
  const t = useTranslations("Session");
  const tw = useTranslations("Weekdays");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  // Set when this column's placeholder was stored by an outline save.
  const [storedId, setStoredId] = useState<string | null>(null);
  const sessionId = data.sessionId ?? storedId;
  const target: SessionTarget = sessionId
    ? { sessionId }
    : { seasonId, trainingSlotId: data.trainingSlotId!, weekStart };
  const { lines, status, store } = useSessionOutline(fromLoadedParts(data.parts), target, setStoredId);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const name = t("label", { weekday: tw(`d${weekdayOf(data.date)}` as "d1"), date: formatDayMonth(data.date) });
  const start = shortTime(data.startTime);
  const end = shortTime(data.endTime);
  const time = start && end ? `${start}–${end}` : (start ?? end);
  const hallName = halls.find((h) => h.id === data.hallId)?.name ?? null;
  const isPlaceholder = sessionId === null;
  const hasContent = lines.some((l) => l.text.trim() !== "" || hasLinks(l));
  const headingId = `session-${data.trainingSlotId ?? data.sessionId}`;

  function report(result: { ok: boolean; error?: string }) {
    if (!result.ok) {
      toast.error(errorMessage(result.error ?? "unexpected"));
    }
  }

  /** Stores a placeholder first, then opens the session's plans. */
  function openPlans() {
    startTransition(async () => {
      await store.settle();
      const result = await openPlansAction(store.currentTarget);
      if (result.ok) {
        router.push(`/sessions/${result.sessionId}/plans`);
      } else {
        report(result);
      }
    });
  }

  function toggleCancelled() {
    startTransition(async () => {
      report(await setSessionCancelledAction(store.currentTarget, !data.isCancelled));
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "grid min-w-0 content-start gap-3 rounded-xl border bg-card p-3 lg:w-0 lg:min-w-80 lg:flex-1",
        data.isCancelled && "bg-muted/50",
      )}
    >
      <header className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3
            id={headingId}
            className={cn("font-heading text-xl font-semibold", data.isCancelled && "line-through")}
          >
            {name}
          </h3>
          {(time || data.location || hallName) && (
            <p className="text-muted-foreground">
              {[time, ...placeParts(data.location, hallName)].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 empty:hidden">
            {data.isCancelled && <Badge variant="destructive">{t("cancelled")}</Badge>}
            {isPlaceholder && !hasContent && <Badge variant="outline">{t("notPlanned")}</Badge>}
            {data.trainingSlotId === null && <Badge variant="secondary">{t("extra")}</Badge>}
          </div>
        </div>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={t("actions", { name })} disabled={pending}>
                  <EllipsisVerticalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-auto min-w-56">
              <DropdownMenuItem onClick={() => setDetailsOpen(true)}>{t("editDetails")}</DropdownMenuItem>
              {canCopy && (
                <DropdownMenuItem onClick={() => setCopyOpen(true)}>{t("copyFrom")}</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleCancelled}>
                {data.isCancelled ? t("restore") : t("cancel")}
              </DropdownMenuItem>
              {canDelete && data.trainingSlotId === null && sessionId && (
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  {t("delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {editable ? (
        <>
          <SessionOutlineEditor
            name={name}
            lines={lines}
            onChange={store.setLines}
            onBlur={store.flush}
            startTime={data.startTime}
            endTime={data.endTime}
          />
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {status === "saving"
              ? t("saving")
              : status === "saved"
                ? t("saved")
                : status === "failed"
                  ? t("notSaved")
                  : ""}
          </p>
        </>
      ) : (
        <SessionOutlineView lines={lines} startTime={data.startTime} name={name} />
      )}

      <SessionAttachments
        initial={data.attachments}
        editable={editable}
        target={() => store.currentTarget}
        onStored={(id) => {
          store.adopt(id);
          setStoredId(id);
        }}
        className="border-t pt-2"
      />

      {data.noteAfter && (
        <div className="grid gap-0.5 border-t pt-2">
          <p className="text-sm font-semibold text-muted-foreground">{t("noteAfterLabel")}</p>
          <p className="break-words whitespace-pre-wrap">{data.noteAfter}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 empty:hidden">
        {showOpenLink && sessionId && (
          <ButtonLink variant="outline" href={`/sessions/${sessionId}`}>
            {t("openSession")}
          </ButtonLink>
        )}
        {sessionId ? (
          <ButtonLink variant="outline" href={`/sessions/${sessionId}/plans`}>
            <MapIcon data-icon="inline-start" />
            {data.planCount > 0 ? t("plansCount", { count: data.planCount }) : t("plans")}
          </ButtonLink>
        ) : (
          editable && (
            <Button type="button" variant="outline" disabled={pending} onClick={openPlans}>
              <MapIcon data-icon="inline-start" />
              {t("plans")}
            </Button>
          )
        )}
      </div>

      {editable && (
        <>
          <SessionDetailsDialog
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            title={t("detailsTitle")}
            initial={{
              date: data.date,
              startTime: start ?? "",
              endTime: end ?? "",
              location: data.location ?? "",
              hallId: data.hallId ?? "",
            }}
            minDate={weekStart}
            maxDate={weekEnd}
            halls={halls}
            submit={async (values) => {
              const result = await updateSessionDetailsAction(store.currentTarget, values);
              return result.ok ? null : result.error;
            }}
          />
          <CopySessionDialog
            open={copyOpen}
            onOpenChange={setCopyOpen}
            targetName={name}
            targetDate={data.date}
            targetHasContent={hasContent || data.planCount > 0}
            sources={copySources.filter((s) => s.id !== sessionId)}
            copy={async (sourceId) => {
              // Let a save in flight finish first, so it cannot overwrite the copy.
              await store.settle();
              const result = await copySessionContentAction(sourceId, store.currentTarget);
              if (!result.ok) {
                return result.error;
              }
              store.replace(fromLoadedParts(result.parts), result.sessionId);
              setStoredId(result.sessionId);
              return null;
            }}
          />
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteTitle", { name })}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending || !sessionId}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteSessionAction(sessionId!);
                      report(result);
                      if (result.ok) {
                        setDeleteOpen(false);
                      }
                    })
                  }
                >
                  {t("delete")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
