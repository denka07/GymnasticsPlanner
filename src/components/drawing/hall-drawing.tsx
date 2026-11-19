import { doorSwing, hatchLines, rowLines, stripeLines, type Segment } from "@/lib/drawing/feature-look";
import { drawingBounds, readMargin, viewBoxOf, type DrawingExtent } from "@/lib/drawing/bounds";
import { cmToUnits } from "@/lib/drawing/geometry";
import { UPRIGHT_CLASS } from "@/lib/drawing/view";
import { isShapeKind, KIND_DEFAULTS, type FeatureKind } from "@/lib/halls";
import { cn } from "@/lib/utils";

import { ConfigurationShape } from "./configuration-drawing";
import { TurnableSvg } from "./turnable-svg";

/*
 * Halls and their fixed features in SVG, in metres (docs/data-model.md,
 * "Hall feature"). No hooks, so they render on the server and in the
 * browser alike, in the editor and in read-only drawings.
 */

/** What is needed to draw a feature. Equipment features carry their configuration's size and look. */
export type DrawableFeature = {
  kind: FeatureKind;
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imageUrl: string | null;
};

/** What is needed to place a feature. */
export type PlacedFeature = DrawableFeature & {
  id: string;
  xCm: number;
  yCm: number;
  rotation: number;
  label: string | null;
};

