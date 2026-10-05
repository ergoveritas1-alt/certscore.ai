import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { siteIntegrityObservationFixture as observation } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { projectSiteIntegrity } from "./site-integrity-projection";

// Use the retained production contract, including independent runtime document binding.
export const siteIntegrityBundleFixture = {
  scanId: "fixture", startedAt: "2026-09-17T07:22:36.000Z", completedAt: "2026-09-17T07:23:00.000Z",
  siteIntegrityObservation: observation, domSnapshots: [],
  runtimeMetadataSnapshots: [{ url: observation.documentUrl, documentIdentity: { token: observation.documentToken }, consentStateAtTime: "pre_consent" }],
} as unknown as CanonicalEvidenceBundle;
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
test("only verified, same-document, in-window retained integrity evidence is materialized", () => {
  const projection = projectSiteIntegrity(siteIntegrityBundleFixture, source, observation.documentUrl);
  assert.equal(projection?.sourceHash, source.sha256);
  assert.equal(projection?.observation.links.length, 3);
  for (const [bundle, suppliedSource, url] of [
    [siteIntegrityBundleFixture, { ...source, verificationStatus: "local_unverified" }, observation.documentUrl],
    [siteIntegrityBundleFixture, source, "https://other.example/"],
    [siteIntegrityBundleFixture, source, "invalid"],
    [{ ...siteIntegrityBundleFixture, startedAt: "invalid" }, source, observation.documentUrl],
    [{ ...siteIntegrityBundleFixture, runtimeMetadataSnapshots: [] }, source, observation.documentUrl],
    [{ ...siteIntegrityBundleFixture, runtimeMetadataSnapshots: [], domSnapshots: siteIntegrityBundleFixture.runtimeMetadataSnapshots }, source, observation.documentUrl],
    [{ ...siteIntegrityBundleFixture, completedAt: "2026-09-17T07:22:40.000Z" }, source, observation.documentUrl],
    [{ ...siteIntegrityBundleFixture, siteIntegrityObservation: undefined }, source, observation.documentUrl],
    [{ ...siteIntegrityBundleFixture, siteIntegrityObservation: { ...observation, documentToken: "different" } }, source, observation.documentUrl],
  ] as const) assert.equal(projectSiteIntegrity(bundle as CanonicalEvidenceBundle, suppliedSource, url), null);
});

import { createHash } from "node:crypto";
import type { CrawlObservation } from "@website-signal-risk-scanner/shared";
import { projectAdditionalPageSiteIntegrity } from "./site-integrity-projection";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { selectSiteIntegrityFinding, projectSiteIntegritySitePriority } from "../../lib/scans/site-integrity-report";

const pageId = "12345678-1234-4123-8123-123456789012";
const attemptId = "12345678-1234-4123-8123-123456789013";
const scanId = "12345678-1234-4123-8123-123456789014";
const capture = { parentScanId: scanId, pageId, attemptId, configurationHash: "c".repeat(64), startedAt: "2026-09-17T07:22:36.000Z", completedAt: "2026-09-17T07:23:00.000Z", finalUrl: "https://clinic.example/services" };
const pageEvidence = {
  siteIntegrityPageCapture: capture,
  siteIntegrityObservation: { ...observation, contractVersion: "certscore.site-integrity-observation.v2", scope: "additional_page_main_document", documentUrl: capture.finalUrl },
  moduleRun: { moduleName: "preConsentRuntimeScanner", status: "completed", startedAt: capture.startedAt },
  domSnapshots: [{ artifactId: "dom", capturedAtMs: 9000, path: "dom.json", url: capture.finalUrl, pagePhase: "network_idle", consentStateAtTime: "pre_consent", documentIdentity: { source: "cdp_loader_id", token: observation.documentToken } }],
};
const hash = (evidence: unknown) => createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
const packet = { ...capture, pageJobId: pageId, executionProfile: "inventory_only", status: "completed", httpStatus: 200, failureKind: null, sourceHash: hash(pageEvidence) } as unknown as CrawlObservation;

test("additional page provenance reaches an eligible scored unified finding and affected page list", () => {
  const projection = projectAdditionalPageSiteIntegrity(pageEvidence, packet, scanId);
  assert.ok(projection);
  assert.equal(projection.contractVersion, "certscore.site-integrity-projection.v2");
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const finding = selectSiteIntegrityFinding(packets);
  assert.ok(finding);
  const priority = projectSiteIntegritySitePriority({ findings: [finding, finding], coverage: [{ pageId, url: capture.finalUrl, homepage: false, status: "captured" }] });
  assert.equal(priority?.pages.length, 1);
  assert.equal(priority?.pages[0]?.homepage, false);
  assert.equal(priority?.pages[0]?.url, capture.finalUrl);
  assert.match(priority!.evidence[0]!, /3 concealed link occurrences/);
  const concern = buildNormalizedConcerns({ runtimeArtifacts: { siteIntegrity: projection }, reviewFindingCandidates: [], validationFindings: [] })[0]!;
  assert.equal(concern.regulatoryChecklistEligibility, "none");
  assert.equal(concern.scoreEffects?.[0]?.deductionPoints, 27);
});

