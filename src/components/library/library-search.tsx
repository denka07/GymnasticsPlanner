import { SearchIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScopeFilter } from "@/lib/library";

/** A name search that puts `?q=` in the URL, so lists can be searched without JavaScript. */
export async function LibrarySearch({
  action,
  label,
  search,
  scope = "all",
}: {
  action: string;
  label: string;
  search: string;
  /** The list's scope filter, kept when searching. */
  scope?: ScopeFilter;
}) {
  const t = await getTranslations("Library");
  const showAll = scope === "all" ? action : `${action}?scope=${scope}`;

  return (
    <Form action={action} role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
      {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
      <Input
        type="search"
        name="q"
        defaultValue={search}
        aria-label={label}
        placeholder={label}
        maxLength={100}
        autoComplete="off"
        className="h-11 min-w-0 flex-1"
      />
      <Button type="submit" variant="outline" className="h-11 px-3">
        <SearchIcon />
        <span className="max-sm:sr-only">{t("search")}</span>
      </Button>
      {search && (
        <Button variant="ghost" className="h-11 px-3" nativeButton={false} render={<Link href={showAll} />}>
          {t("showAll")}
        </Button>
      )}
    </Form>
  );
}
