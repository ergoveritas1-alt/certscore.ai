import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  ConsentUiObservation,
  DomSnapshotArtifact,
  NetworkEvent,
  NetworkResponseEvent,
  PolicySurfaceObservation,
  RuntimeCoverageSummary,
  ScreenshotArtifact,
} from "@certscore/contracts";
import { scanEvidenceLaneAssessmentSchema } from "@certscore/contracts";
import {
  buildScanEvidenceLaneAssessment,
  buildScanNoGoAssessment,
  classifyScanNoGoTextForCalibration,
  hasCompleteRetainedConsentProofPacket,
  shouldAttemptIncompleteConsentVisualFallback,
  shouldAttemptScreenshotOnlyFallback,
} from "./index.js";

test("an HTTP 200 request-rejection shell is no-go without classifying quotations or short public pages as blocked", () => {
  const shell = "The requested URL was rejected. Please consult with your administrator.\nYour support ID is retained-fixture-id\n[Go Back]";
  for (const text of [shell, `Request Rejected\n${shell}`, "The requested URL was rejected. Please consult with your administrator."]) {
    const result = buildScanNoGoAssessment(scanEvidence({text, finalMainDocumentStatus:200, screenshots:[]}));
    assert.equal(result?.scanNoGoAssessment.decision, "no_go");
    assert.equal(result?.primaryReasonCode, "access_denied_or_forbidden_page");
  }
  for (const text of [
    `Troubleshooting guide: ${shell} Read our instructions and contact our team for help.`,
    `The requested URL was rejected. Please consult with your administrator. This example explains a failed form submission; the rest of our site is available.`,
    "Hello world. Public project documentation.",
    "公开资料与服务说明",
  ]) assert.notEqual(buildScanNoGoAssessment(scanEvidence({text, finalMainDocumentStatus:200, screenshots:[], firstPartySuccesses:8}))?.scanNoGoAssessment.decision, "no_go", text);
});

test("all retained main-document 5xx responses are terminal, including Cloudflare origin timeouts", () => {
  for (const status of [500, 501, 502, 503, 504, 507, 520, 521, 522, 523, 524, 525, 526, 530, 599]) {
    const result=buildScanNoGoAssessment(scanEvidence({finalMainDocumentStatus:status,firstPartySuccesses:8,
      text:"Connection timed out Error code 522. Browser Working. Cloudflare Working. Host Error.",screenshots:[]}));
    assert.equal(result?.scanNoGoAssessment.decision,"no_go",String(status));
    assert.equal(result?.primaryReasonCode,"server_error_5xx",String(status));
  }
});

test("subresource 522, quoted timeout guidance and an earlier recovered 522 do not block the public page", () => {
  const text="Public documentation explains Cloudflare error code 522 and connection timeouts. Explore our products and services, compare plans, meet the team and read our public troubleshooting guide.";
  const subresource=scanEvidence({text,screenshots:[],firstPartySuccesses:8});
  subresource.networkEvents.push({requestId:"api",resourceType:"fetch",isMainFrame:true} as NetworkEvent);
  subresource.networkResponseEvents.push({requestId:"api",status:522} as NetworkResponseEvent);
  const subframe=structuredClone(subresource);
  subframe.networkEvents.at(-1)!.resourceType="document";
  subframe.networkEvents.at(-1)!.isMainFrame=false;
  for(const evidence of [subresource,subframe,scanEvidence({text,screenshots:[],priorMainDocumentStatus:522,finalMainDocumentStatus:200,firstPartySuccesses:8})])
    assert.notEqual(buildScanNoGoAssessment(evidence)?.scanNoGoAssessment.decision,"no_go");
});

test("a complete connection/adblock error shell is a challenge, while quoted article text remains usable", () => {
  const shell = "Oops, something went wrong. Please check your connection, disable any ad blockers, or try using a different browser.";
  assert.equal(buildScanNoGoAssessment(scanEvidence({text: shell, finalMainDocumentStatus: 200, screenshots: []}))?.scanNoGoAssessment.decision, "no_go");
  assert.notEqual(buildScanNoGoAssessment(scanEvidence({text: `Troubleshooting guide. A browser may display: ${shell} Our article explains how to fix this message and browse products.`, finalMainDocumentStatus: 200, screenshots: []}))?.scanNoGoAssessment.decision, "no_go");
});

test("overlong retained policy identities do not invalidate the compact lane summary", () => {
  const policy = usablePolicySurface();
  policy.url = `https://example.test/privacy?state=${"x".repeat(850)}`;
  policy.normalizedUrl = policy.url;
  const original = JSON.stringify(policy);
  const assessment = buildScanEvidenceLaneAssessment({ normalizedUrl: "https://example.test/", policySurfaceObservations: [policy],
    runtimeCoverage: unavailableRuntimeCoverage(), scanNoGoAssessment: terminalNoGoAssessment(), transportSecurityObservationCount: 1 });
  assert.equal(scanEvidenceLaneAssessmentSchema.safeParse(assessment).success, true);
  assert.equal(assessment.lanes.policyGdpr, "usable");
  assert.deepEqual(assessment.usablePolicySurfaceUrls, []);
  assert.ok(assessment.limitationKeys.includes("policy_url_summary_limited"));
  assert.equal(JSON.stringify(policy), original, "full retained source remains intact");
});

test("verified first-party policy evidence produces a partial outcome when homepage runtime is no-go", () => {
  const assessment = buildScanEvidenceLaneAssessment({
    normalizedUrl: "https://example.test/",
    policySurfaceObservations: [usablePolicySurface()],
    runtimeCoverage: unavailableRuntimeCoverage(),
    scanNoGoAssessment: terminalNoGoAssessment(),
    transportSecurityObservationCount: 1,
  });

  assert.equal(assessment.outcome, "partial_with_diagnostics");
  assert.equal(assessment.lanes.homepageRuntime, "unusable");
  assert.equal(assessment.lanes.policyGdpr, "usable");
  assert.equal(assessment.lanes.cookiesTrackers, "not_testable");
});

test("ChatGPT main-document 401 stays no-go despite a designed sign-in screen and provider policy", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-sign-in-"));
  try {
    // Retained text from production scan 2a986426-14cb-4925-b6d9-3aaad0e0fcfc.
    const evidence = scanEvidence({
      finalMainDocumentStatus: 401,
      firstPartySuccesses: 5,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "You’re almost in\n\nThis site uses ChatGPT to securely sign you in\n\nContinue with ChatGPT\nYou can review OpenAI's Privacy Policy",
    });
    const noGo = buildScanNoGoAssessment(evidence);
    assert.equal(noGo?.scanNoGoAssessment.decision, "no_go");
    assert.equal(noGo?.primaryReasonCode, "authentication_required");

    const providerPolicy = usablePolicySurface();
    providerPolicy.url = "https://openai.com/en-GB/policies/privacy-policy/";
    providerPolicy.normalizedUrl = providerPolicy.url;
    providerPolicy.targetRelationship = "first_party_brand";
    providerPolicy.ownershipConfidence = 0.78;
    for (const assessment of [
      noGo!.scanNoGoAssessment,
      { ...noGo!.scanNoGoAssessment, reasonCodes: ["access_denied_or_forbidden_page"] },
    ]) {
      const lanes = buildScanEvidenceLaneAssessment({
        normalizedUrl: "https://forenaxis-command.michaelmancini1968.chatgpt.site/",
        policySurfaceObservations: [providerPolicy],
        runtimeCoverage: unavailableRuntimeCoverage(),
        scanNoGoAssessment: assessment,
        transportSecurityObservationCount: 1,
      });
      assert.equal(lanes.outcome, "no_go");
      assert.ok(lanes.limitationKeys.includes("authentication_required"));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a public page with a sign-in link, a subresource 401, or a recovered document remains usable", () => {
  const text = "Welcome to our public product homepage. Explore our services, read our public documentation, compare the available products, and learn about the team. Sign in to manage your account.";
  const subresourceFailure = scanEvidence({ screenshots: [], text });
  subresourceFailure.networkEvents.push({ requestId: "account-api", resourceType: "fetch", isMainFrame: true } as NetworkEvent);
  subresourceFailure.networkResponseEvents.push({ requestId: "account-api", status: 401 } as NetworkResponseEvent);
  for (const evidence of [
    scanEvidence({ screenshots: [], text }),
    subresourceFailure,
    scanEvidence({ screenshots: [], text, priorMainDocumentStatus: 401, finalMainDocumentStatus: 200 }),
  ]) {
    assert.notEqual(buildScanNoGoAssessment(evidence)?.scanNoGoAssessment.decision, "no_go");
  }
});

test("independently recovered target content preserves the existing partial-result path", () => {
  const lanes = buildScanEvidenceLaneAssessment({
    normalizedUrl: "https://example.test/",
    policySurfaceObservations: [usablePolicySurface()],
    runtimeCoverage: unavailableRuntimeCoverage(),
    scanNoGoAssessment: {
      ...terminalNoGoAssessment(),
      decision: "continue_with_diagnostics",
      reasonCodes: ["authentication_required"],
      supportingSignals: { mainDocumentStatus: 401 },
    },
    transportSecurityObservationCount: 1,
  });
  assert.equal(lanes.outcome, "partial_with_diagnostics");
});

test("verified cross-site first-party brand policy keeps the policy lane usable", () => {
  const policy = usablePolicySurface();
  policy.url = "https://privacy.example-parent.test/policycenter/consumer/en-us/";
  policy.normalizedUrl = policy.url;
  policy.targetRelationship = "first_party_brand";
  policy.ownershipConfidence = 0.78;
  policy.ownershipReasonCodes = [
    "cross_site_document",
    "target_brand_named_in_controller_context",
  ];
  const assessment = buildScanEvidenceLaneAssessment({
    normalizedUrl: "https://examplenews.test/",
    policySurfaceObservations: [policy],
    runtimeCoverage: unavailableRuntimeCoverage(),
    scanNoGoAssessment: terminalNoGoAssessment(),
    transportSecurityObservationCount: 0,
  });

  assert.equal(assessment.outcome, "partial_with_diagnostics");
  assert.equal(assessment.lanes.policyGdpr, "usable");
  assert.deepEqual(assessment.usablePolicySurfaceUrls, [policy.url]);
});

test("a discovered link or weak policy excerpt cannot upgrade a terminal no-go", () => {
  const weak = usablePolicySurface();
  weak.status = "observed";
  weak.textExcerpt = "Privacy policy";
  const assessment = buildScanEvidenceLaneAssessment({
    normalizedUrl: "https://example.test/",
    policySurfaceObservations: [weak],
    runtimeCoverage: unavailableRuntimeCoverage(),
    scanNoGoAssessment: terminalNoGoAssessment(),
    transportSecurityObservationCount: 0,
  });

  assert.equal(assessment.outcome, "no_go");
  assert.equal(assessment.lanes.policyGdpr, "limited");
});

test("ordinary usable runtime remains usable without policy evidence", () => {
  const runtimeCoverage = unavailableRuntimeCoverage();
  runtimeCoverage.coverageStatus = "usable";
  const assessment = buildScanEvidenceLaneAssessment({
    normalizedUrl: "https://example.test/",
    policySurfaceObservations: [],
    runtimeCoverage,
    scanNoGoAssessment: null,
    transportSecurityObservationCount: 1,
  });

  assert.equal(assessment.outcome, "usable");
  assert.equal(assessment.lanes.homepageRuntime, "usable");
});

test("a placeholder-only visual capture remains eligible for independent screenshot recovery", () => {
  const placeholderResult = {
    collectionSurfaceObservations: [],
    cookieEvents: [{}],
    moduleRun: { errors: ["1x1 screenshot placeholder used after screenshot capture failures."] },
    networkEvents: [{}],
    networkResponseEvents: [],
    screenshots: [{
      artifactId: "screenshot_pre_consent",
      captureMethod: "primary_placeholder",
    }],
    vendorResolverInputs: [],
    visualCapture: {
      status: "placeholder",
      failureReason: "placeholder_used",
      notes: ["A 1x1 screenshot placeholder was retained."],
    },
  };

  assert.equal(shouldAttemptScreenshotOnlyFallback(placeholderResult as never, "always"), true);
  assert.equal(shouldAttemptScreenshotOnlyFallback(placeholderResult as never, "never"), false);
});

test("a runtime-only lane never starts consent visual recovery for an incomplete inventory", () => {
  const incompleteResult = {
    collectionSurfaceObservations: [],
    consentUiObservations: [{ captureStatus: "incomplete", controls: [] }],
    cookieEvents: [],
    moduleRun: { errors: ["consent_ui_capture_timed_out"] },
    networkEvents: [],
    networkResponseEvents: [],
    screenshots: [],
    vendorResolverInputs: [],
    visualCapture: {
      status: "unavailable",
      failureReason: "consent_ui_capture_timed_out",
      notes: [],
    },
  };

  assert.equal(shouldAttemptIncompleteConsentVisualFallback(incompleteResult as never, "never"), false);
  assert.equal(shouldAttemptIncompleteConsentVisualFallback(incompleteResult as never, "always"), true);
});

test("a complete same-document consent proof does not start an independent recovery browser", () => {
  const completeResult = {
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 25_000,
      captureStatus: "observed",
      inventoryOutcome: "complete_with_controls",
      likelyPresent: true,
      layerInspected: "first_layer",
      documentUrl: "https://example.test/",
      documentIdentity: { source: "cdp_loader_id", token: "loader-1" },
      captureDiagnostics: {
        completedChannels: ["dom_inventory", "geometry", "accessibility_tree"],
        timedOutChannels: [],
        failedChannels: [],
      },
      basis: [
        "inventory:paired_settled_frame_completed",
        "geometry:captured",
      ],
      controls: [{}],
    }],
    moduleRun: { status: "partial", errors: ["late consent control screenshot failed"] },
    screenshots: [{
      artifactId: "screenshot_pre_consent_settled",
      capturedAtMs: 8_000,
      captureMethod: "primary_viewport_fallback",
      documentIdentity: { source: "cdp_loader_id", token: "loader-1" },
      path: "/tmp/screenshot.png",
      url: "https://example.test/",
      pagePhase: "network_idle",
      consentStateAtTime: "pre_consent",
    }],
    visualCapture: { status: "available", artifactRefs: [], notes: [] },
  };

  assert.equal(hasCompleteRetainedConsentProofPacket(completeResult as never), true);
  assert.equal(shouldAttemptIncompleteConsentVisualFallback(completeResult as never, "always"), false);

  completeResult.screenshots[0]!.documentIdentity.token = "loader-2";
  assert.equal(hasCompleteRetainedConsentProofPacket(completeResult as never), false);
  assert.equal(shouldAttemptIncompleteConsentVisualFallback(completeResult as never, "always"), true);
});

