import { PlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { createGroupAction } from "@/app/plan-actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { PageShell } from "@/components/page-shell";
import { NameDialog } from "@/components/plan/name-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { listMyGroups } from "@/lib/data/groups";

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

  return <GroupsOverview />;
}

async function GroupsOverview() {
  const t = await getTranslations();
  const groups = await listMyGroups();

  return (
    <PageShell crumbs={[]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
          {t("Groups.heading")}
        </h1>
        <NameDialog
          trigger={
            <Button>
              <PlusIcon data-icon="inline-start" />
              {t("Groups.newGroup")}
            </Button>
          }
          title={t("Groups.createTitle")}
          label={t("Groups.nameLabel")}
          placeholder={t("Groups.namePlaceholder")}
          submitLabel={t("Common.create")}
          action={createGroupAction}
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Groups.emptyTitle")}</CardTitle>
            <CardDescription>{t("Groups.emptyText")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(({ group, seasons }) => (
            <li key={group.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/groups/${group.id}`} className="hover:underline">
                      {group.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {seasons.length === 0 ? (
                    <p className="text-muted-foreground">{t("Groups.noSeasons")}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {seasons.map((season) => (
                        <li key={season.id}>
                          <Link
                            href={`/seasons/${season.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {season.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
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
