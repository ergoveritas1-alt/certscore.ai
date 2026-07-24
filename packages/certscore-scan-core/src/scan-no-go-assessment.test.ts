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
import {
  buildScanEvidenceLaneAssessment,
  buildScanNoGoAssessment,
  shouldAttemptScreenshotOnlyFallback,
} from "./index.js";

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
