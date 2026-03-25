import { buildUnifiedFindingDisplayPackets, type UnifiedFindingCandidate } from "../apps/web/lib/scans/unified-findings";

type ExpectedResult = {
  presentationStatus: "surface" | "audit_only" | "suppress" | null;
  unifiedFindingId: string | null;
};

const FIXTURE_CASES: Array<{
  candidate: UnifiedFindingCandidate;
  expected: ExpectedResult;
  name: string;
}> = [
  {
    candidate: {
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
    },
    expected: {
      presentationStatus: null,
      unifiedFindingId: null
    },
    name: "non-policy extraction signal is blocked before packet assembly"
  },
  {
    candidate: {
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
    },
    expected: {
      presentationStatus: "audit_only",
      unifiedFindingId: "consent_surface_missing"
    },
    name: "discovery-only consent-surface signal stays audit-only"
  },
  {
    candidate: {
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
    },
    expected: {
      presentationStatus: "audit_only",
      unifiedFindingId: "weak_cookie_security_attributes"
    },
    name: "weak-cookie posture with only HttpOnly examples stays audit-only"
  },
  {
    candidate: {
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
    },
    expected: {
      presentationStatus: "surface",
      unifiedFindingId: "privacy_rights_path_present"
    },
    name: "structured policy-rights signal still surfaces"
  }
];

function main() {
  const results = FIXTURE_CASES.map((testCase) => {
    const packet = buildUnifiedFindingDisplayPackets({
      reviewFindingCandidates: [testCase.candidate],
      validationFindings: [],
      validationFindingLookup: new Map()
    })[0] ?? null;

    return {
      expected: testCase.expected,
      name: testCase.name,
      presentationStatus: packet?.presentationDecision.status ?? null,
      unifiedFindingId: packet?.unifiedFindingId ?? null
    };
  });

  const failures = results.filter(
    (result) =>
      result.presentationStatus !== result.expected.presentationStatus ||
      result.unifiedFindingId !== result.expected.unifiedFindingId
  );

  console.log(JSON.stringify({ failures, results }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
