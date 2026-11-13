"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyPaste,
  indent,
  isOutlinePaste,
  MAX_ACTIVITY_LENGTH,
  MAX_DURATION,
  MAX_TITLE_LENGTH,
  moveLine,
  outdent,
  parsePaste,
  partClockTimes,
  pressEnter,
  removeEmptyLine,
  sessionLength,
  totalDuration,
  type Edit,
  type Focus,
  type OutlineLine,
} from "@/lib/outline";
import { cn } from "@/lib/utils";

import { newLineId } from "./use-session-outline";

/** A text line of the outline: borderless until hovered or focused; grows to fit its text. */
const LINE_CLASS =
  "min-h-8 min-w-0 flex-1 resize-none border-transparent bg-transparent px-1.5 py-1 leading-6 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent";

/** True when a text area shows a single line of text. */
function isSingleLine(el: HTMLTextAreaElement): boolean {
  const style = getComputedStyle(el);
  const line = Number.parseFloat(style.lineHeight) || 24;
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  return el.scrollHeight - padding < line * 1.5;
}

/** Clock times and part numbers per line index, for parts only. */
function partInfo(lines: readonly OutlineLine[], startTime: string | null) {
  const partIndexes = lines.flatMap((l, i) => (l.kind === "part" ? [i] : []));
  const times = partClockTimes(
    startTime,
    partIndexes.map((i) => lines[i].duration),
  );
  const info = new Map<number, { number: number; time: string | null }>();
  partIndexes.forEach((lineIndex, n) => info.set(lineIndex, { number: n + 1, time: times[n] }));
  return info;
}

/** The title of the part a line belongs to, for accessible names. */
function partTitleOf(lines: readonly OutlineLine[], index: number): string {
  for (let i = index; i >= 0; i--) {
    if (lines[i].kind === "part") {
      return lines[i].text;
    }
  }
  return "";
}

/**
 * A session's parts and activities, edited in place like a list in a
 * document. All structure changes go through the pure functions in
 * src/lib/outline.ts; this component maps keys to them and moves the caret.
 */
