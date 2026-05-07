import { z } from "zod";
import { pathToFileURL } from "node:url";

const schema = z.object({
  APP_FLAVOR: z.enum(["certscore", "validation_ops"]).optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  CERTSCORE_ADMIN_EMAILS: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  VALIDATION_OPS_BASE_URL: z.string().url().optional()
});

type ValidationCutoverEnv = z.infer<typeof schema>;

function getHostname(value: string | undefined) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalhostUrl(value: string | undefined) {
  const hostname = getHostname(value);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function pass(label: string, details: string) {
  console.info(`PASS ${label}: ${details}`);
}

function fail(label: string, details: string) {
  console.error(`FAIL ${label}: ${details}`);
}

function info(label: string, details: string) {
  console.info(`INFO ${label}: ${details}`);
}

export function evaluateValidationCutoverContract(env: ValidationCutoverEnv) {
  const findings: Array<{ details: string; label: string; level: "fail" | "info" | "pass" }> = [];
  const appFlavor = env.APP_FLAVOR === "validation_ops" ? "validation_ops" : "certscore";

  findings.push({
    label: "app flavor",
    level: "info",
    details: appFlavor
  });

  if (appFlavor === "validation_ops") {
    if (!env.NEXT_PUBLIC_APP_URL) {
      findings.push({
        label: "validation ops app url",
        level: "fail",
        details: "Set NEXT_PUBLIC_APP_URL for the dedicated validation ops host."
      });
    } else if (isLocalhostUrl(env.NEXT_PUBLIC_APP_URL)) {
      findings.push({
        label: "validation ops app url",
        level: "fail",
        details: "NEXT_PUBLIC_APP_URL must be the public validation ops origin, not localhost. Set it to the active production host before building or deploying."
      });
    } else {
      findings.push({
        label: "validation ops app url",
        level: "pass",
        details: env.NEXT_PUBLIC_APP_URL
      });
    }

    if (!env.DATABASE_URL) {
      findings.push({
        label: "validation ops database",
        level: "fail",
        details: "Set DATABASE_URL on the dedicated validation ops deployment."
      });
    } else {
      findings.push({
        label: "validation ops database",
        level: "pass",
        details: "DATABASE_URL is configured."
      });
    }

    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
      findings.push({
        label: "validation ops auth",
        level: "fail",
        details: "Set BETTER_AUTH_SECRET with at least 32 characters on the dedicated validation ops deployment."
      });
    } else {
      findings.push({
        label: "validation ops auth",
        level: "pass",
        details: "BETTER_AUTH_SECRET is configured."
      });
    }

    if (!env.CERTSCORE_ADMIN_EMAILS?.trim()) {
      findings.push({
        label: "validation ops admins",
        level: "fail",
        details: "Set CERTSCORE_ADMIN_EMAILS so the dedicated validation ops host has an explicit admin allowlist."
      });
    } else {
      findings.push({
        label: "validation ops admins",
        level: "pass",
        details: env.CERTSCORE_ADMIN_EMAILS
      });
    }

    if (env.VALIDATION_OPS_BASE_URL && env.NEXT_PUBLIC_APP_URL && env.VALIDATION_OPS_BASE_URL !== env.NEXT_PUBLIC_APP_URL) {
      findings.push({
        label: "validation ops base url",
        level: "fail",
        details: "VALIDATION_OPS_BASE_URL should be unset on the dedicated validation deployment or match NEXT_PUBLIC_APP_URL."
      });
    }
  } else {
    if (!env.VALIDATION_OPS_BASE_URL) {
      findings.push({
        label: "main app validation host",
        level: "fail",
        details: "Set VALIDATION_OPS_BASE_URL on the main app so validation admin flows can deep-link to the dedicated host."
      });
    } else {
      findings.push({
        label: "main app validation host",
        level: "pass",
        details: env.VALIDATION_OPS_BASE_URL
      });
    }

    if (env.VALIDATION_OPS_BASE_URL && env.NEXT_PUBLIC_APP_URL && env.VALIDATION_OPS_BASE_URL === env.NEXT_PUBLIC_APP_URL) {
      findings.push({
        label: "main app validation host",
        level: "fail",
        details: "VALIDATION_OPS_BASE_URL must point at the dedicated validation host, not the main app origin."
      });
    }
  }

  return findings;
}

function main() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(issue.path.join("."), issue.message);
    }
    process.exitCode = 1;
    return;
  }

  const findings = evaluateValidationCutoverContract(result.data);
  let hasFailure = false;

  for (const finding of findings) {
    if (finding.level === "fail") {
      hasFailure = true;
      fail(finding.label, finding.details);
      continue;
    }

    if (finding.level === "pass") {
      pass(finding.label, finding.details);
      continue;
    }

    info(finding.label, finding.details);
  }

  if (!hasFailure) {
    pass("validation cutover contract", "Environment matches the intended main-app or validation-ops split contract.");
    return;
  }

  process.exitCode = 1;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main();
}
