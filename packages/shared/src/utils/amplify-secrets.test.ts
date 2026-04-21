import assert from "node:assert/strict";
import test from "node:test";
import { mergeAmplifyEnvironmentSecrets, readAmplifyEnvironmentSecrets } from "./amplify-secrets";

test("reads Amplify Gen 1 environment secrets from process.env.secrets JSON", () => {
  const env = {
    secrets: JSON.stringify({
      BETTER_AUTH_SECRET: "secret-value",
      DATABASE_URL: "postgres://example"
    })
  } as NodeJS.ProcessEnv;

  assert.deepEqual(readAmplifyEnvironmentSecrets(env), {
    BETTER_AUTH_SECRET: "secret-value",
    DATABASE_URL: "postgres://example"
  });
});

test("ignores invalid Amplify secrets payloads", () => {
  const env = {
    secrets: "{not-json"
  } as NodeJS.ProcessEnv;

  assert.deepEqual(readAmplifyEnvironmentSecrets(env), {});
});

test("explicit environment variables override Amplify secret values", () => {
  const env = {
    DATABASE_URL: "postgres://explicit",
    secrets: JSON.stringify({
      DATABASE_URL: "postgres://secret",
      S3_BUCKET: "scan-artifacts"
    })
  } as NodeJS.ProcessEnv;

  assert.deepEqual(mergeAmplifyEnvironmentSecrets(env), {
    DATABASE_URL: "postgres://explicit",
    S3_BUCKET: "scan-artifacts",
    secrets: env.secrets
  });
});
