import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  countScenarioEvidenceExcerpts,
  classifyPrivacyOptOutControl,
  directActionFailureReason,
  oneTrustHiddenDiagnosticLabelAction,
  rawControlCandidateScore,
  scenarioRecipeDiagnosticSummary,
  scenarioEvidenceQualitySummary,
  scenarioRuntimeLimitationKeys,
  textControlActivationFailureLimitationReason,
  textFallbackConsentControlAction,
} from "./scanners/consent-flow-runtime-scanner";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function readRepoFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("scenario runtime diagnostics classify thin post-consent network tails", () => {
  assert.deepEqual(
    scenarioRuntimeLimitationKeys({
      actionApplied: true,
      activeRequestCount: 2,
      networkEvents: 18,
      postActionNetworkEvents: 8,
      requestFailures: 1,
      scenario: "accept_all_flow",
    }),
    [
      "thin_post_consent_network_tail",
      "request_failures_observed",
      "active_requests_at_close",
    ],
  );
});

test("scenario runtime diagnostics do not flag healthy post-consent tails", () => {
  assert.deepEqual(
    scenarioRuntimeLimitationKeys({
      actionApplied: true,
      activeRequestCount: 0,
      networkEvents: 80,
      postActionNetworkEvents: 42,
      requestFailures: 0,
      scenario: "reject_all_flow",
    }),
    [],
  );
});

test("scenario evidence quality limits action scenarios without action evidence", () => {
  assert.deepEqual(
    scenarioEvidenceQualitySummary({
      actionApplied: false,
      activeRequestCount: 0,
      evidenceExcerptCount: 2,
      failedRequestCount: 0,
      finalSettleMs: 2_000,
      networkEventCount: 80,
      networkResponseEventCount: 75,
      postActionNetworkEventCount: 35,
      scenario: "reject_all_flow",
    }),
    {
      limitationReason: "action_not_found",
      passStatus: "limited",
    },
  );
});

test("scenario evidence quality limits thin post-action runtime evidence", () => {
  assert.deepEqual(
    scenarioEvidenceQualitySummary({
      actionApplied: true,
      actionAttempt: {
        actionType: "accept_all",
        attemptId: "attempt_accept",
        attempted: true,
        evidenceRefs: [],
        scenario: "accept_all_flow",
        succeeded: true,
        timestampMs: 10,
      },
      activeRequestCount: 0,
      evidenceExcerptCount: 2,
      failedRequestCount: 0,
      finalSettleMs: 2_000,
      networkEventCount: 2,
      networkResponseEventCount: 2,
      postActionNetworkEventCount: 2,
      scenario: "accept_all_flow",
    }),
    {
      limitationReason: "near_zero_runtime_evidence",
      passStatus: "limited",
    },
  );
});

test("scenario evidence quality permits quiet successful reject tails", () => {
  assert.deepEqual(
    scenarioEvidenceQualitySummary({
      actionApplied: true,
      actionAttempt: {
        actionType: "reject_all",
        attemptId: "attempt_reject",
        attempted: true,
        evidenceRefs: [],
        scenario: "reject_all_flow",
        succeeded: true,
        timestampMs: 10,
      },
      activeRequestCount: 0,
      evidenceExcerptCount: 5,
      failedRequestCount: 0,
      finalSettleMs: 2_000,
      networkEventCount: 104,
      networkResponseEventCount: 104,
      postActionNetworkEventCount: 0,
      scenario: "reject_all_flow",
    }),
    { passStatus: "passing" },
  );
});

test("scenario evidence quality permits quiet successful accept tails", () => {
  assert.deepEqual(
    scenarioEvidenceQualitySummary({
      actionApplied: true,
      actionAttempt: {
        actionType: "accept_all",
        attemptId: "attempt_accept",
        attempted: true,
        evidenceRefs: [],
        scenario: "accept_all_flow",
        succeeded: true,
        timestampMs: 10,
      },
      activeRequestCount: 0,
      evidenceExcerptCount: 5,
      failedRequestCount: 0,
      finalSettleMs: 2_000,
      networkEventCount: 104,
      networkResponseEventCount: 104,
      postActionNetworkEventCount: 0,
      scenario: "accept_all_flow",
    }),
    { passStatus: "passing" },
  );
});

