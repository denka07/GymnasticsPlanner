import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type LibraryTab = "stations" | "exercises" | "equipment";

const TABS: LibraryTab[] = ["stations", "exercises", "equipment"];

/** The library heading and its three parts as links; the current one is marked. */
export async function LibraryTabs({ current }: { current: LibraryTab }) {
  const t = await getTranslations("Library");

  return (
    <div className="grid gap-3">
      <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
        {t("heading")}
      </h1>
      <nav aria-label={t("tabsLabel")}>
        <ul className="flex gap-1 border-b">
          {TABS.map((tab) => {
            const active = tab === current;
            return (
              <li key={tab}>
                <Link
                  href={`/library/${tab}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex min-h-11 items-center rounded-t-lg border-b-2 px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${tab}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
