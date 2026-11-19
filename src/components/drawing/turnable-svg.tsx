import type { ReactNode, SVGProps } from "react";

import { drawingBounds, readMargin, viewBoxOf, type DrawingExtent } from "@/lib/drawing/bounds";
import { rectToView, viewTransform, uprightStyle } from "@/lib/drawing/view";
import { cn } from "@/lib/utils";

/*
 * A read-only drawing whose long side follows the screen's: the editor's
 * default orientation (src/lib/drawing/view.ts) without measuring anything,
 * so it renders on the server. Both orientations are rendered and the
 * screen's orientation shows one: a portrait hall is turned on a landscape
 * screen and drawn as it is on a phone held upright.
 */
export function TurnableSvg({
  extent,
  margin,
  label,
  turned,
  className,
  children,
  ...rest
}: {
  /**
   * The drawing's area in metres (`children` draw from (0, 0) to it) and
   * what reaches past it, labels included: all of it is shown.
   */
  extent: DrawingExtent;
  /** Space around everything shown, in metres; 1 % of the area's long side when left out. */
  margin?: number;
  /** What the drawing shows, for assistive technology. */
  label: string;
  /** Draws only this orientation instead of following the screen's. */
  turned?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">) {
  const area = extent.area;
  const svg = (turned: boolean, shownClass?: string) => {
    const shown = rectToView(drawingBounds(extent, turned, margin ?? readMargin(area)), area, turned);
    return (
      <svg
        role="img"
        {...rest}
        aria-label={label}
        data-turned={turned || undefined}
        viewBox={viewBoxOf(shown)}
        className={cn("block h-auto w-full", className, shownClass)}
      >
        <g transform={viewTransform(area, turned)} style={uprightStyle(turned)}>
          {children}
        </g>
      </svg>
    );
  };
  if (turned !== undefined) {
    return svg(turned && area.width !== area.height);
  }
  if (area.width === area.height) {
    return svg(false);
  }
  const portrait = area.height > area.width;
  return (
    <>
      {svg(false, portrait ? "landscape:hidden" : "portrait:hidden")}
      {svg(true, portrait ? "portrait:hidden" : "landscape:hidden")}
    </>
  );
}
