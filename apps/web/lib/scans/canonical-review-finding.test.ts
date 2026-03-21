import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalReviewFindingPresentation, normalizeFindingName } from "./canonical-review-finding";
import type { ScanValidationFinding } from "./validation-review-linking";

function makeLinkedFinding(input: Partial<ScanValidationFinding> & Pick<ScanValidationFinding, "id" | "ruleKey" | "title">): ScanValidationFinding {
  return {
    agreementScore: null,
    category: null,
    description: null,
    evidence: null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    model: null,
    modelConfidence: null,
    pageUrl: null,
    promptVersion: null,
    rationale: null,
    severity: null,
    subtype: null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    verdict: null,
    ...input
  };
}

test("uses rich pre-consent tracking presentation when linked validation evidence is present", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Trackers observed before consent",
        evidence: {
          preconsent_tracker_vendors: ["Meta Pixel"]
        }
      }),
      observedValue: "Meta Pixel",
      severity: "high",
      title: "Trackers observed before consent"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /multiple third-party ad and analytics vendors|Meta Pixel|before consent|privacy choice/i
  );
  assert.match(
    presentation.suggestedFix,
    /Identify where these vendor tags are loaded|gate them behind a positive consent signal|suppress non-essential/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("does not leak healthcare-specific pre-consent tracking copy when medical text is present in evidence", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1b",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Pre-consent tracking detected",
        evidence: {
          pageUrl: "https://mcw.edu/clinical-programs",
          preconsent_tracker_vendors: ["Meta Pixel"],
          supportingSignals: ["medical institution domain mcw.edu", "possible PHI exposure"]
        }
      }),
      observedValue: "Meta Pixel",
      severity: "high",
      title: "Pre-consent tracking detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.doesNotMatch(presentation.whyThisMatters, /mcw\.edu|Protected Health Information|HHS/i);
  assert.doesNotMatch(presentation.suggestedFix, /Google Consent Mode v2|May 2026 HHS deadline/i);
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses plain-language copy for pre-consent tracking activity", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1c",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Pre-consent tracking activity",
        evidence: {
          runtimeEvidence: ["third-party requests fire on initial page load"],
          supportingSignals: ["advertising and analytics platforms observed"]
        }
      }),
      observedValue: "third-party requests",
      severity: "high",
      title: "Pre-consent tracking activity"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /third-party tracking activity|meaningful chance to make a consent choice|consent state has been applied/i
  );
  assert.match(
    presentation.suggestedFix,
    /Block or defer non-essential advertising, analytics, and measurement scripts|default state remains off until consent is granted/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Guidance on cookies and similar technologies");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses calibrated generic copy for pre-consent tracking detected", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1c-detected",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Pre-consent tracking detected",
        evidence: {
          runtimeEvidence: ["third-party requests fire on initial page load"],
          supportingSignals: ["advertising and analytics platforms observed"]
        }
      }),
      observedValue: "third-party requests",
      severity: "high",
      title: "Pre-consent tracking detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /third-party network requests initiating before a consent choice could be recorded|zero-delay execution|ePrivacy Directive and GDPR/i
  );
  assert.match(
    presentation.suggestedFix,
    /Tag Manager or header scripts|denied or decoupled state|consent management platform \(CMP\) confirms an affirmative choice/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Guidance on cookies and similar technologies");
  assert.equal(presentation.confidenceScore, "0.85");
});

test("uses max-confidence evidence-url copy for pre-consent tracker evidence URLs", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1e",
        ruleKey: "privacy.preconsent_tracker_evidence_urls",
        title: "Pre-consent tracker evidence URLs",
        evidence: {
          preconsent_tracker_evidence_urls: [
            "https://example-ad-network.test/pixel",
            "https://example-analytics.test/collect"
          ],
          runtimeEvidence: ["third-party requests fired during initial page load"]
        }
      }),
      observedValue: "network requests",
      severity: "high",
      title: "Pre-consent tracker evidence URLs"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /captured representative pre-consent requests|during the initial page-load sequence|before the site's consent state had been clearly established/i
  );
  assert.match(
    presentation.suggestedFix,
    /Block or defer these vendor requests until an affirmative consent choice is stored|inline loaders|bootstrap scripts/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses max-confidence vendor copy for pre-consent tracker vendors", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1f",
        ruleKey: "privacy.preconsent_tracker_vendors",
        title: "Pre-consent tracker vendors",
        evidence: {
          preconsent_tracker_vendors: ["Google Analytics", "Reddit Pixel"],
          runtimeEvidence: ["vendor requests fired during initial page load"]
        }
      }),
      observedValue: "Google Analytics, Reddit Pixel",
      severity: "high",
      title: "Pre-consent tracker vendors"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /multiple third-party ad and analytics vendors before consent|Google Analytics and Reddit Pixel/i
  );
  assert.match(
    presentation.suggestedFix,
    /Identify where these vendor tags are loaded|gate them behind a positive consent signal/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses count-based copy for pre-consent tracker violations", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1g",
        ruleKey: "privacy.preconsent_tracker_violations",
        title: "Pre-consent tracker violations",
        evidence: {
          count: 8,
          runtimeEvidence: ["8 third-party scripts fired during initial page load"],
          supportingSignals: ["tag manager initialization before consent"]
        }
      }),
      observedValue: "8",
      severity: "high",
      title: "Pre-consent tracker violations"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /8 pre-consent tracking requests|before the visitor could act on the consent interface|during initial render/i
  );
  assert.match(
    presentation.suggestedFix,
    /these 8 requests|block them by default|affirmative opt-in state/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses calibrated max-confidence copy for 71 pre-consent tracking requests", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1g-71",
        ruleKey: "privacy.preconsent_tracker_violations",
        title: "Trackers observed before consent",
        evidence: {
          preconsent_tracker_violations: 71,
          runtimeEvidence: ["third-party requests fired before consent choice"]
        }
      }),
      observedValue: "71",
      severity: "high",
      title: "Trackers observed before consent"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.equal(
    presentation.whyThisMatters,
    "The automated scan observed 71 pre-consent tracking requests before the visitor could act on the consent interface. That pattern suggests one or more non-essential third-party tags or scripts began transmitting data during initial render rather than waiting for a confirmed consent state."
  );
  assert.equal(
    presentation.suggestedFix,
    "Audit the non-essential scripts responsible for these 71 requests and block them by default. They should initialize only after the Consent Management Platform, consent banner, or equivalent control records an affirmative opt-in state."
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Guidance on cookies and similar technologies");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses summarized pre-consent evidence from supporting signals without requiring the full raw URL list", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1h",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Trackers observed before consent",
        evidence: {
          supportingSignals: [
            {
              key: "privacy.preconsent_tracker_evidence_urls",
              label: "Pre-consent tracker evidence summary",
              value: {
                sampleUrls: ["https://mc.yandex.com/watch/125905"],
                totalObservedUrls: 71,
                vendorsObserved: ["Yandex", "Viqeo", "AdRiver"]
              }
            }
          ]
        }
      }),
      observedValue: "Yandex",
      severity: "high",
      title: "Trackers observed before consent"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(
    presentation.whyThisMatters,
    /captured representative pre-consent requests|Yandex, Viqeo, AdRiver/i
  );
  assert.match(
    presentation.suggestedFix,
    /Block or defer these vendor requests until an affirmative consent choice is stored/i
  );
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses post-reject tracking copy for trackers persisted after reject", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1d",
        ruleKey: "privacy.trackers_persisted_after_reject",
        title: "Trackers persisted after reject",
        evidence: {
          runtimeEvidence: ["Reddit Pixel fired after reject interaction"],
          supportingSignals: ["most trackers disabled except Reddit Pixel"]
        }
      }),
      observedValue: "Reddit Pixel",
      severity: "medium",
      title: "Trackers persisted after reject"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers persisted after reject");
  assert.match(
    presentation.whyThisMatters,
    /after selecting the reject option|certain tracking tools remained active|advertising pixel continued to transmit data|visitor expresses their preference to opt out/i
  );
  assert.match(
    presentation.suggestedFix,
    /Reddit Pixel|Reject trigger|Denied or Blocked|stops all data transmission/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Ensuring Consent Choices are Respected");
  assert.equal(presentation.confidenceScore, "0.83");
});

