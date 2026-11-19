"use client";

import {
  BringToFrontIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  CopyIcon,
  MaximizeIcon,
  Redo2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  RotateCwSquareIcon,
  SendToBackIcon,
  Trash2Icon,
  Undo2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { drawingBounds, type DrawingExtent } from "@/lib/drawing/bounds";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addItem,
  angleTo,
  DEFAULT_GRID,
  dragDelta,
  duplicate,
  gridPositions,
  idsInRect,
  moveBy,
  nudge,
  panBy,
  placeAt,
  rectFromPoints,
  removeItems,
  reorder,
  rotateBy,
  rotateTo,
  ROTATION_STEP,
  updateItem,
  zoomAt,
  GRID_STEPS,
  type Area,
  type Direction,
  type LayerMove,
  type Placed,
  type Point,
  type Rect,
  type ViewBox,
} from "@/lib/drawing/editor";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/drawing/history";
import {
  drawingDirection,
  rectToDrawing,
  rectToView,
  toDrawingPoint,
  turnByDefault,
  uprightStyle,
  viewStorageKey,
  viewTransform,
} from "@/lib/drawing/view";
import { cn } from "@/lib/utils";

import { placement } from "./hall-drawing";

/*
 * The drawing editor shared by halls, station layouts and session plans
 * (docs/implementation-plan.md, "Drawn plans"). It knows only placed items
 * with a size; what they are, how they look and what can be added comes
 * from the page through render props. Desktop-first: mouse and keyboard.
 *
 * Mouse: click to select (Shift or Ctrl adds), drag to move, drag the round
 * handle to rotate, drag on empty floor to select with a box, drag with the
 * middle button or with Space held to pan, wheel to zoom. Keys: arrows move
 * one grid step (Shift: 1 m), R and Shift+R rotate 15°, Delete removes,
 * Ctrl+D duplicates, Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) undo and redo,
 * Ctrl+A selects all, Escape clears the selection, Page Up and Page Down
 * change layer.
 *
 * The view can be turned 90° ("Vrid vyn 90°") without changing the drawing:
 * by default a drawing's long side follows the canvas's long side, and the
 * user's choice is remembered per drawing (`viewKey`). The zoomed view is
 * kept in view space (src/lib/drawing/view.ts); pointer positions are mapped
 * back to drawing space, arrow keys move items the way the screen shows, and
 * text that reads `--upright` stays upright.
 */

// --- The remembered view -------------------------------------------------------------

const viewListeners = new Set<() => void>();

function subscribeToViews(listener: () => void) {
  viewListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The user's choice for a drawing: turned, upright, or null when none is stored. */
function readTurnChoice(viewKey: string | undefined): boolean | null {
  if (!viewKey) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(viewStorageKey(viewKey));
    return stored === "turned" ? true : stored === "upright" ? false : null;
  } catch {
    return null;
  }
}

function storeTurnChoice(viewKey: string, turned: boolean) {
  try {
    window.localStorage.setItem(viewStorageKey(viewKey), turned ? "turned" : "upright");
  } catch {
    // Not remembered without storage.
  }
  viewListeners.forEach((listener) => listener());
}

/** What render props get to change the drawing. Every change is one undo step. */
export type EditorApi<T extends Placed> = {
  items: readonly T[];
  selected: readonly T[];
  /** Adds an item on top, centred in the visible part of the drawing, and selects it. */
  add: (item: Omit<T, "x" | "y"> & Partial<Pick<T, "x" | "y">>) => void;
  /**
   * Changes an item. Changes with the same `merge` key in a row are one undo
   * step, so typing in a field or dragging a colour does not fill the history.
   */
  update: (id: string, patch: Partial<T>, merge?: string) => void;
  /** Replaces every item at once, as one undo step (for changes to several items). */
  replace: (items: T[]) => void;
  select: (ids: string[]) => void;
};

type State<T> = {
  history: History<T[]>;
  selected: string[];
  /** The live items while dragging; committed when the drag ends. */
  draft: T[] | null;
  merge: string | null;
};

type Action<T> =
  | { type: "commit"; items: T[]; selected?: string[]; merge?: string | null }
  | { type: "draft"; items: T[] | null }
  | { type: "select"; ids: string[] }
  | { type: "undo" }
  | { type: "redo" };

