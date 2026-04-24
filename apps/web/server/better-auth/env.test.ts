import assert from "node:assert/strict";
import test from "node:test";
import { ZodIssueCode } from "zod";
import { getBetterAuthBaseURLConfig, isBetterAuthConfigurationError } from "./env";

test("classifies Better Auth env error messages as configuration errors", () => {
  assert.equal(
    isBetterAuthConfigurationError(new Error("BETTER_AUTH_SECRET is required for Better Auth configuration.")),
    true
  );
});

test("does not classify unrelated errors as Better Auth configuration errors", () => {
  assert.equal(isBetterAuthConfigurationError(new Error("database unavailable")), false);
});

test("classifies zod-like errors from another module copy as configuration errors", () => {
  const thrown = {
    issues: [
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        message: "Required",
        path: ["BETTER_AUTH_SECRET"],
        received: "undefined"
      }
    ],
    name: "ZodError"
  };

  assert.equal(isBetterAuthConfigurationError(thrown), true);
});

test("builds dynamic Better Auth base URL config for known production and local hosts", () => {
  const config = getBetterAuthBaseURLConfig({
    BETTER_AUTH_SECRET: "12345678901234567890123456789012",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false"
  });

  assert.equal(config.fallback, "https://certscore.ai");
  assert.equal(config.protocol, "auto");
  assert.deepEqual(
    config.allowedHosts,
    [
      "certscore.ai",
      "www.certscore.ai",
      "localhost:3000",
      "127.0.0.1:3000",
      "localhost:3003",
      "127.0.0.1:3003"
    ]
  );
});
