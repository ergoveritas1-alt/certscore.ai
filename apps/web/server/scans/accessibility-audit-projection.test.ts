import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAudit } from "./accessibility-audit-projection";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectAccessibilityAuditSummary } from "../../lib/scans/accessibility-audit-evidence";

function bundle(): CanonicalEvidenceBundle {
  const audit = accessibilityAuditFixture();
  return { scanId: audit.scanId, startedAt: "2026-10-09T12:00:00.000Z", completedAt: "2026-10-09T12:00:10.000Z",
    accessibilityAudit: audit, domSnapshots: [], runtimeMetadataSnapshots: [{ url: audit.documentUrl,
      documentIdentity: { source: "cdp_loader_id", token: audit.documentToken! }, consentStateAtTime: "pre_consent" }],
  } as unknown as CanonicalEvidenceBundle;
}
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };

test("verified retained accessibility observations enter concerns, policy and unified findings", () => {
  const accessibilityAudit = projectAccessibilityAudit(bundle(), source, "https://example.com/");
  assert.ok(accessibilityAudit);
  const runtimeArtifacts = { accessibilityAudit };
  const concerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  assert.ok(concerns.length >= 3);
  assert.ok(concerns.every(concern => concern.categoryId === "accessibility"));
  for (const concern of concerns) {
    assert.ok(!concern.evidenceBundle.flags.includes("consent_governance_disclosure_gap"));
    assert.equal(concern.evidenceBundle.entities.consentGovernanceDisclosureEvidence, undefined);
  }
  const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  for (const id of ["text_alternative_accessibility_issue", "semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"]) {
    assert.ok(findings.some(finding => finding.unifiedFindingId === id), `${id}: ${JSON.stringify(findings.map(f => f.unifiedFindingId))}`);
  }
  assert.ok(findings.every(finding => !(finding.evidence?.snippets ?? []).some(snippet => snippet.startsWith("Consent governance disclosure note:"))));
  assert.deepEqual(projectAccessibilityAuditSummary(accessibilityAudit), {
    status: "completed", required: true, scope: "starting_page_rendered_content", engine: "axe-core", engineVersion: "4.11.3",
    durationMs: 1000, failedRuleCount: 4, affectedNodeCount: 4, reviewRuleCount: 0,
  });
});

test("mismatched independent document proof or timing discards findings and reports limited coverage", () => {
  for (const mutate of [
    (b: CanonicalEvidenceBundle) => { b.runtimeMetadataSnapshots = []; },
    (b: CanonicalEvidenceBundle) => { b.accessibilityAudit!.documentToken = "different-loader"; },
    (b: CanonicalEvidenceBundle) => { b.accessibilityAudit!.completedAt = "2026-10-09T12:00:11.000Z"; },
  ]) {
    const input = bundle(); mutate(input);
    const projection = projectAccessibilityAudit(input, source, "https://example.com/");
    assert.equal(projection?.observation.status, "limited");
    assert.equal(projectAccessibilityAuditSummary(projection)?.failedRuleCount, null);
    assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts: { accessibilityAudit: projection }, reviewFindingCandidates: [], validationFindings: [] }), []);
  }
});

test("unverified, malformed or cross-scan required evidence blocks publication; historical scans stay unchanged", () => {
  assert.throws(() => projectAccessibilityAudit(bundle(), undefined, "https://example.com/"), /checksum-verified/);
  const input = bundle(); input.accessibilityAudit!.scanId = "different-scan";
  assert.throws(() => projectAccessibilityAudit(input, source, "https://example.com/"), /another scan/);
  delete input.accessibilityAudit;
  assert.equal(projectAccessibilityAudit(input, undefined, null), null);
});

test("review items alone never become observed failures", () => {
  const input = bundle();
  input.accessibilityAudit = accessibilityAuditFixture({ status: "limited", reviewItems: input.accessibilityAudit!.violations,
    violations: [], limitations: ["rules_need_review"] });
  const projection = projectAccessibilityAudit(input, source, "https://example.com/");
  assert.equal(projectAccessibilityAuditSummary(projection)?.reviewRuleCount, 4);
  assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts: { accessibilityAudit: projection }, reviewFindingCandidates: [], validationFindings: [] }), []);
});
