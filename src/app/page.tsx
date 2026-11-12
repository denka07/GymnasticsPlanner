import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AppHeader } from "@/components/app-header";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getCurrentUser } from "@/lib/auth";

export default function HomePage() {
  // The session is request-time data, so the page streams in behind Suspense.
  return (
    <Suspense fallback={<Loading />}>
      <StartPage />
    </Suspense>
  );
}

async function StartPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <SignedOut />;
  }

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8" />
    </>
  );
}

async function SignedOut() {
  const t = await getTranslations();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {t("Home.title")}
      </h1>
      <p className="text-muted-foreground">{t("Home.intro")}</p>
      <GoogleSignInButton />
    </main>
  );
}

async function Loading() {
  const t = await getTranslations("Auth");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </main>
  );
}
