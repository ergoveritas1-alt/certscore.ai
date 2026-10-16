import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { publicCmpAuditSchema, detailedEvidenceRowSchema } from "./detailed-evidence";
// The internal contract is CommonJS; keep this dependency test-only.
const { cmpInventoryTablesSchema } = createRequire(import.meta.url)("../../certscore-contracts/src/cmp-audit-evidence.ts");

test("public CMP inventory accepts every canonical source without losing provenance", () => {
  const ids = ["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"];
  const services = cmpInventoryTablesSchema.shape.services.unwrap().element.shape.source.options
    .map((source: string, index: number) => ({name: `Service ${index}`, source, sourceRef: `record:${index}`}));
  const declarations = cmpInventoryTablesSchema.shape.declarations.unwrap().element.innerType().shape.source.options
    .map((source: string, index: number) => ({name: `cookie_${index}`, source, purpose: "Retained declared purpose", duration: "Session"}));
  const audit: any = {version: "cmp_audit_report.v3", scanId: "source-parity-fixture", scope: "starting_page", assessmentSourceHash: "retained-hash",
    rows: ids.map(id => ({id, label: id, status: "Not assessed", sourceIds: []}))};
  const serviceRow = audit.rows.find((row: any) => row.id === "services");
  const cookieRow = audit.rows.find((row: any) => row.id === "cookie_information");
  Object.assign(serviceRow, {status: "Observed", supportingEvidence: {inventory: {services}}});
  Object.assign(cookieRow, {status: "Observed", supportingEvidence: {inventory: {declarations}}});
  assert.deepEqual(publicCmpAuditSchema.parse(audit), audit);
  for (const field of ["services", "declarations"] as const) {
    const invalid = structuredClone(audit);
    invalid.rows.find((row: any) => row.id === (field === "services" ? "services" : "cookie_information"))
      .supportingEvidence.inventory[field][0].source = "guessed_inventory";
    assert.equal(publicCmpAuditSchema.safeParse(invalid).success, false);
  }
  const unsafe = structuredClone(audit);
  unsafe.rows.find((row: any) => row.id === "cookie_information").supportingEvidence.inventory.declarations[0].value = "private-cookie-value";
  assert.equal(publicCmpAuditSchema.safeParse(unsafe).success, false);
});

test("retained excerpt references remain intact and bounded without widening other display fields", () => {
  const row = {id: "policy", title: "Policy", summary: "Retained evidence", status: "Observed", displayStatus: "Observed",
    correctionSteps: [], evidenceRefs: ["Excerpt: " + "x".repeat(4141)], evidenceTarget: "policy", source: {field: "gdprTransparencyRows", rowId: "policy"}};
  assert.deepEqual(detailedEvidenceRowSchema.parse(row), row);
  assert.equal(detailedEvidenceRowSchema.safeParse({...row, evidenceRefs: ["x".repeat(8192)]}).success, true);
  assert.equal(detailedEvidenceRowSchema.safeParse({...row, evidenceRefs: ["x".repeat(8193)]}).success, false);
  assert.equal(detailedEvidenceRowSchema.safeParse({...row, summary: "x".repeat(4001)}).success, false);
});

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
