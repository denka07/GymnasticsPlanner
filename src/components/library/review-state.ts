import type { ReviewState } from "@/lib/data/submissions";
import { formatSubmissionDate } from "@/lib/library";

import type { ReviewPanelState } from "./review-panel";

/**
 * The review state as the panel shows it: dates formatted on the server, and
 * nothing the user was not given (the submitter's name only reaches
 * administrators, through `pending`).
 */
export function toPanelState(review: ReviewState): ReviewPanelState {
  const { mine, pending } = review;
  return {
    mine: mine && {
      status: mine.status,
      date: formatSubmissionDate(mine.reviewedAt ?? mine.submittedAt),
      reviewComment: mine.reviewComment,
    },
    pending: pending && {
      id: pending.id,
      date: formatSubmissionDate(pending.submittedAt),
      submitterName: pending.submitterName,
    },
    included: review.included,
    goesWithStations: review.goesWithStations,
    canSubmit: review.canSubmit,
    canWithdraw: review.canWithdraw,
    canReview: review.canReview,
    canMakeGlobal: review.canMakeGlobal,
    canCopy: review.canCopy,
  };
}