test("uses strong copy and high evidence strength for functional misalignment", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fm-1",
        ruleKey: "policy_runtime.functional_misalignment",
        title: "High-confidence functional misalignment",
        evidence: {
          frictionDelta: 2,
          optInClicks: 1,
          optOutClicks: 3,
          runtimeEvidence: ["opt-in step 1: Accept all", "opt-out step 1: Manage preferences", "opt-out step 3: Save choices"],
          signalValue: 95,
          supportingSignals: ["rights friction confirmed"]
        }
      }),
      observedValue: "Privacy Policy",
      severity: "high",
      title: "High-confidence functional misalignment"
    },
    []
  );

  assert.equal(presentation.findingName, "Functional misalignment");
  assert.match(
    presentation.whyThisMatters,
    /opt-in required 1 click|opt-out required 3 clicks|concrete runtime evidence of asymmetry/i
  );
  assert.match(
    presentation.suggestedFix,
    /opt-out path is as direct as the opt-in path|same number of clicks|secondary hurdles/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "CPPA");
  assert.equal(presentation.confidenceScore, "0.85");
});

test("uses fallback runtime evidence for functional misalignment when validation linkage is absent", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        consentBlockerPageTitle: "Login Required",
        consentBlockerTextSnippet: "Please sign in to manage your privacy choices.",
        consentBlockerType: "auth_wall",
        consentBlockerUrl: "https://example.com/privacy/login",
        consentEvidencePassCount: 2,
        consentRedirectOrAuthRequired: true
      },
      observedValue: "Yes",
      severity: "high",
      title: "Functional misalignment"
    },
    []
  );

  assert.equal(presentation.findingName, "Functional misalignment");
  assert.match(presentation.whyThisMatters, /Login Required|sign in to manage your privacy choices/i);
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses max-strength score and hard-block copy for critical user-rights fulfillment friction", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-1",
        ruleKey: "privacy.friction_score",
        title: "Critical user-rights fulfillment friction",
        evidence: {
          consentRedirectOrAuthRequired: true,
          runtimeEvidence: ["opt-out step 1: Manage preferences", "redirect to login wall observed"],
          signalValue: 100,
          supportingSignals: ["hard block observed"]
        }
      }),
      observedValue: "100",
      severity: "high",
      title: "Critical user-rights fulfillment friction"
    },
    []
  );

  assert.equal(presentation.findingName, "Critical user-rights fulfillment friction");
  assert.match(
    presentation.whyThisMatters,
    /redirect or authentication barrier|strong runtime evidence of functional asymmetry|additional hurdle/i
  );
  assert.match(
    presentation.suggestedFix,
    /Remove the redirect or authentication barrier|without requiring an account|without requiring.*login/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "CPPA");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses deterministic consent blocker evidence for functional misalignment findings", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fm-2",
        ruleKey: "scan_signal.privacy.policy_runtime_functional_misalignment_detected",
        title: "High-confidence functional misalignment",
        evidence: {
          consentBlockerPageTitle: "Login Required",
          consentBlockerTextSnippet: "Please sign in to manage your privacy choices.",
          consentBlockerType: "auth_wall",
          consentBlockerUrl: "https://example.com/privacy/login",
          consentEvidencePassCount: 2,
          consentRedirectOrAuthRequired: true,
          runtimeEvidence: ["opt-out step 1: Manage preferences", "redirect to login wall observed"],
          supportingSignals: ["hard block observed twice"]
        }
      }),
      observedValue: "Privacy Policy",
      severity: "high",
      title: "High-confidence functional misalignment"
    },
    []
  );

  assert.equal(presentation.findingName, "Functional misalignment");
  assert.match(presentation.whyThisMatters, /Login Required|sign in to manage your privacy choices/i);
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses maximum confidence when the same friction blocker is reproduced twice", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-1b",
        ruleKey: "privacy.friction_score",
        title: "Critical user-rights fulfillment friction",
        evidence: {
          consentBlockerPageTitle: "Login Required",
          consentBlockerTextSnippet: "Please sign in to manage your privacy choices.",
          consentBlockerType: "auth_wall",
          consentBlockerUrl: "https://example.com/privacy/login",
          consentEvidencePassCount: 2,
          consentRedirectOrAuthRequired: true,
          runtimeEvidence: ["opt-out step 1: Manage preferences", "redirect to login wall observed"],
          signalValue: 100,
          supportingSignals: ["hard block observed twice"]
        }
      }),
      observedValue: "100",
      severity: "high",
      title: "Critical user-rights fulfillment friction"
    },
    []
  );

  assert.match(presentation.whyThisMatters, /Login Required|sign in to manage your privacy choices/i);
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses elevated heuristic confidence for critical user-rights friction score without runtime proof", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-heuristic-1",
        ruleKey: "scan_signal.privacy.user_rights_friction_score",
        title: "Critical user-rights fulfillment friction",
        evidence: {
          signalValue: 100
        }
      }),
      observedValue: "100",
      severity: "high",
      title: "Critical user-rights fulfillment friction"
    },
    []
  );

  assert.equal(presentation.findingName, "Critical user-rights fulfillment friction");
  assert.equal(presentation.confidenceScore, "0.70");
});

