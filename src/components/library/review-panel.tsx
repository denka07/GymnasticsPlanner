"use client";

import { CopyIcon, GlobeIcon, SendIcon, Undo2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";

import {
  approveSubmissionAction,
  copyToMineAction,
  makeGlobalAction,
  rejectSubmissionAction,
  submitForReviewAction,
  withdrawSubmissionAction,
} from "@/app/library-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { MAX_REVIEW_COMMENT_LENGTH } from "@/lib/data/schemas";

type Kind = "station" | "exercise";

/** What the server lets the user see and do about review, with dates already formatted. */
export type ReviewPanelState = {
  mine: { status: "pending" | "approved" | "rejected"; date: string; reviewComment: string | null } | null;
  pending: { id: string; date: string; submitterName: string } | null;
  canSubmit: boolean;
  canWithdraw: boolean;
  canReview: boolean;
  canMakeGlobal: boolean;
  canCopy: boolean;
};

/**
 * Copying, submitting, withdrawing, making global and reviewing a library
 * item. Every button only calls a server action that checks the same rules
 * again.
 */
export function ReviewPanel({
  kind,
  itemId,
  itemName,
  state,
  personalExercises = [],
}: {
  kind: Kind;
  itemId: string;
  itemName: string;
  state: ReviewPanelState;
  /** For a station: the owner's personal exercises, which do not follow along. */
  personalExercises?: { id: string; name: string }[];
}) {
  const t = useTranslations("Library");
  const errorMessage = useErrorMessage();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(errorMessage(result.error));
          return;
        }
        after?.();
      } catch (error) {
        // redirect() after copying is thrown as an error; let it through.
        if (error && typeof error === "object" && "digest" in error) {
          throw error;
        }
        toast.error(errorMessage("unexpected"));
      }
    });
  }

  const { mine } = state;
  const ownerSection = state.canSubmit || state.canWithdraw || mine !== null;
  const showPersonalNote =
    kind === "station" && personalExercises.length > 0 && (state.canSubmit || state.canWithdraw);
  const nothing =
    !ownerSection && !state.canReview && !state.canMakeGlobal && !state.canCopy;
  if (nothing) {
    return null;
  }

  return (
    <div className="grid gap-4">
      {state.canCopy && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            disabled={pending}
            onClick={() => run(() => copyToMineAction(kind, itemId))}
          >
            <CopyIcon data-icon="inline-start" />
            {t("copyToMine")}
          </Button>
          <p className="text-muted-foreground">{t("copyHint")}</p>
        </div>
      )}

      {state.canMakeGlobal && (
        <Confirm
          trigger={
            <Button type="button" variant="outline" className="h-11 w-fit px-4" disabled={pending}>
              <GlobeIcon data-icon="inline-start" />
              {t("makeGlobal")}
            </Button>
          }
          title={t("makeGlobalTitle")}
          description={t("makeGlobalText", { name: itemName })}
          confirmLabel={t("makeGlobal")}
          action={() => makeGlobalAction(kind, itemId)}
        />
      )}

      {ownerSection && (
        <section className="grid gap-3 rounded-xl border p-4" aria-labelledby={`${itemId}-review`}>
          <h2 id={`${itemId}-review`} className="font-heading text-xl font-semibold">
            {t("reviewHeading")}
          </h2>
          {mine?.status === "pending" && <p role="status">{t("pendingText", { date: mine.date })}</p>}
          {mine?.status === "approved" && <p role="status">{t("approvedText", { date: mine.date })}</p>}
          {mine?.status === "rejected" && state.canSubmit && (
            <div className="grid gap-2" role="status">
              <p>{t("rejectedText", { date: mine.date })}</p>
              <blockquote className="border-l-4 border-destructive/60 pl-3 whitespace-pre-line">
                {mine.reviewComment}
              </blockquote>
              <p className="text-muted-foreground">{t("rejectedHint")}</p>
            </div>
          )}
          {state.canSubmit && mine?.status !== "rejected" && <p>{t("submitIntro")}</p>}
          {showPersonalNote && (
            <div className="grid gap-1">
              <p>{t("personalExercisesNote", { count: personalExercises.length })}</p>
              <ExerciseLinks items={personalExercises} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {state.canSubmit && (
              <Button
                type="button"
                className="h-11 px-4"
                disabled={pending}
                onClick={() => run(() => submitForReviewAction(kind, itemId))}
              >
                <SendIcon data-icon="inline-start" />
                {mine?.status === "rejected" ? t("submitAgain") : t("submit")}
              </Button>
            )}
            {state.canWithdraw && (
              <Confirm
                trigger={
                  <Button type="button" variant="outline" className="h-11 px-4" disabled={pending}>
                    <Undo2Icon data-icon="inline-start" />
                    {t("withdraw")}
                  </Button>
                }
                title={t("withdrawTitle")}
                description={t("withdrawText")}
                confirmLabel={t("withdraw")}
                action={() => withdrawSubmissionAction(kind, itemId)}
              />
            )}
          </div>
        </section>
      )}

      {state.canReview && state.pending && (
        <ReviewerSection
          kind={kind}
          itemId={itemId}
          itemName={itemName}
          submission={state.pending}
          personalExercises={personalExercises}
        />
      )}
    </div>
  );
}

