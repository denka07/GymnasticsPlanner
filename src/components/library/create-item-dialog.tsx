"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

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
import type { ActionResult } from "@/lib/action-result";
import type { LibraryScope } from "@/lib/library";

/**
 * Creates a station or exercise by name. Administrators also choose between
 * personal (the default) and global; the server checks that choice again.
 */
export function CreateItemDialog({
  buttonLabel,
  title,
  placeholder,
  canChooseScope,
  action,
}: {
  buttonLabel: string;
  title: string;
  placeholder: string;
  canChooseScope: boolean;
  action: (name: string, scope: LibraryScope) => Promise<ActionResult>;
}) {
  const t = useTranslations("Library");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<LibraryScope>("personal");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setScope("personal");
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await action(name, canChooseScope ? scope : "personal");
      if (result.ok) {
        setOpen(false);
      } else {
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
            {buttonLabel}
          </Button>
        }
      />
      <DialogContent showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              placeholder={placeholder}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {canChooseScope && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("scopeLabel")}</legend>
              {(["personal", "global"] as const).map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 has-checked:border-primary has-checked:bg-muted/50"
                >
                  <input
                    type="radio"
                    name={`${id}-scope`}
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="grid">
                    <span className="font-medium">
                      {value === "personal" ? t("scopePersonal") : t("scopeGlobal")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {value === "personal" ? t("scopePersonalHint") : t("scopeGlobalHint")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
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
