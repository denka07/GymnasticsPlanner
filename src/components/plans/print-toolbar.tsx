"use client";

import { PrinterIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { printHref, type PrintChoice } from "@/lib/plan-reading";

/**
 * The print view's controls, hidden in print: what to print (every plan or
 * one), "Skriv ut", which opens the browser's print dialog, and the way back.
 */
export function PrintToolbar({
  sessionId,
  plans,
  choice,
  backHref,
}: {
  sessionId: string;
  /** The session's plans in reading order, with their names. */
  plans: { id: string; name: string }[];
  choice: PrintChoice;
  backHref: string;
}) {
  const t = useTranslations("PlanPrint");
  const router = useRouter();
  const id = useId();
  const value = choice === "all" ? "" : choice.planId;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3 print:hidden">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-choice`}>{t("chooseLabel")}</Label>
        <NativeSelect
          id={`${id}-choice`}
          value={value}
          onChange={(event) =>
            router.replace(printHref(sessionId, event.target.value ? { planId: event.target.value } : "all"))
          }
        >
          <NativeSelectOption value="">{t("all")}</NativeSelectOption>
          {plans.map((plan) => (
            <NativeSelectOption key={plan.id} value={plan.id}>
              {plan.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" onClick={() => window.print()}>
        <PrinterIcon data-icon="inline-start" />
        {t("print")}
      </Button>
      <ButtonLink variant="outline" href={backHref}>
        {t("back")}
      </ButtonLink>
      <p className="basis-full text-sm text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
