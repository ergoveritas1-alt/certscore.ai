import { getSupabaseAdminEnv, type SupabaseAdminEnv } from "@website-signal-risk-scanner/db";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

const workerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_PIPELINE_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional())
    .transform((value) => value !== "0"),
  VALIDATION_SCHEDULER_POLL_MINUTES: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(60).default(1)
  ),
  VALIDATION_DEFAULT_RUN_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["manual", "automatic"]).default("manual")
  ),
  VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(5).max(240).default(20)
  ),
  VALIDATION_TRANCO_MIN_RANK: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).default(10_000)
  ),
  VALIDATION_TRANCO_MAX_RANK: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1000).default(20_000)
  ),
  VALIDATION_TRANCO_SOURCE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_OPENAI_MODEL: z.preprocess(emptyStringToUndefined, z.string().min(1).default("gpt-5.4")),
  WEB_BOT_AUTH_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional()).transform((value) => value === "1"),
  WEB_BOT_AUTH_PRIVATE_KEY_PEM: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  WEB_BOT_AUTH_SIGNATURE_AGENT_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  WEB_BOT_AUTH_EXPIRES_SECONDS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(3600).default(300)
  ),
  WEB_BOT_AUTH_INCLUDE_NONCE: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional()).transform((value) => value === "1"),
  SCANNER_CRAWLER_NAME: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  SCANNER_CRAWLER_PUBLIC_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_CRAWLER_PUBLIC_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  WORKER_CONCURRENCY: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(10).default(2)),
  PLAYWRIGHT_BROWSERS_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional())
});

export type WorkerEnv = z.infer<typeof workerEnvSchema> & SupabaseAdminEnv;

export function getConfiguredValidationRedisUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.VALIDATION_REDIS_URL?.trim() || env.REDIS_URL?.trim() || "";
}

export function getWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const values = parseEnvironment({
    env,
    schema: workerEnvSchema,
    scope: "validation-worker-env"
  });

  return {
    ...values,
    SCANNER_CRAWLER_PUBLIC_URL: values.SCANNER_CRAWLER_PUBLIC_URL ?? values.VALIDATION_CRAWLER_PUBLIC_URL,
    ...getSupabaseAdminEnv(env)
  };
}
