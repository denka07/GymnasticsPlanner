"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";

import { useErrorMessage } from "./use-error-message";

/**
 * Creates or edits a focus item. The category is free text; categories
 * already used in the season are offered as suggestions.
 */
export function FocusItemDialog({
  trigger,
  title,
  submitLabel,
  categories,
  initial = { name: "", category: "" },
  action,
}: {
  trigger: ReactElement;
  title: string;
  submitLabel: string;
  categories: string[];
  initial?: { name: string; category: string };
  action: (input: { name: string; category: string }) => Promise<ActionResult>;
}) {
  const t = useTranslations("FocusItems");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(initial.name);
      setCategory(initial.category);
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await action({ name, category });
      if (result.ok) {
        setOpen(false);
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              placeholder={t("namePlaceholder")}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-category`}>
              {t("categoryLabel")} ({tc("optional")})
            </Label>
            <Input
              id={`${id}-category`}
              value={category}
              placeholder={t("categoryPlaceholder")}
              maxLength={50}
              autoComplete="off"
              list={`${id}-categories`}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tc("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
