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
import { Checkbox } from "@/components/ui/checkbox";
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
import { splitIncludedOutcome } from "@/lib/library";

type Kind = "station" | "exercise";
type Named = { id: string; name: string };

/** What the server lets the user see and do about review, with dates already formatted. */
export type ReviewPanelState = {
  mine: { status: "pending" | "approved" | "rejected"; date: string; reviewComment: string | null } | null;
  pending: { id: string; date: string; submitterName: string } | null;
  /** For a station: the exercises included in the submission shown. */
  included: (Named & { scope: "global" | "personal"; qualifies: boolean })[];
  /** For an exercise: the stations whose pending submission includes it. */
  goesWithStations: Named[];
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
  /**
   * For the owner's personal station: their own personal exercises it
   * supports, which may go global with it.
   */
  personalExercises?: Named[];
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
  const choosesExercises = kind === "station" && personalExercises.length > 0;
  const nothing =
    !ownerSection &&
    !state.canReview &&
    !state.canMakeGlobal &&
    !state.canCopy &&
    state.goesWithStations.length === 0;
  if (nothing) {
    return null;
  }
  const outcome = splitIncludedOutcome(state.included);

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

      {state.canMakeGlobal &&
        (choosesExercises ? (
          <PickExercisesDialog
            trigger={
              <Button type="button" variant="outline" className="h-11 w-fit px-4" disabled={pending}>
                <GlobeIcon data-icon="inline-start" />
                {t("makeGlobal")}
              </Button>
            }
            title={t("makeGlobalTitle")}
            description={t("makeGlobalText", { name: itemName })}
            legend={t("makeGlobalExercisesLegend")}
            hint={t("exercisesNotTickedHint")}
            items={personalExercises}
            confirmLabel={t("makeGlobal")}
            action={(ids) => makeGlobalAction(kind, itemId, ids)}
          />
        ) : (
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
        ))}

      {state.goesWithStations.length > 0 && (
        <section className="grid gap-1 rounded-xl border p-4" role="status">
          <p>{t("goesWithStation", { count: state.goesWithStations.length })}</p>
          <ItemLinks items={state.goesWithStations} kind="station" />
        </section>
      )}

      {ownerSection && (
        <section className="grid gap-3 rounded-xl border p-4" aria-labelledby={`${itemId}-review`}>
          <h2 id={`${itemId}-review`} className="font-heading text-xl font-semibold">
            {t("reviewHeading")}
          </h2>
          {mine?.status === "pending" && <p role="status">{t("pendingText", { date: mine.date })}</p>}
          {mine?.status === "pending" && state.included.length > 0 && (
            <div className="grid gap-1">
              <p>{t("includedPending", { count: state.included.length })}</p>
              <ItemLinks items={state.included} kind="exercise" />
            </div>
          )}
          {mine?.status === "approved" && <p role="status">{t("approvedText", { date: mine.date })}</p>}
          {mine?.status === "approved" && outcome.global.length > 0 && (
            <div className="grid gap-1">
              <p>{t("includedApproved", { count: outcome.global.length })}</p>
              <ItemLinks items={outcome.global} kind="exercise" />
            </div>
          )}
          {mine?.status === "approved" && outcome.personal.length > 0 && (
            <div className="grid gap-1">
              <p>{t("includedStayedPersonal", { count: outcome.personal.length })}</p>
              <ItemLinks items={outcome.personal} kind="exercise" />
            </div>
          )}
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
          {state.canSubmit && choosesExercises && <p>{t("submitExercisesIntro")}</p>}
          <div className="flex flex-wrap gap-2">
            {state.canSubmit &&
              (choosesExercises ? (
                <PickExercisesDialog
                  trigger={
                    <Button type="button" className="h-11 px-4" disabled={pending}>
                      <SendIcon data-icon="inline-start" />
                      {mine?.status === "rejected" ? t("submitAgain") : t("submit")}
                    </Button>
                  }
                  title={t("submitTitle")}
                  description={t("submitIntro")}
                  legend={t("submitExercisesLegend")}
                  hint={t("exercisesNotTickedHint")}
                  items={personalExercises}
                  confirmLabel={t("submit")}
                  action={(ids) => submitForReviewAction(kind, itemId, ids)}
                />
              ) : (
                <Button
                  type="button"
                  className="h-11 px-4"
                  disabled={pending}
                  onClick={() => run(() => submitForReviewAction(kind, itemId))}
                >
                  <SendIcon data-icon="inline-start" />
                  {mine?.status === "rejected" ? t("submitAgain") : t("submit")}
                </Button>
              ))}
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
          itemId={itemId}
          itemName={itemName}
          submission={state.pending}
          included={state.included}
        />
      )}
    </div>
  );
}

