import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAudit, projectAdditionalPageAccessibilityAudit } from "./accessibility-audit-projection";
import { createHash } from "node:crypto";
import type { CrawlObservation } from "@website-signal-risk-scanner/shared";
import { accessibilityDeductionBreakdown } from "../../lib/scans/accessibility-score-policy";
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

test("existing additional-page audits require verified bytes and exact attempt, configuration and document binding", () => {
  const pageId = "10000000-0000-4000-8000-000000000001", parentScanId = "parent-scan", attemptId = "20000000-0000-4000-8000-000000000001";
  const a = accessibilityAuditFixture({ scanId: pageId });
  const capture = { pageId, parentScanId, attemptId, configurationHash: "c".repeat(64), startedAt: "2026-10-09T12:00:00.000Z", completedAt: "2026-10-09T12:00:10.000Z", finalUrl: a.documentUrl };
  const evidence = { accessibilityAudit: a, siteIntegrityPageCapture: capture,
    moduleRun: { moduleName: "preConsentRuntimeScanner", status: "completed", startedAt: a.startedAt },
    domSnapshots: [{ artifactId: "dom", capturedAtMs: 6000, path: "dom.json", url: a.documentUrl, pagePhase: "network_idle", consentStateAtTime: "pre_consent", documentIdentity: { source: "cdp_loader_id", token: a.documentToken } }],
  };
  const packet = { ...capture, pageJobId: pageId, executionProfile: "inventory_only", status: "completed", httpStatus: 200, failureKind: null,
    sourceHash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex") } as unknown as CrawlObservation;
  const projection = projectAdditionalPageAccessibilityAudit(evidence, packet, parentScanId);
  assert.ok(projection);
  assert.equal(projection.contractVersion, "certscore.accessibility-audit-projection.v2");
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const effects = packets.flatMap(row => row.scoreEffects ?? []);
  assert.equal(accessibilityDeductionBreakdown([...effects, ...effects]).deductionPoints, 10);
  for (const change of [{ sourceHash: "d".repeat(64) }, { attemptId: pageId }, { pageJobId: attemptId }, { configurationHash: "d".repeat(64) },
    { parentScanId: "wrong" }, { finalUrl: "https://example.com/other" }, { status: "partial" }, { httpStatus: 500 }]) {
    assert.equal(projectAdditionalPageAccessibilityAudit(evidence, { ...packet, ...change } as CrawlObservation, parentScanId), null);
  }
  assert.equal(projectAdditionalPageAccessibilityAudit({ ...evidence, accessibilityAudit: { ...a, documentToken: "stale" } }, packet, parentScanId), null);
  assert.equal(projectAdditionalPageAccessibilityAudit({ ...evidence, accessibilityAudit: undefined }, packet, parentScanId), null);
  for (const changed of [
    { ...evidence, accessibilityAudit: { ...a, documentToken: "stale" } },
    { ...evidence, accessibilityAudit: { ...a, startedAt: "2026-10-09T11:59:59.000Z" } },
    { ...evidence, domSnapshots: [...evidence.domSnapshots, { ...evidence.domSnapshots[0], capturedAtMs: 7000,
      documentIdentity: { source: "cdp_loader_id", token: "new-document" } }] },
  ]) {
    const changedPacket = { ...packet, sourceHash: createHash("sha256").update(JSON.stringify(changed)).digest("hex") };
    assert.equal(projectAdditionalPageAccessibilityAudit(changed, changedPacket, parentScanId), null, "matching bytes alone cannot replace document/timing proof");
  }
  for (const change of [{ documentIdentity: { source: "cdp_loader_id", token: "other-loader" } },
    { url: "https://example.com/other" }]) {
    const matching = evidence.domSnapshots[0]!;
    const conflicting = { ...matching, ...change };
    for (const domSnapshots of [[matching, conflicting], [conflicting, matching]]) {
      const changed = { ...evidence, domSnapshots };
      const changedPacket = { ...packet, sourceHash: createHash("sha256").update(JSON.stringify(changed)).digest("hex") };
      assert.equal(projectAdditionalPageAccessibilityAudit(changed, changedPacket, parentScanId), null,
        "equal latest offsets with conflicting document proof cannot use array order to bind an audit");
    }
  }
  for (const capturedAtMs of [0, 10000]) {
    const changed = { ...evidence, domSnapshots: [{ ...evidence.domSnapshots[0], capturedAtMs }] };
    const changedPacket = { ...packet, sourceHash: createHash("sha256").update(JSON.stringify(changed)).digest("hex") };
    assert.ok(projectAdditionalPageAccessibilityAudit(changed, changedPacket, parentScanId), "visit boundaries remain eligible");
  }
  const stale = { ...evidence, domSnapshots: [...evidence.domSnapshots, { ...evidence.domSnapshots[0], capturedAtMs: 10001 }] };
  const stalePacket = { ...packet, sourceHash: createHash("sha256").update(JSON.stringify(stale)).digest("hex") };
  assert.equal(projectAdditionalPageAccessibilityAudit(stale, stalePacket, parentScanId), null,
    "a stale latest snapshot cannot establish page binding or fall back to earlier proof");
});

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

test("captured image-link identity survives verified projection, concerns and policy", () => {
  const input = bundle();
  const base = input.accessibilityAudit!.violations[0]!;
  input.accessibilityAudit!.rulesEvaluated = ["image-alt", "link-name"];
  input.accessibilityAudit!.violations = [
    { ...base, ruleId: "image-alt", nodeCount: 1, representativeNodes: [{ ...base.representativeNodes[0]!,
      selectors: ["a[target]:nth-child(2) > img"], htmlSnippet: "<img src>", imageLinkIdentity: {
        contractVersion: "certscore.accessibility-image-link-identity.v1", nodeId: 2, imageOnlyLinkId: 1 } }] },
    { ...base, ruleId: "link-name", nodeCount: 1, representativeNodes: [{ ...base.representativeNodes[0]!,
      selectors: ["p:nth-child(2) > a[target]:nth-child(2)"], htmlSnippet: "<a href><img src></a>", imageLinkIdentity: {
        contractVersion: "certscore.accessibility-image-link-identity.v1", nodeId: 1, imageOnlyLinkId: 1 } }] },
  ];
  const accessibilityAudit = projectAccessibilityAudit(input, source, input.accessibilityAudit!.documentUrl)!;
  assert.deepEqual(accessibilityAudit.observation.violations, input.accessibilityAudit!.violations);
  const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const breakdown = accessibilityDeductionBreakdown(findings.flatMap(finding => finding.scoreEffects ?? []));
  assert.equal(breakdown.imageLinkOverlap, "verified");
  assert.equal(breakdown.deductionPoints, 4);
  const stale = projectAccessibilityAudit({ ...input, accessibilityAudit: { ...input.accessibilityAudit!, documentToken: "other" } }, source, input.accessibilityAudit!.documentUrl);
  assert.deepEqual(stale?.observation.violations, []);
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

test("accessibility document proof must fall inside the retained visit before findings or score effects project", () => {
  for (const capturedAtMs of [-1, 10001, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = bundle();
    input.runtimeMetadataSnapshots![0]!.capturedAtMs = capturedAtMs;
    const projection = projectAccessibilityAudit(input, source, "https://example.com/");
    assert.equal(projection?.observation.status, "limited", `capture offset ${capturedAtMs}`);
    assert.deepEqual(projection?.observation.limitations, ["evidence_binding_invalid"]);
    assert.equal(projectAccessibilityAuditSummary(projection)?.failedRuleCount, null);
    const runtimeArtifacts = { accessibilityAudit: projection };
    assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] }), []);
    const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
    assert.equal(accessibilityDeductionBreakdown(findings.flatMap(f => f.scoreEffects ?? [])).deductionPoints, 0);
    assert.deepEqual(findings, []);
    assert.equal(input.accessibilityAudit!.violations.length, 4, "original observations stay unchanged");
  }
  for (const capturedAtMs of [0, 10000]) {
    const input = bundle();
    input.runtimeMetadataSnapshots![0]!.capturedAtMs = capturedAtMs;
    assert.equal(projectAccessibilityAudit(input, source, "https://example.com/")?.observation.status, "completed");
  }
  const input = bundle();
  input.runtimeMetadataSnapshots!.push({ ...input.runtimeMetadataSnapshots![0]!, capturedAtMs: 10001 });
  assert.equal(projectAccessibilityAudit(input, source, "https://example.com/")?.observation.status, "limited",
    "a stale latest snapshot cannot fall back to earlier proof");
});

