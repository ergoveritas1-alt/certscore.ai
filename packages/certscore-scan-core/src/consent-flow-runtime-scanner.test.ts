import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  type NanoConsentUiAssistProvider,
  consentFlowRuntimeScanner,
} from "./scanners/consent-flow-runtime-scanner.js";
import { startStaticFixtureServer, type StaticFixturePage } from "./test-fixtures/static-server.js";

const gaRoute = {
  urlPattern: /https:\/\/www\.google-analytics\.com\/g\/collect/i,
  status: 204,
  contentType: "text/plain",
  body: "",
};

const googleAdsRoute = {
  urlPattern: /https:\/\/googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion/i,
  status: 204,
  contentType: "text/plain",
  body: "",
};

test("consentFlowRuntimeScanner detects accept/reject controls and action success", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    assert.equal(result.moduleRun.status, "completed");
    assert.ok(result.consentActionCandidates.some((candidate) => candidate.actionType === "accept_all"));
    assert.ok(result.consentActionCandidates.some((candidate) => candidate.actionType === "reject_all"));
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateObserved, true);
    assert.equal(rejectAttempt?.actionProof?.attemptedStatus, "attempted_succeeded");
    assert.equal((rejectAttempt?.actionProof?.postClickSettleMs ?? 0) >= 1_200, true);
    assert.ok(rejectAttempt?.actionProof?.beforeScreenshotRef);
    assert.ok(rejectAttempt?.actionProof?.afterScreenshotRef);
    assert.ok(result.consentActionAttempts.some((attempt) => attempt.actionType === "accept_all" && attempt.succeeded));
    assert.ok(result.consentFlowComparisons.some((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_accept" &&
      comparison.collectionEndpointsAppearingOnlyAfterAccept.includes("www.google-analytics.com"),
    ));
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
    assert.equal(rejectComparison?.comparableMeasurement?.rejectActionEvent?.proofAvailable, true);
    const gpcComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_gpc_enabled",
    );
    assert.ok(gpcComparison);
    const gpcHeaderRetained = result.networkEvents.some((event) =>
      event.scenario === "gpc_enabled" && event.requestHeaders?.secGpc === "1"
    );
    assert.equal(gpcComparison.comparableMeasurement?.comparable, gpcHeaderRetained);
    if (!gpcHeaderRetained) {
      assert.equal(gpcComparison.comparableMeasurement?.reason, "gpc_request_header_marker_not_retained");
    }
    assert.equal(gpcComparison?.comparableMeasurement?.postActionWindow.scenario, "gpc_enabled");
    assert.equal(gpcComparison?.vendorsAppearingOnlyAfterAccept.length, 0);
  });
});

test("consentFlowRuntimeScanner records post-choice cookie preference reopen controls", async () => {
  await withConsentFlowScan("consent-post-choice-reopen-control", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );
    const reopenAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reopen_preferences"
    );

    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(reopenAttempt?.viaPreferenceCenter, true);
    assert.equal(reopenAttempt?.attempted, true);
    assert.equal(reopenAttempt?.succeeded, true);
    assert.equal(reopenAttempt?.actionProof?.candidateLabelText, "Cookie Settings");
    assert.equal(reopenAttempt?.actionProof?.candidateNormalizedActionType, "manage_preferences");
    assert.equal(reopenAttempt?.preferenceCenterTraversal?.openSucceeded, true);
    assert.equal(reopenAttempt?.preferenceCenterTraversal?.secondLayerObserved, true);
    assert.equal(reopenAttempt?.preferenceCenterTraversal?.saveChoicesControlObserved, true);
    assert.equal(reopenAttempt?.preferenceCenterTraversal?.attemptedRejectViaPreferenceCenter, false);
    assert.equal(reopenAttempt?.preferenceCenterTraversal?.attemptedSaveChoices, false);
  });
});

test("consentFlowRuntimeScanner deterministically rejects deny non-essential controls", async () => {
  await withConsentFlowScan("consent-deny-non-essential", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );

    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Deny Non-Essential");
    assert.equal(rejectAttempt?.actionProof?.candidateDetectionMethod, "deterministic_text");
    assert.equal(rejectAttempt?.actionProof?.attemptedStatus, "attempted_succeeded");
  });
});

