import { LibraryBigIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { signOutAction } from "@/app/actions";
import { switchDevUserAction } from "@/app/dev-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { DEV_USERS, devSignInEmail } from "@/lib/auth/dev-sign-in";
import { cn } from "@/lib/utils";

/** Header for signed-in pages: app name, the library, the user's name and sign-out. */
export async function AppHeader({ userName, wide = false }: { userName: string; wide?: boolean }) {
  const t = await getTranslations();

  return (
    <header className="border-b">
      <div className={cn(
          "mx-auto flex w-full items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6",
          wide ? "lg:px-8" : "max-w-[75rem]",
        )}>
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="truncate rounded-sm font-heading font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("App.name")}
          </Link>
          <nav aria-label={t("Nav.main")}>
            <Link href="/library" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <LibraryBigIcon data-icon="inline-start" />
              {t("Nav.library")}
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {devSignInEmail() && <DevUserSwitcher current={userName} />}
          <span className="hidden text-[0.9375rem] text-muted-foreground sm:inline">{userName}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              {t("Auth.signOut")}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

/**
 * Development only: switch between the test users to try sharing with two
 * accounts. Rendered only while the development sign-in is on; the action
 * checks the same guard.
 */
async function DevUserSwitcher({ current }: { current: string }) {
  const t = await getTranslations("Dev");
  return (
    <div role="group" aria-label={t("switchUser")} className="flex items-center gap-1 rounded-md border border-dashed px-1 py-0.5">
      <span className="px-1 text-xs text-muted-foreground">{t("label")}</span>
      {DEV_USERS.map((u) => (
        <form key={u.key} action={switchDevUserAction.bind(null, u.key)}>
          <Button type="submit" variant={u.name === current ? "secondary" : "ghost"} size="xs">
            {t(u.key)}
          </Button>
        </form>
      ))}
    </div>
  );
}
