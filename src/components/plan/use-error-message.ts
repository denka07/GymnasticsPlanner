"use client";

import { useTranslations } from "next-intl";

/** Turns an ActionResult error key into Swedish text, with a generic fallback. */
export function useErrorMessage(): (key: string) => string {
  const t = useTranslations("Errors");
  return (key) => {
    const known = key as Parameters<typeof t>[0];
    return t.has(known) ? t(known) : t("invalid");
  };
}
