import assert from "node:assert/strict";
import test from "node:test";
import { ZodIssueCode } from "zod";
import { isBetterAuthConfigurationError } from "./env";

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
