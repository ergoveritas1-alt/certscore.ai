import { z } from "zod";

function formatIssuePath(path: (string | number)[]) {
  return path.length > 0 ? path.join(".") : "environment";
}

function parseEnvironment<TSchema extends z.ZodTypeAny>(input: {
  env?: NodeJS.ProcessEnv;
  schema: TSchema;
  scope: string;
}): z.infer<TSchema> {
  const result = input.schema.safeParse(input.env ?? process.env);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  throw new Error(`[${input.scope}] Invalid environment configuration. ${details}`);
}

export const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

export const supabaseAdminEnvSchema = supabasePublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export const storageBucketEnvSchema = z
  .object({
    S3_BUCKET: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET_REPORTS: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.S3_BUCKET || value.SUPABASE_STORAGE_BUCKET || value.SUPABASE_STORAGE_BUCKET_REPORTS) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["S3_BUCKET"],
      message: "S3_BUCKET (or legacy SUPABASE_STORAGE_BUCKET / SUPABASE_STORAGE_BUCKET_REPORTS) is required"
    });
  });

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_READ_URL: z.string().min(1).optional(),
  DATABASE_SSL_MODE: z.enum(["disable", "prefer", "require", "verify-ca", "verify-full"]).optional()
});

export const s3EnvSchema = z.object({
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => (value === "true" || value === "1" ? true : value === "false" || value === "0" ? false : undefined)),
  S3_REGION: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
});

export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminEnvSchema>;
export type StorageBucketEnv = z.infer<typeof storageBucketEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type S3Env = z.infer<typeof s3EnvSchema>;

export function getSupabasePublicEnv(env: NodeJS.ProcessEnv = process.env): SupabasePublicEnv {
  return parseEnvironment({
    env,
    schema: supabasePublicEnvSchema,
    scope: "supabase-public-env"
  });
}

export function hasSupabasePublicEnv(env: NodeJS.ProcessEnv = process.env) {
  return supabasePublicEnvSchema.safeParse(env).success;
}

export function hasSupabaseAdminEnv(env: NodeJS.ProcessEnv = process.env) {
  return supabaseAdminEnvSchema.safeParse(env).success;
}

export function getSupabaseAdminEnv(env: NodeJS.ProcessEnv = process.env): SupabaseAdminEnv {
  return parseEnvironment({
    env,
    schema: supabaseAdminEnvSchema,
    scope: "supabase-admin-env"
  });
}

export function getStorageBucket(env: NodeJS.ProcessEnv = process.env) {
  const values = parseEnvironment({
    env,
    schema: storageBucketEnvSchema,
    scope: "supabase-storage-env"
  });

  return values.S3_BUCKET ?? values.SUPABASE_STORAGE_BUCKET ?? values.SUPABASE_STORAGE_BUCKET_REPORTS!;
}

export function hasDatabaseEnv(env: NodeJS.ProcessEnv = process.env) {
  return databaseEnvSchema.safeParse(env).success;
}

export function getDatabaseEnv(env: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  return parseEnvironment({
    env,
    schema: databaseEnvSchema,
    scope: "database-env"
  });
}

export function hasS3Env(env: NodeJS.ProcessEnv = process.env) {
  return s3EnvSchema.safeParse(env).success;
}

export function getS3Env(env: NodeJS.ProcessEnv = process.env): S3Env {
  return parseEnvironment({
    env,
    schema: s3EnvSchema,
    scope: "s3-env"
  });
}
