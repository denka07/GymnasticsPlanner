"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/*
 * Fields of the drawing editors' properties panels (halls, station layouts
 * and session plans).
 */

/**
 * A text field that changes the drawing when it is left or Enter is
 * pressed, so typing does not move things about; a value that does not
 * parse is put back.
 */
export function CommitField({
  label,
  value,
  parse,
  onCommit,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  parse: (text: string) => string | number | null | undefined;
  onCommit: (value: string | number | null) => void;
  inputMode?: "decimal" | "numeric" | "text";
  maxLength?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  function commitText() {
    const parsed = parse(text);
    if (parsed === undefined) {
      setText(value);
      return;
    }
    if (text !== value) {
      onCommit(parsed);
    }
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        value={text}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
          }
        }}
      />
    </div>
  );
}

/** A number typed with a comma or point, within [min, max]; undefined when it is not one. */
export function parseNumber(text: string, min: number, max: number): number | undefined {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

