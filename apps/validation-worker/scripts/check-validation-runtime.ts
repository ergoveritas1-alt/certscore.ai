import { checkStorageBucketExists, getStorageBucketName, hasDatabaseEnv, hasS3Env, query } from "@website-signal-risk-scanner/db";
import { chromium } from "playwright";
import { z } from "zod";

const runtimeSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["0", "1", "false", "true"]).optional(),
  VALIDATION_PIPELINE_ENABLED: z.enum(["0", "1"]).optional()
});

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

async function checkDatabase() {
  try {
    await query("select singleton_key from public.validation_settings limit 1", [], { readOnly: true });
    await query("select id from public.validation_targets limit 1", [], { readOnly: true });
    pass("validation database", "Validation schema is reachable through direct PostgreSQL access.");
    return true;
  } catch (error) {
    fail("validation database", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

async function checkStorage() {
  try {
    const bucketExists = await checkStorageBucketExists();
    if (!bucketExists) {
      fail(
        "validation storage",
        `Could not access configured S3 bucket ${getStorageBucketName()}. Check bucket existence, credentials, and endpoint configuration.`
      );
      return false;
    }

    pass("validation storage", `Connected to S3-compatible storage bucket ${getStorageBucketName()}.`);
    return true;
  } catch (error) {
    fail("validation storage", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

async function checkChromium() {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      headless: true
    });

    pass("validation playwright", "Chromium launched successfully for validation scan workflows.");
    return true;
  } catch (error) {
    fail("validation playwright", error instanceof Error ? error.message : "Unknown error");
    return false;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function main() {
  if (!hasDatabaseEnv()) {
    fail("DATABASE_URL", "Set DATABASE_URL in apps/web/.env.local for local validation worker runs.");
    process.exitCode = 1;
    return;
  }

  if (!hasS3Env()) {
    fail("validation storage", "Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY in apps/web/.env.local.");
    process.exitCode = 1;
    return;
  }

  const result = runtimeSchema.safeParse(process.env);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const label = issue.path.join(".");
      if (label === "OPENAI_API_KEY") {
        fail(label, "Set OPENAI_API_KEY in apps/web/.env.local for local validation worker runs.");
        continue;
      }

      fail(label, issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const checks = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkChromium()
  ]);

  if (checks.every(Boolean)) {
    pass("validation runtime", "All validation runtime dependencies passed.");
    return;
  }

  process.exitCode = 1;
}

main().catch((error) => {
  fail("validation runtime", error instanceof Error ? error.message : "Unknown validation runtime error");
  process.exitCode = 1;
});
