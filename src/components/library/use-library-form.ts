"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { useErrorMessage } from "@/components/plan/use-error-message";

/**
 * Save state for a library editor: whether `payload` differs from what was
 * last saved, a save function, and the message to show. Warns before the page
 * is left with unsaved changes.
 */
export function useLibraryForm<T>(payload: T, save: (payload: T) => Promise<ActionResult>) {
  const t = useTranslations("Library");
  const errorMessage = useErrorMessage();
  const current = JSON.stringify(payload);
  const [saved, setSaved] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = current !== saved;

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    startTransition(async () => {
      const result = await save(payload);
      if (result.ok) {
        setSaved(current);
        setError(null);
        setJustSaved(true);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  let status: string | null = null;
  if (dirty) {
    status = t("unsaved");
  } else if (justSaved) {
    status = t("saved");
  }

  return { dirty, pending, error, status, submit };
}