test("a 1x1 placeholder cannot corroborate sparse-page or visual no-go evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-placeholder-"));
  try {
    const screenshotPath = path.join(directory, "placeholder.png");
    const bytes = Buffer.alloc(68, 0);
    Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
    bytes.writeUInt32BE(1, 16);
    bytes.writeUInt32BE(1, 20);
    await writeFile(screenshotPath, bytes);
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 8,
      screenshots: [{
        artifactId: "screenshot_pre_consent_no_go_confirmation",
        capturedAtMs: 2_000,
        captureMethod: "primary_placeholder",
        path: screenshotPath,
        url: "https://example.test/",
        pagePhase: "network_idle",
        consentStateAtTime: "pre_consent",
      }],
    }));

    assert.equal(assessment, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("consent controls prevent a sparse privacy gateway from becoming no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-consent-gateway-"));
  try {
    const screenshot = await retainedScreenshot(directory, { substantive: true });
    const assessment = buildScanNoGoAssessment(scanEvidence({
      consentUiObservations: [consentObservation({ controlLabel: "Akkoord" })],
      firstPartySuccesses: 2,
      screenshots: [screenshot],
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("actionable_consent_control_observed"));
    assert.equal(assessment?.scanNoGoAssessment.supportingSignals.visuallySubstantiveScreenshotObserved, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("substantial first-party activity and a substantive screenshot contradict sparse DOM", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-substantive-screenshot-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 8,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("multiple_first_party_resources_loaded"));
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("visually_substantive_screenshot_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a successful main document followed by a blocked redirect is diagnostic when the retained page is substantive", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-late-block-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      finalMainDocumentStatus: 403,
      firstPartySuccesses: 10,
      priorMainDocumentStatus: 200,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Welcome to Example. This retained page contains normal navigation, product information, customer support, account details, current news, and several useful links for visitors. The complete public website loaded before a later background request returned a blocked response.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("successful_main_document_before_terminal_state"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a visually blank settled screenshot remains no-go even when policy surfaces were found", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-blank-screenshot-with-policy-"));
  try {
    const assessment = buildScanNoGoAssessment({
      ...scanEvidence({
        screenshots: [await retainedScreenshot(directory, { substantive: false })],
      }),
      policySurfaceObservations: [usablePolicySurface()],
    });

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "blank_or_unusable_page");
    assert.equal(assessment?.visualAccessReview.page_state, "blank_or_unusable");
    assert.ok(assessment?.scanNoGoAssessment.corroboratorCodes.includes("retained_visual_artifact_available"));
    assert.equal(assessment?.scanNoGoAssessment.supportingSignals.visuallyBlankScreenshotObserved, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a substantive supplemental JPEG prevents an early blank viewport from becoming blank-page no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-supplemental-jpeg-"));
  try {
    const blankViewport = await retainedScreenshot(directory, { substantive: false });
    blankViewport.artifactId = "screenshot_pre_consent";
    const supplemental = await retainedJpegScreenshot(directory);
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 4,
      screenshots: [blankViewport, supplemental],
      text: "Welcome to Example"
    }));

    assert.equal(assessment, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an acquired-business landing page is a target-site placeholder, not a blank page", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-acquired-business-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 4,
      screenshots: [
        await retainedScreenshot(directory, { substantive: false }),
        await retainedJpegScreenshot(directory)
      ],
      text: "The R.O.EYE agency business has been acquired by Acceleration Partners. Please click here to continue to their website"
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "parked_or_placeholder");
    assert.equal(assessment?.visualAccessReview.artifact_ref, "scan_core:screenshot_pre_consent_full_page");
    assert.equal(assessment?.scanNoGoAssessment.supportingSignals.visuallySubstantiveScreenshotObserved, true);
    assert.equal(assessment?.scanNoGoAssessment.supportingSignals.visuallyBlankScreenshotObserved, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a partial runtime with no retained page evidence is no-go", () => {
  const assessment = buildScanNoGoAssessment({
    consentUiObservations: [],
    domSnapshots: [{ textExcerpt: "" } as DomSnapshotArtifact],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "partial",
      errors: ["Pre-consent runtime reached its 35000ms module budget; retained bounded partial evidence."],
    }] as never,
    networkEvents: [{}, {}, {}, {}] as NetworkEvent[],
    networkResponseEvents: [],
    policySurfaceObservations: [],
    screenshots: [],
  });

  assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
  assert.equal(assessment?.primaryReasonCode, "loading_or_stalled");
  assert.ok(assessment?.scanNoGoAssessment.corroboratorCodes.includes("partial_runtime_without_page_evidence"));
});

