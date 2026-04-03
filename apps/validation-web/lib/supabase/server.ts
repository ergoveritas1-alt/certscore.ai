import "server-only";

import { createServerClient } from "@website-signal-risk-scanner/db";

export function createServerSupabaseClient(...args: Parameters<typeof createServerClient>) {
  return createServerClient(...args);
}
