import assert from "node:assert/strict";
import test from "node:test";
import { evaluateValidationCutoverContract } from "./check-validation-cutover-env";

test("main app contract fails when validation redis is still configured", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "certscore",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    REDIS_URL: "redis://cache.example.internal:6379",
    VALIDATION_OPS_BASE_URL: "https://validation.certscore.ai",
    VALIDATION_REDIS_URL: "redis://validation.example.internal:6379"
  });

  assert.ok(findings.some((finding) => finding.level === "fail" && finding.label === "main app validation redis"));
});

test("main app contract passes when validation host is external and validation redis is absent", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "certscore",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    REDIS_URL: "redis://cache.example.internal:6379",
    VALIDATION_OPS_BASE_URL: "https://validation.certscore.ai"
  });

  assert.equal(findings.some((finding) => finding.level === "fail"), false);
});

test("validation ops contract requires explicit validation redis and admin allowlist", () => {
  const findings = evaluateValidationCutoverContract({
    APP_FLAVOR: "validation_ops",
    BETTER_AUTH_SECRET: "x".repeat(32),
    DATABASE_URL: "postgresql://example",
    NEXT_PUBLIC_APP_URL: "https://validation.certscore.ai"
  });

  assert.ok(findings.some((finding) => finding.level === "fail" && finding.label === "validation ops redis"));
  assert.ok(findings.some((finding) => finding.level === "fail" && finding.label === "validation ops admins"));
});
