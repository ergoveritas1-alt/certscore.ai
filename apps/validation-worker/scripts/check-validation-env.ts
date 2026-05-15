import { z } from "zod";

const validationWorkerCheckSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["0", "1", "false", "true"]).optional(),
  VALIDATION_PIPELINE_ENABLED: z.enum(["0", "1"]).optional(),
  VALIDATION_SCHEDULER_POLL_MINUTES: z.string().optional(),
  VALIDATION_DEFAULT_RUN_MODE: z.enum(["manual", "automatic"]).optional(),
  VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES: z.string().optional(),
  VALIDATION_OPENAI_MODEL: z.string().min(1).optional(),
  VALIDATION_TRANCO_MIN_RANK: z.string().optional(),
  VALIDATION_TRANCO_MAX_RANK: z.string().optional(),
  WEB_BOT_AUTH_ENABLED: z.enum(["0", "1"]).optional(),
  WEB_BOT_AUTH_PRIVATE_KEY_PEM: z.string().min(1).optional(),
  WEB_BOT_AUTH_SIGNATURE_AGENT_URL: z.string().url().optional(),
  WEB_BOT_AUTH_EXPIRES_SECONDS: z.string().optional(),
  WEB_BOT_AUTH_INCLUDE_NONCE: z.enum(["0", "1"]).optional(),
  SCANNER_CRAWLER_NAME: z.string().min(1).optional(),
  SCANNER_CRAWLER_PUBLIC_URL: z.string().url().optional(),
  VALIDATION_CRAWLER_PUBLIC_URL: z.string().url().optional()
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

function main() {
  const result = validationWorkerCheckSchema.safeParse(process.env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const values = result.data;
  pass("validation worker env", "All required validation worker environment variables are present.");
  info("database url", values.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"));
  info("storage bucket", values.S3_BUCKET);
  info("storage region", values.S3_REGION);
  info("pipeline enabled", values.VALIDATION_PIPELINE_ENABLED ?? "1");
  info("default run mode", values.VALIDATION_DEFAULT_RUN_MODE ?? "manual");
  info("default interval", values.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES ?? "20");
  info("validation model", values.VALIDATION_OPENAI_MODEL ?? "gpt-5.4-nano");
  info("web bot auth enabled", values.WEB_BOT_AUTH_ENABLED ?? "0");
}

main();