function ReviewerSection({
  itemId,
  itemName,
  submission,
  included,
}: {
  itemId: string;
  itemName: string;
  submission: { id: string; date: string; submitterName: string };
  included: ReviewPanelState["included"];
}) {
  const t = useTranslations("Library");
  const qualifying = included.filter((e) => e.qualifies);
  const lapsed = included.filter((e) => !e.qualifies);
  return (
    <section
      className="grid gap-3 rounded-xl border border-primary/40 bg-muted/30 p-4"
      aria-labelledby={`${itemId}-reviewer`}
    >
      <h2 id={`${itemId}-reviewer`} className="font-heading text-xl font-semibold">
        {t("reviewHeading")}
      </h2>
      <p>{t("reviewerText", { name: submission.submitterName, date: submission.date })}</p>
      {qualifying.length > 0 && (
        <div className="grid gap-1">
          <p>{t("reviewerIncluded", { count: qualifying.length })}</p>
          <ItemLinks items={qualifying} kind="exercise" />
        </div>
      )}
      {lapsed.length > 0 && (
        <div className="grid gap-1 text-muted-foreground">
          <p>{t("reviewerIncludedLapsed", { count: lapsed.length })}</p>
          <ul className="list-disc pl-5">
            {lapsed.map((e) => (
              <li key={e.id}>{e.name}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {qualifying.length > 0 ? (
          <PickExercisesDialog
            trigger={
              <Button type="button" className="h-11 px-4">
                {t("approve")}
              </Button>
            }
            title={t("approveTitle")}
            description={t("approveText", { name: itemName })}
            legend={t("approveExercisesLegend")}
            hint={t("approveNotTickedHint")}
            items={qualifying}
            confirmLabel={t("approve")}
            action={(ids) => approveSubmissionAction(submission.id, ids)}
          />
        ) : (
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
        )}
        <RejectDialog submissionId={submission.id} submitterName={submission.submitterName} />
      </div>
    </section>
  );
}

function ItemLinks({ items, kind }: { items: Named[]; kind: Kind }) {
  return (
    <ul className="list-disc pl-5">
      {items.map((e) => (
        <li key={e.id}>
          <Link
            href={kind === "station" ? `/library/stations/${e.id}` : `/library/exercises/${e.id}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {e.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Asks before an action that takes a chosen set of exercises along (all
 * ticked at first); shows its error in the dialog.
 */
function PickExercisesDialog({
  trigger,
  title,
  description,
  legend,
  hint,
  items,
  confirmLabel,
  action,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  legend: string;
  hint: string;
  items: Named[];
  confirmLabel: string;
  action: (exerciseIds: string[]) => Promise<ActionResult>;
}) {
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(items.map((e) => e.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await action(items.filter((e) => ticked.has(e.id)).map((e) => e.id));
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  function toggle(exerciseId: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) {
        next.add(exerciseId);
      } else {
        next.delete(exerciseId);
      }
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTicked(new Set(items.map((e) => e.id)));
          setError(null);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false}>
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium">{legend}</legend>
            {items.map((e) => (
              <Label key={e.id} htmlFor={`${id}-${e.id}`} className="min-h-8 font-normal">
                <Checkbox
                  id={`${id}-${e.id}`}
                  checked={ticked.has(e.id)}
                  onCheckedChange={(checked) => toggle(e.id, checked === true)}
                />
                {e.name}
              </Label>
            ))}
            <p className="text-sm text-muted-foreground">{hint}</p>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? tc("saving") : confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
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
