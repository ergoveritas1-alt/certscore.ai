import { checkStorageBucketExists, getStorageBucketName, hasDatabaseEnv, hasS3Env } from "@website-signal-risk-scanner/db";
import { getDatabaseHealth } from "../server/health/get-database-health";

const allowMissingEnv = process.argv.includes("--allow-missing-env");

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

function shouldSkipLiveValidation() {
  return allowMissingEnv;
}

async function main() {
  if (!hasDatabaseEnv() || !hasS3Env()) {
    const details = "Missing database or S3 environment variables required for runtime validation.";

    if (shouldSkipLiveValidation()) {
      pass("runtime env", `${details} Skipping live runtime validation in this build environment.`);
      return;
    }

    fail("runtime env", details);
    process.exitCode = 1;
    return;
  }

  const [health, storageBucketExists] = await Promise.all([
    getDatabaseHealth(),
    checkStorageBucketExists()
  ]);

  if (!health.ok) {
    if (shouldSkipLiveValidation()) {
      pass(
        "database runtime",
        `${health.error ?? "Unknown database runtime error."} Skipping live runtime validation in this build environment.`
      );
      return;
    }

    const missingTableMessage =
      health.requiredTables.missing.length > 0
        ? ` Missing required tables: ${health.requiredTables.missing.join(", ")}.`
        : "";

    fail("database runtime", `${health.error ?? "Unknown database runtime error."}${missingTableMessage}`);
    process.exitCode = 1;
    return;
  }

  if (!health.checks.authSchema) {
    if (shouldSkipLiveValidation()) {
      pass(
        "auth runtime",
        `Missing required Better Auth tables: ${health.requiredTables.missing.join(", ")}. Skipping live runtime validation in this build environment.`
      );
      return;
    }

    fail(
      "auth runtime",
      `Missing required Better Auth tables: ${health.requiredTables.missing.join(", ")}.`
    );
    process.exitCode = 1;
    return;
  }

  if (!storageBucketExists) {
    if (shouldSkipLiveValidation()) {
      pass(
        "storage runtime",
        `Could not access configured S3 bucket ${getStorageBucketName()}. Skipping live runtime validation in this build environment.`
      );
      return;
    }

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