test("scenario evidence quality permits quiet successful tails with one non-material active request", () => {
  assert.deepEqual(
    scenarioEvidenceQualitySummary({
      actionApplied: true,
      actionAttempt: {
        actionType: "accept_all",
        attemptId: "attempt_accept",
        attempted: true,
        evidenceRefs: [],
        scenario: "accept_all_flow",
        succeeded: true,
        timestampMs: 10,
      },
      activeRequestCount: 1,
      evidenceExcerptCount: 5,
      failedRequestCount: 0,
      finalSettleMs: 2_000,
      networkEventCount: 104,
      networkResponseEventCount: 104,
      postActionNetworkEventCount: 0,
      scenario: "accept_all_flow",
    }),
    { passStatus: "passing" },
  );
});

test("scenario evidence excerpt counter uses bounded action proof metadata when DOM excerpts are blank", () => {
  assert.equal(
    countScenarioEvidenceExcerpts({
      beforeDomExcerpt: "",
      attempts: [{
        actionProof: {
          attemptedStatus: "attempted_succeeded",
          candidateLabelText: "OneTrust.RejectAll API",
          candidateNormalizedActionType: "reject_all",
          candidateObserved: true,
          candidateSelectorSummary: "diagnosticOneTrustHiddenLabel:OneTrust.RejectAll%20API",
          evidenceRefs: [],
          postActionConsentStateMarkers: [],
          preActionConsentStateMarkers: [],
          proofVersion: "consent_action_proof.v1",
        },
        actionType: "reject_all",
        attemptId: "attempt_reject",
        attempted: true,
        evidenceRefs: [],
        scenario: "reject_all_flow",
        succeeded: true,
        timestampMs: 10,
      }],
    }),
    3,
  );
});

test("direct action failure reason classifies static privacy center surfaces as explicit limitations", () => {
  const domExcerpt = [
    "Privacy Center",
    "Welcome",
    "Purposes",
    "Requests",
    "Your Privacy Choices",
    "We use online tracking technologies to collect information about you.",
  ].join("\n");

  assert.equal(
    directActionFailureReason({
      afterDomExcerpt: domExcerpt,
      bannerPresentAfter: true,
      beforeDomExcerpt: domExcerpt,
      candidateContextTextExcerpt: "Privacy Center Welcome Purposes Requests",
      candidateLabelText: "Your Privacy Choices",
      postActionConsentStateMarkers: ["usprivacy", "_ketch_consent_v1_"],
      preActionConsentStateMarkers: ["_ketch_consent_v1_", "usprivacy"],
      scenario: "privacy_opt_out_flow",
    }),
    "privacy_center_surface_observed_without_verifiable_opt_out_control",
  );
});

test("direct action failure reason preserves generic banner failure for non-static action surfaces", () => {
  assert.equal(
    directActionFailureReason({
      afterDomExcerpt: "Cookie Settings Reject All",
      bannerPresentAfter: true,
      beforeDomExcerpt: "Cookie Settings Accept All",
      candidateLabelText: "Reject All",
      scenario: "reject_all_flow",
    }),
    "banner_still_present_after_click",
  );
});

test("direct action failure reason classifies custom privacy request forms as manual review", () => {
  assert.equal(
    directActionFailureReason({
      afterDomExcerpt: [
        "Exercise Your Data Privacy Rights",
        "Opt Out of Sale and Sharing of Your Data",
        "Select a Request Type",
      ].join("\n"),
      bannerPresentAfter: true,
      beforeDomExcerpt: "Privacy Center Your Data Privacy Rights",
      candidateLabelText: "Your Data Privacy Rights",
      scenario: "privacy_opt_out_flow",
    }),
    "manual_review_required_custom_privacy_form",
  );
});

test("direct action failure reason classifies privacy control clicks without verifiable state change", () => {
  assert.equal(
    directActionFailureReason({
      afterDomExcerpt: "News page content changed, but no privacy confirmation appeared",
      bannerPresentAfter: true,
      beforeDomExcerpt: "News page content with footer privacy controls",
      candidateLabelText: "Do Not Sell or Share My Personal Information",
      postActionConsentStateMarkers: ["cookie:OptanonConsent", "cookie:usprivacy"],
      preActionConsentStateMarkers: ["cookie:OptanonConsent", "cookie:usprivacy"],
      scenario: "privacy_opt_out_flow",
    }),
    "privacy_control_click_without_verifiable_state_change",
  );
});

