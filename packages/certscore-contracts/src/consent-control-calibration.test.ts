import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  consentControlGeometryHumanReviewCorpusSchema,
  consentControlHumanAdjudicationRowSchema,
} from "./consent-control-calibration";

function validRow() {
  return {
    reviewId: "eu-ir:scan-1",
    scanId: "scan-1",
    website: "https://example.com",
    proposed: { accept: "observed", reject: "unknown", options: "observed" },
    adjudicated: { accept: "observed", reject: "not_observed", options: "observed" },
    override: "Change recommendation",
    documentMatch: "yes",
    notes: "Live Chrome review — EU-IR VPN",
    disposition: "included",
    releaseGateEligible: false,
    releaseGateReasons: ["retained_visual_proof_missing"],
    dispositionReasons: [],
    disagreements: ["reject"],
    evidence: {
      artifactPath: "artifacts/evidence.json",
      sha256: "a".repeat(64),
      scanId: "scan-1",
      domain: "example.com",
      completedAt: "2026-07-01T00:00:00.000Z",
      cmpVendor: null,
      accessPosture: null,
      language: null,
      noGo: null,
      homepageFetchStatus: null,
      verifiedPublicSurfacesCount: 0,
      pagesScanned: 0,
      retainedVisualProof: false,
    },
    provenance: {
      labelClass: "human_adjudication_candidate",
      reviewMethod: "live_chrome_incognito_eu_ir_vpn",
      reviewerRole: "product_owner",
      reviewerAttestedLiveObservation: true,
      independentlyReviewed: false,
      evidenceOnlyReview: false,
      sourceWorksheetSha256: "b".repeat(64),
      labelHash: "c".repeat(64),
    },
  } as const;
}

test("human adjudication candidate contract preserves provenance limitations", () => {
  const parsed = consentControlHumanAdjudicationRowSchema.parse(validRow());
  assert.equal(parsed.provenance.independentlyReviewed, false);
  assert.equal(parsed.provenance.reviewerAttestedLiveObservation, true);
  assert.equal(parsed.releaseGateEligible, false);
});

test("release-gate eligibility fails closed when evidence limitations remain", () => {
  const result = consentControlHumanAdjudicationRowSchema.safeParse({
    ...validRow(),
    releaseGateEligible: true,
  });
  assert.equal(result.success, false);
});

test("included rows require complete adjudicated A/R/O", () => {
  const result = consentControlHumanAdjudicationRowSchema.safeParse({
    ...validRow(),
    adjudicated: null,
  });
  assert.equal(result.success, false);
});

test("geometry outlier corpus preserves complete no-surface observations as not observed", async () => {
  const raw = JSON.parse(await readFile(
    path.resolve(process.cwd(), "fixtures/consent-geometry-human-review.v1.json"),
    "utf8",
  )) as unknown;
  const corpus = consentControlGeometryHumanReviewCorpusSchema.parse(raw);
  assert.equal(corpus.rows.length, 20);
  assert.equal(corpus.independentlyReviewed, false);
  assert.equal(corpus.usage, "calibration_and_regression_only");

  for (const scanId of [
    "547127a8-eff2-468b-8d37-81e1576aa8dc",
    "0699fe88-a5ab-4dee-816f-d2b05d195efa",
  ]) {
    const row = corpus.rows.find((candidate) => candidate.scanId === scanId);
    assert.equal(row?.surface, "not_visible");
    assert.deepEqual(row?.adjudicated, {
      accept: "not_observed",
      reject: "not_observed",
      options: "not_observed",
    });
    assert.equal(row?.documentMatch, "yes");
  }
});

test("geometry outlier corpus keeps paid alternatives distinct from free reject controls", async () => {
  const raw = JSON.parse(await readFile(
    path.resolve(process.cwd(), "fixtures/consent-geometry-human-review.v1.json"),
    "utf8",
  )) as unknown;
  const corpus = consentControlGeometryHumanReviewCorpusSchema.parse(raw);
  for (const scanId of [
    "b15de5f0-662f-4eb1-9d14-3255b82e4125",
    "413bf2eb-f21b-45e1-badc-471a3eb2435c",
  ]) {
    const row = corpus.rows.find((candidate) => candidate.scanId === scanId);
    assert.equal(row?.surface, "visible");
    assert.equal(row?.adjudicated.reject, "not_observed");
  }
});
