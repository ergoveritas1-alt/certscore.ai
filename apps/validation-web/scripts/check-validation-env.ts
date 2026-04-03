import { z } from "zod";

const validationWebCheckSchema = z.object({
  APP_FLAVOR: z.literal("validation_ops"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VALIDATION_REDIS_URL: z.string().url(),
  WEB_BOT_AUTH_ENABLED: z.enum(["0", "1"]).optional(),
  WEB_BOT_AUTH_PRIVATE_KEY_PEM: z.string().min(1).optional(),
  WEB_BOT_AUTH_SIGNATURE_AGENT_URL: z.string().url().optional(),
  WEB_BOT_AUTH_EXPIRES_SECONDS: z.string().optional(),
  WEB_BOT_AUTH_INCLUDE_NONCE: z.enum(["0", "1"]).optional()
});

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

function info(label: string, details: string) {
  console.info(`INFO ${label}: ${details}`);
}

function main() {
  const result = validationWebCheckSchema.safeParse(process.env);

  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }

    process.exitCode = 1;
    return;
  }

  const values = result.data;
  pass("validation web env", "All required validation web environment variables are present.");
  info("app url", new URL(values.NEXT_PUBLIC_APP_URL).origin);
  info("supabase host", new URL(values.NEXT_PUBLIC_SUPABASE_URL).host);
  info("validation redis host", new URL(values.VALIDATION_REDIS_URL).host);
  info("web bot auth enabled", values.WEB_BOT_AUTH_ENABLED ?? "0");
}

main();
