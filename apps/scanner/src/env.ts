import { getSupabaseAdminEnv, type SupabaseAdminEnv } from "@website-signal-risk-scanner/db";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

const scannerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WORKER_CONCURRENCY: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(10).default(2)),
  SCANNER_POLL_INTERVAL_MS: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(500).max(60_000).default(3_000)),
  SCANNER_STALE_SCAN_THRESHOLD_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(60_000).max(24 * 60 * 60 * 1000).default(60 * 60 * 1000)
  ),
  SCANNER_CRAWLER_NAME: z.preprocess(emptyStringToUndefined, z.string().min(1).default("SignalScannerBot")),
  SCANNER_CRAWLER_PUBLIC_URL: z.preprocess(emptyStringToUndefined, z.string().url().default("https://scanner.example")),
  PLAYWRIGHT_BROWSERS_PATH: z.preprocess(emptyStringToUndefined, z.string().min(1).optional())
});

export type ScannerEnv = z.infer<typeof scannerEnvSchema> & SupabaseAdminEnv;

export function getScannerEnv(env: NodeJS.ProcessEnv = process.env): ScannerEnv {
  const values = parseEnvironment({
    env,
    schema: scannerEnvSchema,
    scope: "scanner-env"
  });

  return {
    ...values,
    ...getSupabaseAdminEnv(env)
  };
}
