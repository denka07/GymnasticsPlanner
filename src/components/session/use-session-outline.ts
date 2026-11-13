"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { saveSessionOutlineAction } from "@/app/session-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import type { SessionTarget } from "@/lib/data/schemas";
import type { OutlineLine } from "@/lib/outline";
import { newLineId, OutlineStore } from "@/lib/outline-store";

export { newLineId };

/**
 * The outline of one session column: lines, save status and the store. Save
 * failures show a toast; the edits stay so the next one retries.
 */
export function useSessionOutline(
  initial: OutlineLine[],
  target: SessionTarget,
  onStored: (sessionId: string) => void,
) {
  const t = useTranslations("Session");
  const errorMessage = useErrorMessage();
  const [store] = useState(() => new OutlineStore(initial, target));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.setHandlers(
      (to, parts) => saveSessionOutlineAction(to, parts),
      (key) => toast.error(t("saveFailed"), { description: errorMessage(key) }),
      onStored,
    );
  });

  // Leaving the page sends edits that are still waiting.
  useEffect(() => store.flush, [store]);

  const dirty = snapshot.status === "saving" || snapshot.status === "failed";
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { lines: snapshot.lines, status: snapshot.status, store };
}
