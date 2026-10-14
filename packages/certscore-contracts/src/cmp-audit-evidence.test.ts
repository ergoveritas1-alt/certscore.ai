import assert from "node:assert/strict";
import test from "node:test";
import { cmpPreferencesEvidenceSchema } from "./cmp-audit-evidence";

function packet() {
  return {
    contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1",
    scanId: "preferences", parentDispatchSha256: "a".repeat(64), targetUrl: "https://example.test/", finalUrl: "https://example.test/", documentToken: "loader",
    startedAt: "2026-10-14T00:00:00.000Z", completedAt: "2026-10-14T00:00:01.000Z", status: "limited",
    support: {state: "partial", provider: "OneTrust", recipeVersion: "onetrust_preferences.v2", reason: "preference_surface_missing"},
    action: {count: 0, intent: "options", label: null, opened: false}, controls: [], controlInventoryComplete: false,
    privacyLinks: [], declarations: [], declarationInventoryComplete: false, limitations: ["preference_surface_missing"],
    inspectionDiagnostic: {revision: "cmp_preferences.v2", budgetMs: 17000, phase: "surface_binding",
      surfaceBinding: {version: "cmp_surface_binding.v1", mode: "registered_existing", priorMatches: 0, priorVisible: false, outcome: "missing"}},
  };
}

test("preference binding diagnostics preserve historical packets and never create opening proof", () => {
  const input=packet(), result=cmpPreferencesEvidenceSchema.parse(input);
  assert.equal(result.status,"limited");assert.equal(result.action.opened,false);assert.deepEqual(result.controls,[]);
  assert.deepEqual(result.inspectionDiagnostic,input.inspectionDiagnostic);
  const old={...input,inspectionDiagnostic:{revision:"borlabs_preferences.v1",budgetMs:17000,phase:"control_inventory"}};
  assert.deepEqual(cmpPreferencesEvidenceSchema.parse(old).inspectionDiagnostic,old.inspectionDiagnostic);
  const noDiagnostic={...input,inspectionDiagnostic:undefined};
  assert.equal(cmpPreferencesEvidenceSchema.parse(noDiagnostic).inspectionDiagnostic,undefined);
});

test("preference binding diagnostics reject unbounded or unrecognized values", () => {
  for(const patch of [{priorMatches:1001},{priorMatches:-1},{priorMatches:0.5},{mode:"guessed_modal"},{outcome:"assumed_open"},{html:"<entire-page>"}]){
    const input=packet();Object.assign(input.inspectionDiagnostic.surfaceBinding,patch);
    assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success,false,JSON.stringify(patch));
  }
});

test("v5 scopes cannot silently upgrade historical assessments or label partial matches as Review", async () => {
  const { cmpAuditAssessmentSchema, cmpAuditCriterionSchema } = await import("./cmp-audit-evidence");
  const historical = { version: "cmp_audit_assessment.v4", scanId: "historical", sourceSha256: "a".repeat(64),
    support: { state: "partial", provider: "OneTrust", recipeVersion: "v1", reason: "inspection_incomplete" },
    rows: [...cmpAuditCriterionSchema.options, "implementation"].map(id => ({ id, status: "not_assessed", detail: "Original conclusion", evidenceRefs: [] })) };
  assert.deepEqual(cmpAuditAssessmentSchema.parse(historical), historical);
  const candidate: any = structuredClone(historical); candidate.version = "cmp_audit_assessment.v5";
  candidate.rows.push({ id: "prominence", status: "not_assessed", detail: "Measurements missing", evidenceRefs: [] });
  Object.assign(candidate.rows[0], { status: "incomplete", limitation: { group: "preferences", code: "preference_operation_timed_out" }, evidenceRefs: ["packet"] });
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, true);
  candidate.version = "cmp_audit_assessment.v4";
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, false);
  candidate.version = "cmp_audit_assessment.v5"; delete candidate.rows[0].limitation;
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, false);
  Object.assign(candidate.rows[0], { status: "not_applicable" });
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, false, "Missing support cannot establish not applicable");
  Object.assign(candidate.rows[0], { status: "not_assessed", evidenceRefs: [] });
  const comparison = candidate.rows.find((row: any) => row.id === "found_not_declared");
  Object.assign(comparison, { status: "partially_assessed", evidenceRefs: ["packet"], cookieComparison: {
    declarationPatternCount: 1, observedCookieNameCount: 1, unmatchedNameCount: 0, unmatchedNames: [], allUnmatchedOnlyAfterAccept: false, declarationInventoryComplete: false } });
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, true);
  comparison.status = "review";
  assert.equal(cmpAuditAssessmentSchema.safeParse(candidate).success, false);
});