test("scenario recipe diagnostics classify worker reacquisition against coordinator recipe", () => {
  assert.deepEqual(
    scenarioRecipeDiagnosticSummary({
      candidates: [{
        actionType: "accept_all",
        enabled: true,
        labelText: "Accept All",
        visible: true,
      }],
      recipe: {
        actionType: "accept_all",
        candidates: [{
          actionType: "accept_all",
          labelText: "Accept all",
        }],
        scenario: "accept_all_flow",
        targetUrl: "https://webmd.com/",
      },
      scenario: "accept_all_flow",
    }),
    {
      candidateLabels: ["Accept All"],
      equivalentCandidateCount: 1,
      equivalentVisibleCandidateCount: 1,
      recipeCandidateCount: 1,
      status: "reacquired",
      targetUrl: "https://webmd.com/",
    },
  );

  assert.deepEqual(
    scenarioRecipeDiagnosticSummary({
      candidates: [{
        actionType: "reject_all",
        enabled: true,
        labelText: "Continue",
        visible: true,
      }],
      recipe: {
        actionType: "reject_all",
        candidates: [{
          actionType: "reject_all",
          labelText: "Reject all",
        }],
        scenario: "reject_all_flow",
      },
      scenario: "reject_all_flow",
    }).status,
    "present_not_matched",
  );

  assert.equal(
    scenarioRecipeDiagnosticSummary({
      candidates: [],
      recipe: {
        actionType: "accept_all",
        candidates: [],
        scenario: "accept_all_flow",
      },
      scenario: "accept_all_flow",
    }).status,
    "present_empty",
  );
});

