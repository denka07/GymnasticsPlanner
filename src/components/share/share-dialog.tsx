"use client";

import { Share2Icon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addShareAction,
  listSharesAction,
  removeShareAction,
  updateShareLevelAction,
} from "@/app/share-actions";
import { useErrorMessage } from "@/components/plan/use-error-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ShareEntry } from "@/lib/data/shares";

type Kind = "group" | "season" | "session";
type Level = "view" | "edit";

/**
 * The "Dela" button and dialog, shown to the owner only: who has access to
 * the resource, adding a person by email, switching level and removing.
 * Shares inherited from a parent are listed but managed on the parent. Every
 * action is checked again on the server.
 */
export function ShareDialog({ kind, id, name }: { kind: Kind; id: string; name: string }) {
  const t = useTranslations("Share");
  const tc = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ShareEntry[] | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<Level>("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resource = { kind, id };

  async function reload() {
    const result = await listSharesAction(resource);
    if (result.ok) {
      setEntries(result.shares);
    } else {
      toast.error(errorMessage(result.error));
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEntries(null);
      setEmail("");
      setLevel("view");
      setError(null);
      startTransition(reload);
    }
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addShareAction(resource, { email, level });
      if (result.ok) {
        setEmail("");
        setError(null);
        await reload();
      } else {
        setError(errorMessage(result.error));
      }
    });
  }

  function change(entry: ShareEntry, next: Level) {
    startTransition(async () => {
      const result = await updateShareLevelAction(entry.id, next);
      if (!result.ok) {
        toast.error(errorMessage(result.error));
      }
      await reload();
    });
  }

  function remove(entry: ShareEntry) {
    startTransition(async () => {
      const result = await removeShareAction(entry.id);
      if (!result.ok) {
        toast.error(errorMessage(result.error));
      }
      await reload();
    });
  }

  const own = entries?.filter((e) => e.inheritedFrom === null) ?? [];
  const inherited = entries?.filter((e) => e.inheritedFrom !== null) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Share2Icon data-icon="inline-start" />
            {t("button")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`title.${kind}`, { name })}</DialogTitle>
          <DialogDescription>{t(`intro.${kind}`)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="grid gap-2">
          <Label htmlFor={`${formId}-email`}>{t("emailLabel")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${formId}-email`}
              type="email"
              value={email}
              placeholder={t("emailPlaceholder")}
              autoComplete="off"
              className="min-w-48 flex-1"
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${formId}-error` : `${formId}-hint`}
            />
            <NativeSelect
              aria-label={t("levelLabel")}
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
            >
              <NativeSelectOption value="view">{t("levels.view")}</NativeSelectOption>
              <NativeSelectOption value="edit">{t("levels.edit")}</NativeSelectOption>
            </NativeSelect>
            <Button type="submit" disabled={pending || email.trim() === ""}>
              {t("add")}
            </Button>
          </div>
          {error ? (
            <p id={`${formId}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <p id={`${formId}-hint`} className="text-sm text-muted-foreground">
              {t("emailHint")}
            </p>
          )}
        </form>

        <section aria-labelledby={`${formId}-list`} className="grid gap-2">
          <h3 id={`${formId}-list`} className="font-semibold">
            {t("listHeading")}
          </h3>
          {entries === null ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nobody")}</p>
          ) : (
            <ul className="grid divide-y rounded-lg ring-1 ring-foreground/10">
              {own.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Person entry={entry} />
                  <NativeSelect
                    size="sm"
                    aria-label={t("levelFor", { email: entry.email })}
                    value={entry.level}
                    disabled={pending}
                    onChange={(e) => change(entry, e.target.value as Level)}
                  >
                    <NativeSelectOption value="view">{t("levels.view")}</NativeSelectOption>
                    <NativeSelectOption value="edit">{t("levels.edit")}</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("remove", { email: entry.email })}
                    title={t("removeShort")}
                    disabled={pending}
                    onClick={() => remove(entry)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
              {inherited.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Person entry={entry} />
                  <span className="text-sm">{t(`levels.${entry.level}`)}</span>
                  <Badge variant="outline">{t(`inherited.${entry.inheritedFrom!}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Person({ entry }: { entry: ShareEntry }) {
  const t = useTranslations("Share");
  return (
    <div className="grid min-w-0 flex-1 gap-0.5">
      <span className="truncate font-medium">{entry.name ?? entry.email}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {entry.name && <span className="truncate">{entry.email}</span>}
        {!entry.signedIn && <Badge variant="secondary">{t("waiting")}</Badge>}
      </span>
    </div>
  );
}
