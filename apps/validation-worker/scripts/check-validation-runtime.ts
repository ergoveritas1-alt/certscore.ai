import { createAdminClient } from "@website-signal-risk-scanner/db";
import Redis from "ioredis";
import { chromium } from "playwright";
import { z } from "zod";

const runtimeSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  VALIDATION_REDIS_URL: z.string().url().optional(),
  VALIDATION_PIPELINE_ENABLED: z.enum(["0", "1"]).optional()
});

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

async function checkRedis(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  try {
    await redis.connect();
    const response = await redis.ping();
    pass("validation redis", `Connected to ${new URL(redisUrl).host} and received ${response}.`);
    return true;
  } catch (error) {
    fail("validation redis", `Unable to connect. ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  } finally {
    redis.disconnect();
  }
}

async function checkSupabase(url: string) {
  const supabase = createAdminClient();

  try {
    const { error: settingsError } = await supabase.from("validation_settings").select("singleton_key").limit(1);
    if (settingsError) {
      fail("validation database", `Validation settings query failed. Apply migration 0045. ${settingsError.message}`);
      return false;
    }

    const { error: targetsError } = await supabase.from("validation_targets").select("id").limit(1);
    if (targetsError) {
      fail("validation database", `Validation targets query failed. Apply migration 0045. ${targetsError.message}`);
      return false;
    }

    pass("validation database", `Validation schema is reachable at ${new URL(url).host}.`);
    return true;
  } catch (error) {
    fail("validation database", error instanceof Error ? error.message : "Unknown error");
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
  const result = runtimeSchema.safeParse(process.env);
  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const validationRedisUrl = result.data.VALIDATION_REDIS_URL ?? result.data.REDIS_URL;
  if (!validationRedisUrl) {
    fail("validation redis", "Provide VALIDATION_REDIS_URL or REDIS_URL.");
    process.exitCode = 1;
    return;
  }

  const checks = await Promise.all([
    checkRedis(validationRedisUrl),
    checkSupabase(result.data.NEXT_PUBLIC_SUPABASE_URL),
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
