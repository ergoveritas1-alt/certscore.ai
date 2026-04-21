import { z } from "zod";
import { mergeAmplifyEnvironmentSecrets } from "./amplify-secrets";

function formatIssuePath(path: (string | number)[]) {
  return path.length > 0 ? path.join(".") : "environment";
}

export function parseEnvironment<TSchema extends z.ZodTypeAny>(input: {
  env?: NodeJS.ProcessEnv;
  schema: TSchema;
  scope: string;
}): z.infer<TSchema> {
  const result = input.schema.safeParse(mergeAmplifyEnvironmentSecrets(input.env ?? process.env));

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  throw new Error(`[${input.scope}] Invalid environment configuration. ${details}`);
}