test("uses strong copy and high confidence for high user-rights fulfillment friction", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-2",
        ruleKey: "privacy.friction_score",
        title: "High user-rights fulfillment friction",
        evidence: {
          frictionDelta: 1,
          optInClicks: 1,
          optOutClicks: 2,
          runtimeEvidence: ["opt-in step 1: Accept all", "opt-out step 1: Manage preferences", "opt-out step 2: Save choices"],
          signalValue: 75,
          supportingSignals: ["high friction observed"]
        }
      }),
      observedValue: "75",
      severity: "high",
      title: "High user-rights fulfillment friction"
    },
    []
  );

  assert.equal(presentation.findingName, "High user-rights fulfillment friction");
  assert.match(
    presentation.whyThisMatters,
    /opt-in required 1 click|opt-out required 2 clicks|concrete runtime evidence of asymmetry/i
  );
  assert.match(
    presentation.suggestedFix,
    /opt-out path is as direct as the opt-in path|same number of clicks|secondary hurdles/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "CPPA");
  assert.equal(presentation.confidenceScore, "0.85");
});

test("keeps rights-friction findings inconclusive when runtime symmetry evidence is incomplete", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-3",
        ruleKey: "privacy.friction_score",
        title: "Potential rights-fulfillment friction",
        evidence: {
          runtimeEvidence: ["detector fired"],
          signalValue: 35,
          supportingSignals: ["consent symmetry detector fired"]
        }
      }),
      observedValue: "35",
      severity: "medium",
      title: "Potential rights-fulfillment friction"
    },
    []
  );

  assert.match(
    presentation.whyThisMatters,
    /potential mismatch|bounded click-path audit|did not conclusively prove asymmetric friction/i
  );
  assert.match(
    presentation.suggestedFix,
    /manual review recommended|document click counts|authentication requirements/i
  );
  assert.equal(presentation.confidenceScore, "0.35");
});

test("uses strong accessibility copy and high confidence for confirmed WCAG issues", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-1",
        ruleKey: "accessibility.wcag_errors_detected",
        title: "Automated accessibility issues detected",
        evidence: {
          count: 3,
          supportingSignals: ["high-confidence axe violations"]
        }
      }),
      observedValue: "3",
      severity: "high",
      title: "Automated accessibility issues detected"
    },
    []
  );

  assert.equal(presentation.findingName, "WCAG errors");
  assert.match(
    presentation.whyThisMatters,
    /distinct WCAG rule violations|structural defects in the DOM|missing ARIA landmarks|broken keyboard focus/i
  );
  assert.match(
    presentation.suggestedFix,
    /Level A remediation|descriptive alt text|interactive elements \(buttons\/links\) have unique aria-labels|tabindex sequence/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses accessible plain-language copy for accessibility and user settings", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-friendly-1",
        ruleKey: "scan_snapshot.accessibility.accessibility_and_user_settings",
        title: "Accessibility and user settings",
        evidence: {
          runtimeEvidence: ["keyboard navigation blocked in menu"],
          supportingSignals: [
            {
              key: "accessibility.user_settings",
              label: "Accessibility and user settings",
              value: true,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "true",
      severity: "high",
      title: "Accessibility and user settings"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility and user settings");
  assert.match(
    presentation.whyThisMatters,
    /design makes it difficult|screen readers|navigate using only a keyboard|privacy settings/i
  );
  assert.match(
    presentation.suggestedFix,
    /welcoming for everyone|menus work correctly for keyboard users|invisible labels|opt-out or privacy buttons/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Making the Web Accessible for Everyone");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses high confidence for WCAG errors when evidence count is carried in supporting signals", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-2",
        ruleKey: "accessibility.wcag_errors_detected",
        title: "WCAG errors",
        evidence: {
          confidenceBasis: ["Automated WCAG error count: 3."],
          missingEvidence: ["Rule-level example rows or affected page URLs for the highest-priority violations."],
          reviewPolicy: {
            claimType: "automated_accessibility",
            detectorStrength: "strong"
          },
          supportingSignals: [
            {
              key: "accessibility.wcag_error_count_total",
              label: "WCAG errors",
              value: 3,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "3",
      severity: "high",
      title: "WCAG errors"
    },
    []
  );

  assert.equal(presentation.findingName, "WCAG errors");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses max-strength copy for high-volume WCAG errors", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-3",
        ruleKey: "accessibility.wcag_errors_detected",
        title: "WCAG errors",
        evidence: {
          count: 63,
          runtimeEvidence: ["focus indicator failures observed in navigation"],
          supportingSignals: [
            {
              key: "accessibility.wcag_error_count_total",
              label: "WCAG errors",
              value: 63,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "63",
      severity: "high",
      title: "WCAG errors"
    },
    []
  );

  assert.equal(presentation.findingName, "WCAG errors");
  assert.match(
    presentation.whyThisMatters,
    /63 distinct WCAG rule violations|high density of structural defects|ARIA configuration errors|broken focus indicators/i
  );
  assert.match(
    presentation.suggestedFix,
    /63 identified WCAG failures|focus indicator logic|ARIA attributes|text alternatives/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses strong systemic accessibility copy for negative accessibility risk scores", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-risk-1",
        ruleKey: "accessibility.risk_score",
        title: "Accessibility risk score",
        evidence: {
          signalValue: -4,
          snapshotField: "accessibility_litigation_risk_score",
          supportingSignals: ["keyboard focus defects in shared templates"],
          value: -4
        }
      }),
      observedValue: "-4",
      severity: "high",
      title: "Accessibility risk score"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility risk score");
  assert.match(
    presentation.whyThisMatters,
    /accessibility risk score of -4|significant departure from baseline WCAG compliance|missing ARIA landmarks/i
  );
  assert.match(
    presentation.suggestedFix,
    /shared templates|Keyboard Traps|machine-readable ARIA labels|focus-management logic/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses max-strength accessibility risk copy for critical negative outliers", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-risk-2",
        ruleKey: "accessibility.risk_score",
        title: "Accessibility risk score",
        evidence: {
          signalValue: -10,
          snapshotField: "accessibility_litigation_risk_score",
          supportingSignals: ["systemic accessibility failures in global templates"],
          value: -10
        }
      }),
      observedValue: "-10",
      severity: "high",
      title: "Accessibility risk score"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility risk score");
  assert.match(
    presentation.whyThisMatters,
    /accessibility risk score of -10|critical outlier|insurmountable barriers|max(imum)? legal exposure/i
  );
  assert.match(
    presentation.suggestedFix,
    /immediate technical remediation|eliminate all keyboard traps|complete ARIA landmark structure|machine-readable tab order/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses max-strength accessibility risk copy for score 100", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-risk-100",
        ruleKey: "accessibility.risk_score",
        title: "Accessibility risk score",
        evidence: {
          signalValue: 100,
          snapshotField: "accessibility_litigation_risk_score",
          supportingSignals: ["missing ARIA landmarks in shared layout"],
          value: 100
        }
      }),
      observedValue: "100",
      severity: "high",
      title: "Accessibility risk score"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility risk score");
  assert.match(
    presentation.whyThisMatters,
    /accessibility risk score of 100|structural omissions|missing ARIA landmarks|assistive technologies/i
  );
  assert.match(
    presentation.suggestedFix,
    /global site templates|ARIA landmark structures|unique, machine-readable labels|logical tab order/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses aria-specific accessibility copy", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-aria-1",
        ruleKey: "accessibility.aria_issues",
        title: "ARIA issues",
        evidence: {
          runtimeEvidence: ["invalid aria role on interactive menu control"],
          supportingSignals: ["screen reader name missing on button"]
        }
      }),
      observedValue: "invalid aria role",
      severity: "high",
      title: "ARIA issues"
    },
    []
  );

  assert.equal(presentation.findingName, "ARIA issues");
  assert.match(
    presentation.whyThisMatters,
    /ARIA-related error|assistive technologies|silent or misleading control|buttons, menus, or forms/i
  );
  assert.match(
    presentation.suggestedFix,
    /invalid ARIA attribute|role assigned to the element matches its actual function|required child elements|aria-label or aria-labelledby/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "WAI-ARIA Authoring Practices Guide");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("uses focus-indicator-specific accessibility copy", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-focus-1",
        ruleKey: "accessibility.wcag_focus_indicator_issue_count",
        title: "Focus indicator issues",
        evidence: {
          signalKey: "accessibility.wcag_focus_indicator_issue_count",
          signalLabel: "Focus indicator issues",
          signalValue: 1,
          signalCategory: "accessibility"
        }
      }),
      observedValue: "1",
      severity: "medium",
      title: "Focus indicator issues"
    },
    []
  );

  assert.equal(presentation.findingName, "Focus indicator issues");
  assert.match(
    presentation.whyThisMatters,
    /visible focus indicator is missing or obscured|navigate via keyboard|visible outline|suppressed via CSS/i
  );
  assert.match(
    presentation.suggestedFix,
    /outline: none|outline: 0|clear visual highlight|WCAG 2\.1 contrast requirements/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "WCAG Success Criterion 2.4.7: Focus Visible");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("uses landmark-specific accessibility copy and high confidence for landmark issues", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "landmark-1",
        ruleKey: "accessibility.landmark_issues",
        title: "Landmark issues",
        evidence: {
          count: 2,
          supportingSignals: ["main landmark missing"]
        }
      }),
      observedValue: "2",
      severity: "high",
      title: "Landmark issues"
    },
    []
  );

  assert.equal(presentation.findingName, "Landmark issues");
  assert.match(
    presentation.whyThisMatters,
    /distinct ARIA landmark violations|semantic architecture|screen reader users|jumping directly to primary sections/i
  );
  assert.match(
    presentation.suggestedFix,
    /ARIA landmarks|exactly one main landmark|multiple nav regions have unique aria-labels/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses contrast-specific accessibility copy and confidence for contrast failures", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "contrast-1",
        ruleKey: "accessibility.wcag_contrast_failures_count",
        title: "Contrast failures",
        evidence: {
          supportingSignals: [
            {
              key: "accessibility.wcag_contrast_failures_count",
              label: "Contrast failures",
              value: 4,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "4",
      severity: "high",
      title: "Contrast failures"
    },
    []
  );

  assert.equal(presentation.findingName, "Contrast failures detected");
  assert.match(
    presentation.whyThisMatters,
    /color-contrast failures|text, controls, and status messaging|low vision|color-vision deficiencies/i
  );
  assert.match(
    presentation.suggestedFix,
    /WCAG contrast thresholds|foreground\/background color combinations|core navigation|buttons|form labels/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "WCAG 2.1 Success Criterion 1.4.3 Contrast (Minimum)");
  assert.equal(presentation.confidenceScore, "0.85");
});

