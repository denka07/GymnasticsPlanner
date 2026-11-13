"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { setNoteAfterAction } from "@/app/session-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTE_AFTER_LENGTH } from "@/lib/data/schemas";

/** How long typing must pause before the note is saved, in milliseconds. */
const SAVE_DELAY = 1000;

type Status = "idle" | "saving" | "saved" | "failed";

/**
 * "Anteckning efter passet". Saved shortly after typing stops and when the
 * field loses focus. Saves run one after another, so an older text can never
 * overwrite a newer one.
 */
export function SessionNote({
  sessionId,
  initial,
  editable,
}: {
  sessionId: string;
  initial: string;
  editable: boolean;
}) {
  const t = useTranslations("SessionPage");
  const ts = useTranslations("Session");
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current === saved.current) {
      return;
    }
    const text = latest.current;
    setStatus("saving");
    chain.current = chain.current.then(async () => {
      let error: string | null = null;
      try {
        const result = await setNoteAfterAction(sessionId, text);
        error = result.ok ? null : result.error;
      } catch {
        error = "unexpected";
      }
      if (error === null) {
        saved.current = text;
        // Still "saving" if more was typed meanwhile.
        setStatus(latest.current === text ? "saved" : "saving");
      } else {
        setStatus("failed");
        toast.error(t("noteFailed"), { description: errorMessage(error) });
      }
    });
  }

  function change(next: string) {
    latest.current = next;
    setValue(next);
    setStatus("saving");
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(flush, SAVE_DELAY);
  }

  // Leaving the page sends what is still waiting.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);

  return (
    <section className="grid gap-2">
      <Label htmlFor="note-after" className="text-lg font-semibold">
        {t("noteLabel")}
      </Label>
      {editable ? (
        <>
          <Textarea
            id="note-after"
            value={value}
            maxLength={MAX_NOTE_AFTER_LENGTH}
            placeholder={t("notePlaceholder")}
            onChange={(e) => change(e.target.value)}
            onBlur={flush}
            className="min-h-32 text-lg leading-relaxed md:text-lg"
          />
          <p className="min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">
            {status === "saving"
              ? ts("saving")
              : status === "saved"
                ? ts("saved")
                : status === "failed"
                  ? ts("notSaved")
                  : ""}
          </p>
        </>
      ) : (
        <p id="note-after" className="text-lg leading-relaxed break-words whitespace-pre-wrap">
          {value}
        </p>
      )}
    </section>
  );
}
