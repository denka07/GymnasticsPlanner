"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { createHallAction } from "@/app/library-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
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
import { parseMetres } from "@/lib/halls";

/** Creates a hall from its name and size in metres; the server opens it in the editor. */
export function NewHallDialog() {
  const t = useTranslations("Halls");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setWidth("");
      setLength("");
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const widthCm = parseMetres(width);
    const lengthCm = parseMetres(length);
    if (widthCm === null || lengthCm === null) {
      setError(errorMessage("hallSizeInvalid"));
      return;
    }
    startTransition(async () => {
      const result = await createHallAction({ name, widthCm, lengthCm });
      if (!result.ok) {
        setError(errorMessage(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="h-11 px-4">
            <PlusIcon data-icon="inline-start" />
            {t("new")}
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              placeholder={t("namePlaceholder")}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-width`}>{t("widthLabel")}</Label>
              <Input
                id={`${id}-width`}
                inputMode="decimal"
                placeholder="24,5"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-length`}>{t("lengthLabel")}</Label>
              <Input
                id={`${id}-length`}
                inputMode="decimal"
                placeholder="42"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("sizeHint")}</p>
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
              {pending ? tc("saving") : tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
