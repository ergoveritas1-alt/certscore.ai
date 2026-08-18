import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalEvidenceBundleSchema,
  type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  type LocalV2DagLambdaDispatchPayload,
  uploadAuxiliaryArtifactFiles,
} from "./handler.js";
import {
  applyHomepageScreenshotSafetyGate,
  createHomepageScreenshotSafetyReviewCoordinator,
  createOpenAiScreenshotSafetyClassifier,
  SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS,
  SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS,
} from "./screenshot-safety.js";

test("safe homepage screenshots enter the existing retained artifact path", async () => {
  const directory = await testDirectory("safe");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("safe screenshot bytes"));
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: bundleFixture(screenshotPath),
      classifier: async () => ({ safeForDisplay: true }),
    });

    assert.deepEqual(result.homepageScreenshot, { status: "available" });
    assert.equal(result.screenshots[0]?.retentionStatus, "available");
    assert.equal(result.screenshots[0]?.displayStatus, "available");
    assert.equal(result.artifactRefs.length, 1);
    assert.equal((await stat(screenshotPath)).isFile(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit homepage screenshots are deleted while non-image evidence is preserved", async () => {
  const directory = await testDirectory("explicit");
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("explicit screenshot bytes"));
    const source = bundleFixture(screenshotPath);
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      classifier: async () => ({ safeForDisplay: false }),
    });

    assert.deepEqual(result.homepageScreenshot, {
      status: "withheld",
      reason: "sensitive_visual_content",
    });
    assert.equal(result.screenshots[0]?.retentionStatus, "withheld");
    assert.equal(result.screenshots[0]?.withheldReason, "sensitive_visual_content");
    assert.equal(result.screenshots[0]?.displayStatus, "withheld");
    assert.equal(result.screenshots[0]?.displayWithheldReason, "sensitive_visual_content");
    assert.equal(result.artifactRefs.some((artifact) => artifact.artifactType === "screenshot"), false);
    assert.equal(result.visualCapture?.artifactRefs.some(
      (artifact) => artifact.artifactType === "screenshot",
    ), false);
    assert.equal(
      result.derivedRuntimeSignals.thirdPartyVendorsObserved,
      source.derivedRuntimeSignals.thirdPartyVendorsObserved,
      "non-image scan evidence must remain unchanged",
    );
    await assert.rejects(stat(screenshotPath), /ENOENT/);

    let uploadCount = 0;
    const uploaded = await uploadAuxiliaryArtifactFiles({
      artifactRoot: directory,
      payload: payloadFixture(),
      s3Client: {
        async send() {
          uploadCount += 1;
          return { $metadata: {} };
        },
      },
    });
    assert.equal(uploaded.length, 0);
    assert.equal(uploadCount, 0);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    await rm(directory, { recursive: true, force: true });
  }
});

