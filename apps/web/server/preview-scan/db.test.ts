import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "../scans/local-v2-dag-scan-config";
import { buildPreviewScanInitialConfig } from "./db";

test("preview scan initial config switches to v2 DAG processor on localhost", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    normalizedUrl: "https://example.com/"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(config.profile, "standard");
  assert.equal(v2DagParallel?.profile, "standard");
  assert.equal(v2DagParallel?.scenarioPlanningMode, "planned_parallel");
  assert.equal(v2DagParallel?.policyOutputGraceMs, 1000);
  assert.equal(v2DagParallel?.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("preview scan initial config honors tiny local v2 DAG profile on localhost", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagScanProfile: "tiny",
    normalizedUrl: "https://example.com/"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(config.profile, "tiny");
  assert.equal(v2DagParallel?.profile, "tiny");
  assert.equal(v2DagParallel?.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("preview scan initial config marks Lambda v2 DAG dispatch when configured", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    normalizedUrl: "https://example.com/"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagLambda?.awsRegion, "us-west-1");
  assert.equal(v2DagLambda?.resultHandoff, "sqs");
  assert.equal(v2DagLambda?.targetEnvironment, "local");
  assert.equal(v2DagLambda?.vpcMode, "none");
  assert.equal(v2DagLambda?.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagLambda?.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("preview Lambda v2 DAG dispatch fails closed when env is missing", () => {
  assert.throws(
    () =>
      buildPreviewScanInitialConfig({
        env: {
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          NODE_ENV: "development"
        },
        hostname: "example.com",
        localV2DagRunViaLambda: true,
        normalizedUrl: "https://example.com/"
      }),
    /Lambda v2 DAG scanning is not configured/
  );
});

test("preview scan initial config keeps legacy processor away from localhost-only mode", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "https://certscore.ai",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    normalizedUrl: "https://example.com/"
  });

  assert.equal(config.processor, "live-preview-v1");
  assert.equal(config.execution?.v2DagParallel, undefined);
});
