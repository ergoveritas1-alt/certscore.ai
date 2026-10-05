import assert from "node:assert/strict";
import test from "node:test";
import { qualifiesSiteIntegrityReview, siteIntegrityObservationSchema, siteIntegrityProjectionSchema } from "./site-integrity";
import { siteIntegrityObservationFixture as observation } from "./site-integrity.fixture";

const projection = { contractVersion: "certscore.site-integrity-projection.v1", scanId: "fixture", sourceHash: "a".repeat(64), observationHash: "b".repeat(64), verificationStatus: "verified", evidenceRef: "CanonicalEvidenceBundle.json#siteIntegrityObservation", observation };
test("site integrity requires versioned bounded evidence for each verified hidden link, never a loose flag", () => {
  assert.equal(qualifiesSiteIntegrityReview(projection), true);
  assert.equal(qualifiesSiteIntegrityReview({ hiddenLinks: true, count: 8 }), false);
  assert.equal(qualifiesSiteIntegrityReview({ ...projection, verificationStatus: "unavailable" }), false);
  for (const links of [observation.links.slice(0, 2), observation.links.map(link => ({ ...link, destinationDomain: "same.example" })), observation.links.map(link => ({ ...link, concealment: "offscreen_position" }))]) {
    assert.equal(qualifiesSiteIntegrityReview({ ...projection, observation: { ...observation, links } }), true);
  }
});
test("site integrity rejects unsafe, oversized, duplicate or malformed evidence", () => {
  for (const change of [
    { documentUrl: "https://clinic.example/?email=private" }, { documentUrl: "javascript:alert(1)" }, { documentUrl: "not a URL" },
    { documentToken: "" }, { links: Array(13).fill(observation.links[0]) },
    { links: [observation.links[0], observation.links[0]] },
    { links: [{ ...observation.links[0], evidenceRef: "site_integrity:link:40" }] },
    { links: [{ ...observation.links[0], destinationDomain: "https://evil.example/?token=secret" }] },
    { sourceLane: "consent_proof" }, { inspectedLinks: 1001 }, { rawHtml: "unbounded" },
  ]) assert.equal(siteIntegrityObservationSchema.safeParse({ ...observation, ...change }).success, false);
  assert.equal(siteIntegrityProjectionSchema.safeParse({ ...projection, sourceHash: "fake" }).success, false);
});


test("historical v1 scope cannot silently become an additional-page observation", () => {
  assert.equal(siteIntegrityObservationSchema.safeParse({ ...observation, scope: "additional_page_main_document" }).success, false);
  assert.equal(siteIntegrityProjectionSchema.safeParse({ ...projection, observation: { ...observation, contractVersion: "certscore.site-integrity-observation.v2", scope: "additional_page_main_document" } }).success, false);
});


import { siteIntegrityCodeProofFixture as proof } from "./site-integrity.fixture";
import { SITE_INTEGRITY_LIMITS, siteIntegrityCodeProofSchema } from "./site-integrity";
test("optional code proof is bounded and cannot silently alter historical evidence", () => {
  assert.ok(siteIntegrityCodeProofSchema.safeParse(proof).success);
  const withProof = {...observation, links: [{...observation.links[0]!, codeProof: proof}]};
  assert.ok(siteIntegrityObservationSchema.safeParse(withProof).success);
  assert.equal(siteIntegrityObservationSchema.parse(observation).links[0]!.codeProof, undefined);
  const allLinks = Array.from({length: SITE_INTEGRITY_LIMITS.retainedLinks}, (_, index) => ({...observation.links[0]!, evidenceRef: `site_integrity:link:${index}`, codeProof: proof}));
  assert.ok(allLinks.reduce((total, link) => total + new TextEncoder().encode(JSON.stringify(link.codeProof)).length, 0) > 2048, "the old shared allowance discarded later excerpts");
  assert.equal(siteIntegrityObservationSchema.safeParse({...observation, links: allLinks}).success, true);
  assert.equal(siteIntegrityObservationSchema.safeParse({...observation, links: [...allLinks, {...allLinks[0]!, evidenceRef: "site_integrity:link:12"}]}).success, false);
  assert.equal(SITE_INTEGRITY_LIMITS.codeProofPageBytes, SITE_INTEGRITY_LIMITS.retainedLinks * SITE_INTEGRITY_LIMITS.codeProofBytes);
  assert.equal(siteIntegrityObservationSchema.safeParse({...observation, links: [{...observation.links[0]!, codeProof: proof, codeProofUnavailableReason: "capture_limit"}]}).success, false);
  for (const change of [{highlightedLine: 99}, {lines: Array(14).fill("x".repeat(300))}, {sanitized: false}, {rawHtml: "unsafe"}, {linkRect: {...proof.linkRect, left: Infinity}}]) {
    assert.equal(siteIntegrityCodeProofSchema.safeParse({...proof, ...change}).success, false);
  }
});
