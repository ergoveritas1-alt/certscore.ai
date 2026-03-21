import { lookup } from "node:dns/promises";
import { hasSupabaseAdminEnv, hasSupabasePublicEnv } from "@website-signal-risk-scanner/db";
import { getSupabaseHealth } from "../server/health/get-supabase-health";

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

async function main() {
  if (!hasSupabasePublicEnv() || !hasSupabaseAdminEnv()) {
    fail("runtime env", "Missing Supabase environment variables required for runtime validation.");
    process.exitCode = 1;
    return;
  }

  const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

  try {
    await lookup(supabaseHost);
  } catch {
    fail("supabase runtime", `Unable to resolve ${supabaseHost}. Check NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local.`);
    process.exitCode = 1;
    return;
  }

  const health = await getSupabaseHealth();

  if (!health.ok) {
    const missingTableMessage =
      health.requiredTables.missing.length > 0
        ? ` Missing required tables: ${health.requiredTables.missing.join(", ")}.`
        : "";

    fail("supabase runtime", `${health.error ?? "Unknown Supabase runtime error."}${missingTableMessage}`);
    process.exitCode = 1;
    return;
  }

  pass("supabase runtime", `Connected to the expected schema. Required auth tables present: ${health.requiredTables.present.join(", ")}.`);
}

main().catch((error) => {
  fail("supabase runtime", error instanceof Error ? error.message : "Unknown runtime validation error");
  process.exitCode = 1;
});
