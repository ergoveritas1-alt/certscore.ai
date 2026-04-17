import { hasDatabaseEnv, query } from "@website-signal-risk-scanner/db";
import Redis from "ioredis";
import { chromium } from "playwright";
import { z } from "zod";

const runtimeSchema = z.object({
  DATABASE_URL: z.string().min(1),
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

  const validationRedisUrl = result.data.VALIDATION_REDIS_URL ?? result.data.REDIS_URL;
  if (!validationRedisUrl) {
    fail("validation redis", "Provide VALIDATION_REDIS_URL or REDIS_URL.");
    process.exitCode = 1;
    return;
  }

  const checks = await Promise.all([
    checkRedis(validationRedisUrl),
    checkDatabase(),
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
