import { createAdminClient } from "@website-signal-risk-scanner/db";
import { chromium } from "playwright";
import { z } from "zod";

const runtimeSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SCANNER_CRAWLER_NAME: z.string().min(1),
  SCANNER_CRAWLER_PUBLIC_URL: z.string().url(),
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

async function checkSupabase(url: string, storageBucket: string) {
  const supabase = createAdminClient();

  try {
    const { error } = await supabase.from("scans").select("id", { count: "exact", head: true });
    if (error) {
      fail("supabase database", `Scanner database query failed. ${error.message}`);
      return false;
    }

    pass("supabase database", `Scanner service-role client can query the database at ${new URL(url).host}.`);
  } catch (error) {
    fail("supabase database", error instanceof Error ? error.message : "Unknown error");
    return false;
  }

  try {
    const { data, error } = await supabase.storage.from(storageBucket).list("", {
      limit: 1
    });
    if (error) {
      fail("supabase storage", `Bucket check failed for ${storageBucket}. ${error.message}`);
      return false;
    }

    pass("supabase storage", `Scanner artifacts bucket ${storageBucket} is accessible (${data?.length ?? 0} item sample).`);
    return true;
  } catch (error) {
    fail("supabase storage", error instanceof Error ? error.message : "Unknown error");
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
    pass("playwright chromium", "Chromium launched successfully for scanner runtime workflows.");
    return true;
  } catch (error) {
    fail("playwright chromium", error instanceof Error ? error.message : "Unknown error");
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

  console.info("INFO runtime: Starting scanner runtime checks.");

  const checks = await Promise.all([checkSupabase(result.data.NEXT_PUBLIC_SUPABASE_URL, storageBucket), checkChromium()]);

  if (checks.every(Boolean)) {
    pass("scanner runtime", "All core scanner runtime dependencies passed.");
    return;
  }

  process.exitCode = 1;
}

main().catch((error) => {
  fail("scanner runtime", error instanceof Error ? error.message : "Unknown runtime validation error");
  process.exitCode = 1;
});
