import { getDatabaseEnv, type DatabaseEnv } from "@website-signal-risk-scanner/db";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url()
});

const webServerEnvSchema = z.object({
  APP_FLAVOR: z.enum(["certscore", "validation_ops"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  VALIDATION_OPS_BASE_URL: z.string().url().optional(),
  VALIDATION_TRANCO_SOURCE_URL: z.string().url().optional(),
  VALIDATION_TRANCO_MIN_RANK: z.coerce.number().int().min(1).optional(),
  VALIDATION_TRANCO_MAX_RANK: z.coerce.number().int().min(1000).optional()
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type WebServerEnv = z.infer<typeof webServerEnvSchema> & DatabaseEnv;

export function getAppFlavor(env: NodeJS.ProcessEnv = process.env) {
  return env.APP_FLAVOR === "validation_ops" ? "validation_ops" : "certscore";
}

export function getValidationOpsBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.VALIDATION_OPS_BASE_URL?.trim() || "";
}

export function isValidationOpsApp(env: NodeJS.ProcessEnv = process.env) {
  return getAppFlavor(env) === "validation_ops";
}

export function getWebEnv(env: NodeJS.ProcessEnv = process.env): WebEnv {
  return parseEnvironment({
    env,
    schema: webEnvSchema,
    scope: "web-env"
  });
}

export function getWebServerEnv(env: NodeJS.ProcessEnv = process.env): WebServerEnv {
  const values = parseEnvironment({
    env,
    schema: webServerEnvSchema,
    scope: "web-server-env"
  });

  return {
    ...values,
    ...getDatabaseEnv(env)
  };
}

export function getQueueAvailability(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: true,
    reason: null
  } as const;
}

export function isGoogleAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}
