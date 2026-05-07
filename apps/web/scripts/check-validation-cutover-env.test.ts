import assert from "node:assert/strict";
import test from "node:test";
import { evaluateValidationCutoverContract } from "./check-validation-cutover-env";

test("main app contract passes when validation host is external", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "certscore",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    VALIDATION_OPS_BASE_URL: "https://validation.certscore.ai"
  });

  assert.equal(findings.some((finding) => finding.level === "fail"), false);
});

test("validation ops contract requires admin allowlist", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "validation_ops",
    BETTER_AUTH_SECRET: "x".repeat(32),
    DATABASE_URL: "postgresql://example",
    NEXT_PUBLIC_APP_URL: "https://validation.certscore.ai"
  });

  assert.ok(findings.some((finding) => finding.level === "fail" && finding.label === "validation ops admins"));
});

test("validation ops contract rejects localhost app urls", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "validation_ops",
    BETTER_AUTH_SECRET: "x".repeat(32),
    CERTSCORE_ADMIN_EMAILS: "admin@example.com",
    DATABASE_URL: "postgresql://example",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000"
  });

  assert.ok(
    findings.some(
      (finding) =>
        finding.level === "fail" &&
        finding.label === "validation ops app url" &&
        finding.details.includes("not localhost")
    )
  );
});
