import { z } from "zod";

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

export function getBetterAuthEnv(env: NodeJS.ProcessEnv = process.env): BetterAuthEnv {
  return betterAuthEnvSchema.parse(env);
}