test("consentFlowRuntimeScanner treats accept essential as non-essential reject proof", async () => {
  await withConsentFlowScan("consent-accept-essential", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );
    const acceptEssentialCandidate = result.consentActionCandidates.find((candidate) =>
      candidate.normalizedLabel === "accept essential"
    );

    assert.equal(acceptEssentialCandidate?.actionType, "reject_all");
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Accept Essential");
  }, {
    nanoConsentUiAssistProvider: {
      async classifyControls(input) {
        return {
          assistId: input.assistId,
          classifications: input.candidates
            .filter((candidate) => candidate.normalizedLabel === "accept essential")
            .map((candidate) => ({
              actionId: candidate.actionId,
              actionType: "accept_all" as const,
              confidence: 0.95,
              shouldClick: true,
            })),
        };
      },
    },
  });
});

test("consentFlowRuntimeScanner writes internal replay artifacts when enabled", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const replayRefs = result.artifactRefs.filter((ref) => ref.artifactId.startsWith("replay_"));

    assert.ok(replayRefs.some((ref) => ref.artifactType === "json" && ref.label === "Consent-flow replay manifest"));
    assert.ok(replayRefs.some((ref) => ref.artifactType === "network_archive" && ref.label === "Consent-flow replay HAR"));
    assert.ok(replayRefs.some((ref) => ref.artifactType === "storage_snapshot" && ref.label === "Consent-flow replay storage state"));
    assert.equal(replayRefs.some((ref) => ref.artifactType === "other" && ref.label === "Consent-flow Playwright trace"), false);
    assert.ok(replayRefs.some((ref) => ref.artifactType === "json" && ref.label === "Consent-flow replay controls"));
    assert.ok(replayRefs.some((ref) => ref.artifactType === "json" && ref.label === "Consent-flow replay frame snapshots"));
    assert.equal(replayRefs.some((ref) => ref.artifactType === "network_archive" && /\.har\.zip$/i.test(ref.path ?? "")), true);
    assert.equal(replayRefs.every((ref) => ref.sensitivity === "internal_only"), true);

    for (const ref of replayRefs) {
      assert.ok(ref.path);
      assert.equal(existsSync(ref.path), true, ref.path);
    }
  }, { captureReplay: true });
});

test("consentFlowRuntimeScanner can opt into Playwright trace replay artifacts", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const replayRefs = result.artifactRefs.filter((ref) => ref.artifactId.startsWith("replay_"));

    assert.ok(replayRefs.some((ref) => ref.artifactType === "other" && ref.label === "Consent-flow Playwright trace"));
  }, { captureReplay: true, captureReplayTrace: true });
});

test("consentFlowRuntimeScanner records tracking persistence after reject", async () => {
  await withConsentFlowScan("consent-tracking-persists-after-reject", async ({ result }) => {
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );
    assert.equal(rejectComparison?.collectionEndpointsPersistingAfterReject.includes("www.google-analytics.com"), true);
  });
});

test("consentFlowRuntimeScanner records CCPA privacy opt-out proof with advertising comparison", async () => {
  await withConsentFlowScan("consent-privacy-opt-out-ad-comparison", async ({ result }) => {
    const optOutAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "privacy_opt_out_flow" &&
      attempt.actionType === "do_not_sell_share" &&
      attempt.succeeded
    );
    const optOutComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out"
    );

    assert.ok(optOutAttempt);
    assert.equal(optOutAttempt?.attempted, true);
    assert.equal(optOutAttempt?.succeeded, true);
    assert.equal(optOutAttempt?.actionProof?.candidateNormalizedActionType, "do_not_sell_share");
    assert.equal(optOutAttempt?.actionProof?.attemptedStatus, "attempted_succeeded");
    assert.equal(optOutComparison?.comparableMeasurement?.comparable, true);
    assert.equal(optOutComparison?.comparableMeasurement?.postActionWindow.scenario, "privacy_opt_out_flow");
    assert.equal(optOutComparison?.comparableMeasurement?.rejectActionEvent?.attemptId, optOutAttempt?.attemptId);
    assert.equal(optOutComparison?.collectionEndpointsSuppressedAfterReject.includes("googleads.g.doubleclick.net"), true);
  }, { captureReplay: true, routeFulfillers: [gaRoute, googleAdsRoute] });
});

test("consentFlowRuntimeScanner submits radio-based CCPA privacy opt-out forms before comparison", async () => {
  await withConsentFlowScan("consent-privacy-opt-out-radio-form-ad-comparison", async ({ result }) => {
    const optOutAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "privacy_opt_out_flow" &&
      attempt.actionType === "do_not_sell_share" &&
      attempt.succeeded
    );
    const optOutComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out"
    );

    assert.ok(optOutAttempt);
    assert.equal(optOutAttempt?.attempted, true);
    assert.equal(optOutAttempt?.succeeded, true);
    assert.equal(optOutAttempt?.actionProof?.actionPath, "privacy_opt_out_form");
    assert.equal(optOutAttempt?.actionProof?.attemptedStatus, "attempted_succeeded");
    assert.match(optOutAttempt?.actionProof?.afterDomExcerpt ?? "", /You opted out|Request received/i);
    assert.equal(optOutComparison?.comparableMeasurement?.comparable, true);
    assert.equal(optOutComparison?.comparableMeasurement?.rejectActionEvent?.proofAvailable, true);
    assert.equal(optOutComparison?.collectionEndpointsSuppressedAfterReject.includes("googleads.g.doubleclick.net"), true);
  }, { captureReplay: true, routeFulfillers: [gaRoute, googleAdsRoute] });
});

