import assert from "node:assert/strict";
import test from "node:test";
import { ZodIssueCode } from "zod";
import { getBetterAuthEnv, isBetterAuthConfigurationError } from "./env";

test("classifies missing Better Auth env as configuration errors", () => {
  let thrown: unknown;

  try {
    getBetterAuthEnv({
      NEXT_PUBLIC_APP_URL: "https://certscore.ai"
    } as unknown as NodeJS.ProcessEnv);
  } catch (error) {
    thrown = error;
  }

  assert.equal(isBetterAuthConfigurationError(thrown), true);
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
