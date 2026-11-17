"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { setEventDescriptionAction } from "@/app/plan-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EVENT_DESCRIPTION_LENGTH } from "@/lib/data/schemas";

/** How long typing must pause before the description is saved, in milliseconds. */
const SAVE_DELAY = 1000;

type Status = "idle" | "saving" | "saved" | "failed";

/**
 * An event's description on the week page: a growing text area saved shortly
 * after typing stops and on blur, like the note after a session. Saves run one
 * after another so an older text never overwrites a newer one.
 */
export function EventDescription({
  eventId,
  initial,
}: {
  eventId: string;
  initial: string;
}) {
  const t = useTranslations("Events");
  const ts = useTranslations("Session");
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const area = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const id = `event-description-${eventId}`;

  // Grow with the text.
  useLayoutEffect(() => {
    const el = area.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

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
        const result = await setEventDescriptionAction(eventId, text);
        error = result.ok ? null : result.error;
      } catch {
        error = "unexpected";
      }
      if (error === null) {
        saved.current = text;
        setStatus(latest.current === text ? "saved" : "saving");
      } else {
        setStatus("failed");
        toast.error(t("descriptionFailed"), {
          description: errorMessage(error),
        });
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
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-base font-medium">
        {t("descriptionLabel")}
      </Label>
      <Textarea
        ref={area}
        id={id}
        value={value}
        maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
        placeholder={t("descriptionPlaceholder")}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        className="min-h-24 resize-none overflow-hidden text-base leading-relaxed"
      />
      <p
        className="min-h-5 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {status === "saving"
          ? ts("saving")
          : status === "saved"
            ? ts("saved")
            : status === "failed"
              ? ts("notSaved")
              : ""}
      </p>
    </div>
  );
}