function reducer<T extends Placed>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "commit": {
      const merge = action.merge ?? null;
      const history =
        merge !== null && merge === state.merge
          ? { ...state.history, present: action.items, future: [] }
          : commit(state.history, action.items);
      return { history, selected: action.selected ?? state.selected, draft: null, merge };
    }
    case "draft":
      return { ...state, draft: action.items };
    case "select":
      return { ...state, selected: action.ids, merge: null };
    case "undo":
    case "redo": {
      const history = action.type === "undo" ? undo(state.history) : redo(state.history);
      const ids = new Set(history.present.map((i) => i.id));
      return { history, selected: state.selected.filter((id) => ids.has(id)), draft: null, merge: null };
    }
  }
}

type Gesture =
  | { kind: "move"; start: Point; items: Placed[]; anchor: Point; ids: Set<string>; moved: boolean }
  | { kind: "rotate"; id: string; items: Placed[]; center: Point }
  | { kind: "marquee"; start: Point; additive: boolean; base: string[] }
  | { kind: "pan"; startClient: Point; view: ViewBox; pxPerMetre: number };

/** Shown on top of the drawing for selected items. */
const HANDLE_PX = 7;
const HANDLE_GAP_PX = 22;

/** Space around a fitted view, in metres. */
const FIT_MARGIN = 1;

function sameView(a: ViewBox, b: ViewBox): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 1e-6;
}

