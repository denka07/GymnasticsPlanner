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

/**
 * Shown for unknown URLs and for groups and seasons that do not exist or that
 * the user has no access to; the two cases look the same on purpose.
 */
export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("text")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("back")}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