test("uses form-label-specific accessibility copy and confidence for form label issues", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "form-label-1",
        ruleKey: "accessibility.wcag_form_label_error_count",
        title: "Form label issues",
        evidence: {
          supportingSignals: [
            {
              key: "accessibility.wcag_form_label_error_count",
              label: "Form label issues",
              value: 1,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "1",
      severity: "high",
      title: "Form label issues"
    },
    []
  );

  assert.equal(presentation.findingName, "Form label issues detected");
  assert.match(
    presentation.whyThisMatters,
    /form-label issues|missing labels|screen-reader users|what information a field requests|privacy-rights workflows/i
  );
  assert.match(
    presentation.suggestedFix,
    /Associate each form control|label\/for|aria-label|aria-labelledby|placeholders are not acting as the only field description/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "WCAG 2.1 Success Criterion 3.3.2 Labels or Instructions");
  assert.equal(presentation.confidenceScore, "0.85");
});

test("uses link-name-specific accessibility copy and confidence for link name issues", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "link-name-1",
        ruleKey: "accessibility.wcag_link_name_error_count",
        title: "Link name issues",
        evidence: {
          supportingSignals: [
            {
              key: "accessibility.wcag_link_name_error_count",
              label: "Link name issues",
              value: 11,
              category: "accessibility"
            }
          ]
        }
      }),
      observedValue: "11",
      severity: "high",
      title: "Link name issues"
    },
    []
  );

  assert.equal(presentation.findingName, "Link name issues detected");
  assert.match(
    presentation.whyThisMatters,
    /link-name issues|announced ambiguously|screen readers|where navigation choices lead|core flows/i
  );
  assert.match(
    presentation.suggestedFix,
    /descriptive accessible name|visible text|aria-label|aria-labelledby|click here|read more|icon-only links/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "WCAG 2.1 Success Criterion 2.4.4 Link Purpose (In Context)");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("surfaces representative accessibility examples for contrast findings when available", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        accessibilityRuleExamples: [
          {
            pageUrl: "https://example.com/",
            representativeSelectors: ["button.primary-cta"]
          },
          {
            pageUrl: "https://example.com/signup",
            representativeSelectors: ["a.hero-link"]
          }
        ],
        signalKey: "accessibility.wcag_contrast_failures_count",
        signalLabel: "Contrast failures",
        signalValue: 4,
        supportingSignals: [
          {
            key: "accessibility.wcag_contrast_failures_count",
            label: "Contrast failures",
            value: 4,
            category: "accessibility"
          }
        ]
      },
      observedValue: "4",
      severity: "high",
      title: "Contrast failures"
    },
    []
  );

  assert.match(
    presentation.whyThisMatters,
    /Representative automated evidence included button\.primary-cta on https:\/\/example\.com\/ and a\.hero-link on https:\/\/example\.com\/signup\./i
  );
});

