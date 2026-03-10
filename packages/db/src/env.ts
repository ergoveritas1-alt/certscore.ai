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
    SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET_REPORTS: z.string().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.SUPABASE_STORAGE_BUCKET || value.SUPABASE_STORAGE_BUCKET_REPORTS) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_STORAGE_BUCKET"],
      message: "SUPABASE_STORAGE_BUCKET (or legacy SUPABASE_STORAGE_BUCKET_REPORTS) is required"
    });
  });

export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;
export type SupabaseAdminEnv = z.infer<typeof supabaseAdminEnvSchema>;
export type StorageBucketEnv = z.infer<typeof storageBucketEnvSchema>;

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

  return values.SUPABASE_STORAGE_BUCKET ?? values.SUPABASE_STORAGE_BUCKET_REPORTS!;
}
