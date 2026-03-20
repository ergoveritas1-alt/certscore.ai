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
  assert.match(presentation.whyThisMatters, /before a visitor can provide or deny consent/i);
  assert.match(presentation.suggestedFix, /Consent Mode v2|consent/i);
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.ok(Number(presentation.confidenceScore) >= 0.6);
});

test("uses strong copy and high evidence strength for functional misalignment", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fm-1",
        ruleKey: "policy_runtime.functional_misalignment",
        title: "High-confidence functional misalignment",
        evidence: {
          pageUrl: "https://menardc.com/privacy",
          runtimeEvidence: ["privacy request flow requires account creation"],
          signalValue: 100,
          supportingSignals: ["rights friction maxed"]
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
    /definitive functional misalignment|asymmetric user experience|technical dark pattern|CCPA and GDPR exposure/i
  );
  assert.match(
    presentation.suggestedFix,
    /Functional Symmetry|same number of clicks|secondary authentication|account-creation hurdles/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "CPPA");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses max-strength score and hard-block copy for critical user-rights fulfillment friction", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "fr-1",
        ruleKey: "privacy.friction_score",
        title: "Critical user-rights fulfillment friction",
        evidence: {
          runtimeEvidence: ["delete request path redirects to login"],
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
    /maximum friction score of 100|Hard Block|opting out or requesting deletion|high-risk technical dark pattern/i
  );
  assert.match(
    presentation.suggestedFix,
    /Functional Symmetry|same number of clicks as the Accept path|secondary modals|forced account creation|login redirects/i
  );
  assert.equal(presentation.suggestedBestPractice?.label, "CPPA");
  assert.equal(presentation.confidenceScore, "1.0");
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
    /Policy Ambiguity Score of 90|technically dark to automated auditing|Governing Law, Dispute Resolution, and Termination rights/i
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

test("normalizeFindingName removes confidence-colored prefixes from display names", () => {
  assert.equal(normalizeFindingName("High-confidence technical disclosure gap"), "Technical disclosure gap");
  assert.equal(normalizeFindingName("Low-confidence policy extraction"), "Policy extraction");
  assert.equal(normalizeFindingName("Automated accessibility issues detected"), "WCAG errors");
  assert.equal(normalizeFindingName("Missing technical disclosure"), "Missing technical disclosure");
  assert.equal(normalizeFindingName({ type: "click" } as unknown as string), "");
});