test("classifier errors fail closed without stopping non-image scan evidence", async () => {
  const directory = await testDirectory("unavailable");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("temporary screenshot bytes"));
    const source = bundleFixture(screenshotPath);
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      classifier: async () => {
        throw new Error("classifier timeout");
      },
    });

    assert.deepEqual(result.homepageScreenshot, {
      status: "withheld",
      reason: "safety_check_unavailable",
      failureCode: "moderation_transport_error",
    });
    assert.equal(result.scanId, source.scanId);
    assert.equal(result.derivedRuntimeSignals.thirdPartyVendorsObserved, true);
    assert.equal(result.artifactRefs.some((artifact) => artifact.artifactType === "screenshot"), false);
    assert.equal(result.screenshots[0]?.retentionStatus, "withheld");
    assert.equal(result.screenshots[0]?.withheldReason, "safety_check_unavailable");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("previously display-withheld screenshots are removed from retained storage", async () => {
  const directory = await testDirectory("previous-display-withheld");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("previously retained blocked screenshot bytes"));
    const source = bundleFixture(screenshotPath);
    source.homepageScreenshot = {
      status: "withheld",
      reason: "sensitive_visual_content",
    };
    source.screenshots[0] = {
      ...source.screenshots[0]!,
      displayStatus: "withheld",
      displayWithheldReason: "sensitive_visual_content",
      retentionStatus: "available",
    };

    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      classifier: async () => {
        throw new Error("a completed moderation decision must not be repeated");
      },
    });

    assert.equal(result.screenshots[0]?.retentionStatus, "withheld");
    assert.equal(result.screenshots[0]?.withheldReason, "sensitive_visual_content");
    assert.equal(result.artifactRefs.some((artifact) => artifact.artifactType === "screenshot"), false);
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("screenshot review starts at capture and completes without finalization latency", async () => {
  const directory = await testDirectory("overlap");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("safe screenshot bytes"));
    let resolveClassification: ((value: { safeForDisplay: boolean }) => void) | undefined;
    let classifierStartedResolve: (() => void) | undefined;
    const classifierStarted = new Promise<void>((resolve) => {
      classifierStartedResolve = resolve;
    });
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: directory,
      classifier: async () => {
        classifierStartedResolve?.();
        return new Promise((resolve) => {
          resolveClassification = resolve;
        });
      },
    });
    const source = bundleFixture(screenshotPath);
    coordinator.schedule(source.screenshots[0]!);
    await classifierStarted;
    resolveClassification?.({ safeForDisplay: true });

    const startedAt = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      reviewCoordinator: coordinator,
    });

    assert.deepEqual(result.homepageScreenshot, { status: "available" });
    assert.ok(Date.now() - startedAt < SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unfinished screenshot review adds at most the bounded finalization wait and fails closed", async () => {
  const directory = await testDirectory("bounded-finalization");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, Buffer.from("pending screenshot bytes"));
    const source = bundleFixture(screenshotPath);
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: directory,
      classifier: async () => new Promise(() => undefined),
    });
    coordinator.schedule(source.screenshots[0]!);

    const startedAt = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      reviewCoordinator: coordinator,
    });
    const durationMs = Date.now() - startedAt;

    assert.deepEqual(result.homepageScreenshot, {
      status: "withheld",
      reason: "safety_check_unavailable",
      failureCode: "finalization_deadline_exceeded",
    });
    assert.ok(SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS < SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS);
    assert.ok(
      durationMs < SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS + 100,
      `finalization took ${durationMs}ms`,
    );
    assert.equal(result.screenshots[0]?.retentionStatus, "withheld");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a late unresolved screenshot does not prevent an earlier verified-safe screenshot from display", async () => {
  const directory = await testDirectory("partial-retention");
  try {
    const safePath = path.join(directory, "screenshot-pre-consent.png");
    const latePath = path.join(directory, "screenshot-pre-consent-late.png");
    const orphanPath = path.join(directory, "screenshot-orphan.png");
    await Promise.all([
      writeFile(safePath, Buffer.from("early safe screenshot bytes")),
      writeFile(latePath, Buffer.from("late pending screenshot bytes")),
      writeFile(orphanPath, Buffer.from("unbound screenshot bytes")),
    ]);
    const source = bundleFixture(safePath);
    const lateScreenshot = {
      ...source.screenshots[0]!,
      artifactId: "screenshot_pre_consent_late",
      capturedAtMs: 13_179,
      path: latePath,
    };
    source.screenshots.push(lateScreenshot);
    source.artifactRefs.push({
      artifactId: lateScreenshot.artifactId,
      artifactType: "screenshot",
      path: latePath,
    });
    source.visualCapture?.artifactRefs.push({
      artifactId: lateScreenshot.artifactId,
      artifactType: "screenshot",
      path: latePath,
    });
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: directory,
      classifier: async ({ bytes }) => bytes.toString().startsWith("early")
        ? { safeForDisplay: true }
        : new Promise(() => undefined),
    });
    for (const screenshot of source.screenshots) coordinator.schedule(screenshot);

    const startedAt = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      reviewCoordinator: coordinator,
    });
    const durationMs = Date.now() - startedAt;

    assert.deepEqual(result.homepageScreenshot, { status: "available" });
    assert.deepEqual(
      result.screenshots.map(({
        artifactId,
        displayStatus,
        displayWithheldReason,
        retentionStatus,
        safetyFailureCode,
        withheldReason,
      }) => ({
        artifactId,
        displayStatus,
        displayWithheldReason,
        retentionStatus,
        safetyFailureCode,
        withheldReason,
      })),
      [
        {
          artifactId: "screenshot_pre_consent",
          displayStatus: "available",
          displayWithheldReason: undefined,
          retentionStatus: "available",
          safetyFailureCode: undefined,
          withheldReason: undefined,
        },
        {
          artifactId: "screenshot_pre_consent_late",
          displayStatus: "withheld",
          displayWithheldReason: "safety_check_unavailable",
          retentionStatus: "withheld",
          safetyFailureCode: "finalization_deadline_exceeded",
          withheldReason: "safety_check_unavailable",
        },
      ],
    );
    assert.deepEqual(result.artifactRefs.map((artifact) => artifact.artifactId), [
      "screenshot_pre_consent",
    ]);
    assert.deepEqual(result.visualCapture?.artifactRefs.map((artifact) => artifact.artifactId), [
      "screenshot_pre_consent",
    ]);
    assert.ok(
      durationMs < SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS + 100,
      `partial finalization took ${durationMs}ms`,
    );
    assert.equal((await stat(safePath)).isFile(), true);
    await assert.rejects(stat(latePath), /ENOENT/);
    await assert.rejects(stat(orphanPath), /ENOENT/);
    assert.equal(canonicalEvidenceBundleSchema.safeParse(result).success, true);

    const reapplied = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: result,
      classifier: async () => {
        throw new Error("completed per-artifact decisions must not be reviewed again");
      },
    });
    assert.deepEqual(reapplied, result);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("OpenAI moderation parsing uses only typed sexual-category flags and never logs image data", async () => {
  let requestBody = "";
  const classifier = createOpenAiScreenshotSafetyClassifier(
    { OPENAI_API_KEY: "test-key" },
    async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        results: [{
          categories: {
            sexual: false,
            "sexual/minors": false,
          },
          category_scores: {
            sexual: 0.99,
          },
        }],
      }), { status: 200 });
    },
  );
  const result = await classifier({
    bytes: Buffer.from("private-image"),
    mimeType: "image/png",
  });
  assert.deepEqual(result, { safeForDisplay: true });
  assert.match(requestBody, /omni-moderation-latest/);

  const source = await readFile(new URL("./screenshot-safety.ts", import.meta.url), "utf8");
  assert.match(source, /proxyFetch/);
  assert.doesNotMatch(source, /console\.(?:debug|info|log|warn|error)/);
  assert.doesNotMatch(source, /category_scores/);
});