test("consentFlowRuntimeScanner marks reject not testable when reject control is missing", async () => {
  await withConsentFlowScan("consent-no-reject", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const acceptVsReject = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "after_reject_vs_after_accept",
    );
    assert.equal(rejectAttempt?.attempted, false);
    assert.equal(rejectAttempt?.failureReason, "candidate_not_observed");
    assert.equal(rejectAttempt?.actionProof?.candidateObserved, false);
    assert.equal(rejectAttempt?.actionProof?.attemptedStatus, "not_attempted");
    assert.equal(acceptVsReject?.confidence, 0.35);
    assert.equal(acceptVsReject?.comparableMeasurement?.comparable, false);
    assert.equal(acceptVsReject?.comparableMeasurement?.reason, "reject_all_not_confidently_executed");
    assert.equal(
      acceptVsReject?.coverageLimitations.some((limitation) =>
        limitation.limitationKey === "reject_all_not_confidently_executed",
      ),
      true,
    );
  });
});

test("consentFlowRuntimeScanner completes clear reject through preference center", async () => {
  await withConsentFlowScan("consent-preference-center-reject-success", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const traversal = rejectAttempt?.preferenceCenterTraversal;

    assert.equal(rejectAttempt?.viaPreferenceCenter, true);
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.cmpFamily, "OneTrust");
    assert.equal(rejectAttempt?.actionProof?.actionPath, "preference_center_reject_all_save");
    assert.equal(rejectAttempt?.actionProof?.candidateNormalizedActionType, "reject_all");
    assert.ok((rejectAttempt?.actionProof?.preActionConsentStateMarkers ?? []).some((marker) => marker.includes("OptanonConsentState")));
    assert.ok((rejectAttempt?.actionProof?.postActionConsentStateMarkers ?? []).some((marker) => marker.includes("OptanonConsentState")));
    assert.match(rejectAttempt?.actionProof?.beforeDomExcerpt ?? "", /OneTrust|cookies/i);
    assert.match(rejectAttempt?.actionProof?.afterDomExcerpt ?? "", /Consent-flow fixture|CertScore/i);
    assert.equal(traversal?.opened, true);
    assert.equal(traversal?.secondLayerObserved, true);
    assert.equal(traversal?.rejectAllControlObserved, true);
    assert.equal(traversal?.saveChoicesControlObserved, true);
    assert.equal(traversal?.attemptedRejectViaPreferenceCenter, true);
    assert.equal(traversal?.attemptedSaveChoices, true);
    assert.equal((traversal?.categoryTogglesObserved ?? 0) >= 2, true);
    assert.ok(result.consentActionCandidates.some((candidate) =>
      candidate.actionType === "save_preferences" &&
      candidate.labelText === "Save Choices",
    ));
  });
});

test("consentFlowRuntimeScanner records iframe context for iframe-hosted reject controls", async () => {
  await withConsentFlowScan("consent-iframe-reject", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.cmpFamily, "OneTrust");
    assert.equal(rejectAttempt?.actionProof?.actionPath, "direct_action");
    assert.equal(rejectAttempt?.actionProof?.frameContext?.frameKind, "sub_frame");
    assert.match(rejectAttempt?.actionProof?.candidateSelectorSummary ?? "", /frameIndex:/);
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
  });
});

test("consentFlowRuntimeScanner can reject through preference center toggles plus save", async () => {
  await withConsentFlowScan("consent-preference-center-toggle-save", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const traversal = rejectAttempt?.preferenceCenterTraversal;
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.viaPreferenceCenter, true);
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateObserved, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Save Choices");
    assert.equal(traversal?.rejectAllControlObserved, false);
    assert.equal(traversal?.saveChoicesControlObserved, true);
    assert.equal(traversal?.attemptedDisableCategoryToggles, true);
    assert.equal(traversal?.disabledCategoryToggles, 2);
    assert.equal(traversal?.attemptedSaveChoices, true);
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
  });
});

