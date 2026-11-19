import { arrowShape, ARROW_THICKNESS, TEXT_SIZE } from "@/lib/drawing/annotations";
import { UPRIGHT_CLASS } from "@/lib/drawing/view";
import { cn } from "@/lib/utils";

/*
 * Arrows and short texts in drawn plans, in SVG and metres, drawn from (0, 0)
 * to their box like every placed item (src/lib/drawing/annotations.ts). Used
 * by station layouts and session plans. No hooks, so they render on the
 * server and in the browser alike.
 */

/** An arrow `length` metres long pointing right, along the middle of its box. */
export function ArrowShape({ length }: { length: number }) {
  const { shaft, head } = arrowShape(length);
  return (
    <g data-arrow>
      <line
        {...shaft}
        className="stroke-foreground"
        strokeWidth={ARROW_THICKNESS * 0.22}
        strokeLinecap="round"
      />
      <polygon points={head.map((p) => `${p.x},${p.y}`).join(" ")} className="fill-foreground" />
    </g>
  );
}

/**
 * A short text on one line, centred in its box, about TEXT_SIZE metres high.
 * A free text turns with the drawing; a name given `upright` (its item's
 * rotation in degrees) stays upright on screen instead.
 */
export function TextShape({
  text,
  width,
  height,
  upright,
}: {
  text: string;
  width: number;
  height: number;
  upright?: number;
}) {
  return (
    <text
      x={width / 2}
      y={height / 2}
      fontSize={TEXT_SIZE * 0.8}
      textAnchor="middle"
      dominantBaseline="central"
      className={cn("fill-foreground font-sans font-medium", upright !== undefined && UPRIGHT_CLASS)}
      style={upright === undefined ? undefined : { rotate: `calc(var(--upright, 0deg) - ${upright}deg)` }}
    >
      {text}
    </text>
  );
}
