import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewSchema } from "@certscore/contracts";
import { crawlObservationSchema, type CrawlObservation } from "@website-signal-risk-scanner/shared";
import { projectAdditionalPageSiteIntegrity } from "../../server/scans/site-integrity-projection";
import { deriveCaliforniaFullSiteScore, deriveCaliforniaRegulatoryScore } from "./california-regulatory-score";
import fixture from "./test-fixtures/ergoveritas-california-scopes.json";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingDisplayPacket } from "./unified-findings";

// This slice starts at the three scored canonical starting-page findings. The
// additional-page inventory is bound to the smaller fixture's bytes. Original
// archive digests are kept separately for comparison with the full offline replay.
const home = fixture.startingPageFindings as unknown as UnifiedFindingDisplayPacket[];
const rights = home.find(finding => finding.unifiedFindingId === "california_rights_disclosure_not_observed");
assert.ok(rights?.details?.family === "california_privacy_review");
const assessment = californiaPrivacyReviewSchema.parse(rights.details.projection);
assert.equal(assessment.scanId, fixture.scanId);
const inventory = crawlObservationSchema.parse(fixture.pageInventory);

function pageFindings(packet: CrawlObservation) {
  const siteIntegrity = projectAdditionalPageSiteIntegrity(fixture.pageEvidence, packet, fixture.scanId);
  return buildUnifiedFindingDisplayPackets({
    runtimeArtifacts: { siteIntegrity }, reviewFindingCandidates: [], validationFindings: [],
    validationFindingLookup: new Map(),
  });
}

function score(findings: UnifiedFindingDisplayPacket[]) {
  return deriveCaliforniaRegulatoryScore({ assessment, checklistRows: [], unifiedFindings: findings });
}

test("Ergoveritas California starting-page score is 83 and the separate full-crawl score is 70", () => {
  const startingPage = score(home);
  assert.equal(startingPage.scope, "starting_page");
  assert.equal(startingPage.score, 83);
  const page = pageFindings(inventory);
  const integrity = page.find(finding => finding.details?.family === "site_integrity");
  assert.ok(integrity?.details?.family === "site_integrity");
  const { observation } = integrity.details.projection;
  assert.equal(observation.documentUrl, "https://ergoveritas.com/test1.html");
  assert.deepEqual(observation.links.map(link => link.destinationDomain), ["promotion.example"]);
  const input = { assessment, checklistRows: [], unifiedFindings: home };
  const site = deriveCaliforniaFullSiteScore(input, page);
  assert.deepEqual(site, { score: 70, scope: "full_site", policyVersion: startingPage.policyVersion });
  assert.deepEqual(deriveCaliforniaFullSiteScore(input, [...page, ...page]), site);
  assert.equal(deriveCaliforniaFullSiteScore({ ...input, assessment: null }, page), null);
  const simulated = score([...home, ...page]);
  assert.deepEqual(simulated.deductions.filter(item => item.findingId !== integrity.unifiedFindingId), startingPage.deductions);
  assert.deepEqual(score([...home, ...page, ...page]), simulated);
});

test("failed, HTTP-error and unbound additional-page evidence leave the California score at 83", () => {
  for (const packet of [
    { ...inventory, status: "failed" as const },
    { ...inventory, httpStatus: 404 },
    { ...inventory, sourceHash: "0".repeat(64) },
  ]) {
    const page = pageFindings(packet);
    assert.ok(!page.some(finding => finding.details?.family === "site_integrity"));
    assert.deepEqual(score([...home, ...page]), score(home));
  }
});
