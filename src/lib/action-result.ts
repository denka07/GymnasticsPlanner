/**
 * What a Server Action returns to a form. `error` is a key in the `Errors`
 * namespace of messages/sv.json.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };
