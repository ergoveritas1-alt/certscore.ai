import assert from "node:assert/strict";
import test from "node:test";
import { cmpBasicEvidenceSchema, cmpPreferencesEvidenceSchema, cmpPrivacyLinkSchema } from "./cmp-audit-evidence";

test("passive loaded inventory requires v2 exact source, provider and document proof; v1 stays unchanged", () => {
  const v1={contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:"passive",targetUrl:"https://example.test/",documentUrl:"https://example.test/",documentToken:"loader",capturedAtMs:100,provider:"Cookiebot",controls:[],privacyLinks:[],declarations:[],serviceNames:[],limitations:["passive_first_layer_only","declaration_inventory_not_complete"]};
  assert.deepEqual(cmpBasicEvidenceSchema.parse(v1),v1);
  const valid={...v1,contractVersion:"certscore.cmp-basic-evidence.v2",captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:"loader",declarationsAtMs:90},
    loadedInventoryBinding:{version:"cookiebot_passive_loaded_inventory.v1",rootSelector:"#CybotCookiebotDialog",panelSelector:"#CybotCookiebotDialogTabContentDetails",documentToken:"loader"},
    loadedInventory:{version:"cookiebot_loaded_declarations.v1",records:[{name:"_ga",purpose:"Analytics",duration:"2 years",storageType:"cookie",provider:"Google",sourceRef:"provider:0/record:0"}],truncated:false,unresolvedRecords:0},
    declarations:[{name:"_ga",purpose:"Analytics",duration:"2 years",source:"cmp_loaded_inventory"}],limitations:[...v1.limitations,"loaded_declarations_not_visibility_proof"]};
  assert.equal(cmpBasicEvidenceSchema.safeParse(valid).success,true);
  for (const mutate of [
    (p:any)=>p.contractVersion=v1.contractVersion,(p:any)=>p.provider='OneTrust',(p:any)=>p.sourceLane='runtime_evidence',
    (p:any)=>delete p.loadedInventory,(p:any)=>delete p.loadedInventoryBinding,(p:any)=>delete p.captureProgress.declarationsAtMs,
    (p:any)=>p.loadedInventoryBinding.documentToken='other',(p:any)=>p.loadedInventoryBinding.panelSelector='#guessed',
    (p:any)=>p.declarations[0].purpose='Changed',(p:any)=>p.declarations.push({...p.declarations[0]}),
    (p:any)=>p.loadedInventory.records[0].storageType='local_storage',(p:any)=>p.serviceNames=['Invented service'],
    (p:any)=>p.limitations=p.limitations.filter((s:string)=>s!=='declaration_inventory_not_complete'),
    (p:any)=>p.inventoryManifest={version:'cmp_inventory_manifest.v1',source:'cookiebot_loaded_declarations.v1',names:['_invented'],sourceRecordCount:1,resolvedRecordCount:1,unresolvedRecordCount:0,unresolvedSources:0,truncated:false},
  ]) {const candidate=structuredClone(valid);mutate(candidate);assert.equal(cmpBasicEvidenceSchema.safeParse(candidate).success,false,mutate.toString());}
});

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

test("passive public policy access preserves document, origin and restoration proof",()=>{
  const input={contractVersion:'certscore.cmp-basic-evidence.v1',sourceLane:'consent_proof',scanId:'links',targetUrl:'https://example.test/',documentUrl:'https://example.test/',documentToken:'loader',capturedAtMs:100,provider:'Cookiebot',controls:[],declarations:[],serviceNames:[],limitations:['passive_first_layer_only'],
    captureProgress:{version:'cmp_capture_checkpoints.v1',documentToken:'loader',privacyLinksAtMs:100},
    privacyLinkInspection:{version:'passive_public_privacy_links.v1',scope:'same_origin_page',documentToken:'loader'},
    privacyLinks:[{url:'https://example.test/privacy',hitTargetBeforeAction:true,access:{version:'privacy_link_access.v2',outcome:'reachable',scroll:{version:'privacy_link_scroll.v1',initialOutcome:'outside_viewport',beforeY:0,inspectedY:2000,restored:true}}}]};
  assert.equal(cmpBasicEvidenceSchema.safeParse(input).success,true);
  for(const mutate of [(p:any)=>p.privacyLinks[0].url='https://vendor.test/privacy',(p:any)=>p.privacyLinks[0].url='invalid-url',(p:any)=>p.privacyLinkInspection.documentToken='other',
    (p:any)=>delete p.captureProgress.privacyLinksAtMs,(p:any)=>p.privacyLinks[0].access.scroll.restored=false]){
    const bad=structuredClone(input);mutate(bad);assert.equal(cmpBasicEvidenceSchema.safeParse(bad).success,false);
  }
});

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


