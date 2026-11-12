import { getTranslations } from "next-intl/server";

import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Header for signed-in pages: app name, the user's name and sign-out. */
export async function AppHeader({ userName, wide = false }: { userName: string; wide?: boolean }) {
  const t = await getTranslations();

  return (
    <header className="border-b">
      <div className={cn(
          "mx-auto flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6",
          wide ? "lg:px-8" : "max-w-[75rem]",
        )}>
        <span className="font-heading font-semibold">{t("App.name")}</span>
        <div className="flex items-center gap-3">
          <span className="text-[0.9375rem] text-muted-foreground">{userName}</span>
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
