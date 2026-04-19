import { getDatabaseEnv, type DatabaseEnv } from "@website-signal-risk-scanner/db";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

const workerEnvSchema = z.object({
  OPENAI_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  LLM_ENRICHMENT_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional()).transform((value) => value === "1"),
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
  VALIDATION_NANO_MODEL: z.preprocess(emptyStringToUndefined, z.string().min(1).default("gpt-5.4-nano")),
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
  WORKER_CONCURRENCY: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(10).default(1)),
  PLAYWRIGHT_BROWSERS_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  WORKER_BROWSER_REAPER_ENABLED: z.preprocess(emptyStringToUndefined, z.enum(["0", "1"]).optional()).transform((value) => value !== "0"),
  WORKER_BROWSER_REAPER_INTERVAL_MINUTES: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(1).max(60).default(5)
  ),
  WORKER_BROWSER_REAPER_STALE_MINUTES: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(5).max(240).default(20)
  )
});

export type WorkerEnv = z.infer<typeof workerEnvSchema> & DatabaseEnv;

export function getWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const values = parseEnvironment({
    env,
    schema: workerEnvSchema,
    scope: "validation-worker-env"
  });

  return {
    ...values,
    SCANNER_CRAWLER_PUBLIC_URL: values.SCANNER_CRAWLER_PUBLIC_URL ?? values.VALIDATION_CRAWLER_PUBLIC_URL,
    ...getDatabaseEnv(env)
  };
}