test("consentFlowRuntimeScanner treats confirm-my-choice as preference-center save", async () => {
  await withConsentFlowScan("consent-preference-center-confirm-save", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const traversal = rejectAttempt?.preferenceCenterTraversal;
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.viaPreferenceCenter, true);
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateObserved, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Confirm My Choice");
    assert.equal(rejectAttempt?.actionProof?.candidateNormalizedActionType, "save_preferences");
    assert.equal(traversal?.rejectAllControlObserved, false);
    assert.equal(traversal?.saveChoicesControlObserved, true);
    assert.equal(traversal?.attemptedDisableCategoryToggles, true);
    assert.equal(traversal?.disabledCategoryToggles, 2);
    assert.equal(traversal?.attemptedSaveChoices, true);
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
  });
});

test("consentFlowRuntimeScanner keeps ambiguous preference-center reject path not successful", async () => {
  await withConsentFlowScan("consent-preference-center-ambiguous", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const traversal = rejectAttempt?.preferenceCenterTraversal;
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.viaPreferenceCenter, true);
    assert.equal(rejectAttempt?.attempted, false);
    assert.equal(rejectAttempt?.succeeded, false);
    assert.equal(rejectAttempt?.failureReason, "preference_center_reject_not_observed");
    assert.equal(traversal?.opened, true);
    assert.equal(traversal?.secondLayerObserved, true);
    assert.equal(traversal?.rejectAllControlObserved, false);
    assert.equal(traversal?.attemptedRejectViaPreferenceCenter, false);
    assert.equal(rejectComparison?.coverageLimitations.some((limitation) =>
      limitation.limitationKey === "reject_all_not_confidently_executed",
    ), true);
  });
});

test("consentFlowRuntimeScanner does not click low-confidence ambiguous controls without Nano", async () => {
  await withConsentFlowScan("consent-ambiguous-controls", async ({ result }) => {
    const acceptAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "accept_all");
    assert.equal(acceptAttempt?.attempted, false);
    assert.equal(result.networkEvents.some((event) =>
      event.scenario === "accept_all_flow" &&
      event.consentStateAtTime === "post_accept" &&
      event.hostname === "www.google-analytics.com",
    ), false);
  });
});

test("consentFlowRuntimeScanner can use mock Nano to classify ambiguous controls", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls(input) {
      const control = input.candidates.find((candidate) => candidate.normalizedLabel === "continue");
      return {
        assistId: input.assistId,
        classifications: control
          ? [{
            actionId: control.actionId,
            actionType: "accept_all",
            confidence: 0.9,
            shouldClick: true,
            uncertaintyNotes: ["Fixture-specific ambiguous label."],
          }]
          : [],
      };
    },
  };
  await withConsentFlowScan("consent-ambiguous-controls", async ({ result }) => {
    assert.ok(result.consentActionCandidates.some((candidate) =>
      candidate.actionType === "accept_all" &&
      candidate.detectionMethod === "nano_assisted_ui_classification",
    ));
    assert.ok(result.consentActionAttempts.some((attempt) => attempt.actionType === "accept_all" && attempt.succeeded));
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner preserves explicit high-confidence deterministic actions when Nano omits them", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls(input) {
      return {
        assistId: input.assistId,
        classifications: [],
      };
    },
  };
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateDetectionMethod, "deterministic_text");
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner preserves explicit high-confidence assisted actions when Nano is over-cautious", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls(input) {
      return {
        assistId: input.assistId,
        classifications: input.candidates
          .filter((candidate) => /\breject\b/.test(candidate.normalizedLabel))
          .map((candidate) => ({
            actionId: candidate.actionId,
            actionType: "reject_all" as const,
            confidence: 0.85,
            shouldClick: false,
            uncertaintyNotes: ["Direct reject control, but cautious provider declined click."],
          })),
      };
    },
  };
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateDetectionMethod, "nano_assisted_ui_classification");
    assert.equal(rejectAttempt?.actionProof?.candidateConfidence, 0.85);
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner does not treat privacy-choice-only controls as cookie reject proof", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls(input) {
      return {
        assistId: input.assistId,
        classifications: input.candidates
          .filter((candidate) => /do not sell or share/i.test(candidate.labelText))
          .map((candidate) => ({
            actionId: candidate.actionId,
            actionType: "reject_all" as const,
            confidence: 0.95,
            shouldClick: true,
            uncertaintyNotes: ["Privacy choice opt-out, not full cookie-banner reject proof."],
          })),
      };
    },
  };
  await withConsentFlowScan("consent-privacy-choice-only", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    assert.equal(rejectAttempt?.attempted, false);
    assert.equal(rejectAttempt?.succeeded, false);
    assert.equal(rejectAttempt?.failureReason, "preference_center_second_layer_not_observed");
    assert.equal(rejectAttempt?.actionProof?.candidateObserved, false);
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner can use a privacy choices opener for second-layer accept and reject proof", async () => {
  await withConsentFlowScan("consent-privacy-choice-surface-reject-success", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const acceptAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "accept_all");
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.viaPreferenceCenter, true);
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Opt out");
    assert.equal(rejectAttempt?.preferenceCenterTraversal?.opened, true);
    assert.equal(rejectAttempt?.preferenceCenterTraversal?.rejectAllControlObserved, true);
    assert.equal(rejectAttempt?.preferenceCenterTraversal?.saveChoicesControlObserved, true);
    assert.ok((rejectAttempt?.actionProof?.postActionConsentStateMarkers ?? []).some((marker) =>
      marker.includes("qc-consent-state"),
    ));
    assert.equal(acceptAttempt?.viaPreferenceCenter, true);
    assert.equal(acceptAttempt?.attempted, true);
    assert.equal(acceptAttempt?.succeeded, true);
    assert.equal(acceptAttempt?.actionProof?.candidateLabelText, "Accept All");
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
  });
});

