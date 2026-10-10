import assert from "node:assert/strict";
import test from "node:test";
import { accessibilityProjectionFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import type { AccessibilityRuleObservation } from "@certscore/contracts";
import { accessibilityDeductionBreakdown, buildFocusAccessibilityScoreEffects } from "./accessibility-score-policy";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { projectAccessibilityPriorities } from "./accessibility-priority";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import { deriveCanonicalOverallScoreExplanationForReport } from "../../server/scans/canonical-overall-score";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import noGo from "./test-fixtures/authentication-no-go-20260909.json";

const checked = [{ id: "consent_surface_observed", assessmentStatus: "checked", evidenceState: "observed", status: "Observed", criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } } }] as unknown as GdprEprivacyCoverageChecklistItem[];
function rule(id: string): AccessibilityRuleObservation {
  const base = accessibilityProjectionFixture().observation.violations[0]!;
  const failureSummary = id === "meta-viewport" ? "user-scalable=no on <meta> tag disables zooming on mobile devices"
    : id === "target-size" ? "Target has insufficient size (18px by 18px, should be at least 24px by 24px) Target has insufficient space to its closest neighbors. Safe clickable space has a diameter of 18px instead of at least 24px."
    : `Fix ${id}`;
  return { ...base, ruleId: id, impact: id === "meta-viewport" ? "moderate" : "serious",
    tags: [id === "target-size" ? "wcag258" : id === "meta-viewport" ? "wcag144" : "wcag2a"],
    helpUrl: `https://dequeuniversity.com/rules/axe/4.11/${id}`,
    representativeNodes: [{ selectors: [`#${id}`], htmlSnippet: id === "meta-viewport" ? "<meta name content>" : "<input id>", failureSummary }] };
}
function project(rules: AccessibilityRuleObservation[], overrides = {}) {
  const projection = accessibilityProjectionFixture({ violations: rules, rulesEvaluated: rules.map(row => row.ruleId), ...overrides });
  return buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
}
const effects = (packets: ReturnType<typeof project>) => packets.flatMap(packet => packet.scoreEffects ?? []);
const points = (packets: ReturnType<typeof project>) => accessibilityDeductionBreakdown(effects(packets)).deductionPoints;

test("verified WCAG evidence enters concern policy and the canonical overall score, independently of top findings", () => {
  const packets = project([rule("image-alt"), rule("link-name"), rule("color-contrast"), rule("meta-viewport"), rule("target-size")]);
  assert.equal(points(packets), 12);
  assert.equal(packets.find(packet => packet.unifiedFindingId === "semantic_labeling_accessibility_issue")?.presentationDecision.status, "audit_only");
  assert.equal(projectAccessibilityPriorities(packets).some(finding => finding.id === "semantic_labeling_accessibility_issue"), false);
  assert.equal(projectAccessibilityPriorities(packets).some(finding => /zoom|target_size/.test(finding.id)), false);
  const result = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null }, checklistRows: [...checked], unifiedFindings: packets })!;
  assert.equal(result.score, 88);
  assert.equal(result.deductions.find(row => row.family === "accessibility")?.deductionPoints, 12);
  for (const framework of ["gdpr_eprivacy", "california"] as const) {
    const rows = [...checked, { ...checked[0]!, id: "consumer_rights_request_methods" }];
    const baseline = deriveRegulatoryCoverageScore({ framework, rows }).score;
    assert.equal(deriveRegulatoryCoverageScore({ framework, rows: [...rows, ...packets.map(packet => ({
      ...checked[0]!, id: packet.unifiedFindingId, assessmentStatus: "gap_observed" as const,
    }))] }).score, baseline);
  }
});

test("each category charges once across repeated nodes, rules, packets and pages", () => {
  const image = rule("image-alt"); image.nodeCount = 500;
  const first = project([image, rule("color-contrast")]);
  const second = project([rule("image-alt"), rule("color-contrast")], { documentUrl: "https://example.com/other", scanId: "other-page" });
  assert.equal(points([...first, ...first, ...second]), 6);
  assert.equal(points(project([rule("label"), rule("button-name"), rule("link-name")])), 4);
});

