/**
 * The session outline: parts with activities under them, edited like a list
 * in a document. Pure, so it can be unit-tested; the editor component only
 * maps keys to these functions.
 *
 * The outline is held as a flat list of lines. An activity belongs to the
 * nearest part above it, and the first line is always a part. Every function
 * returns a new list and leaves its input alone; operations that do not apply
 * return null, so the key can do its default thing.
 */

export type LineKind = "part" | "activity";

export type OutlineLine = {
  /** Stable id. The client makes it for new lines; the server keeps it. */
  id: string;
  kind: LineKind;
  text: string;
  /** Minutes; parts only, null for activities. */
  duration: number | null;
};

/** Where the caret goes after an operation. */
export type Focus = { index: number; offset: number };

export type Edit = { lines: OutlineLine[]; focus: Focus };

export type NewId = () => string;

/** Limits, shared by the editor and the server's validation. */
export const MAX_PARTS = 60;
export const MAX_ACTIVITIES_PER_PART = 60;
export const MAX_TITLE_LENGTH = 300;
export const MAX_ACTIVITY_LENGTH = 1000;
export const MIN_DURATION = 1;
export const MAX_DURATION = 600;

export function part(id: string, text: string, duration: number | null = null): OutlineLine {
  return { id, kind: "part", text, duration };
}

export function activity(id: string, text: string): OutlineLine {
  return { id, kind: "activity", text, duration: null };
}

/** A list that obeys the invariants: not empty, first line a part. */
export function ensureLines(lines: readonly OutlineLine[], newId: NewId): OutlineLine[] {
  if (lines.length === 0) {
    return [part(newId(), "")];
  }
  if (lines[0].kind !== "part") {
    return [part(newId(), ""), ...lines];
  }
  return [...lines];
}

/** Index of the part that line `index` belongs to. */
export function partIndexOf(lines: readonly OutlineLine[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (lines[i].kind === "part") {
      return i;
    }
  }
  return 0;
}

/** Index just after the last activity of the part starting at `partIndex`. */
function blockEnd(lines: readonly OutlineLine[], partIndex: number): number {
  let end = partIndex + 1;
  while (end < lines.length && lines[end].kind === "activity") {
    end++;
  }
  return end;
}

function toActivity(line: OutlineLine): OutlineLine {
  return { ...line, kind: "activity", duration: null };
}

function toPart(line: OutlineLine): OutlineLine {
  return { ...line, kind: "part", duration: null };
}

/**
 * Enter. On a part:
 * - at the start of a non-empty title, an empty part is inserted above;
 * - at the end of a title that has activities, a first activity is created
 *   (like Enter after a heading in a document);
 * - otherwise the title splits and the rest becomes the next part, which takes
 *   the activities below (as splitting a heading in a document would).
 * On an activity:
 * - an empty activity turns into a part;
 * - at the start of a non-empty text, an empty activity is inserted above;
 * - otherwise the text splits and the rest becomes the next activity.
 */
export function pressEnter(
  lines: readonly OutlineLine[],
  index: number,
  offset: number,
  newId: NewId,
): Edit {
  const line = lines[index];
  const before = line.text.slice(0, offset);
  const after = line.text.slice(offset);
  const next = [...lines];

  if (line.kind === "activity" && line.text.trim() === "") {
    next[index] = toPart(line);
    return { lines: next, focus: { index, offset: 0 } };
  }
  if (offset === 0 && line.text !== "") {
    const empty = line.kind === "part" ? part(newId(), "") : activity(newId(), "");
    next.splice(index, 0, empty);
    return { lines: next, focus: { index: index + 1, offset: 0 } };
  }
  if (line.kind === "part" && after === "" && lines[index + 1]?.kind === "activity") {
    next.splice(index + 1, 0, activity(newId(), ""));
    return { lines: next, focus: { index: index + 1, offset: 0 } };
  }
  next[index] = { ...line, text: before };
  next.splice(
    index + 1,
    0,
    line.kind === "part" ? part(newId(), after) : activity(newId(), after),
  );
  return { lines: next, focus: { index: index + 1, offset: 0 } };
}

/**
 * Tab: turns a part into an activity of the part above; its own activities
 * join that part too. Null for the first line and for activities.
 */
export function indent(lines: readonly OutlineLine[], index: number, offset: number): Edit | null {
  if (index === 0 || lines[index].kind !== "part") {
    return null;
  }
  const next = [...lines];
  next[index] = toActivity(lines[index]);
  return { lines: next, focus: { index, offset } };
}

