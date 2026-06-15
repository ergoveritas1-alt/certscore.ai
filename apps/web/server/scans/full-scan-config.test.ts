import assert from "node:assert/strict";
import test from "node:test";
import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import { buildQueuedFullScanConfig, requiresFreshScanForCaliforniaRuntime } from "./full-scan-config";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  applyLocalV2DagScanConfig,
  shouldUseLocalV2DagScanTool
} from "./local-v2-dag-scan-config";

test("queued full-scan config keeps anonymous and organization-owned scanner contract aligned", () => {
  const baseInput = {
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage"
  };

  const anonymousConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "marketing-anonymous-full-scan"
  });
  const organizationConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "manual-dashboard"
  });

  assert.deepEqual(
    { ...anonymousConfig, source: "normalized-for-comparison" },
    { ...organizationConfig, source: "normalized-for-comparison" }
  );
  assert.equal(anonymousConfig.processor, "queued-full-scan-v1");
  assert.equal(anonymousConfig.maxRequestedTier, "tier5_full_scan");
  assert.equal(anonymousConfig.freshBrowserRequired, true);
  assert.ok(anonymousConfig.execution?.crawlSeedHints?.some((hint) =>
    hint.source === "canonical_legal_surface_hint" &&
    hint.hintType === "privacy_policy" &&
    hint.url === "https://example.com/privacy-policy"
  ));
});

test("queued full-scan config carries prior scan acceleration only as execution metadata", () => {
  const config = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    priorScanAcceleration: {
      crawlSeedHints: [
        {
          confidence: 0.91,
          hintType: "privacy_policy",
          source: "prior_scan_hint",
          sourceCompletedAt: "2026-05-01T00:00:00.000Z",
          sourceScanId: "scan-prior",
          url: "https://example.com/privacy"
        },
        {
          confidence: 0.65,
          hintType: "homepage_final_url",
          source: "prior_scan_hint",
          sourceCompletedAt: "2026-05-01T00:00:00.000Z",
          sourceScanId: "scan-prior",
          url: "https://www.example.com/"
        }
      ],
      priorScan: {
        crawlSeedHintCount: 2,
        crawlSeedHintTypes: ["privacy_policy", "homepage_final_url"],
        selectedDocumentSourceCount: 1,
        selectedHighYieldPageCount: 1,
        sourceCompletedAt: "2026-05-01T00:00:00.000Z",
        sourceScanId: "scan-prior"
      },
      priorDocumentSources: [
        {
          canonicalUrl: "https://example.com/privacy",
          documentText: "Privacy Policy. We describe personal information rights.",
          documentType: "privacy_policy",
          sourceCompletedAt: "2026-05-01T00:00:00.000Z",
          sourceScanId: "scan-prior",
          sourceUrl: "https://example.com/privacy",
          title: "Privacy Policy"
        }
      ]
    },
    profile: "homepage",
    source: "manual-dashboard"
  });

  assert.deepEqual(config.execution?.priorScanAcceleration, {
    crawlSeedHintCount: 2,
    crawlSeedHintTypes: ["privacy_policy", "homepage_final_url"],
    selectedDocumentSourceCount: 1,
    selectedHighYieldPageCount: 1,
    sourceCompletedAt: "2026-05-01T00:00:00.000Z",
    sourceScanId: "scan-prior"
  });
  assert.deepEqual(config.execution?.priorDocumentSources, [
    {
      canonicalUrl: "https://example.com/privacy",
      documentText: "Privacy Policy. We describe personal information rights.",
      documentType: "privacy_policy",
      sourceCompletedAt: "2026-05-01T00:00:00.000Z",
      sourceScanId: "scan-prior",
      sourceUrl: "https://example.com/privacy",
      title: "Privacy Policy"
    }
  ]);
  assert.deepEqual(config.execution?.crawlSeedHints?.slice(0, 2), [
      {
        confidence: 0.91,
        hintType: "privacy_policy",
        source: "prior_scan_hint",
        sourceCompletedAt: "2026-05-01T00:00:00.000Z",
        sourceScanId: "scan-prior",
        url: "https://example.com/privacy"
      },
      {
        confidence: 0.65,
        hintType: "homepage_final_url",
        source: "prior_scan_hint",
        sourceCompletedAt: "2026-05-01T00:00:00.000Z",
        sourceScanId: "scan-prior",
        url: "https://www.example.com/"
      }
    ]);
  assert.ok(config.execution?.crawlSeedHints?.some((hint) =>
    hint.source === "canonical_legal_surface_hint" &&
    hint.url === "https://example.com/privacy-notice"
  ));
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config carries explicit California privacy runtime flags without evidence shortcuts", () => {
  const defaultConfig = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "california-cohort-validation"
  });

  assert.equal(Object.hasOwn(defaultConfig, "californiaPrivacy"), false);

  const californiaGeoConfig = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "california",
    source: "manual-dashboard"
  });

  assert.deepEqual(californiaGeoConfig.californiaPrivacy, {
    exercisePrivacyChoicePath: true,
    forceGpcVerification: true
  });
  assert.equal(
    requiresFreshScanForCaliforniaRuntime({
      scanFrom: "california"
    }),
    true
  );
  assert.equal(
    requiresFreshScanForCaliforniaRuntime({
      scanFrom: "default"
    }),
    false
  );

  const config = buildQueuedFullScanConfig({
    californiaPrivacy: {
      exercisePrivacyChoicePath: true,
      forceGpcVerification: true
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "california-cohort-validation"
  });

  assert.deepEqual(config.californiaPrivacy, {
    exercisePrivacyChoicePath: true,
    forceGpcVerification: true
  });
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config keeps post-opt-out interaction explicit", () => {
  const config = buildQueuedFullScanConfig({
    californiaPrivacy: {
      forceGpcVerification: true
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "california-cohort-validation"
  });

  assert.deepEqual(config.californiaPrivacy, {
    forceGpcVerification: true
  });
});

