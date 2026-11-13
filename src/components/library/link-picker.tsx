"use client";

import { PlusIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasName, pickerMatches } from "@/lib/library";

type Item = { id: string; name: string };

/**
 * Search among `items` and add one. Optionally offers to create a new item
 * named after the search when no item has that name.
 */
export function LinkPicker({
  label,
  items,
  chosenIds,
  onAdd,
  addLabel,
  noMatches,
  create,
}: {
  label: string;
  items: Item[];
  chosenIds: string[];
  onAdd: (item: Item) => void;
  addLabel: (name: string) => string;
  noMatches: string;
  create?: { label: (name: string) => string; onCreate: (name: string) => Promise<boolean> };
}) {
  const inputId = useId();
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = pickerMatches(items, chosenIds, search);
  const trimmed = search.trim();
  const canCreate =
    create !== undefined && trimmed !== "" && !hasName(items.map((i) => i.name), trimmed);

  function add(item: Item) {
    onAdd(item);
    setSearch("");
    document.getElementById(inputId)?.focus();
  }

  function createNew() {
    if (!create) {
      return;
    }
    startTransition(async () => {
      if (await create.onCreate(trimmed)) {
        setSearch("");
        document.getElementById(inputId)?.focus();
      }
    });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type="search"
        value={search}
        maxLength={100}
        autoComplete="off"
        className="h-11"
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          // Enter adds the first match instead of submitting the whole form.
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0] && trimmed !== "") {
              add(matches[0]);
            } else if (canCreate) {
              createNew();
            }
          }
        }}
      />
      {(matches.length > 0 || canCreate || trimmed !== "") && (
        <ul className="flex flex-wrap gap-2">
          {matches.map((item) => (
            <li key={item.id} className="max-w-full">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 max-w-full px-3 text-left text-base whitespace-normal"
                aria-label={addLabel(item.name)}
                onClick={() => add(item)}
              >
                <PlusIcon data-icon="inline-start" />
                {item.name}
              </Button>
            </li>
          ))}
          {matches.length === 0 && !canCreate && (
            <li className="text-muted-foreground">{noMatches}</li>
          )}
          {canCreate && (
            <li className="max-w-full">
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-11 max-w-full px-3 text-left text-base whitespace-normal"
                disabled={pending}
                onClick={createNew}
              >
                <PlusIcon data-icon="inline-start" />
                {create.label(trimmed)}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