export function SessionOutlineEditor({
  name,
  lines,
  onChange,
  onBlur,
  startTime,
  endTime,
}: {
  /** The session's name for accessible labels, e.g. "Onsdag 2 sep.". */
  name: string;
  lines: OutlineLine[];
  onChange: (lines: OutlineLine[]) => void;
  /** Called when focus leaves the editor. */
  onBlur: () => void;
  startTime: string | null;
  endTime: string | null;
}) {
  const t = useTranslations("Session");
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  /** Where the caret goes once the next lines have rendered. */
  const focusRequest = useRef<Focus | null>(null);
  const info = partInfo(lines, startTime);
  const total = totalDuration(lines.filter((l) => l.kind === "part").map((l) => l.duration));
  const length = sessionLength(startTime, endTime);

  function focusLine(focus: Focus, current: readonly OutlineLine[]) {
    const line = current[focus.index];
    const input = line && inputs.current.get(line.id);
    if (input) {
      input.focus();
      const offset = Math.min(focus.offset, input.value.length);
      input.setSelectionRange(offset, offset);
    }
  }

  // Put the caret where the last operation asked, once the lines have rendered.
  useLayoutEffect(() => {
    if (focusRequest.current) {
      focusLine(focusRequest.current, lines);
      focusRequest.current = null;
    }
  }, [lines]);

  function apply(edit: Edit | null, event: { preventDefault(): void }): boolean {
    if (!edit) {
      return false;
    }
    event.preventDefault();
    focusRequest.current = edit.focus;
    onChange(edit.lines);
    return true;
  }

  function setText(index: number, text: string) {
    const next = [...lines];
    next[index] = { ...next[index], text };
    onChange(next);
  }

  function setDuration(index: number, raw: string) {
    const n = Number.parseInt(raw, 10);
    const duration = Number.isNaN(n) || n < 1 ? null : Math.min(n, MAX_DURATION);
    const next = [...lines];
    next[index] = { ...next[index], duration };
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (event.key === "Enter") {
      // A selection is replaced by the line break, as in a document.
      const base =
        start === end ? lines : lines.map((l, i) => (i === index ? { ...l, text: l.text.slice(0, start) + l.text.slice(end) } : l));
      apply(pressEnter(base, index, start, newLineId), event);
      return;
    }
    if (event.key === "Tab") {
      apply(event.shiftKey ? outdent(lines, index, start) : indent(lines, index, start), event);
      return;
    }
    if (event.key === "Backspace" && start === 0 && end === 0) {
      apply(removeEmptyLine(lines, index), event);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      if (event.altKey) {
        apply(moveLine(lines, index, direction, start), event);
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = index + direction;
      if (target < 0 || target >= lines.length) {
        return;
      }
      if (isSingleLine(input)) {
        event.preventDefault();
        focusLine({ index: target, offset: start }, lines);
        return;
      }
      // A wrapped entry: let the caret move within it first, and go to the
      // next line only when it could not move (top or bottom visual line).
      const before = input.selectionStart;
      setTimeout(() => {
        if (document.activeElement === input && input.selectionStart === before) {
          focusLine({ index: target, offset: start }, lines);
        }
      });
      return;
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>, index: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!isOutlinePaste(text)) {
      return;
    }
    apply(applyPaste(lines, index, parsePaste(text), newLineId), event);
  }

  return (
    <div
      role="group"
      aria-label={t("outlineLabel", { name })}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onBlur();
        }
      }}
      className="grid gap-0.5"
    >
      {lines.map((line, index) => {
        if (line.kind === "part") {
          const part = info.get(index)!;
          return (
            <div key={line.id} className={cn("flex items-start gap-1.5", index > 0 && "mt-2")}>
              <span
                className="w-11 shrink-0 pt-1.5 text-right text-sm text-muted-foreground tabular-nums"
                aria-hidden={part.time === null}
              >
                {part.time && <span className="sr-only">{t("clockLabel", { time: part.time })} </span>}
                {part.time && <span aria-hidden>{part.time}</span>}
              </span>
              <Textarea
                ref={(el) => {
                  if (el) inputs.current.set(line.id, el);
                  else inputs.current.delete(line.id);
                }}
                rows={1}
                value={line.text}
                maxLength={MAX_TITLE_LENGTH}
                aria-label={t("partLabel", { number: part.number })}
                placeholder={index === 0 && lines.length === 1 ? t("partPlaceholder") : undefined}
                onChange={(e) => setText(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, index)}
                onPaste={(e) => onPaste(e, index)}
                className={cn(LINE_CLASS, "font-semibold")}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DURATION}
                value={line.duration ?? ""}
                aria-label={t("durationLabel", { part: line.text || t("partLabel", { number: part.number }) })}
                onChange={(e) => setDuration(index, e.target.value)}
                className="h-8 w-14 shrink-0 border-transparent bg-transparent px-1 text-right tabular-nums shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span aria-hidden className="w-7 shrink-0 pt-1.5 text-sm text-muted-foreground">
                {t("minutes")}
              </span>
            </div>
          );
        }
        return (
          <div key={line.id} className="flex items-start gap-1.5 pl-12">
            <span aria-hidden className="w-3 shrink-0 pt-1 text-center text-muted-foreground">
              •
            </span>
            <Textarea
              ref={(el) => {
                if (el) inputs.current.set(line.id, el);
                else inputs.current.delete(line.id);
              }}
              rows={1}
              value={line.text}
              maxLength={MAX_ACTIVITY_LENGTH}
              aria-label={t("activityLabel", { part: partTitleOf(lines, index) })}
              placeholder={line.text === "" ? t("activityPlaceholder") : undefined}
              onChange={(e) => setText(index, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              onPaste={(e) => onPaste(e, index)}
              className={LINE_CLASS}
            />
          </div>
        );
      })}
      {total !== null && (
        <p className="mt-2 text-right text-sm text-muted-foreground tabular-nums">
          {length !== null ? t("totalOf", { total, length }) : t("total", { total })}
        </p>
      )}
    </div>
  );
}

/** The outline as plain text, for view access. */
export function SessionOutlineView({
  lines,
  startTime,
  name,
}: {
  lines: OutlineLine[];
  startTime: string | null;
  name: string;
}) {
  const t = useTranslations("Session");
  if (lines.every((l) => l.text === "")) {
    return <p className="text-muted-foreground">{t("empty")}</p>;
  }
  const info = partInfo(lines, startTime);
  return (
    <ul aria-label={t("outlineLabel", { name })} className="grid gap-2">
      {lines.map((line, index) => {
        if (line.kind !== "part") {
          return null;
        }
        const children: OutlineLine[] = [];
        for (let i = index + 1; i < lines.length && lines[i].kind === "activity"; i++) {
          children.push(lines[i]);
        }
        const time = info.get(index)?.time;
        return (
          <li key={line.id}>
            <p className="flex gap-2 font-semibold">
              {time && <span className="font-normal text-muted-foreground tabular-nums">{time}</span>}
              <span className="min-w-0 flex-1 break-words">{line.text}</span>
              {line.duration !== null && (
                <span className="font-normal text-muted-foreground tabular-nums">
                  {line.duration} {t("minutes")}
                </span>
              )}
            </p>
            {children.length > 0 && (
              <ul className="ml-5 list-disc">
                {children.map((a) => (
                  <li key={a.id} className="break-words">
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
