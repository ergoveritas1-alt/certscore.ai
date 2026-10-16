import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
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
  writeAndUploadLocalV2DagLambdaArtifacts,
  buildLocalV2DagLambdaScanTuning,
} from "./handler.js";
import {
  applyHomepageScreenshotSafetyGate as applySafetyGate,
  CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS,
  createHomepageScreenshotSafetyReviewCoordinator,
  createOpenAiScreenshotSafetyClassifier,
  SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS,
  VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS,
  SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS,
} from "./screenshot-safety.js";

const coordinators = new Map<string, ReturnType<typeof createHomepageScreenshotSafetyReviewCoordinator>>();
async function applyHomepageScreenshotSafetyGate(input: Parameters<typeof applySafetyGate>[0]) {
  const reviewCoordinator = input.reviewCoordinator ?? createHomepageScreenshotSafetyReviewCoordinator(input);
  coordinators.set(input.artifactRoot, reviewCoordinator);
  return applySafetyGate({ ...input, reviewCoordinator });
}

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

test("a completed first-layer inventory gives its representative screenshot time to finish safety review", async () => {
  const directory = await testDirectory("consent-finalization");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent-settled.png");
    await writeFile(screenshotPath, Buffer.from("safe representative consent screenshot bytes"));
    const source = bundleFixture(screenshotPath);
    source.screenshots[0] = {
      ...source.screenshots[0]!,
      artifactId: "screenshot_pre_consent_settled",
      pagePhase: "network_idle",
    };
    source.consentUiObservations = [{
      observationId: "consent-ui-pre-consent",
      observedAtMs: 500,
      likelyPresent: true,
      layerInspected: "first_layer",
      captureStatus: "observed",
      inventoryOutcome: "complete_with_controls",
      controls: [{
        actionType: "accept_all",
        label: "Accept",
        layer: "first_layer",
        visible: true,
      }],
      evidenceRefs: [],
    }];
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: directory,
      classifier: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { safeForDisplay: true };
      },
    });
    coordinator.schedule(source.screenshots[0]!);

    const startedAt = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({
      artifactRoot: directory,
      bundle: source,
      reviewCoordinator: coordinator,
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(result.screenshots[0]?.retentionStatus, "available");
    assert.equal(result.screenshots[0]?.displayStatus, "available");
    assert.ok(durationMs > SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
    assert.ok(durationMs < CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
    assert.equal((await stat(screenshotPath)).isFile(), true);
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

async function waitUntil(predicate: () => boolean) {
  const deadlineAt = Date.now() + 1_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadlineAt, "expected review progress within one second");
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function pairedFixture(directory: string) {
  const screenshotPath = path.join(directory, "screenshot-pre-consent-settled.png");
  const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toBuffer();
  await writeFile(screenshotPath, bytes);
  const source = bundleFixture(screenshotPath);
  const identity = { source: "cdp_loader_id" as const, token: "document-pair" };
  source.screenshots[0] = { ...source.screenshots[0]!, documentIdentity: identity,
    artifactId: "screenshot_pre_consent_settled", pagePhase: "network_idle" };
  const candidates = ["accept_all", "reject_all"].map((actionType, index) => ({
    candidateId: `candidate_${index}`, label: index ? "Reject" : "Accept", actionType,
    layer: "first_layer", enabled: true, intersectsViewport: true, decisionStatus: "confirmed_visible",
    consentContextConfirmed: true, selectorHint: `#${actionType}`, tagName: "button", classifierReasonCodes: [],
    boundingBox: { x: 20, y: 20 + index * 30, width: 40, height: 20 },
    frameContext: { frameKind: "main_frame", frameUrl: source.url }, screenshotArtifactRef: screenshotPath,
  }));
  source.consentUiObservations = [{
    observationId: "paired-observation", observedAtMs: 500, likelyPresent: true,
    captureStatus: "observed", inventoryOutcome: "partial", layerInspected: "first_layer",
    documentUrl: source.url, documentIdentity: identity,
    captureDiagnostics: { completedChannels: ["dom_inventory", "geometry"], failedChannels: [], timedOutChannels: [] },
    controls: candidates.map(row => ({ actionType: row.actionType as "accept_all" | "reject_all",
      label: row.label, visible: true, selectorHint: "button", tagName: row.tagName })),
    evidenceRefs: [],
  }];
  // A third, unresolved selection control must remain partial without taking
  // away the verified pair's review allowance.
  candidates.push({ ...candidates[0]!, candidateId: "candidate_2", actionType: "save_preferences", label: "Save choices" });
  const geometry = {
    artifactVersion: "consent_control_geometry.v1", sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: source.url, documentIdentity: identity, screenshotArtifactRef: screenshotPath,
    capturedAt: new Date(Date.parse(source.startedAt) + source.screenshots[0]!.capturedAtMs + 129).toISOString(),
    viewport: { width: 100, height: 100 },
    candidates,
    controlInspection: {
      version: "control_specific_inspection.v2", retainedCandidateCount: candidates.length,
      structuralCoverage: "complete", reasonCodes: [],
      captureCoverage: { inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
        documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 },
      candidates: candidates.map(row => ({ candidateId: row.candidateId,
        role: row.actionType === "save_preferences" ? "selection_submit" : "decision",
        unresolvedIntents: row.actionType === "save_preferences" ? ["reject"] : [] })),
    },
    visualComparison: {
      version: "consent_control_visual_comparison.v1", documentToken: identity.token,
      screenshotArtifactRef: screenshotPath, screenshotSha256: createHash("sha256").update(bytes).digest("hex"),
      imageWidth: 100, imageHeight: 100, captureSkewMs: 129,
      accept: { candidateId: "candidate_0", bounds: [20, 20, 40, 20], fillContrast: 2,
        outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 },
      reject: { candidateId: "candidate_1", bounds: [20, 50, 40, 20], fillContrast: 2,
        outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 },
    },
  };
  const saveGeometry = () => writeFile(path.join(directory, "ConsentControlGeometryEvidence.json"), JSON.stringify(geometry));
  await saveGeometry();
  return { source, geometry, saveGeometry, screenshotPath };
}

async function diagnostics(directory: string) {
  return coordinators.get(directory)!.diagnostics();
}

test("a verified AX/native pair reuses one slow review inside the approved four-second allowance", async () => {
  const directory = await testDirectory("native-ax-slow-review");
  try {
    const {source, geometry} = await pairedFixture(directory);
    for (const [index, control] of source.consentUiObservations[0]!.controls.entries()) {
      control.selectorHint = `ax:${index + 1}`;
      control.visibilityEvidence = "box_model_verified";
      control.consentContextEvidence = "local_surface";
      control.domBinding = {version: "ax_backend_dom_binding.v1", axNodeId: String(index + 1), backendNodeId: index + 1,
        nodeType: 1, tagName: "button", documentUrl: source.url, documentIdentity: geometry.documentIdentity};
    }
    let calls = 0;
    const result = await applyHomepageScreenshotSafetyGate({artifactRoot: directory, bundle: source,
      classifier: async () => {calls++; await new Promise(resolve => setTimeout(resolve, 2_200)); return {safeForDisplay: true};}});
    assert.equal(calls, 1);
    assert.equal(result.screenshots[0]!.displayStatus, "available");
    assert.equal((await diagnostics(directory)).reviews[0]!.finalization!.budgetMs, 4_000);
    assert.deepEqual(result.consentUiObservations, source.consentUiObservations);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

for (const drift of ["missing", "tag", "document", "node", "visibility"] as const) {
  test(`AX/native ${drift} drift cannot extend paired-image review`, async () => {
    const directory = await testDirectory(`native-ax-${drift}`);
    try {
      const {source, geometry} = await pairedFixture(directory);
      for (const [index, control] of source.consentUiObservations[0]!.controls.entries()) {
        control.selectorHint = `ax:${index + 1}`;
        control.visibilityEvidence = "box_model_verified";
        control.consentContextEvidence = "local_surface";
        control.domBinding = {version: "ax_backend_dom_binding.v1", axNodeId: String(index + 1), backendNodeId: index + 1,
          nodeType: 1, tagName: "button", documentUrl: source.url, documentIdentity: {...geometry.documentIdentity}};
      }
      const control = source.consentUiObservations[0]!.controls[0]!;
      if (drift === "missing") delete control.domBinding;
      if (drift === "tag") control.domBinding!.tagName = "a";
      if (drift === "document") control.domBinding!.documentIdentity.token = "other-loader";
      if (drift === "node") control.domBinding!.axNodeId = "another-node";
      if (drift === "visibility") control.visibilityEvidence = "unverified";
      await applyHomepageScreenshotSafetyGate({artifactRoot: directory, bundle: source, classifier: async () => new Promise(() => undefined)});
      assert.equal((await diagnostics(directory)).reviews[0]!.finalization!.budgetMs, 75);
    } finally { await rm(directory, {recursive: true, force: true}); }
  });
}

test("a verified A/R pair gets the existing allowance while unrelated inventory stays partial", async () => {
  const directory = await testDirectory("partial-pair");
  try {
    const { source } = await pairedFixture(directory);
    const before = structuredClone(source.consentUiObservations);
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => { await new Promise(resolve => setTimeout(resolve, 150)); return { safeForDisplay: true }; } });
    assert.equal(result.screenshots[0]?.displayStatus, "available");
    assert.deepEqual(result.consentUiObservations, before);
    const diagnostic = await diagnostics(directory);
    assert.equal(diagnostic.reviews[0]!.finalization!.budgetMs, VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
    assert.equal(diagnostic.reviews[0]!.finalization!.outcome.status, "safe");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const drift of ["document", "image_hash", "candidate", "bounds", "frame", "inspection", "missing_observation", "dimensions", "capture_time"] as const) {
  test(`partial inventory does not gain review time from ${drift} drift`, async () => {
    const directory = await testDirectory(`pair-drift-${drift}`);
    try {
      const { source, geometry, saveGeometry } = await pairedFixture(directory);
      if (drift === "document") geometry.documentIdentity.token = "other-document";
      if (drift === "image_hash") geometry.visualComparison.screenshotSha256 = "a".repeat(64);
      if (drift === "candidate") geometry.candidates[1]!.actionType = "accept_all";
      if (drift === "bounds") geometry.candidates[1]!.boundingBox.width = 39;
      if (drift === "frame") geometry.candidates[1]!.frameContext.frameKind = "child_frame";
      if (drift === "inspection") geometry.controlInspection.captureCoverage.documentAndFramesStable = false;
      if (drift === "missing_observation") source.consentUiObservations = [];
      if (drift === "dimensions") geometry.visualComparison.imageWidth = 101;
      if (drift === "capture_time") geometry.capturedAt = new Date(Date.parse(geometry.capturedAt) + 1_000).toISOString();
      await saveGeometry();
      const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
        classifier: async () => new Promise(() => undefined) });
      assert.equal(result.screenshots[0]?.displayStatus, "withheld");
      assert.equal((await diagnostics(directory)).reviews[0]!.finalization!.budgetMs, 75);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("an eligible hung review remains bounded, withheld and immutable after a late approval", async () => {
  const directory = await testDirectory("pair-deadline");
  try {
    const { source, screenshotPath } = await pairedFixture(directory);
    let finish: (result: { safeForDisplay: boolean }) => void = () => undefined;
    const startedAt = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => new Promise(resolve => { finish = resolve; }) });
    assert.ok(Date.now() - startedAt < SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS + 100);
    assert.equal(result.screenshots[0]?.safetyFailureCode, "finalization_deadline_exceeded");
    const frozen = JSON.stringify(await diagnostics(directory));
    finish({ safeForDisplay: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.stringify(await diagnostics(directory)), frozen);
    assert.equal(result.screenshots[0]?.displayStatus, "withheld");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("identical bytes share review across paths; different bytes require independent reviews", async () => {
  const directory = await testDirectory("identical-bytes");
  try {
    const firstPath = path.join(directory, "screenshot-one.png");
    const secondPath = path.join(directory, "screenshot-two.png");
    const thirdPath = path.join(directory, "screenshot-three.png");
    await Promise.all([writeFile(firstPath, "same bytes"), writeFile(secondPath, "same bytes"), writeFile(thirdPath, "different bytes")]);
    const source = bundleFixture(firstPath);
    source.screenshots.push({ ...source.screenshots[0]!, artifactId: "second", path: secondPath },
      { ...source.screenshots[0]!, artifactId: "third", path: thirdPath });
    let calls = 0;
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => { calls += 1; return { safeForDisplay: true }; } });
    assert.equal(calls, 2);
    assert.ok(result.screenshots.every(row => row.displayStatus === "available"));
    assert.equal((await diagnostics(directory)).reviews.filter((row: { sharedIdenticalBytes: boolean }) => row.sharedIdenticalBytes).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("replacing a reviewed file never inherits the original bytes' approval", async () => {
  const directory = await testDirectory("replaced-file");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, "original bytes");
    const source = bundleFixture(screenshotPath);
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let finish!: (result: { safeForDisplay: boolean }) => void;
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({ artifactRoot: directory,
      classifier: async () => { started(); return new Promise(resolve => { finish = resolve; }); } });
    coordinator.schedule(source.screenshots[0]!);
    await ready;
    await writeFile(screenshotPath, "replacement bytes");
    finish({ safeForDisplay: true });
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source, reviewCoordinator: coordinator });
    assert.equal(result.screenshots[0]?.displayStatus, "withheld");
    assert.equal(result.screenshots[0]?.safetyFailureCode, "temporary_file_unavailable");
    assert.equal((await diagnostics(directory)).reviews[0]!.byteBindingFailure, "reviewed_image_bytes_changed");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("queued representative review has priority and concurrency never exceeds two", async () => {
  const directory = await testDirectory("queue-priority");
  try {
    const filenames = ["screenshot-first.png", "screenshot-second.png", "screenshot-third.png", "screenshot-pre-consent-settled.png"];
    for (const [index, filename] of filenames.entries()) await writeFile(path.join(directory, filename), `image ${index}`);
    let active = 0, peak = 0;
    const started: string[] = [];
    const completions: (() => void)[] = [];
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({ artifactRoot: directory,
      classifier: async ({ bytes }) => {
        active += 1; peak = Math.max(peak, active); started.push(bytes.toString());
        await new Promise<void>(resolve => { completions.push(resolve); }); active -= 1;
        return { safeForDisplay: true };
      } });
    const images = filenames.map(filename => ({ path: path.join(directory, filename), captureMethod: "primary_full_page" as const }));
    // Wait for the first two to start, then enqueue both competitors.
    coordinator.schedule(images[0]!); coordinator.schedule(images[1]!);
    await waitUntil(() => started.length >= 2);
    coordinator.schedule(images[2]!); coordinator.schedule(images[3]!);
    coordinator.prioritize(images[3]!.path);
    await waitUntil(() => coordinator.diagnostics().reviews.every(row => row.queuedAtMs !== undefined));
    completions[0]!();
    await waitUntil(() => started.length >= 3);
    assert.equal(started[2], "image 3");
    assert.equal(peak, 2);
    coordinator.cancelPending();
    for (const finish of completions) finish();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("diagnostics distinguish HTTP phases and finalization without retaining request data", async () => {
  const directory = await testDirectory("http-timing");
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, "private image bytes");
    const classifier = createOpenAiScreenshotSafetyClassifier({ OPENAI_API_KEY: "private-key" }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ results: [{ categories: { sexual: false } }] }));
    });
    await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: bundleFixture(screenshotPath), classifier });
    const diagnostic = await diagnostics(directory);
    const row = diagnostic.reviews[0]!;
    assert.ok(row.scheduledAtMs <= row.readStartedAtMs!);
    assert.ok(row.queuedAtMs! <= row.executionStartedAtMs!);
    assert.ok(row.executionStartedAtMs! <= row.requestStartedAtMs!);
    assert.ok(row.requestStartedAtMs! < row.responseHeadersAtMs!);
    assert.ok(row.responseHeadersAtMs! <= row.responseBodyAtMs!);
    assert.ok(row.responseBodyAtMs! <= row.completedAtMs!);
    assert.ok(row.finalization!.completedAtMs >= row.completedAtMs!);
    const text = JSON.stringify(diagnostic);
    for (const secret of ["private-key", "private image bytes", directory, "api.openai.com"]) assert.ok(!text.includes(secret));
    assert.ok(text.length < 8_000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("review diagnostics persist in the existing manifest without an additional artifact upload", async () => {
  const directory = await testDirectory("manifest-timing");
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  try {
    const screenshotPath = path.join(directory, "screenshot-pre-consent.png");
    await writeFile(screenshotPath, "safe image bytes");
    const source = bundleFixture(screenshotPath);
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({ artifactRoot: directory,
      classifier: async () => ({ safeForDisplay: true }) });
    const uploads: string[] = [];
    await writeAndUploadLocalV2DagLambdaArtifacts({ artifactRoot: directory, bundle: source,
      screenshotSafetyReviewCoordinator: coordinator, phaseTimings: [], payload: payloadFixture(),
      scanTuning: buildLocalV2DagLambdaScanTuning({}), s3Client: { async send(command) {
        uploads.push(command.input.Key ?? ""); return { $metadata: {} };
      } } });
    const manifest = JSON.parse(await readFile(path.join(directory, "LocalV2DagLambdaManifest.json"), "utf8"));
    assert.equal(manifest.screenshotSafetyReview.version, "screenshot_safety_review_diagnostics.v1");
    assert.equal(manifest.screenshotSafetyReview.reviews[0].finalization.outcome.status, "safe");
    assert.equal(uploads.length, 3, "only canonical bundle, existing screenshot and existing manifest");
    assert.ok(!uploads.some(key => key.includes("ScreenshotSafetyReviewDiagnostics")));
    assert.ok(!JSON.stringify(manifest.screenshotSafetyReview).includes("safe image bytes"));
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    await rm(directory, { recursive: true, force: true });
  }
});

for (const failure of ["sensitive", "transport_error", "aborted"] as const) {
  test(`a verified pair remains withheld after ${failure} without altering its partial inventory`, async () => {
    const directory = await testDirectory(`pair-failure-${failure}`);
    try {
      const { source } = await pairedFixture(directory);
      const before = structuredClone(source.consentUiObservations);
      const controller = new AbortController();
      const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source, signal: controller.signal,
        classifier: async () => {
          if (failure === "sensitive") return { safeForDisplay: false };
          if (failure === "aborted") controller.abort();
          throw new Error("private transport details must not be persisted");
        } });
      assert.equal(result.screenshots[0]?.displayStatus, "withheld");
      assert.deepEqual(result.consentUiObservations, before);
      assert.ok(!JSON.stringify(await diagnostics(directory)).includes("private transport details"));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("all current producer capture IDs can retain independently reviewed bytes", async () => {
  const directory = await testDirectory("all-capture-ids");
  try {
    const ids = ["screenshot_pre_consent", "screenshot_pre_consent_settled", "screenshot_pre_consent_cmp_empty",
      "screenshot_pre_consent_cmp_controls", "screenshot_pre_consent_packet_recovery",
      "screenshot_pre_consent_no_go_confirmation", "screenshot_pre_consent_full_page", "screenshot_pre_consent_geometry_proof"];
    const source = bundleFixture(path.join(directory, "screenshot-pre-consent.png"));
    source.screenshots = ids.map((artifactId, index) => ({ ...source.screenshots[0]!, artifactId,
      path: path.join(directory, `${artifactId.replaceAll("_", "-")}.png`), capturedAtMs: index * 100 }));
    for (const [index, image] of source.screenshots.entries()) await writeFile(image.path, `unique image ${index}`);
    let calls = 0;
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => { calls += 1; return { safeForDisplay: true }; } });
    assert.equal(calls, ids.length);
    assert.ok(result.screenshots.every(row => row.displayStatus === "available"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unrelated AX inventory timeout does not shorten a verified DOM/geometry pair's review", async () => {
  const directory = await testDirectory("unrelated-channel-timeout");
  try {
    const { source } = await pairedFixture(directory);
    source.consentUiObservations[0]!.captureDiagnostics!.timedOutChannels = ["accessibility_tree"];
    const before = structuredClone(source.consentUiObservations);
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => { await new Promise(resolve => setTimeout(resolve, 150)); return { safeForDisplay: true }; } });
    assert.equal(result.screenshots[0]?.displayStatus, "available");
    assert.equal((await diagnostics(directory)).reviews[0]!.finalization!.budgetMs, VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
    assert.deepEqual(result.consentUiObservations, before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a deadline while reading the moderation response is diagnosed as a timeout", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let headers!: () => void;
  const headersReceived = new Promise<void>(resolve => { headers = resolve; });
  const classifier = createOpenAiScreenshotSafetyClassifier({ OPENAI_API_KEY: "test-key", CERTSCORE_SCREENSHOT_SAFETY_TIMEOUT_MS: "2000" }, async (_url, init) => {
    const stream = new ReadableStream({ start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
    } });
    return new Response(stream);
  });
  const outcome = classifier({ bytes: Buffer.from("image"), mimeType: "image/png",
    onPhase(phase) { if (phase === "response_headers") headers(); } });
  await headersReceived;
  t.mock.timers.tick(2_001);
  await assert.rejects(outcome, { failureCode: "moderation_timeout" });
});

/** Explicit synthetic image/geometry fixture for the retained IKEA pattern:
 * same-document A/R proof, completed DOM/geometry, partial other inventory, no
 * completed pixel metrics. Never substitutes for a historical withheld image. */
async function structuredPairFixture(directory: string) {
  const fixture = await pairedFixture(directory);
  Reflect.deleteProperty(fixture.geometry, "visualComparison");
  const rectangle = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  Object.assign(fixture.geometry, { containers: [{ layer: "first_layer", boundingBox: rectangle(10, 10, 80, 80) }] });
  for (const candidate of fixture.geometry.candidates) Object.assign(candidate.boundingBox,
    rectangle(candidate.boundingBox.x, candidate.boundingBox.y, candidate.boundingBox.width, candidate.boundingBox.height));
  fixture.source.screenshots[0]!.artifactId = "screenshot_pre_consent_geometry_proof";
  await fixture.saveGeometry();
  return fixture;
}

test("verified structured A/R screenshot keeps the approved review grace when pixel metrics are unavailable", async () => {
  const directory = await testDirectory("structured-pair-no-metrics");
  try {
    const { source } = await structuredPairFixture(directory);
    const original = structuredClone(source);
    let calls = 0;
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 200)); return { safeForDisplay: true }; } });
    assert.equal(calls, 1, "No new review or retry");
    assert.equal(result.screenshots[0]?.displayStatus, "available");
    assert.equal((await diagnostics(directory)).reviews[0]!.finalization!.budgetMs, VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS);
    assert.deepEqual(result.consentUiObservations, original.consentUiObservations, "Partial controls stay partial");
    const geometry = JSON.parse(await readFile(path.join(directory, "ConsentControlGeometryEvidence.json"), "utf8"));
    assert.equal(geometry.visualComparison, undefined, "Safety approval cannot manufacture prominence measurements");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const drift of ["document", "dimensions", "stale", "duplicate_accept", "unbound_control", "missing_observation", "malformed_metrics", "withheld"] as const) {
  test(`structured screenshot without metrics fails closed for ${drift}`, async () => {
    const directory = await testDirectory(`structured-drift-${drift}`);
    try {
      const { source, geometry, saveGeometry } = await structuredPairFixture(directory);
      if (drift === "document") geometry.documentIdentity = { ...geometry.documentIdentity, token: "changed-loader" };
      if (drift === "dimensions") geometry.viewport.width = 101;
      if (drift === "stale") geometry.capturedAt = new Date(Date.parse(geometry.capturedAt) + 1000).toISOString();
      if (drift === "duplicate_accept") geometry.candidates.push({ ...geometry.candidates[0]!, candidateId: "duplicate" });
      if (drift === "unbound_control") geometry.candidates[1]!.screenshotArtifactRef = "another-image.png";
      if (drift === "missing_observation") source.consentUiObservations = [];
      if (drift === "malformed_metrics") Object.assign(geometry, { visualComparison: { version: "malformed" } });
      if (drift === "withheld") {
        source.homepageScreenshot = { status: "withheld", reason: "safety_check_unavailable" };
        Object.assign(source.screenshots[0]!, { retentionStatus: "withheld", withheldReason: "safety_check_unavailable" });
      }
      await saveGeometry();
      const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
        classifier: async () => new Promise(() => undefined) });
      assert.equal(result.screenshots[0]?.displayStatus, "withheld");
      const review = (await diagnostics(directory)).reviews[0];
      if (review) assert.equal(review.finalization!.budgetMs, 75, "Unverified proof cannot gain review grace");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test("structured-pair safety timeout stays bounded and late approval cannot reopen retention", async () => {
  const directory = await testDirectory("structured-pair-late");
  let resolve!: (value: { safeForDisplay: boolean }) => void;
  try {
    const { source, screenshotPath } = await structuredPairFixture(directory);
    const started = Date.now();
    const result = await applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source,
      classifier: async () => new Promise(done => { resolve = done; }) });
    assert.ok(Date.now() - started <= SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS + 150);
    assert.equal(result.screenshots[0]?.displayStatus, "withheld");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
    const before = await diagnostics(directory);
    resolve({ safeForDisplay: true });
    await new Promise(done => setImmediate(done));
    assert.deepEqual(await diagnostics(directory), before);
    assert.equal(result.screenshots[0]?.displayStatus, "withheld");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("queued geometry proof outranks settled and general screenshots without preempting or adding requests", async () => {
  const directory = await testDirectory("geometry-priority");
  try {
    const filenames = ["screenshot-first.png", "screenshot-second.png", "screenshot-pre-consent-settled.png", "screenshot-pre-consent-geometry-proof.png"];
    for (const [index, filename] of filenames.entries()) await writeFile(path.join(directory, filename), `image ${index}`);
    const started: string[] = [], completions: (() => void)[] = [];
    let active = 0, peak = 0;
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({ artifactRoot: directory,
      classifier: async ({ bytes }) => {
        active++; peak = Math.max(peak, active); started.push(bytes.toString());
        await new Promise<void>(resolve => completions.push(resolve)); active--;
        return { safeForDisplay: true };
      } });
    const images = filenames.map(filename => ({ path: path.join(directory, filename), captureMethod: "primary_viewport_fallback" as const }));
    coordinator.schedule(images[0]!); coordinator.schedule(images[1]!);
    await waitUntil(() => started.length === 2);
    coordinator.schedule(images[2]!); coordinator.schedule(images[3]!);
    await waitUntil(() => coordinator.diagnostics().reviews.length === 4 && coordinator.diagnostics().reviews.every(row => row.queuedAtMs !== undefined));
    assert.equal(started.length, 2, "Existing in-flight reviews are not interrupted");
    completions[0]!(); await waitUntil(() => started.length === 3);
    assert.equal(started[2], "image 3"); assert.equal(peak, 2);
    coordinator.cancelPending(); completions.forEach(finish => finish());
    assert.equal(started.length, 3, "Cancellation cannot launch another request");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("capture-time pair metadata is immutable and a replaced reviewed file still fails closed", async () => {
  const directory = await testDirectory("pair-metadata-replacement");
  try {
    const { source, screenshotPath } = await pairedFixture(directory);
    let finish!: (value: {safeForDisplay: boolean}) => void;
    const coordinator = createHomepageScreenshotSafetyReviewCoordinator({artifactRoot: directory,
      classifier: async () => new Promise(resolve => {finish = resolve;})});
    coordinator.schedule(source.screenshots[0]!);
    for (let i = 0; i < 100 && !coordinator.reviewedImage(screenshotPath); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const receipt = coordinator.reviewedImage(screenshotPath);
    assert.ok(receipt && Object.isFrozen(receipt));
    assert.equal(receipt.width, 100);
    const resultPromise = applyHomepageScreenshotSafetyGate({ artifactRoot: directory, bundle: source, reviewCoordinator: coordinator });
    await new Promise(resolve => setTimeout(resolve, 20));
    await writeFile(screenshotPath, await sharp({create:{width:100,height:100,channels:3,background:"red"}}).png().toBuffer());
    finish({safeForDisplay:true});
    const result = await resultPromise;
    assert.equal(result.screenshots[0]!.displayStatus, "withheld");
    assert.equal(coordinator.diagnostics().pairEligibility?.status, "verified");
    assert.equal(coordinator.diagnostics().reviews[0]!.byteBindingFailure, "reviewed_image_bytes_changed");
    await assert.rejects(stat(screenshotPath), /ENOENT/);
  } finally { await rm(directory, {recursive:true,force:true}); }
});
