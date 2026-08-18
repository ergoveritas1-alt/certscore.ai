import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  type LocalV2DagLambdaDispatchPayload,
  uploadAuxiliaryArtifactFiles,
} from "./handler.js";
import {
  applyHomepageScreenshotSafetyGate,
  createOpenAiScreenshotSafetyClassifier,
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
    assert.equal(result.artifactRefs.length, 1);
    assert.equal((await stat(screenshotPath)).isFile(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit homepage screenshots are deleted before auxiliary upload and recorded as withheld", async () => {
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
    assert.equal(result.artifactRefs.some((artifact) => artifact.artifactType === "screenshot"), false);
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
    assert.deepEqual(uploaded, []);
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
    });
    assert.equal(result.scanId, source.scanId);
    assert.equal(result.derivedRuntimeSignals.thirdPartyVendorsObserved, true);
    await assert.rejects(stat(screenshotPath), /ENOENT/);
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
