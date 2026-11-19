import { boundsOf, type Placed } from "@/lib/drawing/editor";
import { UPRIGHT_CLASS } from "@/lib/drawing/view";
import { contentSize, type DrawnPlanItem, type PersonRole, type PlanItemContent } from "@/lib/session-plans";
import { cn } from "@/lib/utils";

import { ArrowShape, TextShape } from "../drawing/annotation-drawing";
import { ConfigurationShape } from "../drawing/configuration-drawing";
import { DrawingLabel, HallFeatures, HallFloor, labelSize, placement } from "../drawing/hall-drawing";
import { LayoutItems } from "../drawing/station-layout-drawing";
import { TurnableSvg } from "../drawing/turnable-svg";
import type { HallDrawing } from "@/lib/data/halls";

/*
 * Session plans in SVG (docs/data-model.md, "Plan item"), in metres from the
 * hall's top-left corner. No hooks, so they render on the server and in the
 * browser alike: in the plan editor and in read-only drawings.
 */

/** The look of each person role. */
const PERSON_COLORS: Record<PersonRole, string> = { coach: "#2563eb", passare: "#ea580c" };

/** What people are called on their circle: the role's initial, from the messages. */
export type PersonInitials = Record<PersonRole, string>;

/**
 * One item from (0, 0) to its box. Names and the people's letters stay
 * upright on screen, so they turn back by the item's `rotation`.
 */
export function PlanItemShape({
  content,
  width,
  height,
  rotation,
  initials,
}: {
  content: PlanItemContent;
  width: number;
  height: number;
  rotation: number;
  initials: PersonInitials;
}) {
  switch (content.kind) {
    case "equipment":
      return <ConfigurationShape configuration={content} />;
    case "station":
      return (
        <g data-station>
          {content.layout.length === 0 ? (
            <>
              <rect
                x={0}
                y={0}
                width={width}
                height={height}
                rx={Math.min(width, height) * 0.12}
                className="fill-background/80 stroke-foreground/60"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <TextShape text={content.name} width={width} height={height} upright={rotation} />
            </>
          ) : (
            <g transform={`translate(${width / 2} ${height / 2})`}>
              <LayoutItems items={content.layout} labels={false} />
            </g>
          )}
          {content.adapted && (
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="none"
              className="stroke-foreground/40"
              strokeWidth={1}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      );
    case "text":
      return <TextShape text={content.text} width={width} height={height} />;
    case "area":
      return (
        <rect
          data-area
          x={0}
          y={0}
          width={width}
          height={height}
          className="fill-foreground/5 stroke-foreground/70"
          strokeWidth={1.5}
          strokeDasharray="8 5"
          vectorEffect="non-scaling-stroke"
        />
      );
    case "person": {
      const r = Math.min(width, height) / 2;
      return (
        <g data-person={content.role}>
          <circle cx={width / 2} cy={height / 2} r={r} fill={PERSON_COLORS[content.role]} stroke="white" strokeWidth={r * 0.12} />
          <text
            x={width / 2}
            y={height / 2}
            fontSize={r * 1.15}
            textAnchor="middle"
            dominantBaseline="central"
            className={cn("fill-white font-sans font-semibold", UPRIGHT_CLASS)}
            style={{ rotate: `calc(var(--upright, 0deg) - ${rotation}deg)` }}
          >
            {initials[content.role]}
          </text>
        </g>
      );
    }
    case "arrow":
      return <ArrowShape length={width} />;
  }
}

/** A station's number in a filled circle, upright, centred on a point. */
export function NumberBadge({ x, y, number, size }: { x: number; y: number; number: number; size: number }) {
  const r = size * 0.85;
  return (
    <g data-station-number={number} className="pointer-events-none">
      <circle cx={x} cy={y} r={r} className="fill-primary stroke-background" strokeWidth={r * 0.15} />
      <text
        x={x}
        y={y}
        fontSize={r * 1.15}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn("fill-primary-foreground font-sans font-semibold tabular-nums", UPRIGHT_CLASS)}
      >
        {number}
      </text>
    </g>
  );
}

/**
 * Labels and station numbers, drawn over every item: a label in the middle
 * of its item, a number at the top-left corner of its station's bounds.
 */
export function PlanOverlay({
  items,
  numbers,
  size,
}: {
  items: readonly (Placed & { label: string | null; content: PlanItemContent })[];
  /** Activity id to number. */
  numbers: ReadonlyMap<string, number>;
  size: number;
}) {
  return (
    <g>
      {items.map((item) =>
        item.label ? (
          <DrawingLabel key={`label-${item.id}`} x={item.x} y={item.y} text={item.label} size={size * 0.8} />
        ) : null,
      )}
      {items.map((item) => {
        const c = item.content;
        const number = c.kind === "station" && c.activityId ? numbers.get(c.activityId) : undefined;
        if (number === undefined) {
          return null;
        }
        const b = boundsOf(item);
        return <NumberBadge key={`number-${item.id}`} x={b.x} y={b.y} number={number} size={size} />;
      })}
    </g>
  );
}

/** A drawn item placed in metres, as the editor and the overlay take it. */
export function placedPlanItem(item: DrawnPlanItem): Placed & { label: string | null; content: PlanItemContent } {
  return {
    id: item.id,
    x: item.xCm / 100,
    y: item.yCm / 100,
    rotation: item.rotation,
    label: item.label,
    content: item.content,
    ...contentSize(item.content),
  };
}

/**
 * A plan in its hall in its own SVG, read-only: the floor and fixed
 * features under the items, labels and station numbers on top. It fills the
 * width it is given and keeps the hall's proportions; its long side follows
 * the screen's, like the editor's default (TurnableSvg).
 */
export function PlanDrawing({
  hall,
  items,
  numbers,
  initials,
  label,
  className,
}: {
  hall: HallDrawing;
  items: readonly DrawnPlanItem[];
  numbers: ReadonlyMap<string, number>;
  initials: PersonInitials;
  label: string;
  className?: string;
}) {
  const width = hall.widthCm / 100;
  const height = hall.lengthCm / 100;
  const margin = Math.max(width, height) * 0.02;
  const placed = items.map(placedPlanItem);
  const size = labelSize(hall);
  return (
    <TurnableSvg area={{ width, height }} margin={margin} label={label} className={className} data-plan-drawing>
      <HallFloor floor={hall} />
      <HallFeatures features={hall.features} labels hall={hall} />
      {placed.map((item) => (
        <g key={item.id} transform={placement(item.x, item.y, item.rotation, item.width, item.height)}>
          <PlanItemShape
            content={item.content}
            width={item.width}
            height={item.height}
            rotation={item.rotation}
            initials={initials}
          />
        </g>
      ))}
      <PlanOverlay items={placed} numbers={numbers} size={size} />
    </TurnableSvg>
  );
}
