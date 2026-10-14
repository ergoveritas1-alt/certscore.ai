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
