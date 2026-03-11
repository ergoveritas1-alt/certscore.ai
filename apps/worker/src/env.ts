import { getSupabaseAdminEnv, type SupabaseAdminEnv } from "@website-signal-risk-scanner/db";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

const workerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional()
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
