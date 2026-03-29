import { buildUnifiedFindingDisplayPackets, type UnifiedFindingCandidate } from "../apps/web/lib/scans/unified-findings";

type ExpectedResult = Array<{
  presentationStatus: "surface" | "audit_only" | "suppress";
  unifiedFindingId: string;
}>;

const FIXTURE_CASES: Array<{
  candidates: UnifiedFindingCandidate[];
  expected: ExpectedResult;
  name: string;
}> = [
  {
    candidates: [{
      description: "Critical policy extraction fields were low confidence and need manual review.",
      fallbackEvidence: {
        pageType: "non_policy",
        pageUrl: "https://www.kbdlab.io/components/pbtfans-cookies-n-creme",
        policySemanticConfidence: 0.5,
        signalKey: "policySemanticConfidence",
        signalLabel: "Policy semantic confidence",
        signalValue: 0.5
      },
      observedValue: "Policy extraction",
      severity: "medium",
      signalKey: "policySemanticConfidence",
      signalLabel: "Policy semantic confidence",
      signalSource: "policy_enrichment_signal",
      sourceType: "signal",
      title: "Low-confidence policy extraction"
    }],
    expected: [],
    name: "non-policy extraction signal is blocked before packet assembly"
  },
  {
    candidates: [{
      description: "A consent surface may be missing, but the retained evidence is discovery-only.",
      fallbackEvidence: {
        keyPageAttemptCount: 3,
        keyPageDiscoverySource: "footer_link",
        signalKey: "privacy.consent_surface_missing",
        signalLabel: "Consent surface missing",
        signalValue: true
      },
      observedValue: "No consent surface detected",
      severity: "high",
      signalKey: "privacy.consent_surface_missing",
      signalLabel: "Consent surface missing",
      signalSource: "snapshot_signal",
      sourceType: "signal",
      title: "Consent surface missing"
    }],
    expected: [{ presentationStatus: "surface", unifiedFindingId: "consent_surface_missing" }],
    name: "discovery-only consent-surface signal still surfaces under the current concern policy"
  },
  {
    candidates: [{
      description: "Observed cookies appear to rely on weaker security attributes than expected.",
      fallbackEvidence: {
        cookieAttributeSummary: {
          missingHttpOnlyCount: 4,
          missingHttpOnlyCookieNames: ["_ga", "_ga_H1SWTMGGJ4"]
        },
        signalKey: "privacy.weak_cookie_security_attributes_detected",
        signalLabel: "Weak cookie security attributes detected",
        signalValue: true
      },
      observedValue: "Yes",
      severity: "medium",
      signalKey: "privacy.weak_cookie_security_attributes_detected",
      signalLabel: "Weak cookie security attributes detected",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Weak cookie security attributes detected"
    }],
    expected: [{ presentationStatus: "surface", unifiedFindingId: "weak_cookie_security_attributes" }],
    name: "weak-cookie posture with only HttpOnly examples still surfaces under the current runtime policy"
  },
  {
    candidates: [{
      description: "The scan retained a clear policy-based privacy-rights request path.",
      fallbackEvidence: {
        pageType: "privacy_policy",
        pageUrl: "https://www.kbdlab.io/privacy-policy",
        policyRightsSignals: ["access", "delete"],
        policySnippets: ["If you would like to exercise any of these rights, please contact us."],
        signalKey: "privacy.privacy_rights_path_present",
        signalLabel: "Privacy-rights path present",
        signalValue: true
      },
      observedValue: "Privacy-rights path present",
      severity: "low",
      signalKey: "privacy.privacy_rights_path_present",
      signalLabel: "Privacy-rights path present",
      signalSource: "policy_enrichment_signal",
      sourceType: "signal",
      title: "Privacy-rights path present"
    }],
    expected: [{ presentationStatus: "audit_only", unifiedFindingId: "privacy_rights_path_present" }],
    name: "structured policy-rights signal remains support-only without stronger corroboration"
  },
  {
    candidates: [
      {
        description: "The scan retained a reachable privacy-policy surface.",
        fallbackEvidence: {
          keyPageTitleRecords: [
            {
              title: "Affiliate Disclosure | KBD Lab",
              url: "https://www.kbdlab.io/privacy-policy"
            }
          ],
          pageUrls: ["https://www.kbdlab.io/privacy-policy"],
          policySnippets: ["Affiliate Disclosure | KBD Lab"],
          signalKey: "disclosure.privacy_policy_present",
          signalLabel: "Privacy policy surface present",
          signalValue: true,
          sourceUrls: ["https://www.kbdlab.io/privacy-policy"]
        },
        observedValue: "Privacy policy surface present",
        severity: "low",
        signalKey: "disclosure.privacy_policy_present",
        signalLabel: "Privacy policy surface present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Privacy policy surface present"
      }
    ],
    expected: [
      { presentationStatus: "surface", unifiedFindingId: "surface_title_mismatch" },
      { presentationStatus: "audit_only", unifiedFindingId: "privacy_policy_present" }
    ],
    name: "privacy-policy title mismatch surfaces as the lead finding"
  },
  {
    candidates: [
      {
        description: "The scan retained policy text describing privacy rights, but the guessed do-not-sell path itself was not verified as a reachable user-facing control surface.",
        fallbackEvidence: {
          keyPageAttemptCount: 1,
          keyPageAttemptedUrls: ["https://www.kbdlab.io/cookies"],
          keyPageGuessedOnly: true,
          pageUrls: ["https://www.kbdlab.io/privacy-policy"],
          policySnippets: [
            "CCPA Privacy Rights (Do Not Sell My Personal Information) Under the CCPA, among other rights, consumers may request access to their data."
          ],
          signalKey: "privacy.do_not_sell_link_present",
          signalLabel: "Do-not-sell link present",
          signalValue: true,
          sourceUrls: ["https://www.kbdlab.io/privacy-policy"]
        },
        observedValue: "Do-not-sell link present",
        severity: "low",
        signalKey: "privacy.do_not_sell_link_present",
        signalLabel: "Do-not-sell link present",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Do-not-sell link present"
      }
    ],
    expected: [{ presentationStatus: "audit_only", unifiedFindingId: "privacy_rights_path_present" }],
    name: "guessed do-not-sell evidence is reclassified to privacy rights without overstating a control surface"
  }
];

function main() {
  const results = FIXTURE_CASES.map((testCase) => {
    const packets = buildUnifiedFindingDisplayPackets({
      reviewFindingCandidates: testCase.candidates,
      validationFindings: [],
      validationFindingLookup: new Map()
    });

    return {
      expected: testCase.expected,
      name: testCase.name,
      observed: packets.map((packet) => ({
        presentationStatus: packet.presentationDecision.status,
        unifiedFindingId: packet.unifiedFindingId
      }))
    };
  });

  const failures = results.filter(
    (result) =>
      JSON.stringify(result.observed) !== JSON.stringify(result.expected)
  );

  console.log(JSON.stringify({ failures, results }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
