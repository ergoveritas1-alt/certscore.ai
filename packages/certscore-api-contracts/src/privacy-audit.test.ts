import assert from "node:assert/strict";
import test from "node:test";
import { privacyAuditEvidenceSchema } from "./privacy-audit.js";
import { buildCertScoreApiV2OpenApiDocument } from "./openapi-v2.js";

const evidence = { contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "fixture", documentUrl: "https://example.test/", capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified", scoreEffect: "none", passagePolicy: "california_notice_passages.v1", controls: [], notices: [], negativeControlCoverage: "not_verified", collectionPointNoticeAssessment: "not_assessed", truncated: false };
test("privacy workpaper schema rejects unsafe URLs and unsupported conclusions without throwing", () => {
  assert.ok(privacyAuditEvidenceSchema.safeParse(evidence).success);
  for (const documentUrl of ["invalid", "javascript:alert(1)", "https://user:pass@example.test/", "https://example.test/?token=secret", "https://example.test/#secret"]) {
    assert.equal(privacyAuditEvidenceSchema.safeParse({ ...evidence, documentUrl }).success, false);
  }
  for (const overrides of [{ scoreEffect: "deduct" }, { negativeControlCoverage: "absent" }, { collectionPointNoticeAssessment: "compliant" }, { contractVersion: "unknown" }]) assert.equal(privacyAuditEvidenceSchema.safeParse({ ...evidence, ...overrides }).success, false);
});

test("historical v1 workpapers remain readable without new control proof fields", () => {
  const legacy = { ...evidence, controls: [{
    kind: "do_not_sell_or_share", label: "Do Not Sell or Share", sourceUrl: "https://example.test/",
    destinationUrl: null, placement: "footer_link", evidenceRef: "policy-surface:legacy",
    retrieval: "not_attempted", interaction: "not_tested",
  }] };
  assert.ok(privacyAuditEvidenceSchema.safeParse(legacy).success);
});

test("OpenAPI publishes the bounded, score-neutral workpaper under the scan resource", () => {
  const document = buildCertScoreApiV2OpenApiDocument();
  assert.equal(document.components.schemas.Scan.properties.privacyAuditEvidence.$ref, "#/components/schemas/PrivacyAuditEvidence");
  const schema = document.components.schemas.PrivacyAuditEvidence;
  assert.equal(schema.properties.controls.maxItems, 12);
  assert.equal(schema.properties.notices.maxItems, 4);
  assert.equal(schema.properties.scoreEffect.const, "none");
});
