import assert from "node:assert/strict";
import test from "node:test";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import {
  hydrateChecklistPolicyEvidence,
  indexChecklistPolicyEvidence,
} from "./checklist-evidence-index";

function row(id: string, summary: Record<string, unknown>): GdprEprivacyCoverageChecklistItem {
  return {
    assessmentStatus: "checked",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `policy:${id}`,
        projectionStage: "unified_finding",
        wc01NormalizedConcernKey: `concern:${id}`,
        ws01EvidenceRole: "policy_evidence",
      },
      projectedFindings: [],
      retainedEvidence: {
        article13Signal: { disclosureType: id },
        policySurfaceSummary: summary,
      },
      statusBasis: "retained_policy_evidence",
    },
    evidenceRefs: ["CanonicalEvidenceBundle.json#policy-1"],
    evidenceState: "observed",
    explanation: "Observed retained policy evidence.",
    id,
    label: id,
    note: "Observed retained policy evidence.",
    status: "Observed",
    tone: "neutral",
  };
}

test("repeated checklist policy evidence is indexed once and hydrates without loss", () => {
  const summary = {
    retainedPolicySections: [{ heading: "Rights", textExcerpt: "You may request access." }],
    retainedPrivacyPolicyTextExcerpt: "You may request access.",
  };
  const original = [row("rights", summary), row("contact", summary)];
  const compact = indexChecklistPolicyEvidence(original);

  assert.equal(Object.keys(compact.evidenceIndex).length, 1);
  assert.equal(
    "policySurfaceSummary" in compact.rows[0]!.criticalEvidence.retainedEvidence,
    false,
  );
  assert.equal(
    compact.rows[0]!.criticalEvidence.retainedEvidence.policySurfaceSummaryRef,
    compact.rows[1]!.criticalEvidence.retainedEvidence.policySurfaceSummaryRef,
  );

  const hydrated = hydrateChecklistPolicyEvidence(compact.rows, compact.evidenceIndex);
  assert.deepEqual(hydrated, original);
  assert.deepEqual(
    hydrated.map((item) => item.criticalEvidence.retainedEvidence.policySurfaceSummary),
    [summary, summary],
  );
  assert.deepEqual(
    hydrated.map((item) => item.criticalEvidence.retainedEvidence.article13Signal),
    original.map((item) => item.criticalEvidence.retainedEvidence.article13Signal),
  );
});

test("row evidence remains unchanged when no shared policy summary exists", () => {
  const withoutSummary = row("runtime", {});
  delete withoutSummary.criticalEvidence.retainedEvidence.policySurfaceSummary;
  const compact = indexChecklistPolicyEvidence([withoutSummary]);
  assert.deepEqual(compact.evidenceIndex, {});
  assert.deepEqual(compact.rows, [withoutSummary]);
});