/**
 * Shift+Tab: turns an activity into a part. The activities below it in the
 * same part come along and become its activities. Null for parts.
 */
export function outdent(lines: readonly OutlineLine[], index: number, offset: number): Edit | null {
  if (lines[index].kind !== "activity") {
    return null;
  }
  const next = [...lines];
  next[index] = toPart(lines[index]);
  return { lines: next, focus: { index, offset } };
}

/**
 * Backspace at the start of an empty line: removes it and puts the caret at
 * the end of the previous line. Null when the line is not empty, or when it
 * is the only line, or the first line with activities below (they would have
 * no part).
 */
export function removeEmptyLine(lines: readonly OutlineLine[], index: number): Edit | null {
  if (lines[index].text !== "" || lines.length === 1) {
    return null;
  }
  if (index === 0) {
    if (lines[1].kind === "activity") {
      return null;
    }
    return { lines: lines.slice(1), focus: { index: 0, offset: 0 } };
  }
  const next = [...lines];
  next.splice(index, 1);
  return { lines: next, focus: { index: index - 1, offset: next[index - 1].text.length } };
}

/**
 * Alt+Arrow: moves a line up (-1) or down (+1). A part moves past the
 * neighbouring part together with its activities. An activity moves past its
 * neighbour; past a part title it lands in the neighbouring part. Null when
 * the line cannot move further.
 */
export function moveLine(
  lines: readonly OutlineLine[],
  index: number,
  direction: -1 | 1,
  offset: number,
): Edit | null {
  const line = lines[index];
  if (line.kind === "activity") {
    const target = index + direction;
    // Above the first part there is nowhere to go.
    if (target <= 0 || target >= lines.length) {
      return null;
    }
    const next = [...lines];
    next[index] = next[target];
    next[target] = line;
    return { lines: next, focus: { index: target, offset } };
  }

  const end = blockEnd(lines, index);
  const block = lines.slice(index, end);
  if (direction === -1) {
    if (index === 0) {
      return null;
    }
    const prevStart = partIndexOf(lines, index - 1);
    const prevBlock = lines.slice(prevStart, index);
    const next = [...lines.slice(0, prevStart), ...block, ...prevBlock, ...lines.slice(end)];
    return { lines: next, focus: { index: prevStart, offset } };
  }
  if (end >= lines.length) {
    return null;
  }
  const nextEnd = blockEnd(lines, end);
  const nextBlock = lines.slice(end, nextEnd);
  const next = [...lines.slice(0, index), ...nextBlock, ...block, ...lines.slice(nextEnd)];
  return { lines: next, focus: { index: index + nextBlock.length, offset } };
}

// --- Paste -------------------------------------------------------------------

export type PastedPart = {
  title: string;
  activities: string[];
  /** True for an unbulleted heading line; false for an agenda entry. */
  heading: boolean;
};

const BULLET = /^(?:[••◦‣⁃·]\s*|[-*–]\s+|\d+[.)]\s+)/;

/**
 * Parses pasted text. Lines that start with a bullet (•, -, *, or "1.") are
 * activities of the heading above; other non-empty lines are headings (parts).
 * Bulleted lines before any heading are the agenda: each becomes a part.
 * Blank lines only separate.
 */
export function parsePaste(text: string): PastedPart[] {
  const result: PastedPart[] = [];
  let current: PastedPart | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      continue;
    }
    const bullet = BULLET.exec(trimmed);
    if (bullet) {
      const content = trimmed.slice(bullet[0].length).trim();
      if (content === "") {
        continue;
      }
      if (current === null) {
        result.push({ title: content, activities: [], heading: false });
      } else {
        current.activities.push(content);
      }
    } else {
      current = { title: trimmed, activities: [], heading: true };
      result.push(current);
    }
  }
  return result;
}

/** True when pasted text should be handled as an outline (several lines). */
export function isOutlinePaste(text: string): boolean {
  return text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").length > 1;
}

function sameTitle(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("sv") === b.trim().toLocaleLowerCase("sv");
}

type Block = { part: OutlineLine; activities: OutlineLine[] };

function toBlocks(lines: readonly OutlineLine[]): Block[] {
  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.kind === "part" || blocks.length === 0) {
      blocks.push({ part: line.kind === "part" ? line : toPart(line), activities: [] });
    } else {
      blocks[blocks.length - 1].activities.push(line);
    }
  }
  return blocks;
}

