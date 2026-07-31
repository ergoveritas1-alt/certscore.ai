import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type PasswordEmailPurpose = "account_setup" | "password_reset";

const passwordEmailPurpose = new AsyncLocalStorage<PasswordEmailPurpose>();

export function getPasswordEmailPurpose(): PasswordEmailPurpose {
  return passwordEmailPurpose.getStore() ?? "password_reset";
}

export function withPasswordEmailPurpose<T>(
  purpose: PasswordEmailPurpose,
  operation: () => Promise<T>
): Promise<T> {
  return passwordEmailPurpose.run(purpose, operation);
}
