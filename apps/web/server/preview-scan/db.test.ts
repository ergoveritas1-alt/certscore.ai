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
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    normalizedUrl: "https://example.com/"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagLambda?.awsRegion, "eu-west-1");
  assert.equal(v2DagLambda?.resultHandoff, "sqs");
  assert.equal(v2DagLambda?.targetEnvironment, "local");
  assert.equal(v2DagLambda?.vpcMode, "none");
  assert.equal(v2DagLambda?.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagLambda?.simulatedLocalLambda, false);
  assert.equal(v2DagLambda?.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("preview scan initial config keeps Lambda-on scans on real regional AWS even when simulator env is set", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME: "certscore-v2-dag-ie",
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results",
      CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    normalizedUrl: "https://example.com/",
    scanFrom: "eu_ie"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(v2DagLambda?.awsRegion, "eu-west-1");
  assert.equal(v2DagLambda?.functionName, "certscore-v2-dag-ie");
  assert.equal(v2DagLambda?.resultQueueUrl, "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results");
  assert.equal(v2DagLambda?.simulatedLocalLambda, false);
});

test("preview scan initial config fails closed instead of simulating Lambda-on Ireland scans", () => {
  assert.throws(
    () =>
      buildPreviewScanInitialConfig({
        env: {
          CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
          CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
          CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          NODE_ENV: "development"
        },
        hostname: "example.com",
        localV2DagRunViaLambda: true,
        normalizedUrl: "https://example.com/",
        scanFrom: "eu_ie"
      }),
    /CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL/
  );
});

test("preview scan initial config honors requested Lambda scan location", () => {
  const config = buildPreviewScanInitialConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME: "certscore-v2-dag-usw",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/certscore-v2-dag-usw-results",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    normalizedUrl: "https://example.com/",
    scanFrom: "california"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(v2DagLambda?.awsRegion, "us-west-2");
  assert.equal(v2DagLambda?.functionName, "certscore-v2-dag-usw");
  assert.equal(v2DagLambda?.resultQueueUrl, "https://sqs.us-west-2.amazonaws.com/123/certscore-v2-dag-usw-results");
});

test("preview Lambda v2 DAG dispatch fails closed when queue region is stale", () => {
  assert.throws(
    () =>
      buildPreviewScanInitialConfig({
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
      }),
    /CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL region eu-west-1/
  );
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
