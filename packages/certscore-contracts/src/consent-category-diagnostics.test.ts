import assert from "node:assert/strict";
import test from "node:test";
import {assessConsentCategoryDiagnostics, classifyConsentCategoryReasons} from "./consent-category-diagnostics";
import {consentConfirmationDiagnosticsSchema} from "./consent-confirmation-diagnostics";
import {assessConsentActionStages} from "./consent-action-stages";
import {oneTrustApplicabilityReason} from "./onetrust-applicability";
import {oneTrustApplicabilityFixture} from "./test-fixtures/onetrust-applicability";
import {postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport, type PostAcceptReportProjection} from "./post-accept-observation";
import retained from "./test-fixtures/retained-category-diagnostics.json";

function diagnostics(initial: string[], terminal: string[], truncated = false) {
  return consentConfirmationDiagnosticsSchema.parse({policyVersion: "consent_confirmation_diagnostics.v3", diagnosticOnly: true,
    initialPasses: 1, terminalPasses: 1, terminalRead: "unverified", reasons: [...new Set([...initial, ...terminal])],
    initialReasons: initial, terminalReasons: terminal, reasonsTruncated: truncated});
}

test("actual malformed applicability input stays unknown in v2, with v1 interpretation frozen", () => {
  const source = oneTrustApplicabilityFixture(1000, 100, 200, true).applicability!.source;
  const reason = oneTrustApplicabilityReason(undefined, source);
  assert.equal(reason, "category_inputs_malformed");
  const p = {packetSha256: "a".repeat(64), registrationStatus: "unconfirmed",
    execution: {clickCompleted: true, observationCompleted: true, consentConfirmed: false},
    confirmationDiagnostics: diagnostics([reason], [])} as unknown as PostAcceptReportProjection;
  const legacy = assessConsentActionStages(p);
  const current = assessConsentActionStages(p, "consent_action_stages.v2");
  assert.equal(legacy.policyVersion, "consent_action_stages.v1");
  assert.equal(legacy.categoryCheck, "unsupported");
  assert.equal(legacy.categoryDiagnostics, undefined);
  assert.equal(current.categoryCheck, "unknown");
  assert.deepEqual(current.measures, legacy.measures);
  assert.equal(current.outcome, legacy.outcome);
  assert.equal(current.measures.decisionVerified, false);
  assert.equal(assessConsentActionStages({...p, packetSha256: undefined}, "consent_action_stages.v2").categoryDiagnostics, undefined);
});

test("only explicit unsupported structure is unsupported; unresolved and future reasons stay unknown", () => {
  for (const reason of ["category_inputs_malformed", "category_private_flag_unresolved", "category_no_required",
    "category_proof_invalid", "category_future_unrecognized"])
    assert.equal(classifyConsentCategoryReasons([reason], false).state, "unknown", reason);
  for (const reason of ["category_hierarchy_unsupported", "category_iab_unsupported", "category_type_unsupported", "category_required_excluded"])
    assert.equal(classifyConsentCategoryReasons([reason], false).state, "unsupported", reason);
  for (const reason of ["category_applicability_verified", "category_exclusion_unneeded"])
    assert.equal(classifyConsentCategoryReasons([reason], false).state, "supported", reason);
  assert.equal(classifyConsentCategoryReasons(["category_no_optional"], false).state, "no_optional_categories");
});

test("phase states cannot resolve mixed observations or invent chronology", () => {
  const d = assessConsentCategoryDiagnostics(diagnostics(["category_private_flag_unresolved"], ["category_applicability_verified"]));
  assert.equal(d.initial?.state, "unknown");
  assert.equal(d.terminal?.state, "supported");
  assert.equal(d.aggregate.state, "unknown");
  assert.equal(d.aggregate.conflictingObservations, true);
  for (const reasons of [["category_no_optional", "category_applicability_verified"],
    ["category_iab_unsupported", "category_applicability_verified"],
    ["category_proof_invalid", "category_iab_unsupported"]]) {
    assert.equal(classifyConsentCategoryReasons(reasons, false).state, "unknown");
    assert.deepEqual(classifyConsentCategoryReasons(reasons, false), classifyConsentCategoryReasons([...reasons].reverse(), false));
  }
});

test("truncated, missing and retained-empty diagnostics remain distinct", () => {
  const truncated = assessConsentCategoryDiagnostics(diagnostics(["category_applicability_verified"], [], true));
  assert.equal(truncated.aggregate.state, "unknown");
  assert.equal(truncated.initial?.reasonsTruncated, true);
  const missing = assessConsentCategoryDiagnostics(undefined);
  assert.equal(missing.initial, null);
  assert.equal(missing.terminal, null);
  assert.equal(missing.aggregate.reasonsTruncated, null);
  const empty = assessConsentCategoryDiagnostics(diagnostics([], []));
  assert.deepEqual(empty.initial, {state: "unknown", conflictingObservations: false, reasonsTruncated: false});
});

test("eight retained category packets preserve existing category results and all non-category stages", () => {
  assert.equal(retained.length, 8);
  for (const row of retained) {
    const p = projectPostAcceptEvidenceForReport({packet: postAcceptEvidencePacketSchema.parse(row.packet), packetSha256: row.source.sha256});
    const legacy = assessConsentActionStages(p);
    const v2 = assessConsentActionStages(p, "consent_action_stages.v2");
    const {policyVersion: _v2, categoryDiagnostics, readDiagnostics, ...newFields} = v2;
    const {policyVersion: _v1, ...oldFields} = legacy;
    assert.deepEqual(newFields, oldFields, row.site);
    assert.equal(readDiagnostics?.initialPasses, p.confirmationDiagnostics?.initialPasses);
    assert.equal(readDiagnostics?.terminalPasses, p.confirmationDiagnostics?.terminalPasses);
    assert.equal(readDiagnostics?.terminalRead, p.confirmationDiagnostics?.terminalRead);
    assert.ok(categoryDiagnostics);
    assert.equal(categoryDiagnostics.terminal?.state, row.site === "findaya.co.id" ? "no_optional_categories" : "unknown");
    assert.ok(Buffer.byteLength(JSON.stringify(categoryDiagnostics)) < 1024);
  }
});
