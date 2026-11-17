"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Text clamped to about three lines. The "Visa mer" button appears only when
 * the text is actually cut off, and expands it in place. Line breaks are kept.
 */
export function ExpandableText({ text }: { text: string }) {
  const t = useTranslations("Events");
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Only meaningful while clamped; an expanded text keeps its button.
      if (!expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="grid gap-1">
      <p
        ref={ref}
        className={
          "break-words whitespace-pre-wrap " + (expanded ? "" : "line-clamp-3")
        }
      >
        {text}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="relative z-10 min-h-11 justify-self-start rounded-md px-1 text-base font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}
