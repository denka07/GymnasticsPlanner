import type { ReactNode, SVGProps } from "react";

import { viewArea, viewTransform, uprightStyle } from "@/lib/drawing/view";
import { cn } from "@/lib/utils";

/*
 * A read-only drawing whose long side follows the screen's: the editor's
 * default orientation (src/lib/drawing/view.ts) without measuring anything,
 * so it renders on the server. Both orientations are rendered and the
 * screen's orientation shows one: a portrait hall is turned on a landscape
 * screen and drawn as it is on a phone held upright.
 */
export function TurnableSvg({
  area,
  margin,
  label,
  className,
  children,
  ...rest
}: {
  /** The drawing's size in metres; `children` draw from (0, 0) to it. */
  area: { width: number; height: number };
  /** Space around the drawing, in metres. */
  margin: number;
  /** What the drawing shows, for assistive technology. */
  label: string;
  className?: string;
  children: ReactNode;
} & Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">) {
  const svg = (turned: boolean, shownClass?: string) => {
    const shown = viewArea(area, turned);
    return (
      <svg
        {...rest}
        role="img"
        aria-label={label}
        data-turned={turned || undefined}
        viewBox={`${-margin} ${-margin} ${shown.width + 2 * margin} ${shown.height + 2 * margin}`}
        className={cn("block h-auto w-full", className, shownClass)}
      >
        <g transform={viewTransform(area, turned)} style={uprightStyle(turned)}>
          {children}
        </g>
      </svg>
    );
  };
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
