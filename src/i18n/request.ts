import { getRequestConfig } from "next-intl/server";

import { defaultLocale } from "./config";

// Swedish is the only language for now. When more are added, resolve the
// locale here (for example from the user's settings) and load its catalogue.
export default getRequestConfig(async () => {
  const locale = defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