test("an infrastructure homepage target is separated from a generic loading stall", () => {
  const assessment = buildScanNoGoAssessment({
    consentUiObservations: [],
    domSnapshots: [{ textExcerpt: "" } as DomSnapshotArtifact],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "partial",
      errors: ["Pre-consent runtime reached its module budget; retained bounded partial evidence."],
    }] as never,
    normalizedUrl: "https://alicdn.com/",
    networkEvents: [{}, {}] as NetworkEvent[],
    networkResponseEvents: [],
    policySurfaceObservations: [],
    screenshots: [],
  });

  assert.equal(assessment?.primaryReasonCode, "target_unreachable_or_unsuitable");
  assert.equal(assessment?.visualAccessReview.page_state, "capture_failed");
});

test("navigation no-go preserves TLS and unsuitable-target distinctions", () => {
  const tlsAssessment = buildScanNoGoAssessment({
    consentUiObservations: [],
    domSnapshots: [],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "failed",
      errors: ["page.goto: net::ERR_CERT_COMMON_NAME_INVALID at https://example.com/"],
    }] as never,
    normalizedUrl: "https://example.com/",
    networkEvents: [],
    networkResponseEvents: [],
    policySurfaceObservations: [],
    screenshots: [],
  });
  const targetAssessment = buildScanNoGoAssessment({
    consentUiObservations: [],
    domSnapshots: [],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "failed",
      errors: ["page.goto: net::ERR_INVALID_AUTH_CREDENTIALS at https://ad-srv.net/"],
    }] as never,
    normalizedUrl: "https://ad-srv.net/",
    networkEvents: [],
    networkResponseEvents: [],
    policySurfaceObservations: [],
    screenshots: [],
  });

  assert.equal(tlsAssessment?.primaryReasonCode, "tls_or_certificate_error");
  assert.equal(targetAssessment?.primaryReasonCode, "target_unreachable_or_unsuitable");
});

