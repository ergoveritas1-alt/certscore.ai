import { createAdminClient } from "@website-signal-risk-scanner/db";
import Redis from "ioredis";
import { chromium } from "playwright";
import { z } from "zod";

const runtimeSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET_REPORTS: z.string().min(1).optional(),
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional()
});

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

function getStorageBucket(env: NodeJS.ProcessEnv) {
  return env.SUPABASE_STORAGE_BUCKET ?? env.SUPABASE_STORAGE_BUCKET_REPORTS ?? null;
}

async function checkRedis(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  try {
    await redis.connect();
    const response = await redis.ping();
    pass("redis", `Connected to ${new URL(redisUrl).host} and received ${response}.`);
  } catch (error) {
    fail("redis", `Unable to connect. Verify REDIS_URL and network access. ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  } finally {
    redis.disconnect();
  }

  return true;
}

async function checkSupabase(url: string, storageBucket: string) {
  const supabase = createAdminClient();

  try {
    const { error } = await supabase.from("organizations").select("id", { count: "exact", head: true });

    if (error) {
      fail("supabase database", `Service-role query failed. Apply migrations and verify SUPABASE_SERVICE_ROLE_KEY. ${error.message}`);
      return false;
    }

    pass("supabase database", `Service-role client can query the database at ${new URL(url).host}.`);
  } catch (error) {
    fail("supabase database", `Unable to initialize the service-role client. ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }

  try {
    const { data, error } = await supabase.storage.from(storageBucket).list("", {
      limit: 1
    });

    if (error) {
      fail("supabase storage", `Bucket check failed for ${storageBucket}. Create the bucket or verify permissions. ${error.message}`);
      return false;
    }

    pass("supabase storage", `Storage bucket ${storageBucket} is accessible (${data?.length ?? 0} item sample).`);
  } catch (error) {
    fail("supabase storage", `Unable to access storage bucket ${storageBucket}. ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }

  return true;
}

async function checkChromium() {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    });

    pass("playwright chromium", "Chromium launched successfully for CertScore scan workflows.");
    return true;
  } catch (error) {
    fail(
      "playwright chromium",
      `Chromium could not launch. Run pnpm --filter @website-signal-risk-scanner/worker playwright:install. ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
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

  const storageBucket = getStorageBucket(process.env);

  if (!storageBucket) {
    fail("storage bucket", "Set SUPABASE_STORAGE_BUCKET. Legacy SUPABASE_STORAGE_BUCKET_REPORTS is still accepted.");
    process.exitCode = 1;
    return;
  }

  console.info("INFO runtime: Starting CertScore worker runtime checks.");

  const checks = await Promise.all([
    checkRedis(result.data.REDIS_URL),
    checkSupabase(result.data.NEXT_PUBLIC_SUPABASE_URL, storageBucket),
    checkChromium()
  ]);

  if (checks.every(Boolean)) {
    pass("runtime", "All core worker runtime dependencies passed.");
    return;
  }

  process.exitCode = 1;
}

main().catch((error) => {
  fail("runtime", error instanceof Error ? error.message : "Unknown runtime validation error");
  process.exitCode = 1;
});
