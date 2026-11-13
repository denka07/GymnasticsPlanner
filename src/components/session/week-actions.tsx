"use client";

import { PlusIcon, SettingsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { createExtraSessionAction } from "@/app/session-actions";
import { WeekSettingsPopover } from "@/components/plan/week-header";
import { Button } from "@/components/ui/button";

import { SessionDetailsDialog } from "./session-details-dialog";

/** "Lägg till pass": an extra session on any date of the week. */
export function AddSessionButton({
  seasonId,
  weekStart,
  weekEnd,
}: {
  seasonId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const t = useTranslations("Week");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        {t("addSession")}
      </Button>
      <SessionDetailsDialog
        open={open}
        onOpenChange={setOpen}
        title={t("addTitle")}
        initial={{ date: weekStart, startTime: "", endTime: "", location: "" }}
        minDate={weekStart}
        maxDate={weekEnd}
        submit={async (values) => {
          const result = await createExtraSessionAction(seasonId, values);
          return result.ok ? null : result.error;
        }}
      />
    </>
  );
}

/** Opens the break and note settings of the week. */
export function EditWeekButton(props: {
  seasonId: string;
  weekStart: string;
  week: number;
  isBreak: boolean;
  note: string | null;
  paintedCount: number;
}) {
  const t = useTranslations("Week");
  return (
    <WeekSettingsPopover
      {...props}
      trigger={
        <Button variant="outline">
          <SettingsIcon data-icon="inline-start" />
          {t("editWeek")}
        </Button>
      }
    />
  );
}
