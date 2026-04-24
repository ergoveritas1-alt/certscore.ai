import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleAuthAllowedHosts, isGoogleAuthAllowedForHost } from "./env";

function makeEnv(input: Record<string, string>): NodeJS.ProcessEnv {
  return input as unknown as NodeJS.ProcessEnv;
}

test("google auth allowed hosts match Better Auth local and production hosts", () => {
  const allowedHosts = getGoogleAuthAllowedHosts(makeEnv({
    NEXT_PUBLIC_APP_URL: "https://certscore.ai"
  }));

  assert.deepEqual(Array.from(allowedHosts), [
    "certscore.ai",
    "www.certscore.ai",
    "localhost:3000",
    "127.0.0.1:3000",
    "localhost:3003",
    "127.0.0.1:3003"
  ]);
});

test("google auth allows the configured app host in addition to known defaults", () => {
  assert.equal(
    isGoogleAuthAllowedForHost("preview.certscore.ai", makeEnv({
      NEXT_PUBLIC_APP_URL: "https://preview.certscore.ai"
    })),
    true
  );
});

test("google auth rejects unknown hosts", () => {
  assert.equal(
    isGoogleAuthAllowedForHost("malicious.example", makeEnv({
      NEXT_PUBLIC_APP_URL: "https://certscore.ai"
    })),
    false
  );
});
