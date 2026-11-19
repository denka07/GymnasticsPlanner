"use client";

import { ImageDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { HallDrawing } from "@/lib/data/halls";
import { planImageName } from "@/lib/plan-reading";
import type { DrawnPlanItem } from "@/lib/session-plans";
import { cn } from "@/lib/utils";

import { download, planPng } from "./plan-image";
import { PlanDrawing, type PersonInitials } from "./plan-drawing";

/**
 * "Spara som bild": downloads a plan as a PNG. The plan is drawn off-screen
 * as the hall is, not turned, and that drawing is turned into the image.
 */
export function SavePlanImage({
  hall,
  items,
  numbers,
  initials,
  name,
  date,
  className,
  variant = "outline",
}: {
  hall: HallDrawing;
  items: readonly DrawnPlanItem[];
  numbers: ReadonlyMap<string, number>;
  initials: PersonInitials;
  /** The plan's name, for the file name. */
  name: string;
  /** The session's date, `YYYY-MM-DD`. */
  date: string;
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
}) {
  const t = useTranslations("PlanReading");
  const tp = useTranslations("Plans");
  const [saving, setSaving] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const fileName = planImageName(date, name);

  useEffect(() => {
    if (!saving) {
      return;
    }
    let cancelled = false;
    const svg = holder.current?.querySelector("svg");
    (async () => {
      try {
        if (!svg) {
          throw new Error("no drawing");
        }
        const blob = await planPng(svg);
        if (!cancelled) {
          download(blob, fileName);
        }
      } catch {
        if (!cancelled) {
          toast.error(t("imageFailed"));
        }
      } finally {
        if (!cancelled) {
          setSaving(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saving, fileName, t]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={cn(className)}
        disabled={saving}
        onClick={() => setSaving(true)}
      >
        <ImageDownIcon data-icon="inline-start" />
        {saving ? t("savingImage") : t("saveImage")}
      </Button>
      {saving && (
        <div ref={holder} aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] w-[1200px]">
          <PlanDrawing
            hall={hall}
            items={items}
            numbers={numbers}
            initials={initials}
            label={tp("drawingLabel", { plan: name, hall: hall.name })}
            turned={false}
          />
        </div>
      )}
    </>
  );
}
