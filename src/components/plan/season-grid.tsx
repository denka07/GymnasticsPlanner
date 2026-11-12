"use client";

import { Undo2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  categorySpans,
  cellKey,
  cellsBetween,
  keyLevel,
  levelOf,
  moveFocus,
  type CellLevel,
  type GridPosition,
  type Level,
} from "@/lib/plan-grid";
import { cn } from "@/lib/utils";

import { usePlanGrid } from "./use-plan-grid";
import { WeekHeaderContent } from "./week-header";

export type GridWeek = {
  /** Monday of the week. */
  weekStart: string;
  /** ISO week number. */
  week: number;
  isCurrent: boolean;
  /**
   * Extra classes for the week's header and cells, for per-week decoration
   * such as break weeks.
   */
  className?: string;
  /** A week without training; the header is a decoration, the cells keep their level. */
  isBreak?: boolean;
  /** Free text about the week, shown as a tooltip on the header. */
  note?: string | null;
};

export type GridDiscipline = {
  id: string;
  name: string;
  focusItems: { id: string; name: string; category: string | null }[];
};

const LEVEL_CLASS: Record<Level, string> = {
  high: "bg-focus-high",
  medium: "bg-focus-medium",
  low: "bg-focus-low",
};

/** Brush order in the palette; null clears. */
const BRUSHES: CellLevel[] = ["high", "medium", "low", null];

const brushName = (level: CellLevel) => level ?? "none";

/**
 * The season plan: weeks as columns, focus items as rows grouped by
 * discipline. With `editable`, the legend is a palette and cells can be
 * painted with the mouse, tapped, or set from the keyboard.
 */
