import assert from "node:assert/strict";
import test from "node:test";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { buildCanonicalShadowScoreInput } from "./canonical-shadow-score-input";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function packet(input: {
  family: string;
  findingId: string;
  reportable: boolean;
  status: "surface" | "audit_only" | "suppress";
}): UnifiedFindingDisplayPacket {
  return {
    presentationDecision: { status: input.status },
    severity: "high",
    surfacingDecision: {
      family: input.family,
      reportable: input.reportable
    },
    unifiedFindingId: input.findingId
  } as UnifiedFindingDisplayPacket;
}

test("canonical score input accepts only already-surfaced unified findings and typed checklist rows", () => {
  const input = buildCanonicalShadowScoreInput({
    checklistRows: [{
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "privacy_notice_availability"
    } as GdprEprivacyCoverageChecklistItem],
    unifiedFindings: [
      packet({ family: "consent_tracking", findingId: "pre_consent_tracking_detected", reportable: true, status: "surface" }),
      packet({ family: "accessibility", findingId: "wcag_contrast", reportable: true, status: "surface" }),
      packet({ family: "contradiction", findingId: "audit_only_contradiction", reportable: true, status: "audit_only" }),
      packet({ family: "sensitive_data", findingId: "suppressed_sensitive_context", reportable: false, status: "suppress" })
    ]
  });

  assert.deepEqual(input.coverageRows, [{
    assessmentStatus: "checked",
    evidenceState: "observed",
    rowId: "privacy_notice_availability"
  }]);
  assert.deepEqual(input.findings, [{
    family: "consent_tracking",
    findingId: "pre_consent_tracking_detected",
    severity: "high"
  }]);
});