test("queued full-scan config keeps default scans out of California deep-check runtime", () => {
  const config = buildQueuedFullScanConfig({
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });

  assert.equal(config.californiaPrivacy, undefined);
});

test("queued full-scan config honors explicit California runtime suppression flags", () => {
  const config = buildQueuedFullScanConfig({
    californiaPrivacy: {
      exercisePrivacyChoicePath: false,
      forceGpcVerification: false
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "california",
    source: "operator"
  });

  assert.equal(config.californiaPrivacy, undefined);
  assert.equal(
    requiresFreshScanForCaliforniaRuntime({
      californiaPrivacy: {
        exercisePrivacyChoicePath: false,
        forceGpcVerification: false
      },
      scanFrom: "california"
    }),
    false
  );
});

test("localhost scan configs use the local v2 planned-parallel DAG processor only", () => {
  const config = applyLocalV2DagScanConfig(
    {
      hostname: "example.com",
      normalizedUrl: "https://example.com/",
      processor: "queued-full-scan-v1",
      profile: "homepage",
      source: "manual-dashboard"
    } satisfies SharedScanConfig,
    {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    }
  );

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(config.profile, "full");
  assert.deepEqual(config.execution?.v2DagParallel as Record<string, unknown> | undefined, {
    artifactOnly: true,
    consentFlowDeadlineMs: 30000,
    localOnly: true,
    plannedParallel: true,
    policyPlanningDeadlineMs: 1500,
    productionFindingIntegration: false,
    profile: "full",
    scenarioConcurrency: 2,
    scenarioPlanningMode: "planned_parallel",
    scenarioResourceMode: "lean",
    tool: "certscore-scan-core"
  });
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("local v2 DAG scan switch is disabled away from localhost and in production", () => {
  assert.equal(
    shouldUseLocalV2DagScanTool({
      NEXT_PUBLIC_APP_URL: "https://certscore.ai",
      NODE_ENV: "development"
    }),
    false
  );
  assert.equal(
    shouldUseLocalV2DagScanTool({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "production"
    }),
    false
  );
  assert.equal(
    shouldUseLocalV2DagScanTool({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    }),
    true
  );
});

test("queued full-scan config emits v2 DAG metadata on localhost without evidence shortcuts", () => {
  const config = buildQueuedFullScanConfig({
    californiaPrivacy: {
      exercisePrivacyChoicePath: true,
      forceGpcVerification: true
    },
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(config.profile, "full");
  assert.equal(v2DagParallel?.profile, "full");
  assert.equal(v2DagParallel?.scenarioPlanningMode, "planned_parallel");
  assert.deepEqual(config.californiaPrivacy, {
    exercisePrivacyChoicePath: true,
    forceGpcVerification: true
  });
  assert.ok(config.execution?.crawlSeedHints?.some((hint) => hint.source === "canonical_legal_surface_hint"));
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config honors tiny local v2 DAG profile on localhost", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagScanProfile: "tiny",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(config.profile, "tiny");
  assert.equal(v2DagParallel?.profile, "tiny");
  assert.equal(v2DagParallel?.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config marks local v2 DAG Lambda dispatch when configured", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagParallel?.tool, "certscore-scan-core");
  assert.equal(v2DagParallel?.productionFindingIntegration, false);
  assert.deepEqual(v2DagLambda, {
    artifactOnly: true,
    awsRegion: "us-west-1",
    callbackCorrelationId: "scan_id",
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    dispatchState: "pending_dispatch",
    functionName: "certscore-v2-dag-dev",
    localOnly: true,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    vpcMode: "none"
  });
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan Lambda option fails closed when AWS handoff env is missing", () => {
  assert.throws(
    () =>
      buildQueuedFullScanConfig({
        env: {
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          NODE_ENV: "development"
        },
        hostname: "example.com",
        localV2DagRunViaLambda: true,
        maxPages: 3,
        normalizedUrl: "https://example.com/",
        profile: "homepage",
        source: "manual-dashboard"
      }),
    /Lambda v2 DAG scanning is not configured/
  );
});
