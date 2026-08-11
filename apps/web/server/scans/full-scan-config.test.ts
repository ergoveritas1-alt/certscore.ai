import assert from "node:assert/strict";
import test from "node:test";
import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  applyLocalV2DagScanConfig,
  normalizeLocalV2DagRunViaLambda,
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

test("queued full-scan config preserves validated campaign attribution for scan association", () => {
  const config = buildQueuedFullScanConfig({
    campaignAttribution: {
      utm_campaign: "privacy_agency_test",
      utm_medium: "newsletter",
      utm_source: "theadminbar"
    },
    hostname: "example.com",
    maxPages: 1,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "homepage-anonymous"
  });

  assert.deepEqual(config.campaignAttribution, {
    utm_campaign: "privacy_agency_test",
    utm_medium: "newsletter",
    utm_source: "theadminbar"
  });
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

test("queued full-scan config carries Tranco rank as site metadata only", () => {
  const config = buildQueuedFullScanConfig({
    hostname: "www.example.com",
    maxPages: 3,
    normalizedUrl: "https://www.example.com/",
    profile: "homepage",
    source: "manual-dashboard",
    trancoRankMetadata: {
      lookupHostname: "www.example.com",
      lookupRegistrableDomain: "example.com",
      matchType: "registrable_domain",
      matchedHostname: "example.com",
      rank: 123,
      rankBand: "top_1k",
      source: "validation_targets",
      sourceUpdatedAt: "2026-07-08T00:00:00.000Z"
    }
  });

  assert.deepEqual(config.siteMetadata?.tranco, {
    lookupHostname: "www.example.com",
    lookupRegistrableDomain: "example.com",
    matchType: "registrable_domain",
    matchedHostname: "example.com",
    rank: 123,
    rankBand: "top_1k",
    source: "validation_targets",
    sourceUpdatedAt: "2026-07-08T00:00:00.000Z"
  });
  assert.equal(Object.hasOwn(config.execution ?? {}, "tranco"), false);
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
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
  assert.equal(config.profile, "standard");
  assert.deepEqual(config.execution?.v2DagParallel as Record<string, unknown> | undefined, {
    artifactOnly: true,
    localOnly: true,
    plannedParallel: true,
    postConsentFlowsEnabled: false,
    policyOutputGraceMs: 1000,
    policyPlanningDeadlineMs: 1500,
    productionFindingIntegration: false,
    wc01ProductionProjection: {
      approved: true,
      pipeline: "normalized_concern_policy_unified_finding",
      version: "wc01.normalized-concern-policy.v1"
    },
    profile: "standard",
    scenarioConcurrency: 2,
    scenarioPlanningMode: "planned_parallel",
    scenarioResourceMode: "normal",
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

test("v2 DAG Lambda run flag defaults on only when Lambda handoff is fully configured", () => {
  assert.equal(
    normalizeLocalV2DagRunViaLambda(undefined, {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-prod",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-results"
    }),
    true
  );
  assert.equal(
    normalizeLocalV2DagRunViaLambda(undefined, {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-prod"
    }),
    false
  );
  assert.equal(
    normalizeLocalV2DagRunViaLambda("false", {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-prod",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-results"
    }),
    false
  );
});

test("queued full-scan config emits v2 DAG metadata on localhost without evidence shortcuts", () => {
  const config = buildQueuedFullScanConfig({
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
  assert.equal(config.profile, "standard");
  assert.equal(v2DagParallel?.profile, "standard");
  assert.equal(v2DagParallel?.scenarioPlanningMode, "planned_parallel");
  assert.equal(v2DagParallel?.postConsentFlowsEnabled, false);
  assert.equal(Object.hasOwn(config, "californiaPrivacy"), false);
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
      CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE: "sharded",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
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
  assert.equal(v2DagParallel?.postConsentFlowsEnabled, false);
  assert.deepEqual(v2DagLambda, {
    artifactOnly: true,
    awsRegion: "eu-west-1",
    callbackCorrelationId: "scan_id",
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    debugOverrides: {
      scenarioConcurrency: 1,
      scenarioResourceMode: "cmp_safe"
    },
    dispatchState: "pending_dispatch",
    functionName: "certscore-v2-dag-dev",
    localOnly: true,
    orchestrationMode: "sharded",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    simulatedLocalLambda: false,
    targetEnvironment: "local",
    vpcMode: "none"
  });
  assert.equal(Object.hasOwn(config, "findings"), false);
  assert.equal(Object.hasOwn(config, "signals"), false);
});

test("queued full-scan config uses location-specific Lambda functions and result queues", () => {
  const env = {
    CERTSCORE_V2_DAG_LAMBDA_EU_DE_ENABLED: "true",
    CERTSCORE_V2_DAG_LAMBDA_EU_DE_FUNCTION_NAME: "certscore-v2-dag-de",
    CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-de-results",
    CERTSCORE_V2_DAG_LAMBDA_EU_IE_ENABLED: "true",
    CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME: "certscore-v2-dag-ie",
    CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results",
    CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED: "true",
    CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME: "certscore-v2-dag-california",
    CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-california-results",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NODE_ENV: "development"
  } as const;
  const build = (scanFrom: "eu_de" | "eu_ie" | "california") =>
    buildQueuedFullScanConfig({
      env,
      hostname: "example.com",
      localV2DagRunViaLambda: true,
      maxPages: 3,
      normalizedUrl: "https://example.com/",
      profile: "homepage",
      scanFrom,
      source: "manual-dashboard"
    }).execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.deepEqual(
    ["eu_de", "eu_ie", "california"].map((scanFrom) => {
      const v2DagLambda = build(scanFrom as "eu_de" | "eu_ie" | "california");
      return {
        awsRegion: v2DagLambda?.awsRegion,
        functionName: v2DagLambda?.functionName,
        resultQueueUrl: v2DagLambda?.resultQueueUrl
      };
    }),
    [
      {
        awsRegion: "eu-central-1",
        functionName: "certscore-v2-dag-de",
        resultQueueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-de-results"
      },
      {
        awsRegion: "eu-west-1",
        functionName: "certscore-v2-dag-ie",
        resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results"
      },
      {
        awsRegion: "us-west-1",
        functionName: "certscore-v2-dag-california",
        resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-california-results"
      }
    ]
  );
});

test("queued full-scan config honors simulator env for Lambda-on localhost scans", () => {
  const config = buildQueuedFullScanConfig({
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
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "eu_ie",
    source: "manual-dashboard"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(v2DagLambda?.awsRegion, "eu-west-1");
  assert.equal(v2DagLambda?.functionName, "certscore-v2-dag-ie");
  assert.equal(v2DagLambda?.resultQueueUrl, "local://certscore-v2-dag-lambda-simulated-results");
  assert.equal(v2DagLambda?.simulatedLocalLambda, true);
});

test("queued full-scan config can simulate Lambda-on Ireland scans without a regional queue", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
      CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "eu_ie",
    source: "manual-dashboard"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(v2DagLambda?.awsRegion, "eu-west-1");
  assert.equal(v2DagLambda?.resultQueueUrl, "local://certscore-v2-dag-lambda-simulated-results");
  assert.equal(v2DagLambda?.simulatedLocalLambda, true);
});

test("queued full-scan config routes Lambda-off localhost scans through the simulated Lambda intent", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: false,
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "eu_ie",
    source: "manual-dashboard"
  });
  const v2DagLambda = config.execution?.v2DagLambda as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagLambda?.awsRegion, "eu-west-1");
  assert.equal(v2DagLambda?.functionName, "local-v2-dag-lambda-simulator");
  assert.equal(v2DagLambda?.resultQueueUrl, "local://certscore-v2-dag-lambda-simulated-results");
  assert.equal(v2DagLambda?.simulatedLocalLambda, true);
  assert.equal(v2DagLambda?.productionFindingIntegration, false);
});

test("queued full-scan config routes Lambda-off localhost scans to the local queue when enabled", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      CERTSCORE_LOCALHOST_FULL_SCAN_QUEUE_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: false,
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });
  const v2DagParallel = config.execution?.v2DagParallel as Record<string, unknown> | undefined;

  assert.equal(config.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(v2DagParallel?.tool, "certscore-scan-core");
  assert.equal(v2DagParallel?.productionFindingIntegration, false);
  assert.equal(config.execution?.v2DagLambda, undefined);
});

test("queued full-scan Lambda v2 DAG dispatch fails closed when queue region is stale", () => {
  assert.throws(
    () =>
      buildQueuedFullScanConfig({
        env: {
          CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
          CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
          CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
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
    /CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL region eu-west-1/
  );
});

test("queued full-scan config can dispatch v2 DAG Lambda outside localhost when explicitly enabled", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-prod",
      CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE: "sharded",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-prod-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://certscore.ai",
      NODE_ENV: "production"
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
  assert.equal(config.profile, "standard");
  assert.equal(v2DagParallel?.profile, "standard");
  assert.equal(v2DagParallel?.postConsentFlowsEnabled, false);
  assert.equal(v2DagLambda?.functionName, "certscore-v2-dag-prod");
  assert.equal(v2DagLambda?.localOnly, false);
  assert.equal(v2DagLambda?.targetEnvironment, "production");
  assert.equal(v2DagLambda?.vpcMode, "vpc");
  assert.equal(v2DagLambda?.productionFindingIntegration, false);
  assert.deepEqual(v2DagLambda?.debugOverrides, {
    scenarioConcurrency: 1,
    scenarioResourceMode: "cmp_safe"
  });
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