function fromBlocks(blocks: readonly Block[]): OutlineLine[] {
  return blocks.flatMap((b) => [b.part, ...b.activities]);
}

/**
 * Inserts pasted parts after the part that holds line `index`. A heading
 * whose title equals a part already in the outline (or one pasted before it)
 * adds its activities to that part instead of creating a duplicate. When the
 * caret is on an empty line that line is replaced. The caret goes to the end
 * of the last line written.
 */
export function applyPaste(
  lines: readonly OutlineLine[],
  index: number,
  pasted: readonly PastedPart[],
  newId: NewId,
): Edit | null {
  if (pasted.length === 0) {
    return null;
  }
  const blocks = toBlocks(lines);
  const caretPart = lines[partIndexOf(lines, index)];
  const caretBlock = blocks.findIndex((b) => b.part === caretPart);
  let insertAt = caretBlock + 1;
  // The empty line the caret is on is replaced by the paste.
  const current = lines[index];
  if (current.text === "") {
    if (current.kind === "activity") {
      blocks[caretBlock].activities = blocks[caretBlock].activities.filter((a) => a !== current);
    } else if (blocks[caretBlock].activities.length === 0) {
      blocks.splice(caretBlock, 1);
      insertAt = caretBlock;
    }
  }
  let lastLine: OutlineLine | null = null;

  for (const entry of pasted) {
    const existing = entry.heading ? blocks.find((b) => sameTitle(b.part.text, entry.title)) : undefined;
    const newActivities = entry.activities.map((text) => activity(newId(), text));
    if (existing) {
      existing.activities.push(...newActivities);
      lastLine = newActivities.at(-1) ?? existing.part;
      continue;
    }
    const block: Block = { part: part(newId(), entry.title), activities: newActivities };
    blocks.splice(insertAt, 0, block);
    insertAt++;
    lastLine = newActivities.at(-1) ?? block.part;
  }

  const working = fromBlocks(blocks);
  const focusIndex = lastLine ? working.indexOf(lastLine) : 0;
  return {
    lines: working,
    focus: { index: focusIndex, offset: working[focusIndex].text.length },
  };
}

// --- Clock times ---------------------------------------------------------------

/** "17:00" or "17:00:00" to minutes after midnight; null when not a time. */
export function parseTime(time: string | null | undefined): number | null {
  if (!time) {
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The clock time at which each part starts, given the session's start time
 * and the parts' durations. A part gets a time only while every part before
 * it has a duration: times stop after the first part without one.
 */
export function partClockTimes(
  startTime: string | null,
  durations: readonly (number | null)[],
): (string | null)[] {
  let clock = parseTime(startTime);
  return durations.map((duration) => {
    if (clock === null) {
      return null;
    }
    const time = formatTime(clock);
    clock = duration === null ? null : clock + duration;
    return time;
  });
}

/** Sum of the given durations, or null when none is given. */
export function totalDuration(durations: readonly (number | null)[]): number | null {
  const known = durations.filter((d): d is number => d !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Minutes from start to end, or null unless both are known and end is later. */
export function sessionLength(startTime: string | null, endTime: string | null): number | null {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null || end <= start) {
    return null;
  }
  return end - start;
}

// --- Saving -------------------------------------------------------------------

export type SavedPart = {
  id: string;
  title: string;
  durationMinutes: number | null;
  activities: { id: string; text: string }[];
};

/**
 * The outline as it is sent to the server: nested, trimmed, with empty
 * activities left out, and empty parts left out unless they hold activities.
 */
export function toSavedParts(lines: readonly OutlineLine[]): SavedPart[] {
  return toBlocks(lines)
    .map((b) => ({
      id: b.part.id,
      title: b.part.text.trim(),
      durationMinutes: b.part.duration,
      activities: b.activities
        .map((a) => ({ id: a.id, text: a.text.trim() }))
        .filter((a) => a.text !== ""),
    }))
    .filter((p) => p.title !== "" || p.activities.length > 0);
}

/** The flat lines of a saved outline. */
export function fromSavedParts(parts: readonly SavedPart[]): OutlineLine[] {
  return parts.flatMap((p) => [
    part(p.id, p.title, p.durationMinutes),
    ...p.activities.map((a) => activity(a.id, a.text)),
  ]);
}
