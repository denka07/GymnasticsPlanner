import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/db/schema";
import type { ScopeFilter } from "@/lib/library";
import { cn } from "@/lib/utils";

const FILTERS: ScopeFilter[] = ["all", "mine", "global"];

/** Alla / Mina / Globala as links that keep the search, so it works without JavaScript. */
export async function ScopeFilterNav({
  action,
  filter,
  search,
}: {
  action: string;
  filter: ScopeFilter;
  search: string;
}) {
  const t = await getTranslations("Library");

  function href(value: ScopeFilter): string {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (value !== "all") params.set("scope", value);
    const query = params.toString();
    return query ? `${action}?${query}` : action;
  }

  return (
    <nav aria-label={t("filterLabel")}>
      <ul className="inline-flex rounded-lg border p-0.5">
        {FILTERS.map((value) => {
          const active = value === filter;
          return (
            <li key={value}>
              <Link
                href={href(value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-md px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`filter.${value}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The review status the submitter sees on their own item in a list. */
export async function SubmissionBadge({ status }: { status: SubmissionStatus | null }) {
  if (status !== "pending" && status !== "rejected") {
    return null;
  }
  const t = await getTranslations("Library");
  return (
    <Badge variant={status === "rejected" ? "destructive" : "outline"}>{t(`status.${status}`)}</Badge>
  );
}
