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

export type Crumb = { label: string; href?: string };

/**
 * Layout for signed-in pages: header, breadcrumb (start › group › season ›
 * setup) and content. The last crumb is the current page.
 */
export async function PageShell({
  crumbs,
  children,
}: {
  crumbs: Crumb[];
  children: ReactNode;
}) {
  const user = await requireUser();
  const t = await getTranslations("Nav");
  const all: Crumb[] = [{ label: t("start"), href: "/" }, ...crumbs];

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-6 px-4 py-6 sm:px-6 sm:py-8">
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