function Lines({ lines, className }: { lines: Segment[]; className: string }) {
  return (
    <g className={className}>
      {lines.map((l, i) => (
        <line key={i} {...l} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

/**
 * One feature seen from above, from (0, 0) to its width and length: its
 * image stretched to its size, or the look of its kind in its colour. An
 * equipment feature is drawn like its configuration.
 */
export function FeatureShape({ feature }: { feature: DrawableFeature }) {
  const width = cmToUnits(feature.widthCm);
  const height = cmToUnits(feature.lengthCm);
  if (!isShapeKind(feature.kind)) {
    return <ConfigurationShape configuration={feature} />;
  }
  const defaults = KIND_DEFAULTS[feature.kind];
  const fill = feature.color ?? defaults.color;
  const box = { x: 0, y: 0, width, height };
  const outline = (
    <rect
      {...box}
      fill="none"
      className="stroke-foreground/70"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    />
  );
  if (feature.imageUrl) {
    return (
      <g>
        <image {...box} href={feature.imageUrl} preserveAspectRatio="none" />
        {outline}
      </g>
    );
  }
  switch (defaults.look) {
    case "stripes":
      return (
        <g>
          <rect {...box} fill={fill} />
          <Lines lines={stripeLines(width, height)} className="stroke-black/45" />
          {outline}
        </g>
      );
    case "hatch":
      return (
        <g>
          <rect {...box} fill={fill} />
          <Lines lines={hatchLines(width, height)} className="stroke-black/35" />
          {outline}
        </g>
      );
    case "rows":
      return (
        <g>
          <rect {...box} fill={fill} />
          <Lines lines={rowLines(width, height)} className="stroke-black/40" />
          {outline}
        </g>
      );
    case "opening": {
      const swing = feature.kind === "door" ? doorSwing(width, height) : null;
      return (
        <g>
          <rect {...box} fill={fill} />
          <rect
            {...box}
            fill="none"
            className="stroke-foreground/70"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
          {swing && (
            <g className="stroke-foreground/60" fill="none">
              <line {...swing.leaf} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <path d={swing.arc} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </g>
      );
    }
    default:
      return (
        <g>
          <rect {...box} fill={fill} />
          {outline}
        </g>
      );
  }
}

/** The SVG transform that puts a shape drawn from (0, 0) at its centre and rotation. */
export function placement(x: number, y: number, rotation: number, width: number, height: number): string {
  return `translate(${x} ${y}) rotate(${rotation}) translate(${-width / 2} ${-height / 2})`;
}

/** A label, upright on screen (also in a turned view) and centred on a point, about `size` metres high. */
export function DrawingLabel({ x, y, text, size }: { x: number; y: number; text: string; size: number }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor="middle"
      dominantBaseline="central"
      className={cn("pointer-events-none fill-foreground font-sans font-medium", UPRIGHT_CLASS)}
      paintOrder="stroke"
      stroke="var(--background)"
      strokeWidth={size * 0.25}
      strokeLinejoin="round"
    >
      {text}
    </text>
  );
}

/** The size of labels in a hall of this size, in metres. */
export function labelSize(hall: { widthCm: number; lengthCm: number }): number {
  const shorter = Math.min(hall.widthCm, hall.lengthCm) / 100;
  return Math.min(Math.max(shorter / 30, 0.3), 1.2);
}

/**
 * What a hall drawing shows: the hall, its features and, when drawn, their
 * labels, so a feature or label at the edge is not cut off.
 */
export function hallExtent(
  hall: { widthCm: number; lengthCm: number; features: readonly PlacedFeature[] },
  labels = true,
): DrawingExtent {
  const size = labelSize(hall);
  return {
    area: { width: cmToUnits(hall.widthCm), height: cmToUnits(hall.lengthCm) },
    items: hall.features.map((f) => ({
      id: f.id,
      x: cmToUnits(f.xCm),
      y: cmToUnits(f.yCm),
      rotation: f.rotation,
      width: cmToUnits(f.widthCm),
      height: cmToUnits(f.lengthCm),
    })),
    labels: labels
      ? hall.features.flatMap((f) => (f.label ? [{ x: cmToUnits(f.xCm), y: cmToUnits(f.yCm), text: f.label, size }] : []))
      : [],
  };
}

/** What is needed to draw a hall's floor. */
export type DrawableFloor = {
  widthCm: number;
  lengthCm: number;
  floorColor: string;
  floorImageUrl: string | null;
};

/**
 * The hall's floor, from (0, 0) to its width and length: its image
 * stretched to the hall's size, or its colour; always with the walls'
 * outline. Drawn under everything else.
 */
export function HallFloor({ floor }: { floor: DrawableFloor }) {
  const box = { x: 0, y: 0, width: cmToUnits(floor.widthCm), height: cmToUnits(floor.lengthCm) };
  return (
    <g data-floor>
      {floor.floorImageUrl ? (
        <image {...box} href={floor.floorImageUrl} preserveAspectRatio="none" />
      ) : (
        <rect {...box} fill={floor.floorColor} />
      )}
      <rect
        {...box}
        fill="none"
        className="stroke-foreground"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** Every feature placed in the hall, bottom layer first, with their labels on top. */
export function HallFeatures({
  features,
  labels,
  hall,
}: {
  features: readonly PlacedFeature[];
  labels: boolean;
  hall: { widthCm: number; lengthCm: number };
}) {
  const size = labelSize(hall);
  return (
    <g>
      {features.map((f) => {
        const w = cmToUnits(f.widthCm);
        const h = cmToUnits(f.lengthCm);
        return (
          <g key={f.id} transform={placement(cmToUnits(f.xCm), cmToUnits(f.yCm), f.rotation, w, h)}>
            <FeatureShape feature={f} />
          </g>
        );
      })}
      {labels &&
        features.map((f) =>
          f.label ? (
            <DrawingLabel key={`label-${f.id}`} x={cmToUnits(f.xCm)} y={cmToUnits(f.yCm)} text={f.label} size={size} />
          ) : null,
        )}
    </g>
  );
}

/**
 * A hall with its features in its own SVG, read-only. It fills the width
 * it is given (`className`) and keeps the hall's proportions. A
 * `turnable` drawing has its long side follow the screen's (TurnableSvg).
 */
export function HallDrawing({
  hall,
  label,
  labels = true,
  turnable = false,
  className,
}: {
  hall: DrawableFloor & { features: readonly PlacedFeature[] };
  /** What the drawing shows, for assistive technology. */
  label: string;
  labels?: boolean;
  turnable?: boolean;
  className?: string;
}) {
  const extent = hallExtent(hall, labels);
  if (turnable) {
    return (
      <TurnableSvg extent={extent} label={label} className={className}>
        <HallFloor floor={hall} />
        <HallFeatures features={hall.features} labels={labels} hall={hall} />
      </TurnableSvg>
    );
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={viewBoxOf(drawingBounds(extent, false, readMargin(extent.area)))}
      className={cn("block h-auto w-full", className)}
    >
      <HallFloor floor={hall} />
      <HallFeatures features={hall.features} labels={labels} hall={hall} />
    </svg>
  );
}
