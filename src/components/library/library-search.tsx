import { SearchIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A name search that puts `?q=` in the URL, so lists can be searched without JavaScript. */
export async function LibrarySearch({
  action,
  label,
  search,
}: {
  action: string;
  label: string;
  search: string;
}) {
  const t = await getTranslations("Library");

  return (
    <Form action={action} role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
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
        <Button variant="ghost" className="h-11 px-3" nativeButton={false} render={<Link href={action} />}>
          {t("showAll")}
        </Button>
      )}
    </Form>
  );
}
