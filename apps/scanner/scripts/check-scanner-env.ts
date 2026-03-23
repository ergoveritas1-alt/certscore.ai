import { z } from "zod";

const scannerCheckSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WORKER_CONCURRENCY: z.string().optional(),
  SCANNER_POLL_INTERVAL_MS: z.string().optional(),
  SCANNER_STALE_SCAN_THRESHOLD_MS: z.string().optional(),
  SCANNER_CRAWLER_NAME: z.string().min(1),
  SCANNER_CRAWLER_PUBLIC_URL: z.string().url(),
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET_REPORTS: z.string().min(1).optional()
});

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

function info(label: string, details: string) {
  console.info(`INFO ${label}: ${details}`);
}

function getStorageBucket(env: NodeJS.ProcessEnv) {
  return env.SUPABASE_STORAGE_BUCKET ?? env.SUPABASE_STORAGE_BUCKET_REPORTS ?? null;
}

function main() {
  const result = scannerCheckSchema.safeParse(process.env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const values = result.data;
  const storageBucket = getStorageBucket(process.env);

  if (!storageBucket) {
    fail("storage bucket", "Set SUPABASE_STORAGE_BUCKET. Legacy SUPABASE_STORAGE_BUCKET_REPORTS is still accepted.");
    process.exitCode = 1;
    return;
  }

  pass("scanner env", "All required scanner environment variables are present.");
  info("supabase host", new URL(values.NEXT_PUBLIC_SUPABASE_URL).host);
  info("crawler name", values.SCANNER_CRAWLER_NAME);
  info("crawler public url", values.SCANNER_CRAWLER_PUBLIC_URL);
  info("worker concurrency", values.WORKER_CONCURRENCY ?? "2");
  info("poll interval", values.SCANNER_POLL_INTERVAL_MS ?? "3000");
  info("playwright browsers path", values.PLAYWRIGHT_BROWSERS_PATH ?? "default cache");
}

main();
