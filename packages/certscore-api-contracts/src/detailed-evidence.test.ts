import assert from "node:assert/strict";
import test from "node:test";
import { publicCmpAuditSchema } from "./detailed-evidence";

test("public cookie evidence keeps partial results, template candidates and exact expiry distinct", () => {
  const ids = ["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"];
  const audit: any = { version: "cmp_audit_report.v3", scanId: "retained", scope: "starting_page", assessmentSourceHash: "source",
    rows: ids.map(id => ({ id, label: id, status: "Not assessed", sourceIds: [] })) };
  const row = audit.rows.find((item: any) => item.id === "found_not_declared");
  Object.assign(row, { status: "Partially assessed", sourceIds: ["CanonicalEvidenceBundle.json"], supportingEvidence: {
    cookieComparison: { declarationPatternCount: 1, observedCookieNameCount: 1, unmatchedNameCount: 1, possibleTemplateNameCount: 1, unmatchedNames: ["_ga_S4EX53B760"], allUnmatchedOnlyAfterAccept: true, declarationInventoryComplete: false },
    inventory: { cookies: [{ name: "_ga_S4EX53B760", matchedPattern: null, observedIn: ["after_accept"], possibleTemplateMatch: { pattern: "_ga_xxxxxxxxxx", basis: "ga4_placeholder.v1" },
      observedExpiry: { visit: "Accept", name: "_ga_S4EX53B760", capturedAtEpochSeconds: 100, expiresAtEpochSeconds: 200, remainingSeconds: 100 } }] },
  } });
  assert.deepEqual(publicCmpAuditSchema.parse(audit), audit);
  for (const mutate of [
    (copy: any) => { copy.version = "cmp_audit_report.v2"; },
    (copy: any) => { copy.rows.find((item: any) => item.id === row.id).status = "Review recommended"; },
    (copy: any) => { copy.rows.find((item: any) => item.id === row.id).supportingEvidence.cookieComparison.possibleTemplateNameCount = 2; },
    (copy: any) => { copy.rows.find((item: any) => item.id === row.id).supportingEvidence.inventory.cookies[0].matchedPattern = "_ga_xxxxxxxxxx"; },
    (copy: any) => { copy.rows.find((item: any) => item.id === row.id).supportingEvidence.inventory.cookies[0].observedExpiry.remainingSeconds = 101; },
  ]) {
    const copy = structuredClone(audit); mutate(copy);
    assert.equal(publicCmpAuditSchema.safeParse(copy).success, false);
  }
});
