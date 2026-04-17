import assert from "node:assert/strict";
import test from "node:test";

import { buildSupabaseOperationError, describeSupabaseError } from "./describe-supabase-error";

test("describes missing Supabase DNS records with an env-focused message", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ibjxttgmvdkbuqllbazj.supabase.co";

  const message = describeSupabaseError({
    details:
      "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND ibjxttgmvdkbuqllbazj.supabase.co (ENOTFOUND)",
    message: "TypeError: fetch failed"
  });

  assert.equal(
    message,
    "Supabase host could not be resolved (ibjxttgmvdkbuqllbazj.supabase.co). Check NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local and point localhost at a live dev project."
  );
});

test("wraps operation labels around normalized Supabase errors", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.supabase.co";

  const error = buildSupabaseOperationError("Failed to create preview domain", {
    details: "connect ECONNREFUSED 127.0.0.1:54321",
    message: "TypeError: fetch failed"
  });

  assert.equal(
    error.message,
    "Failed to create preview domain: Supabase refused the connection (db.example.supabase.co). Ensure the configured project or local Supabase API is running and reachable."
  );
});
