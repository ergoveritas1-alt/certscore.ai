import { getSupabaseAdminEnv, type SupabaseAdminEnv } from "@website-signal-risk-scanner/db";
import { VALIDATION_DEFAULT_INTERVAL_MINUTES, VALIDATION_DEFAULT_RUN_MODE, parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

const workerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  LLM_ENRICHMENT_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional())
    .transform((value) => value === "1"),
  LLM_ENRICHMENT_TIMEOUT_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1000).max(60000).default(15000)
  ),
  LLM_ENRICHMENT_MAX_ATTEMPTS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(5).optional()
  ),
  LLM_ENRICHMENT_MAX_CHUNKS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(8).optional()
  ),
  LLM_ENRICHMENT_FORCE_LAST_CHUNK: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional()),
  REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_REDIS_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_PIPELINE_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional())
    .transform((value) => value !== "0"),
  VALIDATION_SCHEDULER_POLL_MINUTES: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(60).default(1)),
  VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(5).max(240).default(VALIDATION_DEFAULT_INTERVAL_MINUTES)
  ),
  VALIDATION_DEFAULT_RUN_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["manual", "automatic"]).default(VALIDATION_DEFAULT_RUN_MODE)
  ),
  VALIDATION_OPENAI_MODEL: z.preprocess(emptyStringToUndefined, z.string().min(1).default("gpt-5.4")),
  VALIDATION_TRANCO_MIN_RANK: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).default(1000)),
  VALIDATION_TRANCO_MAX_RANK: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).default(100000)),
  VALIDATION_TRANCO_SOURCE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  VALIDATION_CRAWLER_PUBLIC_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  WORKER_CONCURRENCY: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(10).default(2)),
  PLAYWRIGHT_BROWSERS_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional())
});

export type WorkerEnv = z.infer<typeof workerEnvSchema> & SupabaseAdminEnv;

export function getWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const values = parseEnvironment({
    env,
    schema: workerEnvSchema,
    scope: "worker-env"
  });

  return {
    ...values,
    ...getSupabaseAdminEnv(env)
  };
}
