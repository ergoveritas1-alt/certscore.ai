import { getDatabaseEnv, type DatabaseEnv } from "@website-signal-risk-scanner/db";
import { getBetterAuthEnv } from "../server/better-auth/env";
import { parseEnvironment } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url()
});

const webServerEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  VALIDATION_REDIS_URL: z.string().url().optional(),
  VALIDATION_TRANCO_SOURCE_URL: z.string().url().optional(),
  VALIDATION_TRANCO_MIN_RANK: z.coerce.number().int().min(1).optional(),
  VALIDATION_TRANCO_MAX_RANK: z.coerce.number().int().min(1000).optional()
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type WebServerEnv = z.infer<typeof webServerEnvSchema> & DatabaseEnv;

export function getConfiguredRedisUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.REDIS_URL?.trim() || "";
}

export function getConfiguredValidationRedisUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.VALIDATION_REDIS_URL?.trim() || env.REDIS_URL?.trim() || "";
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
  try {
    return getBetterAuthEnv(env).NEXT_PUBLIC_AUTH_GOOGLE_ENABLED;
  } catch {
    return false;
  }
}
