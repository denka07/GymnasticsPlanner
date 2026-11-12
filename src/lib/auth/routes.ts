/** Paths used by the sign-in flow. Shared by the proxy, server and client code. */

/** The start page doubles as the sign-in page. */
export const SIGN_IN_PATH = "/";

/**
 * Where the auth provider sends the browser after Google sign-in. The proxy
 * exchanges the session verifier here; the route then forwards to the start page.
 * It must differ from SIGN_IN_PATH, because the proxy skips the exchange there.
 */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Shown when sign-in fails. */
export const AUTH_ERROR_PATH = "/auth/error";
