import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcRuntimeFixture } from "../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import { accessibilityAuditFixture } from "../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { siteIntegrityObservationFixture } from "../../../packages/certscore-contracts/src/site-integrity.fixture";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { compactCanonicalEvidenceBundleForRetention } from "@certscore/scan-core";
import { mergeLocalV2DagLambdaEvidenceLaneBundles } from "./handler";
import { projectAccessibilityAudit } from "../../web/server/scans/accessibility-audit-projection";
import { projectSiteIntegrity } from "../../web/server/scans/site-integrity-projection";
import { projectCmsSecurity } from "../../web/server/scans/cms-security-projection";

const start = Date.parse("2026-10-09T12:00:00.000Z"), iso = (n: number) => new Date(start + n).toISOString();
function fixture(consentOffset: number) {
  const runtime = gpcRuntimeFixture({ enabled: false, url: "https://example.com/" });
  runtime.startedAt = iso(0); runtime.completedAt = iso(10000);
  runtime.scanLaneRuns[0]!.startedAt = runtime.startedAt; runtime.scanLaneRuns[0]!.completedAt = runtime.completedAt;
  runtime.accessibilityAudit = accessibilityAuditFixture({ scanId: runtime.scanId, documentToken: "runtime-clock-test", startedAt: iso(100), completedAt: iso(300), durationMs: 200 });
  runtime.siteIntegrityObservation = { ...siteIntegrityObservationFixture, documentUrl: runtime.url, documentToken: "runtime-clock-test", capturedAt: iso(150) };
  runtime.domSnapshots = [{ artifactId: "dom-runtime", path: "/tmp/runtime-clock/dom.json", url: runtime.url,
    capturedAtMs: 500, pagePhase: "network_idle", consentStateAtTime: "pre_consent",
    documentIdentity: { source: "cdp_loader_id", token: "runtime-clock-test" },
    siteMetadata: { contractVersion: "certscore.site-metadata.v1", title: "Fixture", language: "en", generators: ["Drupal 10.4.2"], wordpressAssetObserved: false, cmsAssets: [] } }];
  const consent = structuredClone(runtime), policy = structuredClone(runtime);
  consent.startedAt = iso(consentOffset); consent.completedAt = iso(12000);
  consent.scanLaneRuns = [{ ...consent.scanLaneRuns[0]!, laneId: "consent_proof", startedAt: consent.startedAt, completedAt: consent.completedAt }];
  consent.domSnapshots = []; delete consent.accessibilityAudit; delete consent.siteIntegrityObservation;
  policy.scanLaneRuns = [{ ...policy.scanLaneRuns[0]!, laneId: "policy_evidence" }];
  const bytes = Buffer.from(JSON.stringify(runtime));
  return { runtime, consent, policy, source: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length } };
}
test("three-lane merge preserves original runtime timing before or after consent without rebasing either lane", () => {
  for (const offset of [-700, 700]) {
    const f = fixture(offset), original = JSON.stringify(f.runtime);
    const b = mergeLocalV2DagLambdaEvidenceLaneBundles({ artifactRoot: "/tmp/runtime-clock-merged", scanId: f.runtime.scanId,
      runtimeEvidence: f.runtime, consentProof: f.consent, policyEvidence: f.policy, runtimeEvidenceSource: f.source });
    assert.equal(JSON.stringify(f.runtime), original);
    assert.equal(b.startedAt, f.consent.startedAt);
    assert.equal(b.runtimeEvidenceClock?.startedAt, f.runtime.startedAt);
    assert.equal(b.runtimeEvidenceClock?.completedAt, f.runtime.completedAt);
    assert.deepEqual(b.runtimeEvidenceClock?.source, f.source);
    assert.equal(b.runtimeMetadataSnapshots?.[0]?.capturedAtMs, 500);
    const parsed = canonicalEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(b)));
    assert.deepEqual(compactCanonicalEvidenceBundleForRetention(parsed, 1).runtimeEvidenceClock, parsed.runtimeEvidenceClock,
      "The original runtime clock survives the deepest canonical retention pass.");
    const source = { verificationStatus: "verified", sha256: "b".repeat(64) };
    assert.equal(projectAccessibilityAudit(parsed, source, b.url)?.observation.rulesEvaluated.length, 4);
    assert.ok(projectSiteIntegrity(parsed, source, b.url));
    assert.equal(projectCmsSecurity(parsed, source, b.url)?.capturedAt, iso(500));
    const wrong = structuredClone(parsed); wrong.runtimeMetadataSnapshots![0]!.documentIdentity!.token = "wrong";
    assert.equal(projectAccessibilityAudit(wrong, source, b.url)?.observation.rulesEvaluated.length, 0);
    assert.equal(projectSiteIntegrity(wrong, source, b.url), null);
  }
});
test("merge refuses an unrelated or already merged runtime clock source", () => {
  for (const defect of ["scan", "target", "region", "lane"] as const) {
    const f = fixture(700);
    if (defect === "scan") f.runtime.scanId = "other";
    if (defect === "target") f.runtime.url = "https://other.test/";
    if (defect === "region") f.runtime.region = "unrelated-region";
    if (defect === "lane") f.runtime.scanLaneRuns.push(f.runtime.scanLaneRuns[0]!);
    assert.throws(() => mergeLocalV2DagLambdaEvidenceLaneBundles({ artifactRoot: "/tmp/runtime-clock-reject", scanId: "gpc-fixture",
      runtimeEvidence: f.runtime, consentProof: f.consent, policyEvidence: f.policy, runtimeEvidenceSource: f.source }), /isolated original runtime/);
  }
});