function imageLink(exact: boolean) {
  const image = rule("image-alt"), link = rule("link-name");
  image.representativeNodes[0] = { ...image.representativeNodes[0]!, selectors: [exact ? "#link > img" : "a[target]:nth-child(2) > img"], htmlSnippet: "<img src style>" };
  link.representativeNodes[0] = { ...link.representativeNodes[0]!, selectors: [exact ? "#link" : "p:nth-child(2) > a[target]:nth-child(2)"], htmlSnippet: "<a href target><img src style></a>" };
  return [image, link, rule("color-contrast"), rule("meta-viewport"), rule("target-size")];
}
test("verified image-link overlap charges the stronger category once; ambiguous identity is explicitly unresolved", () => {
  for (const [exact, expected] of [[true, "verified"], [false, "unresolved"]] as const) {
    const result = accessibilityDeductionBreakdown(effects(project(imageLink(exact))));
    assert.equal(result.deductionPoints, 11);
    assert.equal(result.imageLinkOverlap, expected);
  }
  assert.equal(points(project([...imageLink(true), rule("label")])), 12, "an independent labeling barrier must not erase image-alt scoring");
});

test("captured DOM identity resolves differently scoped selectors and distinguishes separate barriers", () => {
  const rules = imageLink(false);
  const image = rules[0]!.representativeNodes[0]!;
  const link = rules[1]!.representativeNodes[0]!;
  image.imageLinkIdentity = { contractVersion: "certscore.accessibility-image-link-identity.v1", nodeId: 2, imageOnlyLinkId: 1 };
  link.imageLinkIdentity = { contractVersion: "certscore.accessibility-image-link-identity.v1", nodeId: 1, imageOnlyLinkId: 1 };
  let result = accessibilityDeductionBreakdown(effects(project(rules)));
  assert.equal(result.imageLinkOverlap, "verified");
  assert.equal(result.deductionPoints, 11);
  // Similar selectors cannot override direct evidence of distinct nodes.
  link.imageLinkIdentity = { ...link.imageLinkIdentity, nodeId: 3, imageOnlyLinkId: 3 };
  result = accessibilityDeductionBreakdown(effects(project(rules)));
  assert.equal(result.imageLinkOverlap, "none");
  assert.equal(result.deductionPoints, 12);
  image.imageLinkIdentity.imageOnlyLinkId = null;
  assert.equal(points(project(rules)), 12);
  // Bounded examples never prove all failures overlap.
  rules[0]!.nodeCount = 2;
  image.imageLinkIdentity.imageOnlyLinkId = 3;
  assert.equal(accessibilityDeductionBreakdown(effects(project(rules))).imageLinkOverlap, "unresolved");
});

test("overlap IDs cannot deduplicate unrelated captures of the same URL", () => {
  const first = project(imageLink(true));
  const second = project(imageLink(true), { scanId: "different-capture", documentToken: "other-document" });
  const text = effects(first).filter(effect => effect.policyKey === "accessibility.text_alternative_accessibility_issue");
  const semantic = effects(second).filter(effect => effect.policyKey === "accessibility.semantic_labeling_accessibility_issue");
  assert.equal(accessibilityDeductionBreakdown([...text, ...semantic]).deductionPoints, 7);
});