test("surfaces representative accessibility examples for form-label findings when available", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        accessibilityRuleExamples: [
          {
            pageUrl: "https://example.com/account",
            representativeSelectors: ["input[type=\"email\"]"]
          }
        ],
        signalKey: "accessibility.wcag_form_label_error_count",
        signalLabel: "Form label issues",
        signalValue: 1,
        supportingSignals: [
          {
            key: "accessibility.wcag_form_label_error_count",
            label: "Form label issues",
            value: 1,
            category: "accessibility"
          }
        ]
      },
      observedValue: "1",
      severity: "high",
      title: "Form label issues"
    },
    []
  );

  assert.match(
    presentation.whyThisMatters,
    /Representative automated evidence included input\[type="email"\] on https:\/\/example\.com\/account\./i
  );
});

test("surfaces representative accessibility examples for link-name findings when available", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        accessibilityRuleExamples: [
          {
            pageUrl: "https://example.com/",
            representativeSelectors: ["a.icon-only-link"]
          }
        ],
        signalKey: "accessibility.wcag_link_name_error_count",
        signalLabel: "Link name issues",
        signalValue: 11,
        supportingSignals: [
          {
            key: "accessibility.wcag_link_name_error_count",
            label: "Link name issues",
            value: 11,
            category: "accessibility"
          }
        ]
      },
      observedValue: "11",
      severity: "high",
      title: "Link name issues"
    },
    []
  );

  assert.match(
    presentation.whyThisMatters,
    /Representative automated evidence included a\.icon-only-link on https:\/\/example\.com\/\./i
  );
});

test("uses max-strength landmark copy for high-volume landmark issues", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "landmark-2",
        ruleKey: "accessibility.landmark_issues",
        title: "Landmark issues",
        evidence: {
          count: 36,
          supportingSignals: ["landmark defects observed across shared templates"]
        }
      }),
      observedValue: "36",
      severity: "high",
      title: "Landmark issues"
    },
    []
  );

  assert.equal(presentation.findingName, "Landmark issues");
  assert.match(
    presentation.whyThisMatters,
    /36 distinct landmark violations|significant defect in the site's semantic architecture|screen reader users use to skip repetitive content|multiple site templates/i
  );
  assert.match(
    presentation.suggestedFix,
    /global page templates|exactly one main element|navigation blocks are wrapped in nav tags|Primary versus Footer navigation/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses cookie-policy extraction copy and max confidence for structurally weak cookie policy pages", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "cookie-1",
        ruleKey: "section_review.low_confidence_critical_fields",
        title: "Extraction Cookie Policy",
        evidence: {
          pageUrl: "https://menardc.com/lander",
          pageType: "cookie_policy",
          policyAmbiguityScore: 90,
          policyCoverageRatio: null,
          policyFieldCoverage: {},
          policySnippetCount: 0,
          policyStructurallyWeak: true
        }
      }),
      observedValue: "Cookie Policy",
      severity: "high",
      title: "Extraction Cookie Policy"
    },
    []
  );

  assert.equal(presentation.findingName, "Extraction Cookie Policy");
  assert.match(
    presentation.whyThisMatters,
    /complete semantic obstruction regarding cookie disclosures|Policy Ambiguity Score of 90|technically dark to automated auditing|Essential, Performance, and Targeting/i
  );
  assert.match(
    presentation.suggestedFix,
    /Immediate manual verification is required|flattened table structure|semantic section tags|Cookie Name, Provider, Purpose, and Duration/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses privacy-policy extraction copy and max confidence for structurally weak privacy policy pages", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "privacy-1",
        ruleKey: "section_review.low_confidence_critical_fields",
        title: "Extraction Privacy Policy",
        evidence: {
          pageUrl: "https://menardc.com/lander",
          pageType: "privacy_policy",
          policyAmbiguityScore: 90,
          policySemanticConfidence: 0.2,
          policyCoverageRatio: null,
          policyEffectiveDate: null,
          policyFieldCoverage: {},
          policyGoverningLaw: null,
          policyNoticeContactPresent: null,
          policySnippetCount: 0,
          policyStructurallyWeak: true,
          policySummaryShort: "Insufficient policy content fetched for semantic review."
        }
      }),
      observedValue: "Privacy Policy",
      severity: "high",
      title: "Extraction Privacy Policy"
    },
    []
  );

  assert.equal(presentation.findingName, "Extraction Privacy Policy");
  assert.match(
    presentation.whyThisMatters,
    /complete semantic obstruction regarding the privacy policy|Policy Ambiguity Score of 90|technically dark to automated auditing|Data Controller identity and DSAR endpoints/i
  );
  assert.match(
    presentation.suggestedFix,
    /Immediate manual verification is required|Data Retention periods|Third-party recipient categories|Legal basis for processing|replace unstructured div containers|semantic section or article tags/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses strong obstruction copy and high confidence for disclosure likely obstructed", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "obs-1",
        ruleKey: "policy_runtime.disclosure_likely_obstructed",
        title: "Disclosure likely obstructed",
        evidence: {
          pageUrl: "https://menardc.com/lander",
          policyEvidence: ["content nested in collapsible container"],
          supportingSignals: ["dynamic disclosure blocks observed"]
        }
      }),
      observedValue: "Privacy Policy",
      severity: "high",
      title: "Disclosure likely obstructed"
    },
    []
  );

  assert.equal(presentation.findingName, "Disclosure likely obstructed");
  assert.match(
    presentation.whyThisMatters,
    /definitive obstruction signal|prevents reliable data mapping|automated auditing and user visibility/i
  );
  assert.match(
    presentation.suggestedFix,
    /technical audit of the policy DOM|flattened HTML structure|JavaScript-only interactions|display:none/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses tos extraction copy and max confidence for structurally weak terms pages", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "tos-1",
        ruleKey: "section_review.low_confidence_critical_fields",
        title: "Extraction TOS",
        evidence: {
          pageUrl: "https://menardc.com/lander",
          pageType: "terms_of_service",
          policyAmbiguityScore: 90,
          policyCoverageRatio: null,
          policyFieldCoverage: {},
          policySnippetCount: 0,
          policyStructurallyWeak: true
        }
      }),
      observedValue: "Terms of Service",
      severity: "high",
      title: "Extraction TOS"
    },
    []
  );

  assert.equal(presentation.findingName, "Extraction TOS");
  assert.match(
    presentation.whyThisMatters,
    /complete semantic obstruction regarding the Terms of Service|Policy Ambiguity Score of 90|technically dark to automated auditing|Governing Law, Dispute Resolution, and Termination rights/i
  );
  assert.match(
    presentation.suggestedFix,
    /resolve this for future scans|semantic section or article tags|Governing Law, Arbitration, Termination, and Notice\/Contact/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("uses low-confidence extraction copy when sibling runtime findings add context", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "2",
        ruleKey: "scan_report_review.low_confidence_critical_fields",
        title: "Low-confidence policy extraction",
        evidence: {
          pageUrl: "https://jili58d.com/privacy",
          policy_ambiguity_score: 90,
          policy_snippet_count: 0,
          policy_structurally_weak: true
        }
      }),
      observedValue: "medium severity",
      severity: "medium",
      title: "Low-confidence policy extraction"
    },
    [
      {
        linkedValidationFinding: makeLinkedFinding({
          id: "3",
          ruleKey: "policy_runtime.missing_technical_disclosure",
          title: "Missing technical disclosure"
        }),
        observedValue: "Privacy Policy",
        severity: "high",
        title: "Missing technical disclosure"
      }
    ]
  );

  assert.match(presentation.whyThisMatters, /could not extract critical disclosure fields/i);
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses strong disclosure-gap copy for missing technical disclosure", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "missing-tech-1",
        ruleKey: "policy_runtime.missing_technical_disclosure",
        title: "Missing technical disclosure",
        evidence: {
          pageUrl: "https://jili58d.com/privacy",
          runtimeEvidence: ["session replay observed"],
          supportingSignals: ["tracking active without matching disclosure"]
        }
      }),
      observedValue: "Privacy Policy",
      severity: "high",
      title: "Missing technical disclosure"
    },
    []
  );

  assert.equal(presentation.findingName, "Missing technical disclosure");
  assert.match(
    presentation.whyThisMatters,
    /definitive Missing Technical Disclosure|tracking or session replay|GDPR and CCPA exposure/i
  );
  assert.match(
    presentation.suggestedFix,
    /technical audit|session replay|third-party pixels|Technical Disclosures section|semantic HTML tags/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses strong retargeting-pixel copy and high confidence", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "pixel-1",
        ruleKey: "retargeting_pixel",
        title: "Retargeting pixel detected",
        evidence: {
          runtimeEvidence: ["retargeting pixel network request observed"],
          supportingSignals: ["marketing pixel active"]
        }
      }),
      observedValue: "Advertising stack",
      severity: "high",
      title: "Retargeting pixel detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Retargeting pixel detected");
  assert.match(
    presentation.whyThisMatters,
    /active retargeting pixel|persistent technical link|cross-site tracking|specific product interactions|data exfiltration to ad platforms/i
  );
  assert.match(
    presentation.suggestedFix,
    /network stack audit|Meta, Reddit, or LinkedIn|Marketing consent event|Do Not Track|Global Privacy Control/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.9);
});

