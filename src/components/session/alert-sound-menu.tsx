"use client";

import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALERT_SOUNDS, DEFAULT_ALERT_SOUND, type AlertSound } from "@/lib/alert-sounds";
import { cn } from "@/lib/utils";

import { playRound, readAlertSound, saveAlertSound, subscribeAlertSound } from "./timer-effects";

/**
 * Picks the timer's alarm sound, saved on this device. Picking a sound plays
 * one round of it at once; the menu stays open so several can be tried. It
 * never touches a running timer.
 *
 * `labelled` shows the label and the current sound beside the bell, for the
 * start dialog; otherwise it is an icon button, for the timer bar.
 */
export function AlertSoundMenu({ labelled = false, className }: { labelled?: boolean; className?: string }) {
  const t = useTranslations("PartTimer");
  const sound = useSyncExternalStore(subscribeAlertSound, readAlertSound, () => DEFAULT_ALERT_SOUND);

  function pick(value: AlertSound) {
    saveAlertSound(value);
    // A tap, so the page may start sound.
    playRound(value);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          labelled ? (
            <Button type="button" variant="outline" className={cn("h-11 justify-start gap-2 px-3 text-base", className)}>
              <BellIcon className="size-5" />
              <span className="font-medium">{t("alertSound")}</span>
              <span className="text-muted-foreground">{t(`sounds.${sound}`)}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              aria-label={t("alertSound")}
              title={t("alertSound")}
              className={cn("size-11 shrink-0", className)}
            >
              <BellIcon className="size-6" />
            </Button>
          )
        }
      />
      {/* The bar sits at the bottom of the screen, so its menu opens upwards. */}
      <DropdownMenuContent
        align={labelled ? "start" : "end"}
        side={labelled ? "bottom" : "top"}
        className="w-auto min-w-48"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 text-sm">{t("alertSound")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sound}>
            {ALERT_SOUNDS.map((id) => (
              <DropdownMenuRadioItem
                key={id}
                value={id}
                onClick={() => pick(id)}
                className="min-h-11 pl-3 pr-10 text-base"
              >
                {t(`sounds.${id}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
