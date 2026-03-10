import "server-only";

import { createAdminClient } from "@website-signal-risk-scanner/db";

// Service-role access is server-only. Never import this helper into client components.
export function createAdminSupabaseClient(...args: Parameters<typeof createAdminClient>) {
  return createAdminClient(...args);
}