async function testDirectory(label: string) {
  return mkdtemp(path.join(os.tmpdir(), `certscore-screenshot-safety-${label}-`));
}

function payloadFixture(): LocalV2DagLambdaDispatchPayload {
  return {
    artifactOnly: true,
    awsRegion: "eu-central-1",
    callbackCorrelationId: "scan-safety",
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: "certscore-v2-dag-local",
    hostname: "example.com",
    localCallbackUrl: null,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultPurpose: "synthetic_verification",
    resultQueueUrl: "https://sqs.eu-central-1.amazonaws.com/123/test",
    scanId: "scan-safety",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none",
  };
}

function bundleFixture(screenshotPath: string): CanonicalEvidenceBundle {
  return {
    artifactRefs: [{
      artifactId: "screenshot_pre_consent",
      artifactType: "screenshot",
      path: screenshotPath,
    }],
    cmpRuntimeObservations: [],
    completedAt: "2026-08-17T18:00:01.000Z",
    consentActionAttempts: [],
    consentActionCandidates: [],
    consentFlowComparisons: [],
    consentFlowObservations: [],
    consentInteractionEvents: [],
    consentUiObservations: [],
    cookieEvents: [],
    cookieSnapshots: [],
    derivedRuntimeSignals: {
      preConsentTrackingObserved: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      thirdPartyVendorsObserved: true,
    },
    domSnapshots: [],
    iframeEvents: [],
    modulesRun: [],
    scanLaneRuns: [],
    networkEvents: [],
    networkResponseEvents: [],
    normalizedUrl: "https://example.com/",
    normalizedVendorObservations: [],
    observedJourneys: [],
    policySurfaceObservations: [],
    runtimeTimeline: [],
    scanId: "scan-safety",
    scanProfile: {
      enabledModules: [],
      internalBudgetMs: 1_000,
      label: "tiny",
      profileId: "tiny",
      targetDurationMs: 1_000,
    },
    scannerVersion: "test",
    schemaVersion: "certscore.v2.canonical_evidence_bundle.v1",
    screenshots: [{
      artifactId: "screenshot_pre_consent",
      capturedAtMs: 20,
      captureMethod: "primary_viewport_fallback",
      path: screenshotPath,
      url: "https://example.com/",
      pagePhase: "dom_content_loaded",
      consentStateAtTime: "pre_consent",
    }],
    scriptEvents: [],
    startedAt: "2026-08-17T18:00:00.000Z",
    storageSnapshots: [],
    url: "https://example.com/",
    visualCapture: {
      status: "available",
      artifactRefs: [{
        artifactId: "screenshot_pre_consent",
        artifactType: "screenshot",
        path: screenshotPath,
      }],
      notes: [],
    },
  };
}
