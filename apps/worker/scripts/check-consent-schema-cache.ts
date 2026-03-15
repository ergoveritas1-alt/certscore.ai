import { createAdminClient } from "@website-signal-risk-scanner/db";
import { inspect } from "node:util";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

const CONSENT_SCHEMA_CHECKS = [
  {
    table: "scan_snapshots",
    columns: [
      "consent_accept_button_count",
      "consent_reject_button_count",
      "consent_preferences_button_count",
      "consent_interaction_model"
    ]
  },
  {
    table: "scan_runtime_artifacts",
    columns: [
      "consent_audit_completed",
      "consent_reject_click_count",
      "consent_accept_click_count",
      "consent_reject_reduced_tracking"
    ]
  }
] as const;

function fail(message: string) {
  console.error(`FAIL ${message}`);
}

function pass(message: string) {
  console.info(`PASS ${message}`);
}

function formatError(error: unknown) {
  if (!error) {
    return "No error details returned.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const candidate = error as {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
    };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : inspect(error, { depth: 4, breakLength: 120 });
  }

  return String(error);
}

function schemaReloadInstructions(host: string) {
  return [
    `Supabase REST schema cache looks stale for ${host}.`,
    "In the Supabase SQL editor for this project, run:",
    "NOTIFY pgrst, 'reload schema';",
    "If the REST API still serves the old schema, restart the project/API once."
  ].join(" ");
}

async function main() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(`${issue.path.join(".")}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const supabase = createAdminClient();
  const host = new URL(parsed.data.NEXT_PUBLIC_SUPABASE_URL).host;
  let allPassed = true;

  for (const check of CONSENT_SCHEMA_CHECKS) {
    const selectClause = check.columns.join(",");
    const { error } = await supabase.from(check.table).select(selectClause).limit(1);

    if (!error) {
      pass(`${check.table}: REST API recognizes ${check.columns.join(", ")}.`);
      continue;
    }

    allPassed = false;
    const formattedError = formatError(error);
    const normalized = formattedError.toLowerCase();
    if (
      normalized.includes("schema cache") ||
      normalized.includes("could not find the") ||
      normalized.includes("does not exist") ||
      normalized.includes("42703")
    ) {
      fail(`${check.table}: ${formattedError} ${schemaReloadInstructions(host)}`);
      continue;
    }

    fail(`${check.table}: ${formattedError}`);
  }

  if (!allPassed) {
    process.exitCode = 1;
    return;
  }

  pass(`Consent schema cache checks passed for ${host}.`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Unknown consent schema check failure");
  process.exitCode = 1;
});