export function SeasonGrid({
  seasonId,
  seasonName,
  disciplines,
  weeks,
  allocations,
  editable,
  footerRows,
}: {
  seasonId: string;
  seasonName: string;
  disciplines: GridDiscipline[];
  weeks: GridWeek[];
  allocations: { focusItemId: string; weekStart: string; level: Level }[];
  editable: boolean;
  /** Rows rendered under the focus items, in a <tfoot>; one cell per week after two label cells. */
  footerRows?: ReactNode;
}) {
  const t = useTranslations("Plan");
  const grid = usePlanGrid(seasonId, allocations);
  const [brush, setBrush] = useState<CellLevel>("high");
  const [active, setActive] = useState<GridPosition>({ row: 0, col: 0 });
  const tableRef = useRef<HTMLTableElement>(null);
  /** Set while the mouse paints: the cell pressed if it may still toggle off. */
  const pressRef = useRef<{ toggleKey: string | null; last: GridPosition } | null>(null);
  const lastPointerType = useRef<string>("mouse");

  const rows = disciplines.flatMap((d) => d.focusItems);
  const cols = weeks.length;

  const levelLabel = (level: CellLevel) => t(`levels.${brushName(level)}`);

  function cellAt(row: number, col: number): HTMLElement | null {
    return (
      tableRef.current?.querySelector<HTMLElement>(
        `[data-cell][data-row="${row}"][data-col="${col}"]`,
      ) ?? null
    );
  }

  function cellFromEvent(target: EventTarget | null) {
    const el = (target as Element | null)?.closest<HTMLElement>("[data-cell]");
    if (!el || !tableRef.current?.contains(el)) {
      return null;
    }
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    const item = rows[row];
    const week = weeks[col];
    if (!item || !week) {
      return null;
    }
    return { el, row, col, key: cellKey(item.id, week.weekStart) };
  }

  // --- Mouse: press paints, drag paints every cell passed over --------------

  function onPointerDown(event: PointerEvent<HTMLTableElement>) {
    lastPointerType.current = event.pointerType;
    if (!editable || event.pointerType === "touch" || event.button !== 0) {
      return;
    }
    const cell = cellFromEvent(event.target);
    if (!cell) {
      return;
    }
    // No text selection or native focus handling while painting.
    event.preventDefault();
    cell.el.focus();
    setActive({ row: cell.row, col: cell.col });
    grid.beginStroke();
    const current = levelOf(grid.levels, cell.key);
    if (current === brush && brush !== null) {
      // A plain click on a cell that has the brush clears it; decided on release.
      pressRef.current = { toggleKey: cell.key, last: cell };
    } else {
      pressRef.current = { toggleKey: null, last: cell };
      grid.paint(cell.key, brush);
    }
  }

  function onPointerOver(event: PointerEvent<HTMLTableElement>) {
    const press = pressRef.current;
    if (!press || event.pointerType === "touch") {
      return;
    }
    const cell = cellFromEvent(event.target);
    if (!cell || (cell.row === press.last.row && cell.col === press.last.col)) {
      return;
    }
    press.toggleKey = null;
    // Fill cells a fast drag skipped between two pointer events.
    for (const { row, col } of cellsBetween(press.last, cell)) {
      const item = rows[row];
      const week = weeks[col];
      if (item && week) {
        grid.paint(cellKey(item.id, week.weekStart), brush);
      }
    }
    press.last = { row: cell.row, col: cell.col };
  }

  // Release anywhere ends the stroke.
  const endStrokeRef = useRef<() => void>(() => {});
  useEffect(() => {
    endStrokeRef.current = () => {
      const press = pressRef.current;
      if (!press) {
        return;
      }
      pressRef.current = null;
      if (press.toggleKey !== null) {
        grid.paint(press.toggleKey, null);
      }
      grid.endStroke();
    };
  });
  useEffect(() => {
    const end = () => endStrokeRef.current();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, []);

  // --- Touch: a tap paints one cell; dragging scrolls -----------------------

  function onClick(event: MouseEvent<HTMLTableElement>) {
    if (!editable || lastPointerType.current !== "touch") {
      return;
    }
    const cell = cellFromEvent(event.target);
    if (!cell) {
      return;
    }
    setActive({ row: cell.row, col: cell.col });
    const current = levelOf(grid.levels, cell.key);
    grid.setCell(cell.key, current === brush ? null : brush, { debounce: false });
  }

  // --- Keyboard -----------------------------------------------------------

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const cell = cellFromEvent(event.target);
    if (!cell || event.altKey || ((event.ctrlKey || event.metaKey) && !["Home", "End"].includes(event.key))) {
      return;
    }
    const to = moveFocus(
      { row: cell.row, col: cell.col },
      event.key,
      rows.length,
      cols,
      event.ctrlKey || event.metaKey,
    );
    if (to) {
      event.preventDefault();
      setActive(to);
      cellAt(to.row, to.col)?.focus();
      return;
    }
    if (!editable) {
      return;
    }
    const level = keyLevel(event.key, brush);
    if (level === undefined) {
      return;
    }
    event.preventDefault();
    grid.setCell(cell.key, level, { debounce: true });
  }

  // Ctrl+Z / Cmd+Z undoes the last stroke, unless typing in a field.
  const undoRef = useRef(grid.undo);
  useEffect(() => {
    undoRef.current = grid.undo;
  });
  useEffect(() => {
    if (!editable) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable]);

  // --- Rendering ----------------------------------------------------------

  if (rows.length === 0) {
    return null;
  }

  const activeRow = Math.min(active.row, rows.length - 1);
  const activeCol = Math.min(active.col, cols - 1);
  let rowIndex = 0;

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Legend
          editable={editable}
          brush={brush}
          onBrush={setBrush}
          label={levelLabel}
          title={editable ? t("palette") : t("legend")}
        />
        {editable && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite" role="status">
              {grid.status === "saving" ? t("saving") : grid.status === "saved" ? t("saved") : ""}
            </p>
            <Button variant="outline" size="sm" onClick={grid.undo} disabled={!grid.canUndo}>
              <Undo2Icon data-icon="inline-start" />
              {t("undo")}
            </Button>
          </div>
        )}
      </div>
      {editable && <p className="text-xs text-muted-foreground">{t("hint")}</p>}

      <div
        className="max-h-[75dvh] overflow-auto overscroll-x-contain rounded-lg border [--cat-w:4.5rem] [--name-w:7.5rem] sm:[--cat-w:6.5rem] sm:[--name-w:12rem]"
      >
        <table
          ref={tableRef}
          role="grid"
          aria-label={t("gridLabel", { name: seasonName })}
          aria-readonly={!editable || undefined}
          className={cn(
            "border-separate border-spacing-0 text-xs",
            editable && "select-none",
          )}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 w-(--cat-w) min-w-(--cat-w) border-r border-b bg-background px-2 py-1 text-left font-medium text-muted-foreground"
              >
                {t("category")}
              </th>
              <th
                scope="col"
                className="sticky top-0 left-(--cat-w) z-30 w-(--name-w) min-w-(--name-w) border-r border-b bg-background px-2 py-1 text-left font-medium text-muted-foreground"
              >
                {t("focusItem")}
              </th>
              {weeks.map((week) => (
                <th
                  key={week.weekStart}
                  scope="col"
                  data-week={week.weekStart}
                  aria-current={week.isCurrent ? "date" : undefined}
                  title={week.note ?? (week.isCurrent ? t("currentWeek") : undefined)}
                  className={cn(
                    "sticky top-0 z-20 h-7 min-w-8 border-r border-b bg-background p-0 text-center font-medium tabular-nums",
                    week.isCurrent && "bg-primary text-primary-foreground",
                    week.className,
                  )}
                >
                  <WeekHeaderContent
                    seasonId={seasonId}
                    weekStart={week.weekStart}
                    week={week.week}
                    isBreak={week.isBreak ?? false}
                    note={week.note ?? null}
                    editable={editable}
                  />
                </th>
              ))}
            </tr>
          </thead>
          {disciplines.map((discipline) => {
            if (discipline.focusItems.length === 0) {
              return null;
            }
            const spans = categorySpans(discipline.focusItems);
            return (
              <tbody key={discipline.id}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={2 + cols}
                    className="border-b bg-muted p-0 text-left text-sm font-semibold"
                  >
                    <span className="sticky left-0 inline-block px-2 py-1">{discipline.name}</span>
                  </th>
                </tr>
                {discipline.focusItems.map((item, i) => {
                  const row = rowIndex++;
                  return (
                    <tr key={item.id}>
                      {spans[i] > 0 && (
                        <td
                          rowSpan={spans[i]}
                          className="sticky left-0 z-10 w-(--cat-w) max-w-(--cat-w) border-r border-b bg-background px-2 py-1 align-middle text-muted-foreground break-words"
                        >
                          {item.category}
                        </td>
                      )}
                      <th
                        scope="row"
                        className="sticky left-(--cat-w) z-10 w-(--name-w) max-w-(--name-w) border-r border-b bg-background px-2 py-1 text-left font-normal break-words"
                      >
                        {item.name}
                      </th>
                      {weeks.map((week, col) => {
                        const key = cellKey(item.id, week.weekStart);
                        const level = levelOf(grid.levels, key);
                        const isActive = row === activeRow && col === activeCol;
                        return (
                          <td
                            key={week.weekStart}
                            role="gridcell"
                            data-cell=""
                            data-row={row}
                            data-col={col}
                            data-week={week.weekStart}
                            data-level={level ?? undefined}
                            tabIndex={isActive ? 0 : -1}
                            aria-label={t("cellLabel", {
                              item: item.name,
                              week: week.week,
                              level: levelLabel(level),
                            })}
                            onFocus={() => setActive({ row, col })}
                            className={cn(
                              "h-7 min-w-8 border-r border-b outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                              level ? LEVEL_CLASS[level] : "bg-background",
                              editable && "cursor-pointer hover:brightness-95 dark:hover:brightness-125",
                              week.className,
                            )}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          {footerRows && <tfoot>{footerRows}</tfoot>}
        </table>
      </div>
    </div>
  );
}

function Legend({
  editable,
  brush,
  onBrush,
  label,
  title,
}: {
  editable: boolean;
  brush: CellLevel;
  onBrush: (level: CellLevel) => void;
  label: (level: CellLevel) => string;
  title: string;
}) {
  const swatch = (level: CellLevel) => (
    <span
      aria-hidden
      className={cn("size-4 shrink-0 rounded-sm border", level ? LEVEL_CLASS[level] : "bg-background")}
    />
  );

  if (!editable) {
    return (
      <ul aria-label={title} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {BRUSHES.map((level) => (
          <li key={brushName(level)} className="flex items-center gap-1.5">
            {swatch(level)}
            {label(level)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div role="group" aria-label={title} className="flex flex-wrap gap-1.5">
      {BRUSHES.map((level) => {
        const selected = brush === level;
        return (
          <Button
            key={brushName(level)}
            type="button"
            size="sm"
            variant={selected ? "secondary" : "ghost"}
            aria-pressed={selected}
            onClick={() => onBrush(level)}
            className={cn(selected && "ring-2 ring-ring")}
          >
            {swatch(level)}
            {label(level)}
          </Button>
        );
      })}
    </div>
  );
}