test("privacy-link diagnostics are optional for history, strict and consistent with hit testing", () => {
  const link = { url: "https://example.test/privacy", hitTargetBeforeAction: false };
  assert.deepEqual(cmpPrivacyLinkSchema.parse(link), link);
  for (const outcome of ["reachable", "outside_viewport", "not_rendered", "hidden", "transparent", "inactive", "pointer_disabled", "hit_target_missed", "inspection_incomplete"]) {
    const input = { ...link, hitTargetBeforeAction: outcome === "reachable", access: { version: "privacy_link_access.v1", outcome } };
    assert.deepEqual(cmpPrivacyLinkSchema.parse(input), input);
    assert.equal(cmpPrivacyLinkSchema.safeParse({ ...input, hitTargetBeforeAction: !input.hitTargetBeforeAction }).success, false);
  }
  for (const access of [{ version: "privacy_link_access.v1", outcome: "banner_blocked" }, { version: "privacy_link_access.v2", outcome: "hidden" }, { version: "privacy_link_access.v1", outcome: "hidden", rawHtml: "untrusted" }])
    assert.equal(cmpPrivacyLinkSchema.safeParse({ ...link, access }).success, false);
  const input = { ...packet(), privacyLinks: [{ ...link, access: { version: "privacy_link_access.v1", outcome: "outside_viewport" } }] };
  assert.deepEqual(cmpPreferencesEvidenceSchema.parse(input).privacyLinks, input.privacyLinks);
});


test("Options diagnostics are bounded, versioned and cannot manufacture opening proof",()=>{
 const counts={actionable:0,hidden:1,disabled:0,outside_viewport:0,covered:0,unavailable:0};
 const input={...packet(),inspectionDiagnostic:{...packet().inspectionDiagnostic,optionsResolution:{version:"cmp_options_resolution.v1",counts,overflow:false}}};
 assert.equal(cmpPreferencesEvidenceSchema.parse(input).action.opened,false);
 assert.equal(cmpPreferencesEvidenceSchema.safeParse({...input,action:{count:1,intent:"options",label:"Cookie Preferences",opened:true}}).success,false);
 for(const change of [{...counts,hidden:101},{...counts,hidden:100,covered:1},{...counts,hidden:-1}])
  assert.equal(cmpPreferencesEvidenceSchema.safeParse({...input,inspectionDiagnostic:{...input.inspectionDiagnostic,optionsResolution:{...input.inspectionDiagnostic.optionsResolution,counts:change}}}).success,false);
});

test("v7 scope activity diagnostics are bounded and do not supply action or inventory evidence", () => {
  const input = { ...packet(), inspectionDiagnostic: { revision: "cmp_preferences.v7", budgetMs: 17000, phase: "control_inventory",
    identityScopes: { version: "cmp_scope_activity.v1", providers: [{ provider: "Didomi", state: "visible" }, {provider: "HubSpot Consent Banner", state: "inactive"}] } } };
  const parsed = cmpPreferencesEvidenceSchema.parse(input);
  assert.deepEqual(parsed.inspectionDiagnostic, input.inspectionDiagnostic);
  assert.equal(parsed.status, "limited"); assert.equal(parsed.action.count, 0); assert.equal(parsed.action.opened, false);
  assert.deepEqual(parsed.controls, []); assert.equal(parsed.controlInventoryComplete, false);
  for (const providers of [[{provider: "Didomi", state: "assumed_visible"}], [{provider: "x".repeat(121), state: "visible"}], Array.from({length: 41}, () => ({provider: "Didomi", state: "visible"}))]) {
    assert.equal(cmpPreferencesEvidenceSchema.safeParse({...input, inspectionDiagnostic: {...input.inspectionDiagnostic, identityScopes: {...input.inspectionDiagnostic.identityScopes, providers}}}).success, false);
  }
});


test("registered portal diagnostics require v8 verified opening and preserve historical packets", () => {
  const input: any = packet();
  input.inspectionDiagnostic.revision = "cmp_preferences.v8";
  input.inspectionDiagnostic.surfaceBinding.mode = "registered_portal";
  assert.equal(cmpPreferencesEvidenceSchema.parse(input).action.opened, false);
  input.action = {count: 1, intent: "options", label: "Preferences", opened: true};
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success, false);
  input.inspectionDiagnostic.surfaceBinding.verification = {version: "cmp_panel_verification.v1", result: "verified", role: "dialog"};
  assert.equal(cmpPreferencesEvidenceSchema.parse(input).action.opened, true);
  input.inspectionDiagnostic.revision = "cmp_preferences.v7";
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success, false);
  assert.deepEqual(cmpPreferencesEvidenceSchema.parse(packet()).inspectionDiagnostic, packet().inspectionDiagnostic);
});


test("visible inventory retains exact labelled sources without manufacturing opening or complete coverage", async () => {
  const input: any = packet();
  const inventory = {version: "cmp_visible_inventory.v1",records:[{ref:"definition_list:0/row:0",fields:[
    {column:"cookieName",label:"Cookie name",value:"_ga"},{column:"provider",label:"Provider",value:"Google Analytics"},
    {column:"purpose",label:"Purpose",value:"Audience measurement"},{column:"duration",label:"Duration",value:"2 years"}]}],truncated:false,unresolvedRecords:0};
  input.visibleInventory=inventory;input.inspectionDiagnostic.revision="cmp_preferences.v9";
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success,false);
  input.action={count:1,intent:"options",label:"Preferences",opened:true};
  input.checkpoints={version:"cmp_partial_capture.v1",documentToken:"loader",controls:true,controlsSurface:"preferences",privacyLinks:false,declarations:true};
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success,false,"Retained record must agree with declaration projection");
  input.declarations=[{name:"_ga",purpose:"Audience measurement",duration:"2 years",source:"cmp_visible_inventory"}];
  const parsed=cmpPreferencesEvidenceSchema.parse(input);
  assert.deepEqual(parsed.visibleInventory,inventory);assert.equal(parsed.declarationInventoryComplete,false);
  input.visibleInventory.records[0].fields[0].label="Category";
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(input).success,false);
});