test("additional-page capture fails closed on hash, attempt, parent, configuration, document, timing and coverage mismatch", () => {
  for (const overrides of [{ sourceHash: "d".repeat(64) }, { attemptId: scanId }, { pageJobId: scanId }, { parentScanId: pageId }, { configurationHash: "d".repeat(64) }, { finalUrl: "https://clinic.example/wrong" }, { startedAt: "2026-09-17T07:22:50.000Z" }, { completedAt: "2026-09-17T07:22:40.000Z" }, { status: "partial" }, { httpStatus: 500 }]) {
    assert.equal(projectAdditionalPageSiteIntegrity(pageEvidence, { ...packet, ...overrides } as CrawlObservation, scanId), null, JSON.stringify(overrides));
  }
  for (const evidence of [
    { ...pageEvidence, siteIntegrityPageCapture: undefined },
    { ...pageEvidence, siteIntegrityObservation: observation },
    { ...pageEvidence, siteIntegrityObservation: { ...pageEvidence.siteIntegrityObservation, documentToken: "wrong" } },
    { ...pageEvidence, siteIntegrityObservation: { ...pageEvidence.siteIntegrityObservation, capturedAt: "2026-09-17T07:24:00.000Z" } },
    { ...pageEvidence, moduleRun: { ...pageEvidence.moduleRun, status: "partial" } },
    { ...pageEvidence, domSnapshots: [] },
  ]) assert.equal(projectAdditionalPageSiteIntegrity(evidence, { ...packet, sourceHash: hash(evidence) }, scanId), null);
});

test("limited samples score retained verified links, while empty samples stay neutral", () => {
  for (const [links, expected] of [[observation.links, true], [observation.links.slice(0, 1), true], [[], false]] as const) {
    const evidence = { ...pageEvidence, siteIntegrityObservation: { ...pageEvidence.siteIntegrityObservation, links, truncated: true } };
    const projection = projectAdditionalPageSiteIntegrity(evidence, { ...packet, sourceHash: hash(evidence) }, scanId);
    assert.ok(projection);
    const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
    assert.equal(Boolean(selectSiteIntegrityFinding(packets)), expected);
  }
});


import { siteIntegrityCodeProofFixture, siteIntegrityCodeProofObservationFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
test("code proof survives verified persistence and canonical finding projection without changing score", () => {
  const bundle = {...siteIntegrityBundleFixture, siteIntegrityObservation: {...observation, links: observation.links.map((link, index) => index === 0 ? {...link, codeProof: siteIntegrityCodeProofFixture} : link)}};
  const projection = projectSiteIntegrity(bundle, source, observation.documentUrl);
  assert.deepEqual(projection?.observation.links[0]?.codeProof, siteIntegrityCodeProofFixture);
  const finding = selectSiteIntegrityFinding(buildUnifiedFindingDisplayPackets({runtimeArtifacts: {siteIntegrity: projection!}, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map()}));
  assert.deepEqual(finding?.evidence.observation.links[0]?.codeProof, siteIntegrityCodeProofFixture);
  assert.equal(finding?.scoreEffects?.[0]?.deductionPoints, 27);
  const evidence = {...pageEvidence, siteIntegrityObservation: {...pageEvidence.siteIntegrityObservation, links: bundle.siteIntegrityObservation.links}};
  assert.deepEqual(projectAdditionalPageSiteIntegrity(evidence, {...packet, sourceHash: hash(evidence)}, scanId)?.observation.links[0]?.codeProof, siteIntegrityCodeProofFixture);
  assert.equal(projectAdditionalPageSiteIntegrity(evidence, packet, scanId), null, "changed proof bytes require matching retained hash");
});

test("all twelve code excerpts survive verified homepage and additional-page finding projection", () => {
  const codeObservation = siteIntegrityCodeProofObservationFixture;
  const homepage = projectSiteIntegrity({ ...siteIntegrityBundleFixture, siteIntegrityObservation: codeObservation }, source, observation.documentUrl);
  const evidence = { ...pageEvidence, siteIntegrityObservation: { ...codeObservation, contractVersion: "certscore.site-integrity-observation.v2", scope: "additional_page_main_document", documentUrl: capture.finalUrl } };
  const additional = projectAdditionalPageSiteIntegrity(evidence, { ...packet, sourceHash: hash(evidence) }, scanId);
  for (const projection of [homepage, additional]) {
    assert.ok(projection);
    assert.deepEqual(projection.observation.links, codeObservation.links);
    const finding = selectSiteIntegrityFinding(buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() }));
    assert.ok(finding);
    assert.deepEqual(finding.evidence.observation.links, codeObservation.links);
    assert.equal(finding.scoreEffects?.[0]?.deductionPoints, 40);
    const withoutCode = { ...projection, observation: { ...projection.observation, links: projection.observation.links.map(({ codeProof, ...link }) => link) } };
    const baseline = selectSiteIntegrityFinding(buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: withoutCode }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() }));
    assert.deepEqual(finding.scoreEffects, baseline?.scoreEffects);
  }
  const drifted = { ...evidence, siteIntegrityObservation: { ...evidence.siteIntegrityObservation, links: evidence.siteIntegrityObservation.links.slice(0, -1) } };
  assert.equal(projectAdditionalPageSiteIntegrity(drifted, { ...packet, sourceHash: hash(evidence) }, scanId), null);
});
