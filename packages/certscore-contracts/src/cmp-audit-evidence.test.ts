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

test("v6 scopes protect historical conclusions and bound independent activity facts", async () => {
  const { cmpAuditAssessmentSchema, cmpAuditCriterionSchema } = await import("./cmp-audit-evidence");
  const input: any = { version: "cmp_audit_assessment.v6", scanId: "scan", sourceSha256: "a".repeat(64), support: {state:"partial",provider:"OneTrust",recipeVersion:"v1",reason:"bounded"},
    rows: [...cmpAuditCriterionSchema.options, "implementation", "prominence"].map(id => ({id,status:"not_assessed",detail:"",evidenceRefs:[]})) };
  const row = input.rows.find((r: any) => r.id === "implementation");
  Object.assign(row, {status:"observed",evidenceRefs:["CanonicalEvidenceBundle.json"],inventory:{choiceActivity:[{action:"reject",windowMs:8000,requestCount:0,nonEssentialRequestCount:0,requests:[]}]}});
  assert.equal(cmpAuditAssessmentSchema.safeParse(input).success,true);
  const old=structuredClone(input);old.version="cmp_audit_assessment.v5";
  assert.equal(cmpAuditAssessmentSchema.safeParse(old).success,false,"New scopes cannot silently enter historical versions");
  row.inventory.choiceActivity[0].nonEssentialRequestCount=1;
  assert.equal(cmpAuditAssessmentSchema.safeParse(input).success,false);
  row.inventory.choiceActivity[0].nonEssentialRequestCount=0;
  row.inventory.choiceActivity.push(structuredClone(row.inventory.choiceActivity[0]));
  assert.equal(cmpAuditAssessmentSchema.safeParse(input).success,false);
});

test("OneTrust named-service configuration keeps its capture revision distinct from historical packets", () => {
  const input:any=packet();
  for(const version of ["onetrust_loaded_configuration.v1","onetrust_loaded_configuration.v2"]){
    input.inspectionDiagnostic.configuration={version,status:"available",groupCount:5,retainedCookieCount:12,truncated:false};
    assert.equal(cmpPreferencesEvidenceSchema.parse(input).inspectionDiagnostic!.configuration!.version,version);
  }
  input.inspectionDiagnostic.configuration.version="assumed_supported";
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success,false);
});

test("cookie template candidates and expiry evidence cannot become verified matches or guessed retention", async () => {
  const { cmpInventoryTablesSchema, possibleCmpCookieTemplate } = await import("./cmp-audit-evidence");
  assert.equal(possibleCmpCookieTemplate("_ga_xxxxxxxxxx", "_ga_S4EX53B760"), true);
  for (const [pattern, name] of [["_ga_*", "_ga_S4EX53B760"], ["_ga_xxxxxxxxxx", "_ga_123"], ["_ga_xxxxxxxxxx", "_ga_xxxxxxxxxx"], ["cookie_xxxxxxxxxx", "cookie_S4EX53B760"], ["_ga_xxxxxxxxxx", "_ga_S4EX53B760_extra"]])
    assert.equal(possibleCmpCookieTemplate(pattern!, name!), false);
  const cookie = { name: "_ga_S4EX53B760", matchedPattern: null, observedIn: ["after_accept"], possibleTemplateMatch: { pattern: "_ga_xxxxxxxxxx", basis: "ga4_placeholder.v1" },
    observedExpiry: { visit: "Accept", name: "_ga_S4EX53B760", capturedAtEpochSeconds: 100, expiresAtEpochSeconds: 200, remainingSeconds: 100 } };
  assert.equal(cmpInventoryTablesSchema.safeParse({ cookies: [cookie] }).success, true);
  for (const patch of [{ matchedPattern: "_ga_xxxxxxxxxx" }, { name: "unrelated" }, { observedIn: ["before_choice"] },
    { observedExpiry: { ...cookie.observedExpiry, remainingSeconds: 101 } }, { observedExpiry: { ...cookie.observedExpiry, name: "_ga" } }])
    assert.equal(cmpInventoryTablesSchema.safeParse({ cookies: [{ ...cookie, ...patch }] }).success, false);
  assert.equal(cmpInventoryTablesSchema.safeParse({ declarations: [{ name: "_ga_xxxxxxxxxx", purpose: "", duration: "", source: "cmp_api_inventory", observedExpiry: cookie.observedExpiry }] }).success, false);
});

test("configured cookie identities require a bounded provider-bound checkpoint without upgrading historical packets", () => {
  const base: any = packet();
  const witness = { version: "cmp_configured_cookie_identity.v1", configurationPath: "drupalSettings.eu_cookie_compliance.cookie_name", name: "cookie_compliance" };
  base.configuredConsentCookies = [witness];
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(base).success, false);
  base.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader", privacyLinks: false, declarations: false, controls: false, controlsSurface: "first_layer" };
  assert.deepEqual(cmpPreferencesEvidenceSchema.parse(base).configuredConsentCookies, [witness]);
  for (const change of [{ name: "value=private" }, { name: "" }, { name: "a".repeat(161) }, { version: "guessed_cookie" }, { rawValue: "private" }]) {
    assert.equal(cmpPreferencesEvidenceSchema.safeParse({ ...base, configuredConsentCookies: [{ ...witness, ...change }] }).success, false);
  }
  assert.equal(cmpPreferencesEvidenceSchema.safeParse({ ...base, configuredConsentCookies: Array(5).fill(witness) }).success, false);
  assert.equal(cmpPreferencesEvidenceSchema.parse(packet()).configuredConsentCookies, undefined);
});

test("deferred-panel verification diagnostics remain bounded and do not create opening proof", () => {
  const input: any = packet();
  input.inspectionDiagnostic.surfaceBinding.verification = { version: "cmp_panel_verification.v1", result: "role_not_ready", role: "article" };
  const result = cmpPreferencesEvidenceSchema.parse(input);
  assert.equal(result.action.opened, false); assert.equal(result.status, "limited");
  assert.deepEqual(result.inspectionDiagnostic!.surfaceBinding!.verification, input.inspectionDiagnostic.surfaceBinding.verification);
  for (const patch of [{ result: "assumed_ready" }, { role: "x".repeat(33) }, { html: "private" }, { version: "unknown" }])
    assert.equal(cmpPreferencesEvidenceSchema.safeParse({ ...input, inspectionDiagnostic: { ...input.inspectionDiagnostic, surfaceBinding: { ...input.inspectionDiagnostic.surfaceBinding, verification: { ...input.inspectionDiagnostic.surfaceBinding.verification, ...patch } } } }).success, false);
});
