import { getTranslations } from "next-intl/server";

import { signOutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** Header for signed-in pages: app name, the user's name and sign-out. */
export async function AppHeader({ userName }: { userName: string }) {
  const t = await getTranslations();

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <span className="font-heading font-semibold">{t("App.name")}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userName}</span>
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
