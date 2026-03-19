import { z } from "zod";

const webCheckSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url(),
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
  const result = webCheckSchema.safeParse(process.env);

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

  pass("web env", "All required CertScore web environment variables are present.");
  info("expected services", "Supabase Auth, Supabase Postgres, Redis, and Supabase Storage should be reachable.");
  info("app url", new URL(values.NEXT_PUBLIC_APP_URL).origin);
  info("supabase host", new URL(values.NEXT_PUBLIC_SUPABASE_URL).host);
  info("redis host", new URL(values.REDIS_URL).host);
  info("storage bucket", storageBucket);
}

main();
