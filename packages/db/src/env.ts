import { z } from "zod";

function formatIssuePath(path: (string | number)[]) {
  return path.length > 0 ? path.join(".") : "environment";
}

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
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

export const storageBucketEnvSchema = z
  .object({
    S3_BUCKET: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (value.S3_BUCKET) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["S3_BUCKET"],
      message: "S3_BUCKET is required"
    });
  });

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_READ_URL: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  DATABASE_SSL_MODE: z.preprocess(
    emptyStringToUndefined,
    z.enum(["disable", "prefer", "require", "verify-ca", "verify-full"]).optional()
  )
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

export type StorageBucketEnv = z.infer<typeof storageBucketEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type S3Env = z.infer<typeof s3EnvSchema>;

export function getStorageBucket(env: NodeJS.ProcessEnv = process.env) {
  const values = parseEnvironment({
    env,
    schema: storageBucketEnvSchema,
    scope: "storage-env"
  });

  return values.S3_BUCKET;
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
