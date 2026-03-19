import { z } from "zod";

const validationWorkerCheckSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  VALIDATION_REDIS_URL: z.string().url(),
  VALIDATION_PIPELINE_ENABLED: z.enum(["0", "1"]).optional(),
  VALIDATION_SCHEDULER_POLL_MINUTES: z.string().optional(),
  VALIDATION_DEFAULT_RUN_MODE: z.enum(["manual", "automatic"]).optional(),
  VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES: z.string().optional(),
  VALIDATION_OPENAI_MODEL: z.string().min(1).optional(),
  VALIDATION_TRANCO_MIN_RANK: z.string().optional(),
  VALIDATION_TRANCO_MAX_RANK: z.string().optional(),
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
  info("supabase host", new URL(values.NEXT_PUBLIC_SUPABASE_URL).host);
  info("validation redis host", new URL(values.VALIDATION_REDIS_URL).host);
  info("pipeline enabled", values.VALIDATION_PIPELINE_ENABLED ?? "1");
  info("default run mode", values.VALIDATION_DEFAULT_RUN_MODE ?? "manual");
  info("default interval", values.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES ?? "20");
  info("validation model", values.VALIDATION_OPENAI_MODEL ?? "gpt-5.4");
}

main();