test("OneTrust hidden diagnostic label mapping is explicit and target-scoped", () => {
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Accept", "accept_all"),
    { actionType: "accept_all", confidence: 0.88 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Reject", "reject_all"),
    { actionType: "reject_all", confidence: 0.86 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Allow All", "accept_all"),
    { actionType: "accept_all", confidence: 0.88 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Accept Essential", "reject_all"),
    { actionType: "reject_all", confidence: 0.86 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Privacy Center", "reject_all"),
    { actionType: "manage_preferences", confidence: 0.84 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Privacy Center", "accept_all"),
    { actionType: "manage_preferences", confidence: 0.84 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Confirm My Choices", "reject_all"),
    { actionType: "save_preferences", confidence: 0.82 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Submit data request", "do_not_sell_share"),
    { actionType: "do_not_sell_share", confidence: 0.8 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Your Privacy Choices", "do_not_sell_share"),
    { actionType: "manage_preferences", confidence: 0.78 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("opt-out form", "do_not_sell_share"),
    { actionType: "do_not_sell_share", confidence: 0.8 },
  );
  assert.deepEqual(
    oneTrustHiddenDiagnosticLabelAction("Your US State Privacy Rights", "do_not_sell_share"),
    { actionType: "do_not_sell_share", confidence: 0.8 },
  );
  assert.equal(oneTrustHiddenDiagnosticLabelAction("Allow All", "reject_all"), undefined);
  assert.equal(oneTrustHiddenDiagnosticLabelAction("Allow All", "do_not_sell_share"), undefined);
  assert.equal(oneTrustHiddenDiagnosticLabelAction("Submit data request", "accept_all"), undefined);
  assert.equal(oneTrustHiddenDiagnosticLabelAction("Submit", "do_not_sell_share"), undefined);
  assert.equal(oneTrustHiddenDiagnosticLabelAction("More information", "accept_all"), undefined);
});

test("footer privacy controls remain candidates despite generic policy context", () => {
  const footerContext = [
    "Privacy Policy",
    "Data Rights",
    "Privacy Settings",
    "Cookie Notice",
    "Data Vendors",
    "AdChoices",
    "Accessibility Statement",
    "Careers",
    "Newsletter Sign Up",
  ].join(" ");

  const score = rawControlCandidateScore({
    actionId: "footer_dns",
    candidateIndex: 1,
    contextTextExcerpt: footerContext,
    enabled: true,
    frameContext: { frameKind: "main_frame", frameUrl: "https://example.com/" },
    labelText: "Do Not Sell or Share My Personal Information",
    normalizedLabel: "do not sell or share my personal information",
    role: "a",
    selectorSummary: "deepControlIndex:12",
    visible: true,
  }, "do_not_sell_share", "privacy_opt_out_flow");

  assert.ok(score >= 50, `expected footer privacy control to survive planned candidate threshold, got ${score}`);
  assert.deepEqual(
    classifyPrivacyOptOutControl("Review All Privacy and Ad Settings", undefined, footerContext),
    { actionType: "do_not_sell_share", confidence: 0.88, method: "deterministic_text" },
  );
  assert.deepEqual(
    textFallbackConsentControlAction("Review All Privacy and Ad Settings", "privacy_opt_out_flow"),
    { actionType: "do_not_sell_share", confidence: 0.86 },
  );
  assert.deepEqual(
    textFallbackConsentControlAction("Do Not Sell or Share My Personal Information", "privacy_opt_out_flow"),
    { actionType: "do_not_sell_share", confidence: 0.88 },
  );
  assert.deepEqual(
    classifyPrivacyOptOutControl("Your Data Privacy Rights", undefined, "privacy center personal information California privacy rights"),
    { actionType: "do_not_sell_share", confidence: 0.88, method: "deterministic_text" },
  );
  assert.deepEqual(
    textFallbackConsentControlAction("Your Data Privacy Rights", "privacy_opt_out_flow"),
    { actionType: "do_not_sell_share", confidence: 0.88 },
  );
});

test("text control activation failures map to explicit limitations", () => {
  assert.equal(
    textControlActivationFailureLimitationReason(
      "text_control_observed_without_clickable_target; action=do_not_sell_share; label=Your Privacy Choices",
    ),
    "privacy_control_observed_without_clickable_target",
  );
  assert.equal(
    textControlActivationFailureLimitationReason(
      "planner_text_control_not_reacquired; action=do_not_sell_share; label=Your Privacy Choices",
    ),
    "planner_text_control_not_reacquired",
  );
  assert.equal(textControlActivationFailureLimitationReason("locator.click: Timeout 2000ms exceeded"), undefined);
});

test("text control action path has bounded DOM fallback before reporting activation failure", async () => {
  const source = await readRepoFile("packages/certscore-scan-core/src/scanners/consent-flow-runtime-scanner.ts");

  assert.match(source, /async function clickTextControlCandidate/);
  assert.match(source, /getByRole\("button"/);
  assert.match(source, /getByLabel\(label/);
  assert.match(source, /locator\(clickableSelector\)\.filter\(\{ hasText: label \}\)/);
  assert.match(source, /text_control_observed_without_clickable_target/);
  assert.match(source, /planner_text_control_not_reacquired/);
});

test("fallback quality artifacts classify privacy target closes explicitly", async () => {
  const source = await readRepoFile("packages/certscore-scan-core/src/scanners/consent-flow-runtime-scanner.ts");

  assert.match(source, /fallbackScenarioQualityLimitationReason\(\{/);
  assert.match(source, /privacy_control_url_observed/);
  assert.match(source, /privacy_control_target_closed_before_quality_artifact/);
});

test("planned reject scenario budget leaves room for quality-first browser recovery", async () => {
  const source = await readRepoFile("packages/certscore-scan-core/src/scanners/consent-flow-runtime-scanner.ts");

  assert.match(source, /item\.scenario === "reject_all_flow"[\s\S]*?return 36_000;/);
  assert.match(source, /item\.scenario === "privacy_opt_out_flow"[\s\S]*?return item\.targetUrl \? 36_000 : 18_000;/);
});

test("privacy opt-out ranking prefers settings opener over bare footer DNS link", async () => {
  const source = await readRepoFile("packages/certscore-scan-core/src/scanners/consent-flow-runtime-scanner.ts");

  assert.match(source, /review all privacy and ad settings\|privacy settings\|privacy preferences/);
  assert.match(source, /do not sell\(\?: or share\)\?\|do not share\/\.test\(label\) \? 0\.3 : 0/);
});

test("privacy opt-out form requires verified radio selection before save", async () => {
  const source = await readRepoFile("packages/certscore-scan-core/src/scanners/consent-flow-runtime-scanner.ts");
  const nanoProviderSource = await readRepoFile("packages/certscore-scan-core/src/nano-consent-ui-assist-provider.ts");

  assert.match(source, /selectAndVerifyPrivacyOptOutChoice/);
  assert.match(source, /sale \(\?:or\|and\) sharing/);
  assert.match(source, /select a request type/);
  assert.match(source, /clickPrivacyOptOutLeadingControl/);
  assert.match(source, /box\.x - 18/);
  assert.match(source, /privacyOptOutChoiceSelected/);
  assert.match(source, /element instanceof HTMLInputElement[\s\S]*?element\.checked/);
  assert.match(source, /aria-checked/);
  assert.match(source, /selectAndVerifyPrivacyOptOutChoiceWithNano/);
  assert.match(source, /Nano consent UI assist provider is required for privacy opt-out control disambiguation/);
  assert.match(source, /data-certscore-privacy-control-id/);
  assert.match(source, /manual_review_required_custom_privacy_form/);
  assert.match(source, /customPrivacyFormVisible/);
  assert.match(source, /writePrivacyOptOutFormDiagnosticArtifact/);
  assert.match(source, /privacy_opt_out_form_diagnostic_manual_review/);
  assert.match(source, /preferredScenarioQualityAttempt/);
  assert.match(nanoProviderSource, /"do_not_sell_share"/);
});
