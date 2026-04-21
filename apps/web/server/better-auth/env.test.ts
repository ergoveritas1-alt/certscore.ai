import assert from "node:assert/strict";
import test from "node:test";
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