test("consentFlowRuntimeScanner preserves context-gated opt-out proof when Nano is cautious", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls(input) {
      return {
        assistId: input.assistId,
        classifications: input.candidates
          .filter((candidate) => candidate.labelText === "Opt out")
          .map((candidate) => ({
            actionId: candidate.actionId,
            actionType: "unknown" as const,
            confidence: 0.2,
            shouldClick: false,
            uncertaintyNotes: ["Opt-out wording can be context dependent."],
          })),
      };
    },
  };
  await withConsentFlowScan("consent-privacy-choice-surface-reject-success", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");

    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.actionProof?.candidateLabelText, "Opt out");
    assert.equal(rejectAttempt?.actionProof?.candidateDetectionMethod, "deterministic_text");
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner keeps controls non-clickable when Nano classification fails", async () => {
  const provider: NanoConsentUiAssistProvider = {
    async classifyControls() {
      throw new SyntaxError("Expected ',' or ']' after array element in JSON");
    },
  };
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    assert.equal(result.moduleRun.status, "partial");
    assert.match(result.moduleRun.errors.join("\n"), /Nano consent UI assist failed/);
    assert.ok(result.consentActionCandidates.some((candidate) =>
      candidate.assistMetadata.some((metadata) =>
        metadata.uncertaintyNotes.some((note) => note.includes("Nano consent UI assist failed")),
      ),
    ));
    assert.equal(result.consentActionAttempts.some((attempt) => attempt.attempted), false);
    assert.equal(result.consentActionAttempts.every((attempt) => attempt.failureReason === "candidate_confidence_too_low"), true);
  }, { enableNanoConsentUiAssist: true, nanoConsentUiAssistProvider: provider });
});

test("consentFlowRuntimeScanner keeps CMP cookie persistence separate from tracker activation", async () => {
  await withConsentFlowScan("consent-cmp-cookie-persists", async ({ result }) => {
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );
    assert.equal(rejectComparison?.cookiesPersistingAfterReject.includes("OptanonConsent"), false);
    assert.equal(rejectComparison?.collectionEndpointsPersistingAfterReject.length, 0);
  });
});

test("consentFlowRuntimeScanner records analytics cookie persistence conservatively", async () => {
  await withConsentFlowScan("consent-analytics-cookie-persists", async ({ result }) => {
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );
    assert.equal(rejectComparison?.cookiesPersistingAfterReject.includes("_ga"), true);
  });
});

test("consentFlowRuntimeScanner records failed click when banner remains", async () => {
  await withConsentFlowScan("consent-banner-failed-click", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, false);
    assert.equal(rejectAttempt?.failureReason, "banner_still_present_after_click");
  });
});

