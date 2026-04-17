import { hasDatabaseEnv, hasS3Env } from "@website-signal-risk-scanner/db";
import { getDatabaseHealth } from "../server/health/get-database-health";
import { checkStorageBucketExists, getStorageBucketName } from "../server/storage/s3";

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

  const [health, storageBucketExists] = await Promise.all([
    getDatabaseHealth(),
    checkStorageBucketExists()
  ]);

  if (!health.ok) {
    const missingTableMessage =
      health.requiredTables.missing.length > 0
        ? ` Missing required tables: ${health.requiredTables.missing.join(", ")}.`
        : "";

    fail("database runtime", `${health.error ?? "Unknown database runtime error."}${missingTableMessage}`);
    process.exitCode = 1;
    return;
  }

  if (!health.checks.authSchema) {
    fail(
      "auth runtime",
      `Missing required Better Auth tables: ${health.requiredTables.missing.join(", ")}.`
    );
    process.exitCode = 1;
    return;
  }

  if (!storageBucketExists) {
    fail(
      "storage runtime",
      `Could not access configured S3 bucket ${getStorageBucketName()}. Check bucket existence, credentials, and endpoint configuration.`
    );
    process.exitCode = 1;
    return;
  }

  pass("database runtime", `Connected to the expected schema. Required auth tables present: ${health.requiredTables.present.join(", ")}.`);
  pass("storage runtime", `Connected to S3-compatible storage bucket ${getStorageBucketName()}.`);
}

main().catch((error) => {
  fail("database runtime", error instanceof Error ? error.message : "Unknown runtime validation error");
  process.exitCode = 1;
});
