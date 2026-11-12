import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Layout for signed-in pages: header, breadcrumb (start › group › season ›
 * setup) and content. The last crumb is the current page.
 */
export async function PageShell({
  crumbs,
  wide = false,
  children,
}: {
  crumbs: Crumb[];
  /** Use the full window width, for the season plan; otherwise a reading width. */
  wide?: boolean;
  children: ReactNode;
}) {
  const user = await requireUser();
  const t = await getTranslations("Nav");
  const all: Crumb[] = [{ label: t("start"), href: "/" }, ...crumbs];

  return (
    <>
      <AppHeader userName={user.name} wide={wide} />
      <main className={cn(
          "mx-auto grid w-full min-w-0 flex-1 content-start px-4 sm:px-6",
          wide ? "gap-4 py-4 lg:px-8" : "max-w-[75rem] gap-6 py-6 sm:py-8",
        )}>
        <Breadcrumb aria-label={t("label")}>
          <BreadcrumbList>
            {all.map((crumb, index) => {
              const last = index === all.length - 1;
              return (
                <Fragment key={`${index}-${crumb.label}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="min-w-0">
                    {last || !crumb.href ? (
                      <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink className="truncate" render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        {children}
      </main>
    </>
  );
}

/** Shown while a signed-in page streams in. */
export async function PageLoading() {
  const t = await getTranslations("Common");
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </main>
  );
}