test("consentFlowRuntimeScanner planned_parallel writes internal scenario artifacts", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const planRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_plan");
    const executionRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_execution");
    const traceRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_flow_trace");
    const recipeResearchRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_action_recipe_research");

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(planRef?.path);
    assert.ok(executionRef?.path);
    assert.ok(traceRef?.path);
    assert.ok(recipeResearchRef?.path);
    assert.equal(planRef.sensitivity, "internal_only");
    assert.equal(executionRef.sensitivity, "internal_only");
    assert.equal(traceRef.sensitivity, "internal_only");
    assert.equal(recipeResearchRef.sensitivity, "internal_only");

    const plan = JSON.parse(await readFile(planRef.path, "utf8"));
    const execution = JSON.parse(await readFile(executionRef.path, "utf8"));
    const trace = JSON.parse(await readFile(traceRef.path, "utf8"));
    const recipeResearch = JSON.parse(await readFile(recipeResearchRef.path, "utf8"));

    assert.equal(plan.artifactVersion, "consent_scenario_plan.v1");
    assert.equal(execution.artifactVersion, "consent_scenario_execution.v1");
    assert.equal(trace.artifactVersion, "consent_flow_trace.v1");
    assert.equal(recipeResearch.artifactVersion, "consent_action_recipe_research.v1");
    assert.ok(execution.scenarios.some((item: { scenario: string; phaseTimings?: Array<{ label: string }> }) =>
      item.scenario === "reject_all_flow" &&
      item.phaseTimings?.some((phase) => phase.label === "action_readiness_settle")
    ));
    assert.ok(execution.scenarios.some((item: { scenario: string; phaseTimings?: Array<{ label: string }> }) =>
      item.scenario === "gpc_enabled" &&
      item.phaseTimings?.some((phase) => phase.label === "baseline_candidate_reuse") &&
      !item.phaseTimings?.some((phase) => phase.label === "pre_action_classification")
    ));
    assert.deepEqual(plan.plannedScenarios.map((item: { scenario: string }) => item.scenario), [
      "baseline_pre_consent",
      "gpc_enabled",
      "reject_all_flow",
      "accept_all_flow",
    ]);
    assert.equal(execution.healthSummary.failed, 0);
    assert.equal(execution.healthSummary.comparisonEligible >= 4, true);
    assert.ok(trace.scenarioNodes.some((node: { scenario: string; comparisonEligible: boolean }) =>
      node.scenario === "reject_all_flow" && node.comparisonEligible
    ));
    assert.ok(trace.coverageTrace.some((area: { coverageArea: string; status: string }) =>
      area.coverageArea === "post_reject_tracking" && area.status === "testable"
    ));
    assert.ok(result.consentFlowComparisons.some((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_accept" &&
      comparison.comparableMeasurement?.comparable
    ));
    assert.ok(result.consentFlowComparisons.some((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject" &&
      comparison.comparableMeasurement?.comparable
    ));
    assert.equal(result.screenshots.some((screenshot) =>
      screenshot.artifactId.startsWith("screenshot_reject_all_flow_")
    ), false);
    assert.equal(result.screenshots.some((screenshot) =>
      screenshot.artifactId === "screenshot_baseline_pre_consent_before"
    ), true);
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
  });
});

test("consentFlowRuntimeScanner planned_parallel reuses no-banner pre-consent baseline", async () => {
  await withConsentFlowScan("policy-footer-privacy", async ({ result }) => {
    const executionRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_execution");

    assert.ok(executionRef?.path);
    const execution = JSON.parse(await readFile(executionRef.path, "utf8"));
    const baselineEntry = execution.scenarios.find((entry: { scenario: string }) =>
      entry.scenario === "baseline_pre_consent"
    );

    assert.equal(baselineEntry?.status, "completed");
    assert.equal(baselineEntry?.phaseTimings?.some((phase: { label: string }) =>
      phase.label === "external_pre_consent_baseline_reuse"
    ), true);
    assert.equal(result.domSnapshots.some((snapshot) => snapshot.artifactId === "dom_text_pre_consent"), false);
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
    preConsentBaseline: {
      moduleRun: {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 5,
        evidenceRefs: [],
        errors: [],
      },
      runtimeTimeline: [],
      networkEvents: [],
      networkResponseEvents: [],
      cookieEvents: [],
      cookieSnapshots: [],
      storageSnapshots: [],
      scriptEvents: [],
      iframeEvents: [],
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent_fixture",
        observedAtMs: 0,
        likelyPresent: false,
        basis: ["no_confident_consent_controls"],
        textExcerpt: "Privacy Policy",
        evidenceRefs: [{ refId: "ref_dom_text_pre_consent", artifactId: "dom_text_pre_consent" }],
        confidence: 0.45,
      }],
      cmpRuntimeObservations: [],
      screenshots: [],
      domSnapshots: [{
        artifactId: "dom_text_pre_consent",
        capturedAtMs: 0,
        path: "synthetic-dom-text-pre-consent.txt",
        url: "https://example.test/",
        textExcerpt: "Privacy Policy",
        pagePhase: "network_idle",
        consentStateAtTime: "pre_consent",
      }],
      vendorResolverInputs: [],
    },
  });
});

