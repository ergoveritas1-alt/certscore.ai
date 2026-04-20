import { lookup } from "node:dns/promises";
import { z } from "zod";

const webCheckSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
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
  return env.S3_BUCKET ?? null;
}

async function checkDatabaseHost(connectionString: string) {
  let hostname: string;

  try {
    hostname = new URL(connectionString).hostname;
  } catch {
    fail("database host", "DATABASE_URL is not a valid connection string.");
    return false;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    info("database dns", `Skipping DNS lookup for local host ${hostname}.`);
    return true;
  }

  try {
    await lookup(hostname);
    pass("database dns", `Resolved ${hostname}.`);
    return true;
  } catch (error) {
    fail(
      "database dns",
      `Could not resolve ${hostname}. Update DATABASE_URL in apps/web/.env.local and point it at a live PostgreSQL instance.`
    );
    if (error instanceof Error && error.message) {
      info("database dns error", error.message);
    }
    return false;
  }
}

async function main() {
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
  const googleEnabled = String(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED ?? "").trim().toLowerCase() === "true";

  if (!storageBucket) {
    fail("storage bucket", "Set S3_BUCKET.");
    process.exitCode = 1;
    return;
  }

  if (googleEnabled && !values.GOOGLE_CLIENT_ID) {
    fail("google client id", "Set GOOGLE_CLIENT_ID when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true.");
    process.exitCode = 1;
    return;
  }

  if (googleEnabled && !values.GOOGLE_CLIENT_SECRET) {
    fail("google client secret", "Set GOOGLE_CLIENT_SECRET when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true.");
    process.exitCode = 1;
    return;
  }

  pass("web env", "All required CertScore web environment variables are present.");
  info("expected services", "PostgreSQL and S3-compatible storage should be reachable.");
  info("better auth", googleEnabled ? "App auth env includes email/password and Google OAuth." : "App auth env includes email/password.");
  info("app url", new URL(values.NEXT_PUBLIC_APP_URL).origin);
  info("storage bucket", storageBucket);
  info("storage region", values.S3_REGION);

  const databaseReachable = await checkDatabaseHost(values.DATABASE_URL);
  if (!databaseReachable) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("web env", error instanceof Error ? error.message : "Unknown web env validation error");
  process.exitCode = 1;
});
