import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { countPendingSubmissions } from "@/lib/data/submissions";
import { cn } from "@/lib/utils";

export type LibraryTab = "stations" | "exercises" | "equipment" | "review";

const TABS: LibraryTab[] = ["stations", "exercises", "equipment"];

/**
 * The library heading and its parts as links; the current one is marked.
 * Administrators also get Granskning, with the number of pending submissions.
 */
export async function LibraryTabs({ current }: { current: LibraryTab }) {
  const [t, user] = await Promise.all([getTranslations("Library"), requireUser()]);
  const pending = await countPendingSubmissions(user);
  const tabs = user.isAdmin ? [...TABS, "review" as const] : TABS;

  return (
    <div className="grid gap-3">
      <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
        {t("heading")}
      </h1>
      <nav aria-label={t("tabsLabel")}>
        <ul className="flex gap-1 overflow-x-auto border-b">
          {tabs.map((tab) => {
            const active = tab === current;
            return (
              <li key={tab}>
                <Link
                  href={`/library/${tab}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex min-h-11 items-center gap-2 rounded-t-lg border-b-2 px-3 font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${tab}`)}
                  {tab === "review" && pending > 0 && (
                    <Badge aria-label={t("pendingCount", { count: pending })}>{pending}</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