test("consentFlowRuntimeScanner planned_parallel reuses CMP-bearing pre-consent baseline", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const planRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_plan");
    const executionRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_execution");

    assert.equal(result.moduleRun.status, "completed");
    assert.ok(planRef?.path);
    assert.ok(executionRef?.path);

    const plan = JSON.parse(await readFile(planRef.path, "utf8"));
    const execution = JSON.parse(await readFile(executionRef.path, "utf8"));
    const baselineEntry = execution.scenarios.find((entry: { scenario: string }) =>
      entry.scenario === "baseline_pre_consent"
    );

    assert.equal(plan.plannerInputs.baselineCmpEvidenceObserved, true);
    assert.ok(plan.plannedScenarios.some((item: { scenario: string }) => item.scenario === "reject_all_flow"));
    assert.ok(plan.plannedScenarios.some((item: { scenario: string }) => item.scenario === "accept_all_flow"));
    assert.equal(baselineEntry?.status, "completed");
    assert.equal(baselineEntry?.phaseTimings?.some((phase: { label: string }) =>
      phase.label === "external_pre_consent_baseline_reuse"
    ), true);
    assert.equal(result.domSnapshots.some((snapshot) => snapshot.artifactId === "dom_text_pre_consent"), false);
    assert.ok(result.consentActionAttempts.some((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    ));
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
    preConsentBaseline: {
      moduleRun: {
        moduleName: "preConsentRuntimeScanner",
        status: "partial",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 21_495,
        evidenceRefs: [],
        errors: ["Screenshot fallback used: page.screenshot timeout"],
      },
      runtimeTimeline: [],
      networkEvents: [],
      networkResponseEvents: [],
      cookieEvents: [],
      cookieSnapshots: [],
      storageSnapshots: [],
      scriptEvents: [],
      iframeEvents: [],
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent_fixture",
        observedAtMs: 0,
        likelyPresent: false,
        basis: ["insufficient_banner_keywords"],
        textExcerpt: "",
        evidenceRefs: [{ refId: "ref_dom_text_pre_consent", artifactId: "dom_text_pre_consent" }],
        confidence: 0.45,
      }],
      cmpRuntimeObservations: [{
        observationId: "cmp_runtime_onetrust_fixture",
        observedAtMs: 1_200,
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        vendorObservationId: "vendor_onetrust_fixture",
        entity: "OneTrust, LLC",
        vendor: "OneTrust",
        product: "OneTrust CMP",
        signals: [{
          signalType: "script_url",
          matchedField: "hostname",
          matchedValueRedacted: "cdn.cookielaw.org",
          sourceEventId: "net_onetrust_fixture",
          sourceEventType: "network_request",
          url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
          resolverBasis: ["onetrust_cmp_script_or_cookie"],
          confidence: 0.95,
        }],
        evidenceRefs: [],
        confidence: 0.95,
      }],
      screenshots: [],
      domSnapshots: [{
        artifactId: "dom_text_pre_consent",
        capturedAtMs: 0,
        path: "synthetic-dom-text-pre-consent.txt",
        url: "https://example.test/",
        textExcerpt: "",
        pagePhase: "network_idle",
        consentStateAtTime: "pre_consent",
      }],
      vendorResolverInputs: [],
    },
  });
});

test("consentFlowRuntimeScanner planned_parallel lean resources preserve action proof", async () => {
  await withConsentFlowScan("consent-simple-accept-reject", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );
    const acceptAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "accept_all_flow" && attempt.actionType === "accept_all"
    );
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject"
    );
    const acceptComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_accept"
    );

    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(acceptAttempt?.succeeded, true);
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
    assert.equal(acceptComparison?.comparableMeasurement?.comparable, true);
    assert.equal(result.screenshots.some((screenshot) => screenshot.artifactId.startsWith("screenshot_reject_all_flow_")), false);
    assert.equal(result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_baseline_pre_consent_before"), true);
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
    scenarioResourceMode: "lean",
  });
});

test("consentFlowRuntimeScanner lean resources preserve consent image Set-Cookie evidence", async () => {
  await withConsentFlowScan("consent-lean-guarded-image-cookie", async ({ result }) => {
    const baselineNoiseCookie = result.networkResponseEvents.some((event) =>
      event.scenario === "baseline_pre_consent" &&
      event.cookieNamesSet.includes("noise_image_cookie")
    );
    const rejectNoiseCookie = result.networkResponseEvents.some((event) =>
      event.scenario === "reject_all_flow" &&
      event.cookieNamesSet.includes("noise_image_cookie")
    );
    const rejectConsentCookie = result.networkResponseEvents.find((event) =>
      event.scenario === "reject_all_flow" &&
      event.responseUrl.includes("/cmp/consent-pixel.gif") &&
      event.cookieNamesSet.includes("OptanonConsent")
    );
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );

    assert.equal(baselineNoiseCookie, true);
    assert.equal(rejectNoiseCookie, false);
    assert.ok(rejectConsentCookie);
    assert.equal(rejectConsentCookie.setCookieHeaders[0]?.startsWith("OptanonConsent=[redacted]"), true);
    assert.equal(rejectAttempt?.succeeded, true);
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
    scenarioResourceMode: "lean",
  });
});

