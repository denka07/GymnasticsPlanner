import { layoutItemSize, layoutView, type DrawnLayoutItem } from "@/lib/station-layouts";
import { cn } from "@/lib/utils";

import { ArrowShape, TextShape } from "./annotation-drawing";
import { ConfigurationShape } from "./configuration-drawing";
import { DrawingLabel, placement } from "./hall-drawing";

/*
 * A station's layout in SVG (docs/data-model.md, "Station layout item"), in
 * metres around the station's centre. No hooks, so it renders on the server
 * and in the browser alike: on the station's page, small in lists and in the
 * activity search dialog, and in a session's activity details.
 */

/** Labels in a station's drawing, in metres. */
export const LAYOUT_LABEL_SIZE = 0.28;

/** What is needed to draw an item; the editor's items have it too. */
type Drawable =
  | { kind: "equipment"; widthCm: number; lengthCm: number; color: string | null; imageUrl: string | null }
  | { kind: "arrow"; lengthCm: number }
  | { kind: "text"; text: string };

/** One layout item from (0, 0) to its box: its configuration, an arrow or a text. */
export function LayoutItemShape({ item, width, height }: { item: Drawable; width: number; height: number }) {
  if (item.kind === "equipment") {
    return <ConfigurationShape configuration={item} />;
  }
  if (item.kind === "arrow") {
    return <ArrowShape length={width} />;
  }
  return <TextShape text={item.text} width={width} height={height} />;
}

/** Every item placed around (0, 0), bottom layer first, with their labels on top. */
export function LayoutItems({ items, labels }: { items: readonly DrawnLayoutItem[]; labels: boolean }) {
  return (
    <g>
      {items.map((item) => {
        const { width, height } = layoutItemSize(item);
        return (
          <g key={item.id} transform={placement(item.xCm / 100, item.yCm / 100, item.rotation, width, height)}>
            <LayoutItemShape item={item} width={width} height={height} />
          </g>
        );
      })}
      {labels &&
        items.map((item) =>
          item.label ? (
            <DrawingLabel
              key={`label-${item.id}`}
              x={item.xCm / 100}
              y={item.yCm / 100}
              text={item.label}
              size={LAYOUT_LABEL_SIZE}
            />
          ) : null,
        )}
    </g>
  );
}

/**
 * A station's layout in its own SVG, read-only, scaled to fit the box it is
 * given (`className`). Nothing is drawn for a station without a layout.
 */
export function StationLayoutDrawing({
  items,
  label,
  labels = true,
  className,
}: {
  items: readonly DrawnLayoutItem[];
  /** What the drawing shows, for assistive technology. */
  label: string;
  labels?: boolean;
  className?: string;
}) {
  const view = layoutView(items);
  if (!view) {
    return null;
  }
  return (
    <svg
      role="img"
      aria-label={label}
      data-station-layout
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block", className)}
    >
      <LayoutItems items={items} labels={labels} />
    </svg>
  );
}

/** A station drawn small, for lists and pickers: no labels, in a box of the given size. */
export function StationThumbnail({
  items,
  label,
  className,
}: {
  items: readonly DrawnLayoutItem[];
  label: string;
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <span className={cn("inline-block shrink-0 rounded-md border bg-muted/40 p-1", className)}>
      <StationLayoutDrawing items={items} label={label} labels={false} className="size-full" />
    </span>
  );
}
