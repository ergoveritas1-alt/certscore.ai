import { lookup } from "node:dns/promises";
import { z } from "zod";
import { mergeAmplifyEnvironmentSecrets } from "../../../packages/shared/src/utils/amplify-secrets";

const amplifyRuntimeSchema = z.object({
  APP_FLAVOR: z.enum(["certscore", "validation_ops"]).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_READ_URL: z.string().optional(),
  DATABASE_SSL_MODE: z.enum(["disable", "prefer", "require", "verify-ca", "verify-full"]).optional(),
  DATABASE_URL: z.string().min(1),
  FEEDBACK_TO_EMAIL: z.string().email(),
  GMAIL_SMTP_APP_PASSWORD: z.string().min(1),
  GMAIL_SMTP_USER: z.string().email(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.string().optional(),
  PRIVACY_REQUEST_TO_EMAIL: z.string().email().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false", "1", "0"]).optional(),
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
    fail("database dns", `Could not resolve ${hostname}. Confirm Amplify SSR can reach the production PostgreSQL host.`);
    if (error instanceof Error && error.message) {
      info("database dns error", error.message);
    }
    return false;
  }
}

function isGoogleEnabled(env: NodeJS.ProcessEnv) {
  return String(env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

async function main() {
  const env = mergeAmplifyEnvironmentSecrets(process.env);
  const result = amplifyRuntimeSchema.safeParse(env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const values = result.data;
  const googleEnabled = isGoogleEnabled(env);

  if (googleEnabled && !values.GOOGLE_CLIENT_ID) {
    fail("google client id", "Set GOOGLE_CLIENT_ID when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true.");
    process.exitCode = 1;
  }

  if (googleEnabled && !values.GOOGLE_CLIENT_SECRET) {
    fail("google client secret", "Set GOOGLE_CLIENT_SECRET when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true.");
    process.exitCode = 1;
  }

  if (!values.PRIVACY_REQUEST_TO_EMAIL) {
    info("privacy email", "PRIVACY_REQUEST_TO_EMAIL is unset; privacy requests will fall back to FEEDBACK_TO_EMAIL if the server code permits it.");
  }

  pass("amplify runtime env", "Critical web runtime variables are present after Amplify secrets merge.");
  info("app url", new URL(values.NEXT_PUBLIC_APP_URL).origin);
  info("app flavor", values.APP_FLAVOR ?? "certscore");
  info("storage bucket", values.S3_BUCKET);
  info("storage region", values.S3_REGION);
  info("database ssl mode", values.DATABASE_SSL_MODE ?? "provider default");
  info("google auth", googleEnabled ? "enabled" : "disabled");

  const databaseReachable = await checkDatabaseHost(values.DATABASE_URL);
  if (!databaseReachable) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("amplify runtime env", error instanceof Error ? error.message : "Unknown Amplify runtime validation error");
  process.exitCode = 1;
});
