import assert from "node:assert/strict";
import test from "node:test";
import { getS3Env, hasS3Env } from "./env";

const baseEnv = {
  S3_BUCKET: "certscore-artifacts",
  S3_REGION: "us-west-1"
};

test("accepts task-role S3 configuration without static credentials", () => {
  assert.equal(hasS3Env(baseEnv), true);
  assert.deepEqual(getS3Env(baseEnv), baseEnv);
});

test("accepts an explicit S3 credential pair for local compatible storage", () => {
  const env = {
    ...baseEnv,
    S3_ACCESS_KEY_ID: "local-access-key",
    S3_SECRET_ACCESS_KEY: "local-secret-key"
  };

  assert.equal(hasS3Env(env), true);
  assert.deepEqual(getS3Env(env), env);
});

test("rejects a partial explicit S3 credential pair", () => {
  assert.equal(hasS3Env({ ...baseEnv, S3_ACCESS_KEY_ID: "partial" }), false);
  assert.throws(
    () => getS3Env({ ...baseEnv, S3_ACCESS_KEY_ID: "partial" }),
    /S3_SECRET_ACCESS_KEY: S3 access key id and secret access key must be configured together/
  );
});