test("uses healthcare-specific retargeting-pixel copy on medical domains", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "pixel-2",
        ruleKey: "retargeting_pixel",
        title: "Retargeting pixel detected",
        evidence: {
          pageUrl: "https://mcw.edu/clinical-programs",
          runtimeEvidence: ["retargeting pixel network request observed on clinical content"],
          supportingSignals: ["medical institution domain mcw.edu"]
        }
      }),
      observedValue: "mcw.edu",
      severity: "high",
      title: "Retargeting pixel detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Retargeting pixel detected");
  assert.match(
    presentation.whyThisMatters,
    /medical institution domain|clinical or educational pages|broader advertising profiles|HIPAA and privacy exposure/i
  );
  assert.match(
    presentation.suggestedFix,
    /Meta, Google, or Criteo|Marketing consent event|no health-related page metadata/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("uses confirmed exfiltration copy when plaintext third-party payload evidence is present", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "sensitive-1",
        ruleKey: "high_sensitivity_data_collection_detected",
        title: "Potential high-sensitivity data collection risk",
        evidence: {
          runtimeEvidence: ["email in POST https://tracker.example.net/collect"],
          sensitivePayloadViolations: [
            {
              detectedType: "email_detected",
              evidenceStrength: "confirmed",
              matchSnippet: "email=al***@example.com",
              requestMethod: "POST",
              requestUrl: "https://tracker.example.net/collect",
              sourceField: "email",
              sourceLocation: "request_body",
              sourcePattern: "keyed_field",
              timestamp: "2026-03-20T14:19:44.000Z",
              vendorHost: "tracker.example.net"
            }
          ]
        }
      }),
      observedValue: "Sensitive request payload",
      severity: "high",
      title: "Potential high-sensitivity data collection risk"
    },
    []
  );

  assert.equal(presentation.findingName, "Potential high-sensitivity data collection risk");
  assert.match(
    presentation.whyThisMatters,
    /confirmed plaintext email data|third-party request|tracker\.example\.net|`email` field in the request body/i
  );
  assert.match(
    presentation.suggestedFix,
    /Immediately inspect the affected third-party integrations|remove sensitive fields|redaction or approved irreversible hashing/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses low-confidence risk copy when no direct payload proof is retained", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "sensitive-2",
        ruleKey: "high_sensitivity_data_collection_detected",
        title: "Potential high-sensitivity data collection risk",
        evidence: {
          runtimeEvidence: ["third-party request observed"],
          supportingSignals: ["sensitive data collection signal triggered"]
        }
      }),
      observedValue: "third-party payload risk",
      severity: "high",
      title: "Potential high-sensitivity data collection risk"
    },
    []
  );

  assert.equal(presentation.findingName, "Potential high-sensitivity data collection risk");
  assert.match(
    presentation.whyThisMatters,
    /requests to third-party endpoints associated with tracking or measurement behavior|does not by itself confirm transmission of high-sensitivity user input/i
  );
  assert.match(
    presentation.suggestedFix,
    /Audit the relevant third-party requests and payload construction logic|redact them before dispatch/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.4");
});

test("uses medium-high confidence risk copy for field-level sensitive payload indicators", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "sensitive-2b",
        ruleKey: "high_sensitivity_data_collection_detected",
        title: "Potential high-sensitivity data collection risk",
        evidence: {
          runtimeEvidence: ["insurance member id in POST https://tracker.example.net/collect"],
          sensitivePayloadViolations: [
            {
              detectedType: "insurance_member_id_detected",
              evidenceStrength: "suspected",
              matchSnippet: "memberId=AB********34",
              requestMethod: "POST",
              requestUrl: "https://tracker.example.net/collect",
              sourceField: "memberId",
              sourceLocation: "request_body",
              sourcePattern: "keyed_field",
              timestamp: "2026-03-20T14:19:44.000Z",
              vendorHost: "tracker.example.net"
            }
          ]
        }
      }),
      observedValue: "Sensitive request payload",
      severity: "high",
      title: "Potential high-sensitivity data collection risk"
    },
    []
  );

  assert.equal(presentation.findingName, "Potential high-sensitivity data collection risk");
  assert.match(
    presentation.whyThisMatters,
    /field-level indicators of insurance member id data|does not yet prove plaintext exfiltration/i
  );
  assert.equal(presentation.confidenceScore, "0.7");
});