export function DrawingEditor<T extends Placed>({
  area,
  initialItems,
  onItemsChange,
  renderItem,
  itemLabel,
  background,
  overlay,
  palette,
  properties,
  label,
  className,
  initialView,
  viewKey,
  extent,
}: {
  /** The drawing's size in metres; items' centres stay inside it. */
  area: Area;
  /** The part shown at first, in drawing space; the whole area when left out. */
  initialView?: ViewBox;
  /** Remembers the user's choice of turned view under this name (for example "hall:<id>"). */
  viewKey?: string;
  /**
   * What is drawn past the items' own shapes (labels, numbers, the hall's
   * features), so fitting the view shows all of it.
   */
  extent?: (items: readonly T[]) => Omit<DrawingExtent, "area" | "items">;
  initialItems: T[];
  /** Called with the items whenever a change is committed (not during a drag). */
  onItemsChange?: (items: T[]) => void;
  /** An item drawn from (0, 0) to its width and height; the editor places and rotates it. */
  renderItem: (item: T) => ReactNode;
  /** The item's name for assistive technology and tests. */
  itemLabel: (item: T) => string;
  /** Drawn under the items (for example the hall's floor). */
  background?: ReactNode;
  /** Drawn over the items, given them (for example upright labels). */
  overlay?: (items: readonly T[]) => ReactNode;
  /** What can be added. */
  palette?: (api: EditorApi<T>) => ReactNode;
  /** The panel for the selected items. */
  properties?: (api: EditorApi<T>) => ReactNode;
  /** The drawing's name for assistive technology. */
  label: string;
  className?: string;
}) {
  const t = useTranslations("Drawing");
  const id = useId();
  const [state, dispatch] = useReducer(reducer<T>, undefined, () => ({
    history: createHistory(initialItems),
    selected: [],
    draft: null,
    merge: null,
  }));
  const [grid, setGrid] = useState<number | null>(DEFAULT_GRID);
  const [snapRotation, setSnapRotation] = useState(true);
  // The view is in view space; it starts unturned until the canvas is measured.
  /** The view that shows the whole area, the items and everything drawn past them. */
  const fitted = (shown: readonly T[], turnedView: boolean): ViewBox =>
    rectToView(drawingBounds({ area, items: shown, ...extent?.(shown) }, turnedView, FIT_MARGIN), area, turnedView);
  const [view, setView] = useState<ViewBox>(() => initialView ?? fitted(initialItems, false));
  const [canvas, setCanvas] = useState<{ width: number; height: number } | null>(null);
  // A choice made here wins over the stored one, which wins over the default.
  const [turnChoice, setTurnChoice] = useState<boolean | null>(null);
  const storedChoice = useSyncExternalStore(
    subscribeToViews,
    () => readTurnChoice(viewKey),
    () => null,
  );
  // The part shown first (a station's items, say) decides the default, else the whole area.
  const [shape] = useState(() => initialView ?? area);
  const turned = turnChoice ?? storedChoice ?? turnByDefault(shape, canvas);
  // When the view turns, keep showing the same part of the drawing.
  const [shownTurned, setShownTurned] = useState(false);
  if (shownTurned !== turned) {
    setShownTurned(turned);
    // A fitted view stays fitted (upright labels lie the other way); another keeps its part.
    const wasFitted = !initialView && sameView(view, fitted(state.history.present, shownTurned));
    setView((v) => (wasFitted ? fitted(state.history.present, turned) : rectToView(rectToDrawing(v, area, shownTurned), area, turned)));
  }
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [pxPerMetre, setPxPerMetre] = useState(10);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);

  function toggleTurned() {
    const next = !turned;
    setTurnChoice(next);
    if (viewKey) {
      storeTurnChoice(viewKey, next);
    }
  }

  const committed = state.history.present;
  const items = state.draft ?? committed;
  const selectedSet = useMemo(() => new Set(state.selected), [state.selected]);
  const selected = useMemo(() => items.filter((i) => selectedSet.has(i.id)), [items, selectedSet]);

  // Tell the page about committed changes.
  const reported = useRef(committed);
  useEffect(() => {
    if (reported.current !== committed) {
      reported.current = committed;
      onItemsChange?.(committed);
    }
  }, [committed, onItemsChange]);

  // Pixels per metre, for handles and grid density; follows the view and the element's size.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const measure = () => {
      const ctm = svg.getScreenCTM();
      if (ctm && ctm.a > 0) {
        setPxPerMetre(ctm.a);
      }
      const { clientWidth: width, clientHeight: height } = svg;
      setCanvas((c) => (c && c.width === width && c.height === height ? c : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [view]);

  /** A point on the screen in view space. */
  const toView = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) {
      return { x: 0, y: 0 };
    }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  /** A point on the screen in drawing space. */
  const toDrawing = useCallback(
    (clientX: number, clientY: number): Point => toDrawingPoint(toView(clientX, clientY), area, turned),
    [toView, area, turned],
  );

  const change = useCallback(
    (next: T[], options: { selected?: string[]; merge?: string | null } = {}) =>
      dispatch({ type: "commit", items: next, ...options }),
    [],
  );

  const api: EditorApi<T> = useMemo(
    () => ({
      items,
      selected,
      add: (item) => {
        const center = placeAt(
          toDrawingPoint({ x: view.x + view.width / 2, y: view.y + view.height / 2 }, area, turned),
          grid,
          area,
        );
        const placed = { ...item, x: item.x ?? center.x, y: item.y ?? center.y } as T;
        change(addItem(committed, placed), { selected: [placed.id] });
      },
      update: (itemId, patch, merge) =>
        change(updateItem(committed, itemId, patch), { merge: merge ? `${itemId}:${merge}` : null }),
      replace: (next) => change(next),
      select: (ids) => dispatch({ type: "select", ids }),
    }),
    [items, selected, committed, view, grid, area, turned, change],
  );

  // --- Commands ---------------------------------------------------------------

  const hasSelection = state.selected.length > 0;

  const remove = useCallback(() => {
    if (hasSelection) {
      change(removeItems(committed, selectedSet), { selected: [] });
    }
  }, [hasSelection, committed, selectedSet, change]);

  const copy = useCallback(() => {
    if (!hasSelection) {
      return;
    }
    const step = grid ?? 0.5;
    const result = duplicate(committed, selectedSet, () => crypto.randomUUID(), { x: step, y: step }, area);
    change(result.items, { selected: result.ids });
  }, [hasSelection, committed, selectedSet, grid, area, change]);

  const turn = useCallback(
    (degrees: number) => {
      if (hasSelection) {
        change(rotateBy(committed, selectedSet, degrees, snapRotation ? ROTATION_STEP : null));
      }
    },
    [hasSelection, committed, selectedSet, snapRotation, change],
  );

  const layer = useCallback(
    (move: LayerMove) => {
      if (hasSelection) {
        change(reorder(committed, selectedSet, move));
      }
    },
    [hasSelection, committed, selectedSet, change],
  );

  const zoom = useCallback(
    (factor: number, at?: Point) =>
      setView((v) => zoomAt(v, factor, at ?? { x: v.x + v.width / 2, y: v.y + v.height / 2 })),
    [],
  );

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoom(factor, toView(e.clientX, e.clientY));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoom, toView]);

  // --- Pointer ------------------------------------------------------------------

  function startPan(e: React.PointerEvent) {
    gesture.current = {
      kind: "pan",
      startClient: { x: e.clientX, y: e.clientY },
      view,
      pxPerMetre: svgRef.current?.getScreenCTM()?.a ?? pxPerMetre,
    };
  }

  function onBackgroundDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      svgRef.current?.setPointerCapture(e.pointerId);
      startPan(e);
      return;
    }
    if (e.button !== 0) {
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    gesture.current = {
      kind: "marquee",
      start: toDrawing(e.clientX, e.clientY),
      additive,
      base: additive ? state.selected : [],
    };
    if (!additive) {
      dispatch({ type: "select", ids: [] });
    }
  }

  function onItemDown(e: React.PointerEvent, item: T) {
    if (e.button === 1 || spaceHeld) {
      return; // Let the background pan.
    }
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    svgRef.current?.focus({ preventScroll: true });
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const ids = selectedSet.has(item.id)
        ? state.selected.filter((s) => s !== item.id)
        : [...state.selected, item.id];
      dispatch({ type: "select", ids });
      return;
    }
    const ids = selectedSet.has(item.id) ? state.selected : [item.id];
    if (!selectedSet.has(item.id)) {
      dispatch({ type: "select", ids });
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: "move",
      start: toDrawing(e.clientX, e.clientY),
      items: committed,
      anchor: { x: item.x, y: item.y },
      ids: new Set(ids),
      moved: false,
    };
  }

  function onHandleDown(e: React.PointerEvent, item: T) {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: "rotate", id: item.id, items: committed, center: { x: item.x, y: item.y } };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) {
      return;
    }
    if (g.kind === "pan") {
      setView(
        panBy(g.view, {
          x: (e.clientX - g.startClient.x) / g.pxPerMetre,
          y: (e.clientY - g.startClient.y) / g.pxPerMetre,
        }),
      );
      return;
    }
    const p = toDrawing(e.clientX, e.clientY);
    if (g.kind === "move") {
      const raw = { x: p.x - g.start.x, y: p.y - g.start.y };
      // A small wobble while clicking is not a move.
      if (!g.moved && Math.hypot(raw.x, raw.y) * pxPerMetre < 3) {
        return;
      }
      g.moved = true;
      const delta = dragDelta(g.anchor, raw, e.altKey ? null : grid);
      dispatch({ type: "draft", items: moveBy(g.items as T[], g.ids, delta, area) });
    } else if (g.kind === "rotate") {
      const step = snapRotation && !e.shiftKey ? ROTATION_STEP : null;
      dispatch({
        type: "draft",
        items: rotateTo(g.items as T[], new Set([g.id]), angleTo(g.center, p), step),
      });
    } else if (g.kind === "marquee") {
      const rect = rectFromPoints(g.start, p);
      setMarquee(rect);
      const hit = idsInRect(committed, rect);
      dispatch({ type: "select", ids: [...new Set([...g.base, ...hit])] });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    setMarquee(null);
    if ((g?.kind === "move" || g?.kind === "rotate") && state.draft) {
      change(state.draft);
    } else if (state.draft) {
      dispatch({ type: "draft", items: null });
    }
  }

  // --- Keyboard -------------------------------------------------------------------

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const arrows: Record<string, Direction> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    let handled = true;
    if (key in arrows) {
      if (hasSelection) {
        const step = e.shiftKey ? 1 : (grid ?? 0.05);
        // Items move the way the screen shows, also when the view is turned.
        change(nudge(committed, selectedSet, drawingDirection(arrows[key], turned), step, area), {
          merge: `nudge:${state.selected.join(",")}`,
        });
      } else {
        handled = false;
      }
    } else if (key === "Delete" || key === "Backspace") {
      remove();
    } else if (mod && (key === "z" || key === "Z")) {
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    } else if (mod && (key === "y" || key === "Y")) {
      dispatch({ type: "redo" });
    } else if (mod && (key === "d" || key === "D")) {
      copy();
    } else if (mod && (key === "a" || key === "A")) {
      dispatch({ type: "select", ids: committed.map((i) => i.id) });
    } else if (key === "Escape") {
      dispatch({ type: "select", ids: [] });
    } else if (!mod && (key === "r" || key === "R")) {
      turn(e.shiftKey ? -ROTATION_STEP : ROTATION_STEP);
    } else if (key === "PageUp") {
      layer(e.shiftKey ? "front" : "forward");
    } else if (key === "PageDown") {
      layer(e.shiftKey ? "back" : "backward");
    } else if (key === " ") {
      setSpaceHeld(true);
    } else if (key === "+" || key === "=") {
      zoom(1.25);
    } else if (key === "-") {
      zoom(0.8);
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
    }
  }

  // --- Drawing --------------------------------------------------------------------

  const gridStep = grid ?? 1;
  const showGrid = gridStep * pxPerMetre >= 6;
  const xs = showGrid ? gridPositions(area.width, gridStep) : [];
  const ys = showGrid ? gridPositions(area.height, gridStep) : [];
  const handleR = HANDLE_PX / pxPerMetre;
  const handleGap = HANDLE_GAP_PX / pxPerMetre;
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div className={cn("grid gap-3", className)}>
      <Toolbar
        t={t}
        id={id}
        canUndo={canUndo(state.history)}
        canRedo={canRedo(state.history)}
        hasSelection={hasSelection}
        grid={grid}
        snapRotation={snapRotation}
        turned={turned}
        onTurn={toggleTurned}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onDuplicate={copy}
        onDelete={remove}
        onRotate={turn}
        onLayer={layer}
        onGrid={setGrid}
        onSnapRotation={setSnapRotation}
        onZoom={(f) => zoom(f)}
        onFit={() => setView(fitted(items, turned))}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-2">
          <svg
            ref={svgRef}
            role="application"
            aria-label={label}
            aria-describedby={`${id}-help`}
            tabIndex={0}
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
            preserveAspectRatio="xMidYMid meet"
            className={cn(
              // Fills what is left of the window under the toolbar, above the save bar.
              "h-[max(24rem,calc(100dvh-13rem))] w-full touch-none rounded-lg border bg-muted/40 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
              spaceHeld ? "cursor-grab" : "cursor-default",
            )}
            onPointerDown={onBackgroundDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => {
              if (e.key === " ") {
                setSpaceHeld(false);
              }
            }}
            onBlur={() => setSpaceHeld(false)}
          >
            <g transform={viewTransform(area, turned)} style={uprightStyle(turned)} data-turned={turned || undefined}>
            {background}
            {showGrid && (
              <g className="pointer-events-none stroke-foreground/10" data-grid>
                {xs.map((x) => (
                  <line
                    key={`x${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={area.height}
                    strokeWidth={x % 5 === 0 ? 1.5 : 0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {ys.map((y) => (
                  <line
                    key={`y${y}`}
                    x1={0}
                    y1={y}
                    x2={area.width}
                    y2={y}
                    strokeWidth={y % 5 === 0 ? 1.5 : 0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
            {items.map((item) => (
              <g
                key={item.id}
                data-item-id={item.id}
                role="button"
                aria-label={itemLabel(item)}
                aria-pressed={selectedSet.has(item.id)}
                transform={placement(item.x, item.y, item.rotation, item.width, item.height)}
                className="cursor-move"
                onPointerDown={(e) => onItemDown(e, item)}
              >
                {renderItem(item)}
                {/* Catches clicks on items whose look leaves gaps. */}
                <rect x={0} y={0} width={item.width} height={item.height} fill="transparent" />
              </g>
            ))}
            {overlay?.(items)}
            {selected.map((item) => (
              <g
                key={`sel-${item.id}`}
                transform={placement(item.x, item.y, item.rotation, item.width, item.height)}
                className="pointer-events-none"
              >
                <rect
                  x={0}
                  y={0}
                  width={item.width}
                  height={item.height}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            {single && (
              <g transform={placement(single.x, single.y, single.rotation, single.width, single.height)}>
                <line
                  x1={single.width / 2}
                  y1={0}
                  x2={single.width / 2}
                  y2={-handleGap}
                  className="pointer-events-none stroke-primary"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  data-rotate-handle
                  aria-label={t("rotateHandle")}
                  cx={single.width / 2}
                  cy={-handleGap}
                  r={handleR}
                  className="cursor-grab fill-background stroke-primary"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => onHandleDown(e, single)}
                />
              </g>
            )}
            {marquee && (
              <rect
                {...marquee}
                className="pointer-events-none fill-primary/10 stroke-primary"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            </g>
          </svg>
          <p id={`${id}-help`} className="sr-only">
            {t("help")}
          </p>
        </div>
        <div className="grid content-start gap-4">
          {palette?.(api)}
          {properties?.(api)}
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  t,
  id,
  canUndo: undoable,
  canRedo: redoable,
  hasSelection,
  grid,
  snapRotation,
  turned,
  onTurn,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  onRotate,
  onLayer,
  onGrid,
  onSnapRotation,
  onZoom,
  onFit,
}: {
  t: ReturnType<typeof useTranslations<"Drawing">>;
  id: string;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  grid: number | null;
  snapRotation: boolean;
  turned: boolean;
  onTurn: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate: (degrees: number) => void;
  onLayer: (move: LayerMove) => void;
  onGrid: (grid: number | null) => void;
  onSnapRotation: (on: boolean) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  const tool = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
  return (
    <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex gap-1">
        {tool(t("undo"), <Undo2Icon />, onUndo, !undoable)}
        {tool(t("redo"), <Redo2Icon />, onRedo, !redoable)}
      </div>
      <div className="flex gap-1">
        {tool(t("duplicate"), <CopyIcon />, onDuplicate, !hasSelection)}
        {tool(t("delete"), <Trash2Icon />, onDelete, !hasSelection)}
        {tool(t("rotateLeft"), <RotateCcwIcon />, () => onRotate(-ROTATION_STEP), !hasSelection)}
        {tool(t("rotateRight"), <RotateCwIcon />, () => onRotate(ROTATION_STEP), !hasSelection)}
      </div>
      <div className="flex gap-1">
        {tool(t("toFront"), <BringToFrontIcon />, () => onLayer("front"), !hasSelection)}
        {tool(t("forward"), <ChevronUpIcon />, () => onLayer("forward"), !hasSelection)}
        {tool(t("backward"), <ChevronDownIcon />, () => onLayer("backward"), !hasSelection)}
        {tool(t("toBack"), <SendToBackIcon />, () => onLayer("back"), !hasSelection)}
      </div>
      <div className="flex gap-1">
        {tool(t("zoomOut"), <ZoomOutIcon />, () => onZoom(0.8))}
        {tool(t("zoomIn"), <ZoomInIcon />, () => onZoom(1.25))}
        {tool(t("fit"), <MaximizeIcon />, onFit)}
        <Button
          type="button"
          variant={turned ? "secondary" : "outline"}
          size="icon-lg"
          aria-label={t("turnView")}
          title={t("turnView")}
          aria-pressed={turned}
          onClick={onTurn}
        >
          <RotateCwSquareIcon />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-grid`} className="text-sm">
          {t("grid")}
        </Label>
        <NativeSelect
          id={`${id}-grid`}
          value={grid === null ? "off" : String(grid)}
          onChange={(e) => onGrid(e.target.value === "off" ? null : Number(e.target.value))}
        >
          {GRID_STEPS.map((step) => (
            <NativeSelectOption key={step} value={String(step)}>
              {t("gridStep", { step })}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="off">{t("gridOff")}</NativeSelectOption>
        </NativeSelect>
      </div>
      <Label htmlFor={`${id}-snap`} className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          id={`${id}-snap`}
          checked={snapRotation}
          onCheckedChange={(checked) => onSnapRotation(checked === true)}
        />
        {t("snapRotation")}
      </Label>
      <Popover>
        <PopoverTrigger
          render={
            <Button type="button" variant="ghost" size="icon-lg" aria-label={t("helpButton")} title={t("helpButton")}>
              <CircleHelpIcon />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 text-sm">
          {t("help")}
        </PopoverContent>
      </Popover>
    </div>
  );
}