function ReviewerSection({
  kind,
  itemId,
  itemName,
  submission,
  personalExercises,
}: {
  kind: Kind;
  itemId: string;
  itemName: string;
  submission: { id: string; date: string; submitterName: string };
  personalExercises: { id: string; name: string }[];
}) {
  const t = useTranslations("Library");
  return (
    <section
      className="grid gap-3 rounded-xl border border-primary/40 bg-muted/30 p-4"
      aria-labelledby={`${itemId}-reviewer`}
    >
      <h2 id={`${itemId}-reviewer`} className="font-heading text-xl font-semibold">
        {t("reviewHeading")}
      </h2>
      <p>{t("reviewerText", { name: submission.submitterName, date: submission.date })}</p>
      {kind === "station" && personalExercises.length > 0 && (
        <div className="grid gap-1">
          <p>{t("reviewerPersonalExercises", { count: personalExercises.length })}</p>
          <ul className="list-disc pl-5">
            {personalExercises.map((e) => (
              <li key={e.id}>{e.name}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Confirm
          trigger={
            <Button type="button" className="h-11 px-4">
              {t("approve")}
            </Button>
          }
          title={t("approveTitle")}
          description={t("approveText", { name: itemName })}
          confirmLabel={t("approve")}
          action={() => approveSubmissionAction(submission.id)}
        />
        <RejectDialog submissionId={submission.id} submitterName={submission.submitterName} />
      </div>
    </section>
  );
}

function ExerciseLinks({ items }: { items: { id: string; name: string }[] }) {
  return (
    <ul className="list-disc pl-5">
      {items.map((e) => (
        <li key={e.id}>
          <Link
            href={`/library/exercises/${e.id}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {e.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Asks before an action that is not a deletion; shows its error in the dialog. */
function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  action,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<ActionResult>;
}) {
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <Button onClick={confirm} disabled={pending}>
            {pending ? tc("saving") : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RejectDialog({ submissionId, submitterName }: { submissionId: string; submitterName: string }) {
  const t = useTranslations("Library");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await rejectSubmissionAction(submissionId, comment);
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setComment("");
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" className="h-11 px-4 text-destructive">
            {t("reject")}
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("commentHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-comment`}>{t("commentLabel", { name: submitterName })}</Label>
            <Textarea
              id={`${id}-comment`}
              value={comment}
              rows={4}
              maxLength={MAX_REVIEW_COMMENT_LENGTH}
              onChange={(e) => setComment(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? tc("saving") : t("reject")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
