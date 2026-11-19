import { footprint, lookOf } from "@/lib/drawing/geometry";
import { cn } from "@/lib/utils";

/*
 * Drawing pieces for drawn plans, in SVG. Coordinates are in drawing units
 * (metres); a configuration's width runs along x and its length along y.
 * No hooks, so they render on the server and in the browser alike.
 */

/** What is needed to draw a configuration. */
export type DrawableConfiguration = {
  widthCm: number;
  lengthCm: number;
  color: string | null;
  imageUrl: string | null;
};

/**
 * One configuration seen from above, as SVG elements to place in a drawing
 * whose unit is the metre: its image stretched to its size, or a rectangle
 * in its colour, or a neutral grey; always with a thin outline.
 */
export function ConfigurationShape({
  configuration,
  x = 0,
  y = 0,
}: {
  configuration: DrawableConfiguration;
  /** Top left corner, in metres. */
  x?: number;
  y?: number;
}) {
  const { width, height } = footprint(configuration);
  const look = lookOf(configuration);
  const box = { x, y, width, height };
  return (
    <g>
      {look.kind === "image" ? (
        <image {...box} href={look.href} preserveAspectRatio="none" />
      ) : look.kind === "color" ? (
        <rect {...box} fill={look.fill} />
      ) : (
        <rect {...box} className="fill-muted" />
      )}
      <rect
        {...box}
        fill="none"
        className="stroke-foreground/60"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One configuration in its own SVG, `scale` pixels per metre. */
export function ConfigurationDrawing({
  configuration,
  scale,
  label,
  className,
}: {
  configuration: DrawableConfiguration;
  scale: number;
  /** What the drawing shows, for assistive technology. */
  label: string;
  className?: string;
}) {
  const { width, height } = footprint(configuration);
  return (
    <svg
      role="img"
      aria-label={label}
      width={Math.max(1, width * scale)}
      height={Math.max(1, height * scale)}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
      className={cn("shrink-0", className)}
    >
      <ConfigurationShape configuration={configuration} />
    </svg>
  );
}

/** A bar one metre long at `scale` pixels per metre, with its label ("1 m"). */
export function ScaleBar({ scale, label, className }: { scale: number; label: string; className?: string }) {
  const tick = 6;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <svg aria-hidden width={scale} height={tick} viewBox={`0 0 ${scale} ${tick}`} overflow="visible">
        <path
          d={`M0.5 0 V${tick} M0.5 ${tick / 2} H${scale - 0.5} M${scale - 0.5} 0 V${tick}`}
          fill="none"
          className="stroke-current"
          strokeWidth={1}
        />
      </svg>
      {label}
    </span>
  );
}