test("partial evaluation scores retained failures only; review, failed, unbound and malformed evidence stay neutral", () => {
  assert.equal(points(project([rule("image-alt")], { status: "limited", limitations: ["rules_need_review"], reviewItems: [rule("label")], rulesEvaluated: ["image-alt", "label"] })), 3);
  for (const overrides of [
    { status: "failed", violations: [], rulesEvaluated: [], limitations: ["audit_failed"] },
    { documentToken: null }, { rulesEvaluated: [] },
    { violations: [], reviewItems: [rule("image-alt")], status: "limited", limitations: ["rules_need_review"] },
  ]) assert.equal(points(project([rule("image-alt")], overrides)), 0);
  const unsupported = rule("target-size"); unsupported.representativeNodes[0]!.failureSummary = "Review size manually";
  assert.equal(points(project([unsupported])), 0);
  const sufficient = rule("target-size");
  sufficient.representativeNodes[0]!.failureSummary = sufficient.representativeNodes[0]!.failureSummary.replaceAll("18px", "24px");
  assert.equal(points(project([sufficient])), 0, "contradictory sufficient measurements cannot create a target-size deduction");
  assert.equal(points(project([rule("html-has-lang"), { ...rule("image-alt"), impact: "minor" } ])), 0);
  const valid = project([rule("image-alt")]);
  for (const mutate of [
    { policyVersion: "old" }, { deductionPoints: 40 }, { evidenceRefs: [] }, { observedActivity: ["guessed"] },
    { policyKey: "accessibility.unknown" },
  ]) assert.equal(accessibilityDeductionBreakdown(effects(valid).map(effect => ({ ...effect, ...mutate }))).deductionPoints, 0);
});

test("keyboard and reproduced focus share six points and focus must be bound to the verified document", () => {
  const keyboard = project([rule("nested-interactive")]);
  assert.equal(points(keyboard), 6);
  const p = accessibilityProjectionFixture();
  const provenance = { ...p, ...p.observation, evaluatedRules: ["image-alt"] };
  const raw = { accessibilityAuditProvenance: { ...provenance, contractVersion: p.contractVersion }, focusManagementEvidence: {
    issueType: "focus_not_restored", expected: "Focus returns to trigger", observed: "Focus lost", evidenceStrength: "behavior_reproduced",
    focusTrace: [{ from: "trigger", to: "body" }], dialogContext: { selector: "#dialog" },
    documentUrl: p.observation.documentUrl, documentToken: p.observation.documentToken,
  } };
  const focus = buildFocusAccessibilityScoreEffects(raw);
  assert.equal(focus.length, 1);
  assert.equal(accessibilityDeductionBreakdown([...effects(keyboard), ...focus]).deductionPoints, 6);
  assert.deepEqual(buildFocusAccessibilityScoreEffects({ ...raw, focusManagementEvidence: { ...raw.focusManagementEvidence, documentToken: "stale" } }), []);
  const focusPacket = { ...keyboard[0]!, unifiedFindingId: "focus_management_issue", scoreEffects: focus };
  assert.equal(deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null }, checklistRows: checked, unifiedFindings: [focusPacket] })?.score, 94);
  const unrelated = { ...keyboard[0]!, unifiedFindingId: "unrelated_finding" };
  assert.equal(deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null }, checklistRows: checked, unifiedFindings: [unrelated] })?.score, 100);
});

test("accessibility preserves the shared score floor and retained no-go decision", () => {
  const packets = project([rule("image-alt"), rule("label"), rule("color-contrast"), rule("nested-interactive")]);
  const gaps = ["reject_all_path_availability", "pre_consent_third_party_tracking", "pre_consent_cookies_storage",
    "session_replay_fingerprinting_review", "embedded_content_pre_consent", "social_media_embed_pre_consent",
    "third_party_iframe_pre_consent", "privacy_notice_availability", "transport_security_https_delivery"]
    .map(id => ({ ...checked[0]!, id, assessmentStatus: "gap_observed", evidenceState: "observed", status: "Gap observed",
      criticalEvidence: { retainedEvidence: { preConsentStorageAssessment: { classifiedNonEssentialCount: 100 },
        preconsentThirdPartyTrackingVendors: Array.from({ length: 100 }, (_, i) => `Vendor ${i}`) } } }));
  const input = { checklistRows: [...checked, ...gaps] as GdprEprivacyCoverageChecklistItem[], unifiedFindings: packets };
  assert.equal(deriveCanonicalOverallScoreExplanationForReport({ ...input, scanRecord: { runtimeArtifacts: null } })?.score, 0);
  assert.equal(deriveCanonicalOverallScoreExplanationForReport({ ...input, scanRecord: { runtimeArtifacts: noGo.runtimeArtifacts } }), null);
});
