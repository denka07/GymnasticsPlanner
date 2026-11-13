import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";

/** Marks a global library item, which only administrators can change. */
export async function ScopeBadge() {
  const t = await getTranslations("Library");
  return <Badge variant="secondary">{t("global")}</Badge>;
}
