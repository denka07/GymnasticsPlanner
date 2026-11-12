"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { AUTH_CALLBACK_PATH, AUTH_ERROR_PATH } from "@/lib/auth/routes";

/** Starts Google sign-in directly; there is no other sign-in method. */
export function GoogleSignInButton() {
  const t = useTranslations("Auth");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const origin = window.location.origin;
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(AUTH_CALLBACK_PATH, origin).toString(),
        errorCallbackURL: new URL(AUTH_ERROR_PATH, origin).toString(),
      });
      if (error) {
        throw error;
      }
      // On success the browser is on its way to Google; keep the pending state.
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="lg" onClick={signIn} disabled={pending}>
        {pending ? t("signingIn") : t("signInWithGoogle")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("signInFailed")}
        </p>
      )}
    </div>
  );
}
