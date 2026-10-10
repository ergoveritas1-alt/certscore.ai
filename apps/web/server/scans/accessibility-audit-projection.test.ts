import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAudit } from "./accessibility-audit-projection";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectAccessibilityAuditSummary } from "../../lib/scans/accessibility-audit-evidence";

function bundle(): CanonicalEvidenceBundle {
  const audit = accessibilityAuditFixture();
  return { scanId: audit.scanId, normalizedUrl: audit.documentUrl, startedAt: "2026-10-09T12:00:00.000Z", completedAt: "2026-10-09T12:00:10.000Z",
    accessibilityAudit: audit, domSnapshots: [], runtimeMetadataSnapshots: [{ url: audit.documentUrl, capturedAtMs: 6000,
      documentIdentity: { source: "cdp_loader_id", token: audit.documentToken! }, consentStateAtTime: "pre_consent" }],
  } as unknown as CanonicalEvidenceBundle;
}
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };

async function runtimeDocumentSelector() {
  const require = createRequire(import.meta.url);
  const path = require.resolve("server-only");
  (require.cache as Record<string, unknown>)[path] = { exports: {}, filename: path, id: path,
    isPreloading: false, loaded: true, path, paths: [] };
  return (await import("./local-v2-dag-report")).getLocalV2AccessibilityDocumentUrl;
}

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

test("independent runtime document binding preserves session-specific URLs without normalizing them away", async () => {
  const getLocalV2AccessibilityDocumentUrl = await runtimeDocumentSelector();
  const input = bundle();
  const runtimeUrl = "https://example.com/en/;jsessionid=runtime-session";
  input.accessibilityAudit!.documentUrl = runtimeUrl;
  input.runtimeMetadataSnapshots![0]!.url = runtimeUrl;
  input.domSnapshots = [{ ...input.runtimeMetadataSnapshots![0]!, capturedAtMs: 7000,
    url: "https://example.com/en/;jsessionid=consent-session",
    documentIdentity: { source: "cdp_loader_id", token: "consent-loader" } }];
  const documentUrl = getLocalV2AccessibilityDocumentUrl(input);
  assert.equal(documentUrl, runtimeUrl);
  const projected = projectAccessibilityAudit(input, source, documentUrl);
  assert.equal(projected?.observation.status, "completed");
  assert.equal(projected?.observation.violations.length, 4);
  assert.equal(projectAccessibilityAudit(input, source, input.domSnapshots[0]!.url)?.observation.violations.length, 0);
});

test("latest runtime proof, lane ownership and no-go/auxiliary guards fail closed", async () => {
  const getLocalV2AccessibilityDocumentUrl = await runtimeDocumentSelector();
  const input = bundle();
  input.runtimeMetadataSnapshots!.push({ ...input.runtimeMetadataSnapshots![0]!, capturedAtMs: 7000,
    documentIdentity: { source: "cdp_loader_id", token: "new-loader" } });
  assert.equal(projectAccessibilityAudit(input, source, getLocalV2AccessibilityDocumentUrl(input))?.observation.violations.length, 0);
  assert.equal(projectAccessibilityAudit(bundle(), source, null)?.observation.violations.length, 0);
  input.runtimeMetadataSnapshots![1]!.url = "https://example.com/oauth/callback";
  assert.equal(getLocalV2AccessibilityDocumentUrl(input), null);
  input.runtimeMetadataSnapshots![1]!.url = "https://unrelated.invalid/";
  assert.equal(getLocalV2AccessibilityDocumentUrl(input), null, "another site's document is not the assessment target");
  input.domSnapshots = bundle().runtimeMetadataSnapshots!;
  input.runtimeMetadataSnapshots = [];
  assert.equal(getLocalV2AccessibilityDocumentUrl(input), null, "empty runtime proof cannot borrow consent proof");
  delete input.runtimeMetadataSnapshots;
  assert.equal(getLocalV2AccessibilityDocumentUrl(input), "https://example.com/", "legacy unsharded capture remains readable");
});

test("failed and not-testable audits retain honest terminal coverage rather than a false zero or binding reason", () => {
  for (const status of ["failed", "not_testable"] as const) {
    const input = bundle();
    input.accessibilityAudit = accessibilityAuditFixture({ status, documentToken: null, rulesEvaluated: [],
      violations: [], reviewItems: [], limitations: ["document_unavailable"] });
    const projected = projectAccessibilityAudit(input, source, null);
    assert.equal(projected?.observation.status, status);
    assert.deepEqual(projected?.observation.limitations, ["document_unavailable"]);
    assert.equal(projectAccessibilityAuditSummary(projected)?.failedRuleCount, null);
  }
});

test("reviewed rule additions pass through canonical concerns/policy while explicit exclusions remain evidence-only", () => {
  const families = {
    "input-image-alt": "text_alternative_accessibility_issue",
    "aria-prohibited-attr": "semantic_labeling_accessibility_issue",
    "aria-required-children": "semantic_labeling_accessibility_issue",
    "link-in-text-block": "visual_contrast_accessibility_issue",
  };
  for (const ruleId of [...Object.keys(families), "html-has-lang", "target-size", "meta-viewport"]) {
    const input = bundle();
    const rule = { ...input.accessibilityAudit!.violations[0]!, ruleId,
      helpUrl: `https://dequeuniversity.com/rules/axe/4.11/${ruleId}` };
    input.accessibilityAudit!.rulesEvaluated = [ruleId];
    input.accessibilityAudit!.violations = [rule];
    const accessibilityAudit = projectAccessibilityAudit(input, source, input.accessibilityAudit!.documentUrl);
    const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit },
      reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
    const expected = families[ruleId as keyof typeof families];
    assert.deepEqual(findings.map(f => f.unifiedFindingId), expected ? [expected] : [], ruleId);
    assert.equal(accessibilityAudit?.observation.violations[0]!.ruleId, ruleId, "exclusions retain raw evidence");
  }
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
