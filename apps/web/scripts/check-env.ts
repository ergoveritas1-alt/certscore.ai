import { lookup } from "node:dns/promises";
import { z } from "zod";

const webCheckSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  REDIS_URL: z.string().url(),
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

  if (!storageBucket) {
    fail("storage bucket", "Set S3_BUCKET.");
    process.exitCode = 1;
    return;
  }

  pass("web env", "All required CertScore web environment variables are present.");
  info("expected services", "PostgreSQL, Redis, and S3-compatible storage should be reachable.");
  info("app url", new URL(values.NEXT_PUBLIC_APP_URL).origin);
  info("redis host", new URL(values.REDIS_URL).host);
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
