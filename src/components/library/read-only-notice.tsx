import { getTranslations } from "next-intl/server";

/** Tells a non-administrator why a global item cannot be edited. */
export async function ReadOnlyNotice() {
  const t = await getTranslations("Library");
  return <p className="rounded-lg border bg-muted/40 px-3 py-2.5">{t("readOnly")}</p>;
}