test("equal latest runtime offsets with conflicting document proof remain limited in either array order", () => {
  for (const change of [{ documentIdentity: { source: "cdp_loader_id" as const, token: "other-loader" } },
    { url: "https://example.com/other" }]) {
    for (const reverse of [false, true]) {
      const input = bundle();
      const matching = input.runtimeMetadataSnapshots![0]!;
      const conflicting = { ...matching, ...change };
      input.runtimeMetadataSnapshots = reverse ? [conflicting, matching] : [matching, conflicting];
      const projection = projectAccessibilityAudit(input, source, "https://example.com/");
      assert.equal(projection?.observation.status, "limited");
      assert.deepEqual(projection?.observation.limitations, ["evidence_binding_invalid"]);
      const runtimeArtifacts = { accessibilityAudit: projection };
      assert.deepEqual(buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] }), []);
      const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
      assert.equal(accessibilityDeductionBreakdown(findings.flatMap(f => f.scoreEffects ?? [])).deductionPoints, 0);
      assert.deepEqual(findings, []);
      assert.equal(input.accessibilityAudit!.violations.length, 4, "original observations stay unchanged");
    }
  }
  const input = bundle();
  input.runtimeMetadataSnapshots!.push({ ...input.runtimeMetadataSnapshots![0]! });
  assert.equal(projectAccessibilityAudit(input, source, "https://example.com/")?.observation.status, "completed",
    "duplicate proof of the same latest document remains usable");
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

test("bounded example coverage survives canonical projection and public summary without changing counts", () => {
  const input = bundle();
  input.accessibilityAudit!.violations[0]!.nodeCount = 500;
  input.accessibilityAudit!.exampleCoverage = { version: "breadth_before_detail.v1", observedNodeCount: 503,
    retainedNodeCount: 4, omittedNodeCount: 499, byteBudgetLimited: true };
  const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
  const projected = projectAccessibilityAudit(input, source, input.normalizedUrl)!;
  assert.equal(projected.observation.status, "completed");
  const summary = projectAccessibilityAuditSummary(projected)!;
  assert.equal(summary.affectedNodeCount, 503);
  assert.deepEqual(summary.exampleCoverage, input.accessibilityAudit!.exampleCoverage);
  input.runtimeMetadataSnapshots![0]!.documentIdentity!.token = "wrong-loader";
  const rejected = projectAccessibilityAudit(input, source, input.normalizedUrl)!;
  assert.equal(rejected.observation.status, "limited");
  assert.equal(rejected.observation.exampleCoverage, undefined);
  assert.equal(rejected.observation.violations.length, 0);
});
