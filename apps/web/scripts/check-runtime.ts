import { hasDatabaseEnv, hasS3Env } from "@website-signal-risk-scanner/db";
import { getSupabaseHealth } from "../server/health/get-supabase-health";

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

async function main() {
  if (!hasDatabaseEnv() || !hasS3Env()) {
    fail("runtime env", "Missing database or S3 environment variables required for runtime validation.");
    process.exitCode = 1;
    return;
  }

  const health = await getSupabaseHealth();

  if (!health.ok) {
    const missingTableMessage =
      health.requiredTables.missing.length > 0
        ? ` Missing required tables: ${health.requiredTables.missing.join(", ")}.`
        : "";

    fail("database runtime", `${health.error ?? "Unknown database runtime error."}${missingTableMessage}`);
    process.exitCode = 1;
    return;
  }

  pass("database runtime", `Connected to the expected schema. Required auth tables present: ${health.requiredTables.present.join(", ")}.`);
}

main().catch((error) => {
  fail("database runtime", error instanceof Error ? error.message : "Unknown runtime validation error");
  process.exitCode = 1;
});
