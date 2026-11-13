/**
 * An error the person can fix, such as a name that is already taken. `key` is
 * a key in the `Errors` namespace of messages/sv.json. Server actions turn it
 * into an ActionResult instead of failing.
 */
export class UserError extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = "UserError";
  }
}