test("consentFlowRuntimeScanner planned_parallel gates failed actions from comparisons", async () => {
  await withConsentFlowScan("consent-banner-failed-click", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "reject_all_flow" && attempt.actionType === "reject_all"
    );
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject"
    );
    const executionRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_execution");

    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, false);
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, false);
    assert.equal(rejectComparison?.comparableMeasurement?.reason, "reject_all_not_confidently_executed");
    assert.ok(executionRef?.path);
    const execution = JSON.parse(await readFile(executionRef.path, "utf8"));
    const rejectEntry = execution.scenarios.find((entry: { scenario: string }) => entry.scenario === "reject_all_flow");
    assert.equal(rejectEntry?.actionProofStatus, "attempted_failed");
    assert.equal(rejectEntry?.comparisonEligible, false);
  }, {
    scenarioPlanningMode: "planned_parallel",
    scenarioConcurrency: 2,
    consentFlowDeadlineMs: 20_000,
  });
});

test("consentFlowRuntimeScanner planned_parallel captures focused privacy opt-out fixture", async () => {
  await withConsentFlowScan("consent-focused-privacy-opt-out", async ({ result }) => {
    const optOutAttempt = result.consentActionAttempts.find((attempt) =>
      attempt.scenario === "privacy_opt_out_flow" &&
      attempt.actionType === "do_not_sell_share"
    );
    const optOutComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_privacy_opt_out"
    );
    const planRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_scenario_plan");
    const traceRef = result.artifactRefs.find((ref) => ref.artifactId === "consent_flow_trace");

    assert.equal(optOutAttempt?.attempted, true);
    assert.equal(optOutAttempt?.succeeded, true);
    assert.equal(optOutComparison?.comparableMeasurement?.comparable, true);
    assert.ok(planRef?.path);
    const plan = JSON.parse(await readFile(planRef.path, "utf8"));
    assert.equal(plan.deadlines.scenarioConcurrency, 3);
    assert.ok(traceRef?.path);
    const trace = JSON.parse(await readFile(traceRef.path, "utf8"));
    assert.ok(trace.coverageTrace.some((area: { coverageArea: string; status: string }) =>
      area.coverageArea === "ccpa_cpra_do_not_sell_share_behavior" && area.status === "testable"
    ));
  }, {
    scenarioPlanningMode: "planned_parallel",
    captureReplay: true,
    consentFlowDeadlineMs: 20_000,
    routeFulfillers: [gaRoute, googleAdsRoute],
  });
});

test("consentFlowRuntimeScanner accepts changed consent state markers when banner text remains", async () => {
  await withConsentFlowScan("consent-banner-stateful-click", async ({ result }) => {
    const rejectAttempt = result.consentActionAttempts.find((attempt) => attempt.actionType === "reject_all");
    const rejectComparison = result.consentFlowComparisons.find((comparison) =>
      comparison.comparedScenarios === "fresh_pre_consent_vs_after_reject",
    );

    assert.equal(rejectAttempt?.attempted, true);
    assert.equal(rejectAttempt?.succeeded, true);
    assert.equal(rejectAttempt?.failureReason, undefined);
    assert.ok((rejectAttempt?.actionProof?.postActionConsentStateMarkers ?? []).some((marker) =>
      marker.includes("OptanonAlertBoxClosed") || marker.includes("OptanonConsentState"),
    ));
    assert.equal(rejectComparison?.comparableMeasurement?.comparable, true);
  });
});

async function withConsentFlowScan(
  page: StaticFixturePage,
  run: (context: { result: Awaited<ReturnType<typeof consentFlowRuntimeScanner>> }) => Promise<void> | void,
  options: Partial<Parameters<typeof consentFlowRuntimeScanner>[0]> = {},
): Promise<void> {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-consent-flow-"));
  try {
    const targetUrl = server.urlFor(page);
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await consentFlowRuntimeScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 10_000,
      artifactWriter,
      routeFulfillers: [gaRoute],
      privacyControlUrls: page === "consent-privacy-opt-out-ad-comparison" ||
        page === "consent-privacy-opt-out-radio-form-ad-comparison" ||
        page === "consent-focused-privacy-opt-out" ? [`${targetUrl}?privacy=1`] : undefined,
      ...options,
    });
    await run({ result });
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
}
