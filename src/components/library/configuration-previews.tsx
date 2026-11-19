import { useLocale, useTranslations } from "next-intl";

import { ConfigurationDrawing } from "@/components/drawing/configuration-drawing";
import type { ConfigurationItem } from "@/lib/data/equipment-configurations";
import { fitScale, footprint } from "@/lib/drawing/geometry";
import { formatSize } from "@/lib/equipment-configurations";
import { cn } from "@/lib/utils";

/**
 * The scale (pixels per metre) at which every configuration fits in a box of
 * the given size, at most `max`. Drawing a whole list at one scale keeps
 * sizes comparable.
 */
export function previewScale(
  configurations: readonly ConfigurationItem[],
  box: { width: number; height: number },
  max: number,
): number {
  return fitScale(configurations.map(footprint), box, max);
}

/**
 * Configurations side by side, each drawn to `scale` with its name and size
 * below. No hooks other than translations, so it renders on the server too.
 */
export function ConfigurationPreviews({
  configurations,
  scale,
  className,
}: {
  configurations: readonly ConfigurationItem[];
  scale: number;
  className?: string;
}) {
  const t = useTranslations("Configurations");
  const locale = useLocale();
  return (
    <ul className={cn("flex flex-wrap items-end gap-x-5 gap-y-3", className)}>
      {configurations.map((c) => {
        const size = formatSize(c.widthCm, c.lengthCm, locale);
        return (
          <li key={c.id} className="grid max-w-full justify-items-start gap-1.5">
            <ConfigurationDrawing
              configuration={c}
              scale={scale}
              label={t("drawingLabel", { name: c.name, size })}
            />
            <span className="grid text-sm leading-snug">
              <span className="break-words">
                {c.name}
                {c.isDefault && <span className="text-muted-foreground"> · {t("default")}</span>}
              </span>
              <span className="text-muted-foreground tabular-nums">{size}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