test("uses high-confidence payload copy from fallback evidence when validation linkage is absent", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        signalKey: "commerce.high_sensitivity_data_collection_detected",
        signalLabel: "High-sensitivity data collection detected",
        signalValue: true,
        sensitivePayloadViolations: [
          {
            detectedType: "phone_detected",
            evidenceStrength: "confirmed",
            matchSnippet: "phone=***-***-4567",
            requestMethod: "POST",
            requestUrl: "https://tracker.example.net/collect",
            sourceField: "phone",
            sourceLocation: "request_body",
            sourcePattern: "keyed_field",
            timestamp: "2026-03-20T14:19:44.000Z",
            vendorHost: "tracker.example.net"
          }
        ]
      },
      observedValue: "Sensitive request payload",
      severity: "high",
      title: "High-sensitivity data collection detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Potential high-sensitivity data collection risk");
  assert.match(
    presentation.whyThisMatters,
    /confirmed plaintext phone data|third-party request|tracker\.example\.net/i
  );
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses disclosure-style copy for accessibility statement unavailable", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-statement-1",
        ruleKey: "accessibility_statement_fetch_failed",
        title: "Accessibility statement unavailable",
        evidence: {
          missingEvidence: ["Accessibility statement not found at candidate URLs."]
        }
      }),
      observedValue: "404",
      severity: "medium",
      title: "Accessibility statement unavailable"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility statement not retrievable");
  assert.match(presentation.whyThisMatters, /could not retrieve an accessibility statement|known limitations|support contact/i);
  assert.match(presentation.suggestedFix, /verify whether an accessibility statement exists|publish one/i);
  assert.equal(presentation.suggestedBestPractice?.title, "Accessibility Statement Generator and Requirements");
  assert.equal(presentation.confidenceScore, "0.70");
});

test("uses linked validation fetch provenance for accessibility statement fetch failures", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "a11y-statement-2",
        ruleKey: "disclosure.accessibility_statement_fetch_failed",
        title: "Accessibility statement unavailable",
        evidence: {
          confidenceBasis: [
            "The scan attempted to fetch 3 candidate URLs for this disclosure and none returned retrievable content.",
            "Those targets were discovered via rendered footer links rather than guessed slugs."
          ],
          keyPageAttemptCount: 3,
          keyPageAttemptedUrls: [
            "https://example.com/accessibility",
            "https://example.com/legal/accessibility",
            "https://support.example.com/accessibility"
          ],
          keyPageDiscoverySource: "footer_link",
          keyPageGuessedOnly: false,
          keyPageStopReason: "all_attempts_failed",
          missingEvidence: ["The disclosure could still exist at an untested, localized, or consolidated URL outside the bounded fetch."]
        }
      }),
      observedValue: "3 candidate URLs",
      severity: "medium",
      title: "Accessibility statement unavailable"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility statement not retrievable");
  assert.match(
    presentation.whyThisMatters,
    /3 specific candidate URLs|rendered footer links rather than guessed slugs|Every bounded fetch attempt|known limitations|support contact channel/i
  );
  assert.equal(presentation.confidenceScore, "0.80");
});

test("uses disclosure-style copy for cookie policy fetch failures without linked validation data", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "same_brand_subdomain",
        keyPageGuessedOnly: false,
        keyPageStopReason: "repeated_failures",
        signalKey: "disclosure.cookie_policy_fetch_failed",
        signalLabel: "Cookie policy unavailable",
        signalValue: [
          "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/cookies",
          "http://wiki.liveinternet.ru/ServisDnevnikovLiveInternet/Cookies",
          "https://www.liveinternet.ru/cookiebeleid"
        ]
      },
      observedValue: "3 candidate URLs",
      severity: "high",
      title: "Cookie policy unavailable"
    },
    []
  );

  assert.equal(presentation.findingName, "Cookie policy not retrievable");
  assert.match(
    presentation.whyThisMatters,
    /3 specific candidate URLs|same-brand discovery rather than guessed slugs|repeated hard failures|ePrivacy Directive and GDPR|unmapped URL|primary privacy policy/i
  );
  assert.match(
    presentation.suggestedFix,
    /standalone page or a dedicated section within the primary privacy policy|vendors, purposes, and lifespans/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "GDPR.eu");
  assert.equal(presentation.confidenceScore, "0.75");
});

test("uses disclosure-style copy for privacy policy fetch failures without linked validation data", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        keyPageAttemptCount: 2,
        keyPageDiscoverySource: "footer_link",
        keyPageGuessedOnly: false,
        keyPageStopReason: "all_attempts_failed",
        signalKey: "disclosure.privacy_policy_fetch_failed",
        signalLabel: "Privacy policy page unavailable",
        signalValue: ["https://example.com/privacy", "https://example.com/legal/privacy"]
      },
      observedValue: "2 candidate URLs",
      severity: "high",
      title: "Privacy policy page unavailable"
    },
    []
  );

  assert.equal(presentation.findingName, "Privacy policy not retrievable");
  assert.match(
    presentation.whyThisMatters,
    /2 specific candidate URLs|rendered footer links rather than guessed slugs|Every bounded fetch attempt|data collection, sharing, retention, and contact mechanisms/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.80");
});

test("uses disclosure-style copy for accessibility statement fetch failures without linked validation data", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      fallbackEvidence: {
        keyPageAttemptCount: 2,
        keyPageDiscoverySource: "same_brand_subdomain",
        keyPageGuessedOnly: false,
        keyPageStopReason: "repeated_failures",
        signalKey: "disclosure.accessibility_statement_fetch_failed",
        signalLabel: "Accessibility statement unavailable",
        signalValue: ["https://example.com/accessibility", "https://support.example.com/accessibility"]
      },
      observedValue: "2 candidate URLs",
      severity: "medium",
      title: "Accessibility statement unavailable"
    },
    []
  );

  assert.equal(presentation.findingName, "Accessibility statement not retrievable");
  assert.match(
    presentation.whyThisMatters,
    /2 specific candidate URLs|same-brand discovery rather than guessed slugs|repeated hard failures|known limitations|support contact channel/i
  );
  assert.equal(presentation.suggestedBestPractice?.title, "Accessibility Statement Generator and Requirements");
  assert.equal(presentation.confidenceScore, "0.75");
});

