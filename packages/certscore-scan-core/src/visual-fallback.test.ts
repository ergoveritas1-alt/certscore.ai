import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  boundedPreConsentVisualFallbackDeadlineMs,
  capturePreConsentScreenshotOnlyFallback,
  consentInspectionNeedsRecovery,
} from "./index.js";
import { classifyVisualCaptureFailureReason } from "./scanners/pre-consent-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

test("visual fallback starts only when the scanner has a meaningful deadline budget", () => {
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({ configuredDeadlineMs: 6_000 }), 6_000);
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({
    absoluteDeadlineAtMs: 20_000,
    configuredDeadlineMs: 6_000,
    nowMs: 15_000,
  }), 5_000);
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({
    absoluteDeadlineAtMs: 20_000,
    configuredDeadlineMs: 6_000,
    nowMs: 19_001,
  }), null);
});

test("visual capture distinguishes renderer crashes from browser and page closure", () => {
  assert.equal(
    classifyVisualCaptureFailureReason("page.screenshot: Target crashed while capturing"),
    "renderer_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("browser has disconnected"),
    "browser_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Target page, context or browser has been closed"),
    "page_closed",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Supplemental full-page screenshot timed out"),
    "screenshot_timeout",
  );
});

test("typed partial consent diagnostics trigger recovery without relying on error wording", () => {
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1,
      captureStatus: "incomplete",
      captureDiagnostics: {
        completedChannels: ["screenshot"],
        timedOutChannels: ["dom_inventory"],
        failedChannels: [],
      },
      likelyPresent: false,
      basis: ["bounded module deadline reached"],
      visibleChoiceLabels: [],
      defaultTogglePurposeLabels: [],
      precheckedOptionalPurposeCount: 0,
      precheckedOptionalPurposeLabels: [],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: false,
      controls: [],
      impliedConsentLanguageObserved: false,
      impliedConsentLanguageEvidence: [],
      evidenceRefs: [],
      confidence: 0.4,
    }],
  }), true);
});

test("typed consent recovery covers partial modules and missing geometry channels", () => {
  const observedControls = {
    observationId: "consent_ui_pre_consent",
    observedAtMs: 1,
    captureStatus: "observed" as const,
    likelyPresent: true,
    basis: ["settled_control_inventory_completed"],
    visibleChoiceLabels: ["Accept All"],
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: true,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    impliedConsentLanguageObserved: false,
    impliedConsentLanguageEvidence: [],
    evidenceRefs: [],
    confidence: 0.8,
  };
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [observedControls],
  }), true);
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "completed",
    observations: [{
      ...observedControls,
      captureStatus: "no_evidence",
      likelyPresent: false,
      basis: ["settled_control_inventory_completed", "geometry_capture_unavailable"],
    }],
  }), true);
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [{
      ...observedControls,
      captureDiagnostics: {
        completedChannels: ["dom_inventory", "geometry"],
        timedOutChannels: [],
        failedChannels: [],
      },
      basis: [
        "settled_control_inventory_completed",
        "geometry:captured",
        "recovery:independent_consent_capture_completed",
      ],
    }],
  }), false);
});

test("visual fallback retains bounded consent-surface evidence with the screenshot", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent");
    assert.equal(result.screenshot.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.domSnapshot?.artifactId, "dom_text_pre_consent");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
    assert.equal(
      result.consentUiObservation?.visibleChoiceLabels.some((label) => /\breject all\b/i.test(label)),
      true,
    );
    assert.equal(
      result.visualCapture.notes.some((note) => /consent-surface evidence/.test(note)),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("full-page visual fallback preserves late consent surfaces after incomplete inspection", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-full-page-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent_full_page");
    assert.equal(result.screenshot.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.pagePhase, "network_idle");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bounded consent recovery retains canonical DOM inventory and geometry evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-consent-recovery-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
      recoverConsentEvidence: true,
      fallbackDeadlineMs: 6_000,
    });

    assert.equal(result.consentRecoveryCompleted, true);
    assert.equal(result.screenshot, undefined);
    assert.equal(result.consentUiObservation?.captureStatus, "observed");
    assert.ok(result.consentUiObservation?.captureDiagnostics?.completedChannels.includes("dom_inventory"));
    assert.ok(result.consentUiObservation?.captureDiagnostics?.completedChannels.includes("geometry"));
    assert.ok(result.consentUiObservation?.basis.includes("recovery:independent_consent_capture_completed"));
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
    await access(path.join(tempRoot, "ConsentControlGeometryEvidence.json"));
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bounded consent recovery can retain complete no-surface evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-consent-recovery-negative-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("policy-footer-privacy"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
      recoverConsentEvidence: true,
      fallbackDeadlineMs: 6_000,
    });

    assert.equal(result.consentRecoveryCompleted, true);
    assert.equal(result.consentUiObservation?.captureStatus, "no_evidence");
    assert.equal(result.consentUiObservation?.likelyPresent, false);
    assert.equal(result.consentUiObservation?.controls.length, 0);
    assert.ok(result.consentUiObservation?.basis.includes("settled_control_inventory_completed"));
    assert.ok(result.consentUiObservation?.basis.includes("geometry:captured"));
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
