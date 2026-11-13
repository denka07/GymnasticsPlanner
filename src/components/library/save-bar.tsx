"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/** The bottom bar of a library editor: save status, errors and the save button. */
export function SaveBar({
  dirty,
  pending,
  error,
  status,
}: {
  dirty: boolean;
  pending: boolean;
  error: string | null;
  status: string | null;
}) {
  const t = useTranslations();

  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      {error ? (
        <p role="alert" className="mr-auto text-destructive">
          {error}
        </p>
      ) : (
        <p role="status" className="mr-auto text-muted-foreground">
          {status}
        </p>
      )}
      <Button type="submit" className="h-11 px-5 text-base" disabled={pending || !dirty}>
        {pending ? t("Common.saving") : t("Library.save")}
      </Button>
    </div>
  );
}