test("keeps potential wording for low-confidence high-sensitivity risk findings", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "sensitive-3",
        ruleKey: "high_sensitivity_data_collection_detected",
        title: "Potential high-sensitivity data collection risk",
        evidence: {
          runtimeEvidence: ["third-party request observed"],
          supportingSignals: ["sensitive data collection signal triggered"]
        }
      }),
      observedValue: "third-party payload risk",
      severity: "high",
      title: "Potential high-sensitivity data collection risk"
    },
    []
  );

  assert.equal(presentation.findingName, "Potential high-sensitivity data collection risk");
  assert.equal(presentation.confidenceScore, "0.4");
});

test("uses session-replay copy and moderate confidence for detector-backed replay findings", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "replay-1",
        ruleKey: "commerce.session_replay_tool_detected",
        title: "Session replay tool detected",
        evidence: {
          claim: "Session replay tool detected was elevated during the scan and merits reviewer attention.",
          confidenceBasis: ["Automated detector fired for this signal."],
          missingEvidence: ["No rule-specific evidence builder has been configured yet."],
          pageUrls: [],
          policyEvidence: [],
          reviewPolicy: {
            claimType: "behavior_without_disclosure",
            detectorStrength: "medium",
            gapTolerance: "medium"
          },
          runtimeEvidence: [],
          supportingSignals: [
            {
              category: "commerce",
              key: "commerce.session_replay_tool_detected",
              label: "Session replay tool detected",
              value: true
            }
          ]
        }
      }),
      observedValue: "Session replay tool detected",
      severity: "high",
      title: "Session replay tool detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Session replay tool detected");
  assert.match(
    presentation.whyThisMatters,
    /active session replay scripts|mouse movements, scrolling behavior, and keystrokes|behavioral journey of the user/i
  );
  assert.match(
    presentation.suggestedFix,
    /specific session replay vendor|FullStory, Hotjar, or LogRocket|Consent Management Platform|masked to prevent the collection of PII/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "FTC");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("uses stronger runtime session-replay copy and high confidence", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "replay-2",
        ruleKey: "commerce.session_replay_runtime_detected",
        title: "Session replay runtime detected",
        evidence: {
          runtimeEvidence: ["session replay script observed on page load"],
          supportingSignals: [
            {
              category: "commerce",
              key: "commerce.session_replay_runtime_detected",
              label: "Session replay runtime detected",
              value: true
            }
          ]
        }
      }),
      observedValue: "Session replay runtime detected",
      severity: "high",
      title: "Session replay runtime detected"
    },
    []
  );

  assert.equal(presentation.findingName, "Session replay runtime detected");
  assert.match(
    presentation.whyThisMatters,
    /active session replay scripts|scrolling patterns|behavioral journey of the user|aggregate page-level metrics/i
  );
  assert.match(
    presentation.suggestedFix,
    /specific session replay vendor|FullStory, Hotjar, or LogRocket|Consent Management Platform|masked to prevent the collection of PII/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "FTC");
  assert.equal(presentation.confidenceScore, "0.9");
});

test("uses vendor-specific runtime session-replay copy and elevated confidence", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "replay-3",
        ruleKey: "commerce.session_replay_runtime_vendors",
        title: "Session replay runtime vendors",
        evidence: {
          runtimeEvidence: ["FullStory runtime script observed on page load"],
          supportingSignals: [
            {
              category: "commerce",
              key: "commerce.session_replay_runtime_vendors",
              label: "Session replay runtime vendors",
              value: ["FullStory"]
            }
          ]
        }
      }),
      observedValue: "FullStory",
      severity: "high",
      title: "Session replay runtime vendors"
    },
    []
  );

  assert.equal(presentation.findingName, "Session replay runtime vendors");
  assert.match(
    presentation.whyThisMatters,
    /FullStory as an active session replay vendor|mouse movements, scrolling, and clicks|unintended collection of behavioral data|unmasked form fields/i
  );
  assert.match(
    presentation.suggestedFix,
    /FullStory is explicitly listed|Consent Management Platform|Functional or Analytical cookies|masked within the FullStory configuration/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "FTC");
  assert.equal(presentation.confidenceScore, "0.95");
});

test("uses low-confidence extraction copy for policy extraction title without linked validation finding", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      evidence: ["https://jili58d.com/privacy"],
      observedValue: "Privacy Policy",
      severity: "medium",
      title: "Low-confidence policy extraction"
    },
    []
  );

  assert.match(presentation.whyThisMatters, /could not extract critical disclosure fields/i);
  assert.match(presentation.suggestedFix, /manual technical review/i);
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.55");
});

test("falls back to generic presentation for unmatched findings without linked validation data", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      evidence: ["https://example.com/privacy"],
      observedValue: "medium severity",
      severity: "medium",
      title: "Unexpected disclosure concern"
    },
    []
  );

  assert.equal(presentation.findingName, "Unexpected disclosure concern");
  assert.match(presentation.whyThisMatters, /merit reviewer attention/i);
  assert.match(presentation.suggestedFix, /confirm whether the signal needs follow-up/i);
  assert.equal(presentation.confidenceScore, "0.55");
});

test("uses bounded key-page discovery presentation for unresolved bounded search findings", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      evidence: ["Privacy policy", "Terms of service"],
      observedValue: "Privacy policy, Terms of service",
      severity: "medium",
      title: "Bounded key-page discovery unresolved"
    },
    []
  );

  assert.equal(presentation.findingName, "Bounded key-page discovery unresolved");
  assert.match(presentation.whyThisMatters, /bounded key-page discovery pass|tried and failed|coverage-related findings may be understated/i);
  assert.match(presentation.suggestedFix, /stable footer links|legal hubs|sitemap entries|JS-only navigation/i);
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "1.0");
});

test("normalizeFindingName removes confidence-colored prefixes from display names", () => {
  assert.equal(normalizeFindingName("High-confidence technical disclosure gap"), "Technical disclosure gap");
  assert.equal(normalizeFindingName("Low-confidence policy extraction"), "Policy extraction");
  assert.equal(normalizeFindingName("Automated accessibility issues detected"), "WCAG errors");
  assert.equal(normalizeFindingName("Pre-consent tracker vendors"), "Trackers observed before consent");
  assert.equal(
    normalizeFindingName("High-sensitivity data collection detected"),
    "Potential high-sensitivity data collection risk"
  );
  assert.equal(normalizeFindingName("Privacy policy page unavailable"), "Privacy policy not retrievable");
  assert.equal(normalizeFindingName("Terms page unavailable"), "Terms page not retrievable");
  assert.equal(normalizeFindingName("Cookie policy unavailable"), "Cookie policy not retrievable");
  assert.equal(normalizeFindingName("Accessibility statement unavailable"), "Accessibility statement not retrievable");
  assert.equal(normalizeFindingName("Contact page unavailable"), "Contact page not retrievable");
  assert.equal(normalizeFindingName("Missing technical disclosure"), "Missing technical disclosure");
  assert.equal(normalizeFindingName({ type: "click" } as unknown as string), "");
});
