import { mergeAmplifyEnvironmentSecrets } from "@website-signal-risk-scanner/shared";
import { ZodError, z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "1" || normalized === "true") {
        return true;
      }
      if (normalized === "0" || normalized === "false") {
        return false;
      }
    }

    return value;
  }, z.boolean());
}

const betterAuthEnvSchema = z
  .object({
    BETTER_AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: envBoolean(false)
  })
  .superRefine((value, ctx) => {
    if (value.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && !value.GOOGLE_CLIENT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GOOGLE_CLIENT_ID is required when Google auth is enabled.",
        path: ["GOOGLE_CLIENT_ID"]
      });
    }

    if (value.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && !value.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GOOGLE_CLIENT_SECRET is required when Google auth is enabled.",
        path: ["GOOGLE_CLIENT_SECRET"]
      });
    }
  });

export type BetterAuthEnv = z.infer<typeof betterAuthEnvSchema>;
type BetterAuthEnvInput = Record<string, string | boolean | undefined>;

export const BETTER_AUTH_KNOWN_ALLOWED_HOSTS = [
  "certscore.ai",
  "www.certscore.ai",
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost:3003",
  "127.0.0.1:3003"
] as const;

export function getBetterAuthEnv(env: BetterAuthEnvInput = process.env): BetterAuthEnv {
  return betterAuthEnvSchema.parse(mergeAmplifyEnvironmentSecrets(env as NodeJS.ProcessEnv));
}

export function getBetterAuthBaseURLConfig(env: BetterAuthEnvInput = process.env) {
  const values = getBetterAuthEnv(env);
  const allowedHosts = new Set<string>(BETTER_AUTH_KNOWN_ALLOWED_HOSTS);

  allowedHosts.add(new URL(values.NEXT_PUBLIC_APP_URL).host);

  return {
    allowedHosts: Array.from(allowedHosts),
    fallback: values.NEXT_PUBLIC_APP_URL,
    protocol: "auto" as const
  };
}

const BETTER_AUTH_ENV_KEYS = new Set([
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED"
]);

type ZodLikeIssue = {
  path?: unknown[];
};

function getZodLikeIssues(error: unknown): ZodLikeIssue[] {
  if (error instanceof ZodError) {
    return error.issues;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  ) {
    return (error as { issues: ZodLikeIssue[] }).issues;
  }

  return [];
}

export function isBetterAuthConfigurationError(error: unknown) {
  const issues = getZodLikeIssues(error);

  if (issues.length > 0) {
    return issues.some((issue) => {
      const [pathSegment] = Array.isArray(issue.path) ? issue.path : [];
      return typeof pathSegment === "string" && BETTER_AUTH_ENV_KEYS.has(pathSegment);
    });
  }

  if (error instanceof Error) {
    return Array.from(BETTER_AUTH_ENV_KEYS).some((key) => error.message.includes(key));
  }

  return false;
}