test("partial runtime with a retained actionable banner stays diagnostic instead of becoming no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-partial-consent-evidence-"));
  try {
    const assessment = buildScanNoGoAssessment({
      ...scanEvidence({
        consentUiObservations: [consentObservation({ controlLabel: "Accept all" })],
        firstPartySuccesses: 4,
        screenshots: [await retainedScreenshot(directory, { substantive: true })],
        text: "Welcome to Example. Cookie choices are shown below.",
      }),
      modulesRun: [{
        moduleName: "preConsentRuntimeScanner",
        status: "partial",
        errors: ["Bounded geometry proof screenshot timed out after the page remained usable."],
      }] as never,
    });

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("actionable_consent_control_observed"));
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("visually_substantive_screenshot_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a late 403 cannot erase a substantial retained page load", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-late-403-rich-page-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      finalMainDocumentStatus: 403,
      firstPartySuccesses: 20,
      priorMainDocumentStatus: 200,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Access Denied. You do not have permission to access this resource.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("successful_main_document_before_terminal_state"));
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("multiple_first_party_resources_loaded"));
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("visually_substantive_screenshot_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit challenge copy outranks a generic 403 reason", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-challenge-reason-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      finalMainDocumentStatus: 403,
      screenshots: [await retainedScreenshot(directory, { substantive: false })],
      text: "Please verify you are a human. Press and hold to verify.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "captcha_or_challenge");
    assert.equal(assessment?.visualAccessReview.page_state, "captcha_or_challenge");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("localized commerce security interstitial is a no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-commerce-interstitial-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      screenshots: [await retainedScreenshot(directory, { substantive: false })],
      text: "Klicke auf die Schaltfläche unten, um mit dem Einkauf fortzufahren Weiter shoppen Unsere AGB Datenschutzerklärung",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "captcha_or_challenge");
    assert.equal(assessment?.visualAccessReview.page_state, "captcha_or_challenge");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("settled challenge text outranks generic words embedded in consent probe scripts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-challenge-dom-priority-"));
  try {
    const observation = consentObservation({ controlLabel: "" });
    observation.likelyPresent = false;
    observation.acceptControlObserved = false;
    observation.visibleChoiceLabels = [];
    observation.controls = [];
    observation.textExcerpt = `${"inline application script ".repeat(20)} request blocked`;
    const assessment = buildScanNoGoAssessment(scanEvidence({
      consentUiObservations: [observation],
      finalMainDocumentStatus: 403,
      screenshots: [await retainedScreenshot(directory, { substantive: false })],
      text: "Luarmor Checking Your Browser.. Show Details",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "captcha_or_challenge");
    assert.equal(assessment?.visualAccessReview.page_state, "captcha_or_challenge");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a genuine 403 with no usable-page contradictors remains no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-genuine-403-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      finalMainDocumentStatus: 403,
      screenshots: [await retainedScreenshot(directory, { substantive: false })],
      text: "403 Forbidden. Access denied.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "access_denied_or_forbidden_page");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocker-like wording inside substantive article content is diagnostic, not no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-article-copy-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 6,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Morning News Politics Business Culture Technology Sports Opinion Subscribe Sign in. The court heard that a visitor had previously been shown an access denied message while attempting to open the public record. Reporters reviewed the incident, interviewed the parties, and published the complete account with related stories, navigation links, author information, publication details, and reader comments.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.equal(assessment?.visualAccessReview.page_state, "degraded_but_useful");
    assert.equal(assessment?.scanNoGoAssessment.supportingSignals.likelyIncidentalAccessBlockText, true);
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("substantive_retained_dom_volume_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ThePrint-like representative page and consent modal contradict access-block wording", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-theprint-pattern-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      consentUiObservations: [consentObservation({ controlLabel: "Consent" })],
      firstPartySuccesses: 6,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Access denied",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.equal(assessment?.visualAccessReview.page_state, "degraded_but_useful");
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("actionable_consent_control_observed"));
    assert.ok(assessment?.scanNoGoAssessment.contradictorCodes.includes("visually_substantive_screenshot_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocker wording in consent-probe script text does not override settled page DOM", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-script-copy-"));
  try {
    const observation = consentObservation({ controlLabel: "" });
    observation.likelyPresent = false;
    observation.acceptControlObserved = false;
    observation.visibleChoiceLabels = [];
    observation.controls = [];
    observation.textExcerpt = `${"inline application script ".repeat(20)} request blocked`;
    const assessment = buildScanNoGoAssessment(scanEvidence({
      consentUiObservations: [observation],
      firstPartySuccesses: 6,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Example News Home World Business Science Culture. The settled public homepage contains current stories, normal navigation, publication details, account links, article summaries, images, and a complete footer for readers.",
    }));

    assert.equal(assessment, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an initial security challenge that resolves into a representative page remains usable with diagnostics", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-resolved-challenge-"));
  try {
    const evidence = scanEvidence({
      firstPartySuccesses: 6,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Example Store Products Services Support Account. The final public storefront loaded with product navigation, pricing, customer information, help links, company details, and a complete footer after the initial request settled.",
    });
    evidence.networkEvents.push({
      thirdParty: false,
      url: "https://example.test/cdn-cgi/challenge-platform/scripts/jsd/main.js",
    } as NetworkEvent);
    const assessment = buildScanNoGoAssessment(evidence);

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.equal(assessment?.visualAccessReview.page_state, "degraded_but_useful");
    assert.ok(assessment?.scanNoGoAssessment.corroboratorCodes.includes("network_security_challenge_request_observed"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a blocked third-party challenge resource does not make a representative page no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-third-party-block-"));
  try {
    const evidence = scanEvidence({
      firstPartySuccesses: 6,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Example Magazine Latest Features Reviews Guides Subscribe. The representative public page includes normal editorial content, site navigation, account controls, article links, contact information, and a complete footer.",
    });
    evidence.networkEvents.push({
      requestId: "third-party-challenge",
      thirdParty: true,
      url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1",
    } as NetworkEvent);
    evidence.networkResponseEvents.push({
      firstParty: false,
      requestId: "third-party-challenge",
      status: 403,
    } as NetworkResponseEvent);
    const assessment = buildScanNoGoAssessment(evidence);

    assert.equal(assessment?.scanNoGoAssessment.decision, "continue_with_diagnostics");
    assert.equal(assessment?.visualAccessReview.page_state, "degraded_but_useful");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a polished but corroborated access-denied page remains no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-polished-access-block-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      firstPartySuccesses: 8,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Access denied. Your request blocked by the security service used to protect this site from online attacks. Reference information, support links, incident details, request identifiers, troubleshooting instructions, branding, navigation, and contact options are provided below so the site owner can investigate the blocked request.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "access_denied_or_forbidden_page");
    assert.equal(assessment?.visualAccessReview.page_state, "access_blocked");
    assert.ok(Number(assessment?.scanNoGoAssessment.supportingSignals.accessBlockMarkerCount) >= 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ordinary scheduled-maintenance navigation text does not make a usable site no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-scheduled-maintenance-navigation-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      consentUiObservations: [consentObservation({ controlLabel: "Accept all" })],
      firstPartySuccesses: 8,
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "JOKER.COM Domain Registration Web Hosting Email Scheduled Maintenances Support Search your domain names and explore our hosting plans. Cookie preferences are available below.",
    }));

    assert.equal(assessment, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a genuine scheduled-maintenance notice remains no-go", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-genuine-maintenance-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      screenshots: [await retainedScreenshot(directory, { substantive: false })],
      text: "Scheduled maintenance. The site is temporarily unavailable while we perform updates. We'll be back soon.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, "maintenance_or_unavailable");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a substantive screenshot alone cannot clear access-block evidence", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-no-go-screenshot-only-"));
  try {
    const assessment = buildScanNoGoAssessment(scanEvidence({
      screenshots: [await retainedScreenshot(directory, { substantive: true })],
      text: "Access denied.",
    }));

    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.visualAccessReview.page_state, "access_blocked");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function scanEvidence(input: {
  consentUiObservations?: ConsentUiObservation[];
  finalMainDocumentStatus?: number;
  firstPartySuccesses?: number;
  priorMainDocumentStatus?: number;
  policySurfaceObservations?: PolicySurfaceObservation[];
  screenshots: ScreenshotArtifact[];
  text?: string;
}) {
  const networkEvents: NetworkEvent[] = [];
  const networkResponseEvents: NetworkResponseEvent[] = [];
  const documentStatuses = [input.priorMainDocumentStatus, input.finalMainDocumentStatus ?? 200]
    .filter((status): status is number => typeof status === "number");
  documentStatuses.forEach((status, index) => {
    const requestId = `document-${index}`;
    networkEvents.push({ requestId, resourceType: "document", isMainFrame: true } as NetworkEvent);
    networkResponseEvents.push({ requestId, firstParty: true, status } as NetworkResponseEvent);
  });
  for (let index = 0; index < (input.firstPartySuccesses ?? 0); index += 1) {
    networkResponseEvents.push({ firstParty: true, status: 200 } as NetworkResponseEvent);
  }
  return {
    consentUiObservations: input.consentUiObservations ?? [],
    domSnapshots: [{ textExcerpt: input.text ?? "" } as DomSnapshotArtifact],
    modulesRun: [],
    networkEvents,
    networkResponseEvents,
    policySurfaceObservations: input.policySurfaceObservations ?? [],
    screenshots: input.screenshots,
  };
}

function consentObservation(input: { controlLabel: string }): ConsentUiObservation {
  return {
    observationId: "consent-observation",
    observedAtMs: 100,
    likelyPresent: true,
    basis: ["visible_control"],
    visibleChoiceLabels: [input.controlLabel],
    acceptControlObserved: true,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [{
      actionType: "accept_all",
      classifierReasonCodes: ["matched_accept"],
      label: input.controlLabel,
      visible: true,
    }],
    evidenceRefs: [],
    confidence: 0.95,
  };
}

async function retainedScreenshot(
  directory: string,
  input: { substantive: boolean },
): Promise<ScreenshotArtifact> {
  const screenshotPath = path.join(directory, "confirmation.png");
  const byteLength = input.substantive ? 100_000 : 8_000;
  const bytes = Buffer.alloc(byteLength, input.substantive ? 0x5a : 0);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(1366, 16);
  bytes.writeUInt32BE(900, 20);
  await writeFile(screenshotPath, bytes);
  return {
    artifactId: "screenshot_pre_consent_no_go_confirmation",
    capturedAtMs: 2_000,
    captureMethod: "primary_viewport_fallback",
    path: screenshotPath,
    url: "https://example.test/",
    pagePhase: "network_idle",
    consentStateAtTime: "pre_consent",
  };
}

async function retainedJpegScreenshot(directory: string): Promise<ScreenshotArtifact> {
  const screenshotPath = path.join(directory, "supplemental-full-page.jpg");
  const bytes = Buffer.alloc(60_000, 0x5a);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xa3, 0x04, 0x01, 0x03, 0x01, 0x11, 0x00]).copy(bytes, 0);
  await writeFile(screenshotPath, bytes);
  return {
    artifactId: "screenshot_pre_consent_full_page",
    capturedAtMs: 4_000,
    captureMethod: "primary_full_page",
    path: screenshotPath,
    url: "https://example.test/",
    pagePhase: "network_idle",
    consentStateAtTime: "pre_consent",
  };
}

function unavailableRuntimeCoverage(): RuntimeCoverageSummary {
  return {
    coverageStatus: "limited_none",
    limitationKeys: ["access_denied_or_forbidden_page"],
    fallbackModesUsed: [],
    observationCounts: {
      networkEvents: 1,
      thirdPartyRequests: 0,
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      normalizedVendors: 0,
      observedJourneys: 0,
    },
    silentEmpty: false,
    notes: [],
  };
}

function terminalNoGoAssessment() {
  return {
    status: "available" as const,
    version: "scan-no-go-assessment-v1" as const,
    decision: "no_go" as const,
    scanNoGoConfidence: 0.95,
    reasonCodes: ["access_denied_or_forbidden_page"],
    corroboratorCodes: ["terminal_page_text_or_status_observed"],
    contradictorCodes: [],
    supportingSignals: {},
    evidenceRefs: ["scan_runtime_artifacts.scan_no_go_assessment"],
  };
}

function usablePolicySurface(): PolicySurfaceObservation {
  return {
    observationId: "policy-surface",
    sourceScanner: "policy_surface",
    scenario: "policy_surface_review",
    consentStateAtTime: "not_applicable",
    surfaceType: "privacy_policy",
    url: "https://example.test/privacy",
    normalizedUrl: "https://example.test/privacy",
    discoveryMethod: "footer_link",
    status: "fetched",
    httpStatus: 200,
    fetchable: true,
    textExcerpt: "We collect and use personal information to provide our services. You may contact our privacy team to exercise access, correction, deletion, objection, and portability rights. We retain personal data only for defined periods and disclose service provider categories, legal bases, international transfer safeguards, complaint rights, and controller contact information. This notice explains the purposes of processing and how individuals may withdraw consent.",
    productJourneyCount: 0,
    trackerJourneyCount: 0,
    cookieJourneyCount: 0,
    scriptJourneyCount: 0,
    endpointJourneyCount: 0,
    activeCollectionJourneyCount: 0,
    consentManagementJourneyCount: 0,
    notes: [],
    evidenceRefs: [{ refId: "policy-excerpt", url: "https://example.test/privacy" }],
  } as PolicySurfaceObservation;
}

// Exact retained starting-document text; no artifact read or browser run in these tests.
const retainedCharacterChallengeText = "Enter the characters seen in the image below:\n\nDownload audio CAPTCHA\nAnswer\nSubmit";
const retainedCapacityHoldingText = "Sit tight\n\nWe’ve got our hands full at the moment but we should be up and moving shortly.\nThis page will automatically refresh and bring you into the website as soon as we can handle it.\n\n \t\nU.S. & CANADA\n\t \n\nIf you live in the United States or Canada and need to contact us immediately, please call 1.800.638.6464 or email customer_service@patagonia.com.\n\n \t\nEUROPE\n\t \n\nEuropean customers can email directsales.europe@patagonia.com or reach us by phone.\n\nAustria : (+43) 512 219 532\nDenmark : 804 04 938\nFrance : (+33) 450 88 44 92\nGermany : (+49) 89 2620 79666\nIreland : (+353) 766 705 887\nItaly : (+39) 047 48 61 000\nSwitzerland : (+41) 215 60 61 10\nNetherlands : (+31) 202 990 787\nUnited Kingdom : (+44) 203 636 9222\nSpain : (+34) 518 89 92 53\n \t\nJAPAN\n\t \n\nご迷惑をお掛けしておりますが、現在ウェブサイトがご利用いただけません。\n恐れ入りますがしばらくのあいだご静観願います。準備でき次第、ページが自動的に更新されてサイトが表示されます。\n\nお急ぎの場合は、電話またはメールにてお問い合わせください。\n電話 ： 受付時間 9：00-17：00（日・祝日も営業）\n0800-8887-447（フリーコール・通話料無料）\n045-435-6100（IP電話/携帯電話専用・通話料有料）\nメール： customerservice.japan@patagonia.com\n\nPHOTO: Sonnie Trotter";

test("explicit character-entry challenge and capacity-holding pages remain no-go with successful HTTP", () => {
  for (const [text, reason] of [
    [retainedCharacterChallengeText, "captcha_or_challenge"],
    [retainedCapacityHoldingText, "maintenance_or_unavailable"],
  ] as const) {
    assert.equal(classifyScanNoGoTextForCalibration(text)?.reasonCode, reason);
    const assessment = buildScanNoGoAssessment(scanEvidence({ text, screenshots: [], firstPartySuccesses: 4 }));
    assert.equal(assessment?.scanNoGoAssessment.decision, "no_go");
    assert.equal(assessment?.primaryReasonCode, reason);
  }
});

test("CAPTCHA help, quoted access shells and ordinary capacity/refresh content remain usable", () => {
  const ordinaryPages = [
    "Support: CAPTCHA accessibility. Enter the characters seen in the image below: Download audio CAPTCHA Answer Submit. These labels describe the sample form in our guide. Contact support if the audio cannot be played.",
    `Accessibility guide: the example challenge reads “${retainedCharacterChallengeText}”. Our documentation explains accessible alternatives and provides keyboard instructions.`,
    `Capacity planning article: the example holding screen says “${retainedCapacityHoldingText}”. This is an illustration of a queue rather than the current page state.`,
    "Capacity dashboard. We have our hands full with orders today. This page will automatically refresh its capacity metrics every minute. Browse products and choose a delivery date to continue.",
    "Sit tight. We have plenty of capacity for your booking. Refresh the page to see updated availability, or continue browsing the timetable below.",
    "Enter the characters seen in the image below: Download audio CAPTCHA Answer Submit Products Pricing Documentation Support Contact. This demonstration appears alongside our normal public product content.",
    `“${retainedCharacterChallengeText}”`,
    `“${retainedCapacityHoldingText}”`,
  ];
  for (const text of ordinaryPages) {
    assert.equal(classifyScanNoGoTextForCalibration(text), null, text);
    assert.equal(buildScanNoGoAssessment(scanEvidence({ text, screenshots: [], firstPartySuccesses: 8 })), null, text);
  }
});
