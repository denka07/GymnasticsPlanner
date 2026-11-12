import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SIGN_IN_PATH } from "@/lib/auth/routes";

/** Neon Auth sends people here when Google sign-in fails. */
export default async function AuthErrorPage() {
  const t = await getTranslations("Auth");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t("errorTitle")}</CardTitle>
          <CardDescription>{t("errorText")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link href={SIGN_IN_PATH} />}>
            {t("backToStart")}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
