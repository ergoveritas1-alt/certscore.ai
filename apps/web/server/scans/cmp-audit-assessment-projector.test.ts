import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { cmpNetworkCookieInventorySchema, projectNetworkCmpCookies, projectPostAcceptEvidenceForReport, cmpCookieExpiryEvidenceSchema, cmpPreferencesEvidenceSchema, consentControlAssessmentSchema, postAcceptEvidencePacketSchema, postRefusalEvidencePacketSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveCmpAuditAssessment } from "./cmp-audit-assessment-projector";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { withCanonicalConsentAssessmentSnapshot, withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";
import { publicCmpAuditSchema } from "../../../../packages/certscore-api-contracts/src/detailed-evidence";

function bundle() {
  const url = "https://example.com/";
  return { scanId: "scan-1", url, startedAt: "2026-10-13T00:00:00.000Z", runtimeCoverage: { coverageStatus: "usable" }, cookieEvents: [],
    policySurfaceObservations: [{ url: `${url}privacy`, documentFetchState: "fetched", documentEvaluationState: "usable" }],
    cmpPreferencesEvidence: cmpPreferencesEvidenceSchema.parse({ contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1", scanId: "scan-1", parentDispatchSha256: "a".repeat(64), targetUrl: url, finalUrl: url, documentToken: "loader-1", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:02.000Z", status: "completed", support: { state: "partial", provider: "OneTrust", recipeVersion: "bounded_cmp_preferences.v1", reason: "bounded_visible_preference_inspection" }, action: { count: 1, intent: "options", label: "Manage options", opened: true }, controls: [{ label: "Analytics", kind: "category", enabled: true, checked: false }], controlInventoryComplete: true, privacyLinks: [{ url: `${url}privacy`, hitTargetBeforeAction: true }], declarations: [{ name: "_ga", purpose: "Audience measurement", duration: "1 day", source: "cmp_visible_inventory" }], declarationInventoryComplete: false, limitations: [] })
  } as unknown as CanonicalEvidenceBundle;
}

test("unnamed observed cookies retain neutral source references without entering name comparisons", () => {
  const input = bundle();
  input.cookieEvents = [{ cookieName: "" }, { cookieName: "_ga" }] as CanonicalEvidenceBundle["cookieEvents"];
  const original = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(audit.version, "cmp_audit_assessment.v7");
  assert.deepEqual(row.cookieComparison?.unnamedCookieRefs, ["CanonicalEvidenceBundle.json#cookieEvents.0"]);
  assert.equal(row.cookieComparison?.observedCookieNameCount, 1);
  assert.ok(!row.cookieComparison?.unmatchedNames.includes(""));
  assert.ok(!row.inventory?.cookies?.some(cookie => cookie.name === ""));
  assert.deepEqual(input, original);
  const assessment = consentControlAssessmentSchema.parse({...observedControlAssessment, cmpAudit: audit});
  const concerns = buildNormalizedConcerns({runtimeArtifacts: {consentControlAssessment: assessment}, reviewFindingCandidates: [], validationFindings: []});
  const projected = projectCmpAudit({scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns});
  assert.equal(projected.version, "cmp_audit_report.v3");
  assert.deepEqual(projected.rows.find(row => row.id === "found_not_declared")?.supportingEvidence?.cookieComparison?.unnamedCookieRefs, row.cookieComparison?.unnamedCookieRefs);
  assert.equal(publicCmpAuditSchema.safeParse(projected).success, true);
});

test("verified cookie snapshot coverage is independent of unfinished DOM loading and cannot establish broader absence",()=>{
  const input=bundle();input.completedAt="2026-10-13T00:00:10.000Z";
  input.runtimeCoverage={...input.runtimeCoverage!,coverageStatus:"limited_partial",limitationKeys:["pre_consent_runtime_partial","runtime_page_inventory_document_unsettled"]};
  input.scanLaneRuns=[{laneId:"runtime_evidence",accessOutcome:"representative_page",executionOutcome:"degraded",challengeDetected:false,firstHttpStatus:200,firstEffectiveUrl:input.url}] as CanonicalEvidenceBundle["scanLaneRuns"];
  input.cookieSnapshots=[{capturedAtMs:5000,consentStateAtTime:"pre_consent",cookies:[{name:"_ga"}],captureCoverage:{version:"bound_cookie_snapshot.v1",scope:"browser_context_point_in_time",targetUrl:input.url,documentUrl:input.url,documentToken:"runtime-loader",startedAtMs:4900,completedAtMs:5000,status:"completed"}}] as CanonicalEvidenceBundle["cookieSnapshots"];
  input.runtimeMetadataSnapshots=[{url:input.url,capturedAtMs:4800,consentStateAtTime:"pre_consent",documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"}}] as CanonicalEvidenceBundle["runtimeMetadataSnapshots"];
  const original=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==="declared_not_found")?.status,"observed");
  assert.match(audit.rows.find(row=>row.id==="declared_not_found")!.detail,/point-in-time/);
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.status,"partially_assessed");
  assert.deepEqual(input,original);
  const redirect=structuredClone(input);
  Object.assign(redirect.cookieSnapshots![0]!.captureCoverage!,{documentUrl:"https://redirected.test/",documentBindingPolicy:"passive_final_document.v1"});
  redirect.runtimeMetadataSnapshots![0]!.url="https://redirected.test/";
  assert.equal(deriveCmpAuditAssessment(redirect)!.rows.find(row=>row.id==="declared_not_found")!.status,"observed");
  delete redirect.cookieSnapshots![0]!.captureCoverage!.documentBindingPolicy;
  assert.notEqual(deriveCmpAuditAssessment(redirect)!.rows.find(row=>row.id==="declared_not_found")!.status,"observed");
  const diagnosticVisit=structuredClone(input);Object.assign(diagnosticVisit.scanLaneRuns![0]!,{accessOutcome:"bot_challenge",challengeDetected:true,challengeType:"potential_security_challenge",executionOutcome:"success"});
  diagnosticVisit.scanNoGoAssessment={status:"available",version:"scan-no-go-assessment-v1",decision:"continue_with_diagnostics",scanNoGoConfidence:0.72,reasonCodes:["potential_security_challenge"],corroboratorCodes:[],contradictorCodes:[],evidenceRefs:[],supportingSignals:{blockingFrameChallengeObserved:false}};
  assert.equal(deriveCmpAuditAssessment(diagnosticVisit)!.rows.find(row=>row.id==="declared_not_found")?.status,"observed","Canonical continued diagnostic visits may retain a completed factual snapshot comparison");
  diagnosticVisit.scanNoGoAssessment!.decision="no_go";
  assert.notEqual(deriveCmpAuditAssessment(diagnosticVisit)!.rows.find(row=>row.id==="declared_not_found")?.status,"observed");
  const invalidNewProof=structuredClone(input);invalidNewProof.runtimeCoverage!.coverageStatus="usable";invalidNewProof.cookieSnapshots[0]!.captureCoverage!.documentToken="other";
  assert.notEqual(deriveCmpAuditAssessment(invalidNewProof)!.rows.find(row=>row.id==="declared_not_found")?.status,"observed","Unverifiable new proof must not fall back to historical coverage rules");
  const laterMetadata=structuredClone(input);laterMetadata.runtimeMetadataSnapshots![0]!.capturedAtMs=5100;
  assert.equal(deriveCmpAuditAssessment(laterMetadata)!.rows.find(row=>row.id==="declared_not_found")?.status,"observed","Immutable CDP loader binding may be retained after the cookie read, within the same scan");
  for(const mutate of [
    (b:typeof input)=>{b.runtimeMetadataSnapshots![0]!.capturedAtMs=11000},
    (b:typeof input)=>{b.cookieSnapshots[0]!.captureCoverage!.documentToken="other"},
    (b:typeof input)=>{b.cookieSnapshots[0]!.captureCoverage!.documentUrl="https://other.test/"},
    (b:typeof input)=>{b.cookieSnapshots[0]!.captureCoverage!.completedAtMs=5001},
    (b:typeof input)=>{b.runtimeMetadataSnapshots=[]},
    (b:typeof input)=>{b.scanLaneRuns![0]!.challengeDetected=true},
    (b:typeof input)=>{delete b.cookieSnapshots[0]!.captureCoverage},
  ]) {const invalid=structuredClone(input);mutate(invalid);assert.notEqual(deriveCmpAuditAssessment(invalid)!.rows.find(row=>row.id==="declared_not_found")?.status,"observed");}
});

test("compact configured names support comparison without inventing missing descriptions or complete DOM inventories",()=>{
  const input=bundle(),packet=input.cmpPreferencesEvidence!;packet.support.provider="CookieYes";
  packet.inspectionDiagnostic={revision:"cmp_preferences.v12",budgetMs:17000,phase:"completed"};
  packet.checkpoints={version:"cmp_partial_capture.v1",documentToken:"loader-1",privacyLinks:true,declarations:true,controls:true,controlsSurface:"preferences"};
  packet.captureProgress={version:"cmp_capture_checkpoints.v1",documentToken:"loader-1",declarationsAtMs:1000};
  packet.inventoryManifest={version:"cmp_inventory_manifest.v1",source:"cookieyes_category_configuration.v1",names:["_ga","beyond_detail_sample"],sourceRecordCount:2,resolvedRecordCount:2,unresolvedRecordCount:0,unresolvedSources:0,truncated:false};
  input.cookieSnapshots=[{consentStateAtTime:"pre_consent",cookies:[{name:"_ga"},{name:"beyond_detail_sample"}]}] as CanonicalEvidenceBundle["cookieSnapshots"];
  input.cookieEvents=[{cookieName:"_ga"},{cookieName:"beyond_detail_sample"}] as CanonicalEvidenceBundle["cookieEvents"];
  const audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.status,"not_observed");
  assert.equal(audit.rows.find(row=>row.id==="cookie_information")?.inventory?.declarations?.length,1);
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.cookieComparison?.declarationPatternCount,2);
  const partial=structuredClone(input);partial.cmpPreferencesEvidence!.inventoryManifest!.source="onetrust_group_cookie_lists.v1";partial.cmpPreferencesEvidence!.support.provider="OneTrust";
  assert.equal(deriveCmpAuditAssessment(partial)!.rows.find(row=>row.id==="found_not_declared")?.status,"partially_assessed");
  const malformed=structuredClone(packet);malformed.inventoryManifest!.resolvedRecordCount=0;
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(malformed).success,false);
});

test("bound loaded Cookiebot cards resolve factual inventory through canonical concerns while remaining partial and score-neutral", async () => {
  const {projectLoadedCmpInventory} = await import("@certscore/contracts");
  const input=bundle(), packet=input.cmpPreferencesEvidence!;
  packet.support.provider="Cookiebot";
  packet.inspectionDiagnostic={revision:"cmp_preferences.v11",budgetMs:17000,phase:"completed",surfaceBinding:{version:"cmp_surface_binding.v1",mode:"registered_existing",priorMatches:1,outcome:"opened",verification:{version:"cmp_panel_verification.v1",result:"verified",role:"tabpanel"}}};
  packet.checkpoints={version:"cmp_partial_capture.v1",documentToken:"loader-1",privacyLinks:true,declarations:true,controls:true,controlsSurface:"preferences"};
  packet.loadedInventory={version:"cookiebot_loaded_declarations.v1",truncated:true,unresolvedRecords:0,records:[
    {name:"_ga",purpose:"Audience measurement",duration:"2 years",storageType:"cookie",provider:"Google",sourceRef:"provider:0/record:0"},
    {name:"storage_key",purpose:"Preferences",duration:"Persistent",storageType:"local_storage",provider:"Provider",sourceRef:"provider:1/record:0"},
  ]};
  packet.declarations=projectLoadedCmpInventory(packet.loadedInventory).declarations;
  packet.controlInventoryComplete=false;
  input.cookieSnapshots=[{consentStateAtTime:"pre_consent",cookies:[{name:"_ga"},{name:"unlisted"}]}] as CanonicalEvidenceBundle["cookieSnapshots"];
  input.cookieEvents=[{cookieName:"_ga"},{cookieName:"unlisted"}] as CanonicalEvidenceBundle["cookieEvents"];
  cmpPreferencesEvidenceSchema.parse(packet);
  const original=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==="services")?.status,"observed");
  assert.deepEqual(audit.rows.find(row=>row.id==="services")?.inventory?.services?.map(s=>s.name),["Google","Provider"]);
  assert.match(audit.rows.find(row=>row.id==="services")!.detail,/may be collapsed/);
  assert.equal(audit.rows.find(row=>row.id==="cookie_information")?.status,"observed");
  assert.equal(audit.rows.find(row=>row.id==="declared_not_found")?.status,"observed");
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.status,"partially_assessed");
  assert.equal(audit.rows.find(row=>row.id==="cookie_information")?.inventory?.declarations?.some(d=>d.name==="storage_key"),false);
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(report.rows.find(row=>row.id==="services")?.status,"Observed");
  assert.equal(report.rows.find(row=>row.id==="cookie_information")?.supportingEvidence?.inventory?.declarations?.[0]?.source,"cmp_loaded_inventory");
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,original);
  for(const mutate of [
    (p:typeof packet)=>{p.documentToken="stale"},
    (p:typeof packet)=>{p.declarations[0]!.purpose="invented"},
    (p:typeof packet)=>{p.support.provider="Other"},
    (p:typeof packet)=>{p.declarationInventoryComplete=true},
    (p:typeof packet)=>{delete p.loadedInventory},
    (p:typeof packet)=>{p.inspectionDiagnostic!.surfaceBinding!.verification!.result="panel_replaced"},
    (p:typeof packet)=>{p.checkpoints!.declarations=false},
    (p:typeof packet)=>{p.inspectionDiagnostic!.revision="cmp_preferences.v10"},
  ]) {
    const invalid=structuredClone(packet);mutate(invalid);assert.equal(cmpPreferencesEvidenceSchema.safeParse(invalid).success,false);
  }
});

test("passive CookieYes configuration survives preference cancellation without inventing purposes, services or completeness", () => {
  const input=bundle();delete input.cmpPreferencesEvidence;
  input.completedAt="2026-10-13T00:00:12.000Z";
  input.cmpPreferenceLaneOutcome={status:"limited",startedAt:input.startedAt,completedAt:input.completedAt,limitationCode:"preference_inspection_cancelled"};
  input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:"pre_consent",documentIdentity:{token:"basic-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cookieSnapshots=[{consentStateAtTime:"pre_consent",cookies:[{name:"_ga"}]}] as CanonicalEvidenceBundle["cookieSnapshots"];
  input.cookieEvents=[{cookieName:"_ga"},{cookieName:"unlisted"}] as CanonicalEvidenceBundle["cookieEvents"];
  input.cmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:input.scanId,targetUrl:input.url,documentUrl:input.url,documentToken:"basic-loader",capturedAtMs:100,provider:"CookieYes",controls:[],privacyLinks:[],serviceNames:[],
    declarations:[{name:"_ga",purpose:"Audience measurement",duration:"2 years",source:"cmp_api_inventory"},{name:"unknown",purpose:"",duration:"",source:"cmp_api_inventory"}],
    limitations:["passive_first_layer_only","declaration_inventory_not_complete","cookieyes_loaded_configuration.v1","loaded_configuration_not_visibility_proof"]};
  const before=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==="declared_not_found")?.status,"observed");
  assert.equal(audit.rows.find(row=>row.id==="cookie_information")?.status,"partially_assessed");
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.status,"partially_assessed");
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.cookieComparison?.declarationInventoryComplete,false);
  assert.ok(audit.rows.find(row=>row.id==="services")?.status!=="observed");
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(report.rows.find(row=>row.id==="declared_not_found")?.status,"Observed");
  assert.equal(report.rows.find(row=>row.id==="cookie_information")?.supportingEvidence?.inventory?.declarations?.[1]?.purpose,"");
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,before);
  input.cmpBasicEvidence.documentToken="stale";
  assert.equal(deriveCmpAuditAssessment(input)?.rows.find(row=>row.id==="declared_not_found")?.status,"incomplete");
});

test("document-unsettled snapshots support only partial CMP comparison, with access and capture failures closed", () => {
  const input=bundle();input.completedAt="2026-10-13T00:00:10.000Z";
  input.runtimeCoverage={...input.runtimeCoverage!,coverageStatus:"limited_partial",limitationKeys:["pre_consent_runtime_partial","runtime_page_inventory_document_unsettled"]};
  input.scanLaneRuns=[{laneId:"runtime_evidence",accessOutcome:"representative_page",executionOutcome:"degraded",challengeDetected:false,firstHttpStatus:200,firstEffectiveUrl:input.url}] as CanonicalEvidenceBundle["scanLaneRuns"];
  input.cookieSnapshots=[{capturedAtMs:5000,consentStateAtTime:"pre_consent",cookies:[{name:"_ga"},{name:"other"}]}] as CanonicalEvidenceBundle["cookieSnapshots"];
  const before=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  for(const id of ["declared_not_found","found_not_declared"])assert.equal(audit.rows.find(row=>row.id===id)?.status,"partially_assessed");
  assert.equal(audit.rows.find(row=>row.id==="found_not_declared")?.cookieComparison,undefined,"No complete-inventory review eligibility");
  assert.deepEqual(audit.rows.find(row=>row.id==="found_not_declared")?.inventory?.cookies,[{name:"_ga",matchedPattern:"_ga",observedIn:["before_choice"]},{name:"other",matchedPattern:null,observedIn:["before_choice"]}]);
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(report.rows.find(row=>row.id==="declared_not_found")?.status,"Partially assessed");
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,before);
  for(const mutate of [
    (b:CanonicalEvidenceBundle)=>{b.runtimeCoverage!.limitationKeys.push("navigation_failed")},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns![0]!.firstHttpStatus=403},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns![0]!.challengeDetected=true},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns![0]!.firstEffectiveUrl="https://other.test/"},
    (b:CanonicalEvidenceBundle)=>{b.scanLaneRuns=[]},
    (b:CanonicalEvidenceBundle)=>{b.cookieSnapshots![0]!.capturedAtMs=11000},
    (b:CanonicalEvidenceBundle)=>{b.cookieSnapshots=[]},
  ]){
    const failed=structuredClone(input);mutate(failed);
    assert.equal(deriveCmpAuditAssessment(failed)!.rows.find(row=>row.id==="declared_not_found")?.status,"not_assessed");
  }
});

test("verified preferences persist and reach checklist results only through concern policy, without scoring", () => {
  const audit = deriveCmpAuditAssessment(bundle())!;
  assert.equal(audit.rows.find(row => row.id === "categories")?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "not_assessed");
  assert.equal(audit.rows.find(row => row.id === "privacy_access")?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "not_assessed");
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const old = { ...assessment, cmpAudit: undefined };
  const snapshot = withCanonicalConsentAssessmentSnapshot({ consentControlAssessment: old, consent_control_assessment: old }, assessment);
  assert.deepEqual(snapshot.consentControlAssessment, assessment);
  assert.deepEqual(snapshot.consent_control_assessment, assessment);
  const artifacts = withPersistedFirstLayerConsentEvidence({ consentControlAssessment: assessment }, { consent_control_assessment: assessment })!;
  assert.deepEqual((artifacts.consent_control_assessment as typeof assessment).cmpAudit, audit);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [] });
  const cmpConcerns = concerns.filter(concern => concern.originKey.startsWith("consent.cmp_audit."));
  assert.equal(cmpConcerns.length, 10);
  assert.ok(cmpConcerns.every(concern => concern.promotionEligibility === "internal_only" && concern.externalSurfacingEligibility === "eligible" && (concern.scoreEffects?.length ?? 0) === 0), JSON.stringify(cmpConcerns.map(c => ({ policy: c.promotionEligibility, external: c.externalSurfacingEligibility, effects: c.scoreEffects, raw: c.evidenceBundle.rawEvidence }))));
  assert.ok(cmpConcerns.every(concern => concern.evidenceBundle.flags.length === 0 && concern.evidenceBundle.policySnippets.length === 0));
  const result = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(result.rows.find(row => row.id === "categories")?.status, "Observed");
  assert.equal(result.inspectionSupport?.state, "partial");
  const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, reorder(item)])) : value;
  const transported = reorder({ assessment, concerns }) as { assessment: typeof assessment; concerns: typeof concerns };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: transported.assessment, normalizedConcerns: transported.concerns }).rows.find(row => row.id === "categories")?.status, "Observed");
  assert.ok(result.rows.every(row => !row.deductionPoints));
  // A typed assessment alone is not a shortcut around policy evaluation.
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment }).rows.find(row => row.id === "categories")?.status, "Not assessed");
  cmpConcerns[0]!.evidenceBundle.rawEvidence!.cmpAuditSourceSha256 = "b".repeat(64);
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: cmpConcerns }).rows.find(row => row.id === "categories")?.status, "Not assessed");
});

test("partial, failed, foreign and historical evidence cannot establish feature absence", () => {
  for (const mutate of [
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.controlInventoryComplete = false; b.cmpPreferencesEvidence!.controls = []; },
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.status = "limited"; },
    (b: CanonicalEvidenceBundle) => { b.cmpPreferencesEvidence!.scanId = "wrong-scan"; },
    (b: CanonicalEvidenceBundle) => { delete b.cmpPreferencesEvidence; },
  ]) {
    const b = bundle(); mutate(b);
    const audit = deriveCmpAuditAssessment(b);
    assert.ok(!audit || audit.rows.every(row => !["feature_not_supported", "not_observed"].includes(row.status)));
  }
});

test("retained timeout projects an inspection outcome without inventing vendor unsupported or feature absence", () => {
  const input = bundle();
  Object.assign(input.cmpPreferencesEvidence!, { status: "limited", controls: [], controlInventoryComplete: false,
    support: { state: "unknown", provider: null, recipeVersion: null, reason: "inspection_incomplete" },
    limitations: ["preference_budget_exhausted"] });
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_budget_exhausted");
  assert.equal(audit.support.state, "unknown");
  assert.ok(audit.rows.every(row => ["not_assessed", "incomplete"].includes(row.status)));
  assert.equal(input.cmpPreferencesEvidence!.support.reason, "inspection_incomplete", "original evidence is preserved");
});


test("coordinator timeout without a worker packet remains a score-neutral coverage outcome", () => {
  const input = bundle(); delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_budget_exhausted");
  assert.ok(audit.rows.every(row => row.status === "not_assessed" || (row.status === "incomplete" && row.limitation?.group === "preferences")));
  input.cmpPreferenceLaneOutcome.limitationCode = "preference_worker_failed";
  assert.equal(deriveCmpAuditAssessment(input)!.support.reason, "preference_worker_failed");
});


test("new document-bound checkpoints survive a later timeout; historical and drifted packets do not", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.status = "limited"; packet.limitations = ["preference_budget_exhausted"];
  packet.controlInventoryComplete = false;
  packet.action = { count: 1, intent: "options", label: "Manage options", opened: false };
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "first_layer" };
  const audit = deriveCmpAuditAssessment(input)!;
  for (const id of ["categories", "privacy_access", "cookie_information"]) assert.equal(audit.rows.find(row => row.id === id)?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "not_assessed");
  packet.checkpoints.documentToken = "wrong-loader";
  assert.equal(deriveCmpAuditAssessment(input), undefined);
  packet.checkpoints.documentToken = "loader-1";
  packet.limitations.push("preference_document_changed");
  assert.ok(deriveCmpAuditAssessment(input)!.rows.every(row => row.status === "not_assessed"));
});

test("complete configured declarations compare bounded globs to observed cookies without requiring an Accept click", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.declarationCoverage = { scope: "configured_services", configured: 1, resolved: 1, unresolved: 0, truncated: false };
  packet.declarationInventoryComplete = true;
  packet.declarations[0]!.name = "_ga_*";
  input.cookieEvents = [{ cookieName: "_ga_123" }] as any;
  let audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "not_observed");
  assert.equal(audit.rows.find(row => row.id === "declared_not_found")?.status, "not_assessed");
  input.cookieEvents.push({ cookieName: "other" } as any);
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")?.status, "review");
  packet.declarationInventoryComplete = false; packet.declarationCoverage.unresolved = 1;
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")?.status, "partially_assessed");
  packet.declarationInventoryComplete = true;
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(packet).success, false);
});

test("v2 narrow facts stay informational, source-bound and neutral when proof is missing", () => {
  const b = bundle();
  b.runtimeCoverage = { coverageStatus: "usable" } as any;
  b.startedAt = "2026-10-14T00:00:00.000Z";
  b.cookieSnapshots = [{ capturedAtMs: 1000, consentStateAtTime: "pre_consent", cookies: [{ name: "_ga" }, { name: "borlabs-cookie", domain: "example.com", path: "/", expires: Date.parse(b.startedAt) / 1000 + 1 + 5184000 }] }] as any;
  b.postRefusalEvidence = { parentScanId: b.scanId, normalizedUrl: b.url, productionProjectable: true,
    refusalRegistration: { status: "confirmed" }, decisionEvidence: { basis: "verified_state", decision: "denied", observedAtMs: 1000, observedStateSha256: "a".repeat(64) },
    storage: { postAction: [{ storageType: "cookie", name: "borlabs-cookie", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 5184100, capturedAtEpochSeconds: 100 }] } } as any;
  const audit = deriveCmpAuditAssessment(b)!;
  assert.equal(audit.version, "cmp_audit_assessment.v6");
  for (const id of ["duration", "declared_not_found"]) assert.equal(audit.rows.find(row => row.id === id)?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "consent_record")?.status, "not_assessed", "A malformed legacy packet cannot prove a stored record");
  assert.equal(audit.rows.find(row => row.id === "duration")!.inventory!.expiries![0]!.remainingSeconds, 5184000);
  assert.match(audit.rows.find(row => row.id === "declared_not_found")!.detail, /1 of 1/);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projection = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projection.rows.find(row => row.id === "duration")!.label, "CMP cookie expiry");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  const legacy = { ...assessment, cmpAudit: { ...audit, version: "cmp_audit_assessment.v1" as const, rows: audit.rows.filter(row => row.id !== "implementation" && row.id !== "prominence").map(row => ({ ...row, inventory: row.inventory?.declarations ? { declarations: row.inventory.declarations.map(({ inferredPurpose, ...declaration }) => declaration) } : undefined })) } };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: legacy }).rows.find(row => row.id === "duration")!.label, "Duration of consent or rejection is appropriate");
  b.postRefusalEvidence!.decisionEvidence!.decision = "unknown";
  assert.equal(deriveCmpAuditAssessment(b)!.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  b.postRefusalEvidence!.parentScanId = "foreign";
  b.runtimeCoverage!.coverageStatus = "limited" as any;
  const limited = deriveCmpAuditAssessment(b)!;
  for (const id of ["consent_record", "duration", "declared_not_found"]) assert.equal(limited.rows.find(row => row.id === id)!.status, "not_assessed");
});

test("v4 privacy reachability is independent of document retrieval through canonical concern projection", () => {
  for (const mode of ["different_url", "timeout", "failed", "not_retrieved", "not_reachable"] as const) {
    const input = bundle();
    if (mode === "different_url") input.policySurfaceObservations![0]!.url = "https://example.com/de/privacy";
    if (mode === "timeout" || mode === "failed") Object.assign(input.policySurfaceObservations![0]!, { documentFetchState: "failed", documentEvaluationState: "not_attempted", fetchFailureReason: mode === "timeout" ? "timeout" : "network_error" });
    if (mode === "not_retrieved") input.policySurfaceObservations = [];
    if (mode === "not_reachable") input.cmpPreferencesEvidence!.privacyLinks[0]!.hitTargetBeforeAction = false;
    const audit = deriveCmpAuditAssessment(input)!;
    const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
    const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "privacy_access")!;
    assert.equal(row.status, mode === "not_reachable" ? "Not assessed" : "Observed");
    assert.match(row.detail!, mode === "not_reachable" ? /This saved scan did not record why/ : /unobstructed click target/);
    assert.ok(!row.deductionPoints);
  }
});

test("preference readiness timeout explains unassessed reachability even when the policy was retrieved", () => {
  const input = bundle();
  Object.assign(input.cmpPreferencesEvidence!, { status: "limited", limitations: ["preference_budget_exhausted"], controls: [], privacyLinks: [], controlInventoryComplete: false });
  const audit = deriveCmpAuditAssessment(input)!;
  assert.match(audit.rows.find(row => row.id === "privacy_access")!.detail, /timed out before pre-choice privacy-link reachability/);
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /timed out before individual-service/);
});

test("v3 identifies configured services through retained source accounting, persistence and concern policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.controlInventoryComplete = false;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.serviceNames = Array.from({ length: 11 }, (_, index) => `Named service ${index + 1}`);
  packet.declarationCoverage = { scope: "configured_services", configured: 11, resolved: 11, unresolved: 0, truncated: false };
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "services")!;
  assert.equal(audit.version, "cmp_audit_assessment.v6");
  assert.equal(row.status, "observed");
  assert.match(row.detail, /11 services identified/);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const persisted = withCanonicalConsentAssessmentSnapshot({}, assessment);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: persisted, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "services")!;
  assert.equal(projected.label, "Individual services identified in the CMP");
  assert.equal(projected.status, "Observed");
  assert.equal(projected.detail, row.detail);
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "services")!.status, "Not assessed");
  const legacy = { ...assessment, cmpAudit: { ...audit, version: "cmp_audit_assessment.v2" as const, rows: audit.rows.filter(row => row.id !== "implementation" && row.id !== "prominence").map(row => ({ ...row, inventory: row.inventory?.declarations ? { declarations: row.inventory.declarations.map(({ inferredPurpose, ...declaration }) => declaration) } : undefined })) } };
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: legacy }).rows.find(row => row.id === "services")!.label, "Individual service checkboxes or toggles observed");
  assert.equal(legacy.cmpAudit.version, "cmp_audit_assessment.v2");
});

test("service identification cannot be inferred from cookie declarations, categories or incomplete accounting", () => {
  for (const mode of ["no_accounting", "unresolved", "truncated", "mismatched_counts", "empty", "no_checkpoint", "failed", "unbound"] as const) {
    const input = bundle(), packet = input.cmpPreferencesEvidence!;
    packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
    packet.declarationCoverage = { scope: "configured_services", configured: 11, resolved: 11, unresolved: 0, truncated: false };
    const coverage = packet.declarationCoverage;
    if (mode === "no_accounting") delete packet.declarationCoverage;
    if (mode === "unresolved") coverage.unresolved = 1;
    if (mode === "truncated") coverage.truncated = true;
    if (mode === "mismatched_counts") coverage.resolved = 10;
    if (mode === "empty") coverage.configured = coverage.resolved = 0;
    if (mode === "no_checkpoint") packet.checkpoints.declarations = false;
    if (mode === "failed") packet.status = "failed";
    if (mode === "unbound") packet.limitations.push("preference_document_changed");
    const row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!;
    assert.equal(row.status, "not_assessed", mode);
  }
});

test("retained service identities survive unrelated timeout; labelled service controls also identify services", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.status = "limited";
  packet.limitations = ["preference_budget_exhausted"];
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: false, declarations: true, controls: false, controlsSurface: "preferences" };
  packet.declarationCoverage = { scope: "configured_services", configured: 1, resolved: 1, unresolved: 0, truncated: false };
  packet.serviceNames = ["Named service"];
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!.status, "observed");
  delete packet.declarationCoverage;
  packet.status = "completed";
  packet.controls = [{ label: "Example Analytics", kind: "service", enabled: false, checked: true }];
  const row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!;
  assert.equal(row.status, "observed");
  assert.match(row.detail, /1 individual service was identified/);
  assert.match(row.detail, /functionality was not tested/);
});

function choicePacket(action: "accept" | "reject") {
  const shared = { artifactOnly: true, productionProjectable: true, scanId: `scan-${action}`, parentScanId: "scan-1",
    targetUrl: "https://example.com/", normalizedUrl: "https://example.com/", phase: "post_action", consentAction: action,
    startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:02.000Z",
    resolver: { found: true, method: "cmp_registry_recipe", confidence: 1, recipeId: `fixture-${action}`, cmpId: "fixture" },
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v1", action, observedAtMs: 95,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text", actionSemantics: "direct_label",
      classifierIntent: action, classifierConfidence: 1, matchedLocale: "en", matchStrength: "direct", classifierReasonCodes: [],
      cmpId: "fixture", recipeId: `fixture-${action}`, selectorHint: `#${action}`, visible: true, enabled: true, uniquelyActionable: true },
    observationWindowMs: 500, timing: { dispatchDelayMs: 0, navigationMs: 40, resolverMs: 10, confirmationMs: 20,
      observationMs: 500, observationExitReason: "window_elapsed", observationEndedAtMs: 620, totalMs: 650, readyAtMs: 650 },
    observations: [], cancellation: { requested: false, outcome: "not_requested" }, limitations: [] };
  const registration = { status: "confirmed", actionDispatchedAtMs: 100, witnesses: [{ witnessType: "cmp_storage_state", observedAtMs: 120,
    key: "fixture", expectedState: action === "accept" ? "granted" : "denied", observedStateHash: "a".repeat(64), corroboratingOnly: false }] };
  return action === "accept" ? postAcceptEvidencePacketSchema.parse({ ...shared, artifactVersion: "certscore.post_accept_evidence.v1", observationBranch: "accept_only",
    acceptanceRegistration: { ...registration, acceptanceExercised: true, acceptanceRegisteredAtMs: 120 },
    network: { requests: [], postAcceptNonEssentialRequests: [], activeRequestIdsAtAcceptanceRegistration: [] },
    storage: { preAction: [], postAction: [], writesAfterAccept: [], itemsCreatedOrChangedAfterAccept: [] } })
    : postRefusalEvidencePacketSchema.parse({ ...shared, artifactVersion: "certscore.post_refusal_evidence.v1", observationBranch: "reject_only",
    refusalRegistration: { ...registration, refusalExercised: true, refusalRegisteredAtMs: 120 },
    network: { requests: [], postRefusalNonEssentialRequests: [], activeRequestIdsAtRefusalRegistration: [] },
    storage: { preActionCapturedAtMs: 90, postActionCapturedAtMs: 620, preAction: [], postAction: [], writesAfterRefusal: [], nonEssentialItemsPersistingAfterRefusal: [] } });
}

test("v4 partial action coverage persists through concern policy; review still takes precedence", () => {
  const input = bundle();
  input.postAcceptEvidence = postAcceptEvidencePacketSchema.parse(choicePacket("accept"));
  const project = (review = false) => {
    const audit = deriveCmpAuditAssessment(input)!;
    const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
    const artifacts = withCanonicalConsentAssessmentSnapshot({}, assessment);
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [] });
    assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
    return projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns,
      checklistRows: review ? [{ id: "post_reject_tracking_reduction", evidenceState: "observed", status: "Review signal",
        assessmentStatus: "review_signal", note: "Eligible activity after Reject." } as any] : [] }).rows.find(row => row.id === "implementation")!;
  };
  assert.equal(project().label, "Activity after Accept / Reject");
  assert.equal(project().status, "Partially assessed");
  assert.match(project().detail!, /Accept: 0.5-second activity check completed/);
  assert.equal(project(true).status, "Review recommended");
  input.postRefusalEvidence = postRefusalEvidencePacketSchema.parse(choicePacket("reject"));
  assert.equal(project().status, "Observed");
  assert.match(project().detail!, /Reject: 0.5-second activity check completed/);
  assert.equal(project(true).status, "Review recommended");
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  assert.equal(project().status, "Observed", "independent action coverage does not require preference success");
});

test("missing completion, malformed, foreign and unconfirmed actions do not create partial coverage", () => {
  for (const mode of ["incomplete", "foreign", "wrong_url", "no_proof", "no_witness", "unprojectable"] as const) {
    const input = bundle();
    const packet = postAcceptEvidencePacketSchema.parse(choicePacket("accept"));
    if (mode === "incomplete") delete packet.timing.observationExitReason;
    if (mode === "foreign") packet.parentScanId = "foreign";
    if (mode === "wrong_url") packet.normalizedUrl = "https://other.example/";
    if (mode === "no_proof") delete packet.actionControlProof;
    if (mode === "no_witness") packet.acceptanceRegistration.witnesses = [];
    if (mode === "unprojectable") packet.productionProjectable = false;
    input.postAcceptEvidence = packet;
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "implementation")!.status, "not_assessed", mode);
  }
});

test("cookie omission review matches exact names and globs without claiming missing services or pre-consent use", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.declarationInventoryComplete = true;
  packet.declarations = ["_ga_*", "_pk_id.*.*", "borlabs-cookie"].map(name => ({ name, purpose: "", duration: "", source: "cmp_api_inventory" }));
  const accept = choicePacket("accept") as NonNullable<CanonicalEvidenceBundle["postAcceptEvidence"]>;
  accept.storage.postAction = ["_ga_123", "_pk_id.1.abc", "borlabs-cookie", "borlabs-cookie-gcs", "hubspotutk"].map(name => ({ storageType: "cookie", name, nonEssential: false, identityHash: "a".repeat(64), valueHash: "b".repeat(64) }));
  input.postAcceptEvidence = accept;
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "review");
  assert.match(row.detail, /2 observed cookie names did not match 3 retained CMP declaration patterns/);
  assert.deepEqual(row.cookieComparison?.unmatchedNames, ["borlabs-cookie-gcs", "hubspotutk"]);
  assert.equal(row.cookieComparison?.allUnmatchedOnlyAfterAccept, true);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const report = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  const displayed = report.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(displayed.label, "Unmatched cookie names");
  assert.equal(displayed.status, "Review recommended");
  assert.equal(displayed.detail, row.detail);
  assert.deepEqual(displayed.supportingEvidence?.cookieComparison, row.cookieComparison);
  const altered = structuredClone(concerns);
  altered.find(c => c.originKey === "consent.cmp_audit.found_not_declared")!.evidenceBundle.rawEvidence!.cmpAuditRow = { ...row, cookieComparison: { ...row.cookieComparison!, unmatchedNames: ["invented", "hubspotutk"] } };
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: altered }).rows.find(r => r.id === "found_not_declared")?.supportingEvidence, undefined);
  assert.equal(consentControlAssessmentSchema.safeParse({ ...assessment, cmpAudit: { ...audit, rows: audit.rows.map(r => r.id === "found_not_declared" ? { ...r, cookieComparison: { ...r.cookieComparison!, unmatchedNameCount: 0 } } : r) } }).success, false);

  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  accept.storage.postAction = Array.from({ length: 100 }, (_, i) => ({ storageType: "cookie", name: `cookie_${i}_${"x".repeat(130)}`, nonEssential: false, identityHash: "a".repeat(64), valueHash: "b".repeat(64) }));
  const bounded = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!;
  assert.ok(bounded.detail.length <= 500);
  assert.equal(bounded.cookieComparison?.unmatchedNames.length, 3);
  assert.equal(bounded.cookieComparison?.unmatchedNameCount, 100);
});

test("inventory tables preserve canonical names, wildcard matches and capture scope through policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  packet.serviceNames = ["Google Analytics", "Consent preferences"];
  packet.declarationCoverage = { scope: "configured_services", configured: 2, resolved: 2, unresolved: 0, truncated: false };
  packet.declarations = [
    { name: "_ga_*", purpose: "Audience measurement", duration: "2 years", source: "cmp_api_inventory" },
    { name: "consent", purpose: "Preferences", duration: "60 days", source: "cmp_api_inventory" },
  ];
  packet.declarationInventoryComplete = true;
  input.cookieEvents = [{ cookieName: "_ga_123" }, { cookieName: "unexpected" }] as any;
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  assert.deepEqual(input, before, "retained source is never rewritten");
  assert.deepEqual(audit.rows.find(row => row.id === "services")!.inventory!.services!.map(row => row.name), packet.serviceNames);
  assert.deepEqual(audit.rows.find(row => row.id === "cookie_information")!.inventory!.declarations!.map(({ inferredPurpose, ...row }) => row), packet.declarations);
  const comparison = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(comparison.status, "review");
  assert.deepEqual(comparison.inventory!.cookies, [
    { name: "_ga_123", matchedPattern: "_ga_*", observedIn: ["before_choice"] },
    { name: "unexpected", matchedPattern: null, observedIn: ["before_choice"] },
  ]);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.deepEqual(projected.rows.find(row => row.id === "found_not_declared")!.supportingEvidence!.inventory, comparison.inventory);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "services")!.supportingEvidence, undefined);
  const corrupted = structuredClone(concerns);
  const raw = corrupted.find(row => row.originKey === "consent.cmp_audit.services")!.evidenceBundle.rawEvidence as any;
  raw.cmpAuditRow.inventory.services[0].name = "Wrong retained name";
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "services")!.supportingEvidence, undefined);
  packet.status = "limited"; packet.checkpoints!.declarations = false; packet.checkpoints!.controls = false;
  const limited = deriveCmpAuditAssessment(input);
  assert.ok(!limited || limited.rows.every(row => !row.inventory), "unverified sub-observations cannot populate tables");
});

test("category table retains selectable controls and captured settings through canonical policy", () => {
  const input = bundle();
  input.cmpPreferencesEvidence!.controls = [
    { label: "Essential", kind: "category", enabled: false, checked: true },
    { label: "Statistics", kind: "category", enabled: true, checked: false },
    { label: "Marketing", kind: "category", enabled: true, checked: true },
    { label: "External media", kind: "category", enabled: true, checked: null },
  ];
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  const expected = [{ name: "Statistics", checked: false }, { name: "Marketing", checked: true }, { name: "External media", checked: null }];
  assert.deepEqual(audit.rows.find(row => row.id === "categories")!.inventory!.categories, expected);
  assert.deepEqual(input, before);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "categories")!;
  assert.equal(row.status, "Observed");
  assert.equal(row.detail, "3 categories were available.");
  assert.deepEqual(row.supportingEvidence!.inventory!.categories, expected);
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment }).rows.find(row => row.id === "categories")!.supportingEvidence, undefined);
  const corrupted = structuredClone(concerns);
  (corrupted.find(row => row.originKey === "consent.cmp_audit.categories")!.evidenceBundle.rawEvidence!.cmpAuditRow as any).inventory.categories[0].checked = true;
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "categories")!.supportingEvidence, undefined);
  delete assessment.cmpAudit!.rows.find(row => row.id === "categories")!.inventory;
  const legacyConcerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const historical = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: legacyConcerns }).rows.find(row => row.id === "categories")!;
  assert.match(historical.detail!, /Statistics; Marketing; External media/);
  assert.equal(historical.supportingEvidence, undefined);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
});

test("expiry tables preserve timestamp precision through policy without claiming original storage life", () => {
  const input = bundle();
  input.postRefusalEvidence = completedUnconfirmedPacket("reject") as any;
  input.postRefusalEvidence!.storage.postAction = [{ storageType: "cookie", name: "borlabs-cookie", hostname: "example.com", nonEssential: false, identityBasis: "cookie_name_domain_path_partition", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 1797130216, capturedAtEpochSeconds: 1791946219.865 }];
  const before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  const expected = { visit: "Reject", name: "borlabs-cookie", capturedAtEpochSeconds: 1791946219.865, expiresAtEpochSeconds: 1797130216, remainingSeconds: 1797130216 - 1791946219.865 };
  const duration = audit.rows.find(row => row.id === "duration")!;
  assert.equal(duration.status, "observed"); assert.match(duration.detail, /CMP cookie expiry was captured/);
  assert.deepEqual(duration.inventory!.expiries, [expected]); assert.deepEqual(input, before);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "duration")!;
  assert.equal(row.status, "Observed");
  assert.equal(row.detail, "CMP cookie expiry was captured. Time remaining is shown below.");
  assert.deepEqual(row.supportingEvidence!.inventory!.expiries, [expected]);
  const corrupted = structuredClone(concerns);
  const expiry = (corrupted.find(row => row.originKey === "consent.cmp_audit.duration")!.evidenceBundle.rawEvidence!.cmpAuditRow as any).inventory.expiries[0];
  expiry.expiresAtEpochSeconds += 1; expiry.remainingSeconds += 1;
  assert.equal(projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: corrupted }).rows.find(row => row.id === "duration")!.supportingEvidence, undefined);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", limitationCode: "preference_budget_exhausted", startedAt: "2026-10-13T00:00:00.000Z", completedAt: "2026-10-13T00:00:17.000Z" };
  assert.deepEqual(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory!.expiries, [expected], "independent expiry survives preference failure");
  for (const mutate of [
    () => { input.postRefusalEvidence!.parentScanId = "foreign"; },
    () => { input.postRefusalEvidence!.afterActionCapture!.stopReason = "aborted"; },
    () => { Reflect.deleteProperty(input.postRefusalEvidence!.storage.postAction[0]!, "valueHash"); },
    () => { delete input.postRefusalEvidence!.storage.postAction[0]!.capturedAtEpochSeconds; },
    () => { input.postRefusalEvidence!.storage.postAction[0]!.expiresAtEpochSeconds = -1; },
    () => { input.postRefusalEvidence!.storage.postAction[0]!.expiresAtEpochSeconds = 10; },
  ]) {
    input.postRefusalEvidence = structuredClone(before.postRefusalEvidence); mutate();
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
  }
});


test("expiry evidence rejects inconsistent arithmetic and nonpersistent timestamps", () => {
  const valid = { visit: "Accept", name: "borlabs-cookie", capturedAtEpochSeconds: 100, expiresAtEpochSeconds: 5184100, remainingSeconds: 5184000 };
  assert.equal(cmpCookieExpiryEvidenceSchema.safeParse(valid).success, true);
  for (const change of [{ remainingSeconds: 60 }, { expiresAtEpochSeconds: -1 }, { capturedAtEpochSeconds: NaN }, { expiresAtEpochSeconds: 10 }, { cookieValue: "private" }]) {
    assert.equal(cmpCookieExpiryEvidenceSchema.safeParse({ ...valid, ...change }).success, false);
  }
});

test("preference binding diagnostics do not promote a limited IKEA-style pre-click packet", () => {
  const input=bundle(),packet=input.cmpPreferencesEvidence!;
  Object.assign(packet,{status:"limited",support:{state:"partial",provider:"OneTrust",recipeVersion:"onetrust_preferences.v2",reason:"preference_surface_missing"},
    action:{count:0,intent:"options",label:null,opened:false},controls:[],privacyLinks:[],declarations:[],controlInventoryComplete:false,declarationInventoryComplete:false,
    limitations:["preference_surface_missing"],inspectionDiagnostic:{revision:"cmp_preferences.v2",budgetMs:17000,phase:"surface_binding",
      surfaceBinding:{version:"cmp_surface_binding.v1",mode:"registered_existing",priorMatches:0,priorVisible:false,outcome:"missing"}}});
  const before=structuredClone(input);
  const audit=deriveCmpAuditAssessment(input)!;
  assert.ok(audit.rows.every(row=>["not_assessed", "incomplete"].includes(row.status)));
  assert.equal(audit.support.reason,"preference_surface_missing");
  assert.deepEqual(input,before);
  packet.inspectionDiagnostic!.surfaceBinding!.outcome="opened";
  assert.ok(deriveCmpAuditAssessment(input)!.rows.every(row=>["not_assessed", "incomplete"].includes(row.status)),"Diagnostics cannot substitute for retained controls or opening proof");
});

test("operation timeout keeps its specific cause and does not create missing-feature findings", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "limited", controls: [], declarations: [], privacyLinks: [], controlInventoryComplete: false,
    action: { count: 0, intent: "options", label: null, opened: false }, limitations: ["preference_operation_timed_out"],
    support: { state: "partial", provider: "OneTrust", recipeVersion: "onetrust_preferences.v2", reason: "preference_operation_timed_out" } });
  const original = structuredClone(packet);
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.support.reason, "preference_operation_timed_out");
  for (const id of ["categories", "services", "privacy_access", "cookie_information"]) {
    const row = audit.rows.find(row => row.id === id)!;
    assert.equal(row.status, "incomplete");
    assert.equal(row.limitation?.code, "preference_operation_timed_out");
  }
  assert.deepEqual(packet, original);
  assert.ok(audit.rows.every(row => !["feature_not_supported", "not_observed", "review"].includes(row.status)));
});

test("v5 baseline CMP expiry survives preference/action failure with exact identity, timing and source hash", () => {
  const input = bundle();
  input.cookieSnapshots = [{ artifactId: "cookies-before", capturedAtMs: 1500, consentStateAtTime: "pre_consent", evidenceRefs: [],
    cookieNames: ["OptanonConsent"], cookies: [{ name: "OptanonConsent", domain: ".example.com", path: "/", expires: Date.parse(input.startedAt) / 1000 + 86400 }] }];
  delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: input.startedAt, completedAt: "2026-10-13T00:00:17.000Z", limitationCode: "preference_budget_exhausted" };
  const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "duration")!;
  assert.equal(row.status, "observed");
  assert.deepEqual(row.inventory!.expiries![0], { visit: "Before choice", name: "OptanonConsent", domain: ".example.com", path: "/",
    capturedAtEpochSeconds: Date.parse(input.startedAt) / 1000 + 1.5, expiresAtEpochSeconds: Date.parse(input.startedAt) / 1000 + 86400, remainingSeconds: 86398.5 });
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed", "Cookie presence cannot confirm a choice");
  assert.deepEqual(input, before);
  input.startedAt = "2026-10-13T00:00:01.000Z";
  assert.notEqual(deriveCmpAuditAssessment(input)!.sourceSha256, audit.sourceSha256, "Capture arithmetic participates in provenance");
  for (const change of [{ domain: ".foreign.test" }, { name: "_ga" }, { expires: -1 }, { expires: NaN }, { path: "bad" }, { expires: 10 }]) {
    Object.assign(input, structuredClone(before)); Object.assign(input.cookieSnapshots![0]!.cookies[0]!, change);
    assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
  }
  Object.assign(input, structuredClone(before)); input.runtimeCoverage!.coverageStatus = "limited_partial";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "duration")!.inventory, undefined);
});

test("CMP expiry follows the verified final runtime document, never a foreign or unbound redirect",()=>{
  const input=bundle();input.completedAt="2026-10-13T00:00:10.000Z";
  input.cookieSnapshots=[{capturedAtMs:1500,consentStateAtTime:"pre_consent",cookies:[{name:"OptanonConsent",domain:".redirected.test",path:"/",expires:Date.parse(input.startedAt)/1000+86400}],
    captureCoverage:{version:"bound_cookie_snapshot.v1",scope:"browser_context_point_in_time",targetUrl:input.url,documentUrl:"https://www.redirected.test/",documentBindingPolicy:"passive_final_document.v1",documentToken:"final-loader",startedAtMs:1400,completedAtMs:1500,status:"completed"}}] as CanonicalEvidenceBundle["cookieSnapshots"];
  input.runtimeMetadataSnapshots=[{url:"https://www.redirected.test/",capturedAtMs:1500,consentStateAtTime:"pre_consent",documentIdentity:{source:"cdp_loader_id",token:"final-loader"}}] as CanonicalEvidenceBundle["runtimeMetadataSnapshots"];
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(r=>r.id==="duration")!.status,"observed");
  for(const mutate of [
    (b:typeof input)=>{b.runtimeMetadataSnapshots![0]!.documentIdentity!.token="other";},
    (b:typeof input)=>{b.cookieSnapshots![0]!.captureCoverage!.targetUrl="https://foreign.test/";},
    (b:typeof input)=>{delete b.cookieSnapshots![0]!.captureCoverage!.documentBindingPolicy;},
    (b:typeof input)=>{b.cookieSnapshots![0]!.captureCoverage!.completedAtMs=1501;},
    (b:typeof input)=>{b.cookieSnapshots![0]!.cookies[0]!.domain=".foreign.test";},
  ]){const invalid=structuredClone(input);mutate(invalid);assert.notEqual(deriveCmpAuditAssessment(invalid)!.rows.find(r=>r.id==="duration")!.status,"observed");}
});

test("v5 partial inventories retain named services, incomplete details and neutral matches through policy", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: packet.documentToken!, declarations: true, controls: true, controlsSurface: "preferences", privacyLinks: true };
  packet.declarationCoverage = { scope: "configured_services", configured: 3, resolved: 2, unresolved: 1, truncated: false };
  packet.serviceNames = ["Named Analytics", "Named Media"];
  packet.declarations = [{ name: "_ga_*", purpose: "Analytics", duration: "1 year", source: "cmp_api_inventory" }, { name: "media_id", purpose: "", duration: "", source: "cmp_api_inventory" }];
  input.cookieEvents = [{ cookieName: "_ga_123" }, { cookieName: "unknown_name" }] as any;
  const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "services")!.status, "observed");
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /2 services identified.*Additional services/);
  assert.equal(audit.rows.find(row => row.id === "cookie_information")!.status, "partially_assessed");
  assert.deepEqual(audit.rows.find(row => row.id === "cookie_information")!.inventory!.declarations!.map(({ inferredPurpose, ...row }) => row), packet.declarations);
  const comparison = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(comparison.status, "partially_assessed");
  assert.equal(comparison.cookieComparison!.declarationInventoryComplete, false);
  assert.equal(comparison.inventory!.cookies![0]!.matchedPattern, "_ga_*");
  assert.equal(comparison.inventory!.cookies![1]!.matchedPattern, null);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: withCanonicalConsentAssessmentSnapshot({}, assessment), reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.version, "cmp_audit_report.v3");
  assert.equal(projected.rows.find(row => row.id === "found_not_declared")!.status, "Partially assessed");
  assert.deepEqual(projected.rows.find(row => row.id === "found_not_declared")!.supportingEvidence!.inventory, comparison.inventory);
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  assert.deepEqual(input, before);
  packet.checkpoints.declarations = false; packet.status = "limited";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!.inventory, undefined);
  packet.checkpoints.declarations = true; packet.declarationInventoryComplete = true; packet.declarationCoverage.unresolved = 0; packet.declarationCoverage.configured = 2;
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!.status, "review", "A verified complete inventory keeps genuine Review results");
});

function completedUnconfirmedPacket(action: "accept" | "reject") {
  const packet: any = structuredClone(choicePacket(action));
  const registration = action === "accept" ? "acceptanceRegistration" : "refusalRegistration";
  packet[registration] = { status: "unconfirmed", reason: "decision_not_verified", actionDispatchedAtMs: 100, witnesses: [],
    ...(action === "accept" ? { acceptanceExercised: false } : { refusalExercised: false }) };
  packet.productionProjectable = false; packet.decisionEvidence = { policyVersion: "semantic_consent_registration.v2", decision: "unknown", basis: "unverified" };
  packet.captureCoverage = { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 };
  packet.interactionDiagnostics = { resolver: { snapshots: [], truncated: false },
    navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
    click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false } };
  packet.storage.postActionCapturedAtMs = 600;
  packet.timing.observationEndedAtMs = 600;
  packet.afterActionCapture = { policyVersion: "bounded_after_action_capture.v2", action, activationStatus: "completed", actionDispatchedAtMs: 100,
    captureEndedAtMs: 600, requestedWindowMs: 500, stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
    storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: [], requestAncestry: [] };
  return action === "accept" ? postAcceptEvidencePacketSchema.parse(packet) : postRefusalEvidencePacketSchema.parse(packet);
}

test("v5 completed after-click capture is assessable without claiming registered consent", () => {
  const input = bundle(); input.postAcceptEvidence = completedUnconfirmedPacket("accept") as any;
  const direct = projectPostAcceptEvidenceForReport({ packet: input.postAcceptEvidence!, packetSha256: createHash("sha256").update(JSON.stringify(input.postAcceptEvidence)).digest("hex") });
  assert.equal(direct.execution?.status, "succeeded");
  assert.equal(direct.afterActionCapture?.activationStatus, "completed");
  assert.equal(direct.interactionDiagnostics?.click.outcome, "completed");
  let audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "implementation")!.status, "partially_assessed");
  assert.match(audit.rows.find(row => row.id === "implementation")!.detail, /Accept: 0.5-second activity check completed/);
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  input.postRefusalEvidence = completedUnconfirmedPacket("reject") as any;
  audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "implementation")!.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  assert.equal(input.postRefusalEvidence!.productionProjectable, false);
  for (const change of [{ storageSnapshotRetained: false }, { stopReason: "aborted" }, { requestsDropped: 1 }, { activationStatus: "uncertain", stopReason: "click_uncertain" }]) {
    const altered = structuredClone(input); delete altered.postAcceptEvidence;
    Object.assign(altered.postRefusalEvidence!.afterActionCapture!, change);
    assert.equal(deriveCmpAuditAssessment(altered)!.rows.find(row => row.id === "implementation")!.status, "not_assessed");
  }
  const foreign = structuredClone(input); delete foreign.postAcceptEvidence; foreign.postRefusalEvidence!.normalizedUrl = "https://foreign.test/";
  assert.equal(deriveCmpAuditAssessment(foreign)!.rows.find(row => row.id === "implementation")!.status, "not_assessed");
});

test("v5 paired-image limitations require verified source and loader binding, independently of other available images", async () => {
  const { consentVisualFixture } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const { geometry } = await consentVisualFixture();
  const input = bundle();
  geometry.pageUrl = input.url; geometry.candidates.forEach(candidate => { candidate.frameContext.frameUrl = input.url; });
  input.startedAt = new Date(Date.parse(geometry.capturedAt) - 1000).toISOString();
  input.consentUiObservations = [{ documentUrl: input.url, documentIdentity: geometry.documentIdentity }] as CanonicalEvidenceBundle["consentUiObservations"];
  input.screenshots = [
    { artifactId: "selected", capturedAtMs: 1000, path: geometry.screenshotArtifactRef!, url: input.url, documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", retentionStatus: "withheld", displayStatus: "withheld", safetyFailureCode: "finalization_deadline_exceeded" },
    { artifactId: "other", path: "other.png", url: input.url, documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", retentionStatus: "available", displayStatus: "available" },
  ] as CanonicalEvidenceBundle["screenshots"];
  const original = structuredClone({ input, geometry });
  const row = deriveCmpAuditAssessment(input, geometry as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!;
  assert.equal(row.status, "incomplete");
  assert.deepEqual(row.limitation, { group: "visual", code: "finalization_deadline_exceeded" });
  assert.deepEqual({ input, geometry }, original);
  for (const mutate of [
    (g: typeof geometry) => { g.documentIdentity!.token = "other-loader"; },
    (g: typeof geometry) => { g.sourceScanner = "foreign" as typeof g.sourceScanner; },
    (g: typeof geometry) => { g.controlInspection!.retainedCandidateCount++; },
    (g: typeof geometry) => { g.candidates[1]!.screenshotArtifactRef = "other.png"; },
    (g: typeof geometry) => { g.candidates[0]!.frameContext.frameUrl = "https://foreign.test/"; },
  ]) {
    const changed = structuredClone(geometry); mutate(changed);
    assert.equal(deriveCmpAuditAssessment(input, changed as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!.status, "not_assessed");
  }
  input.screenshots[0]!.retentionStatus = "available"; input.screenshots[0]!.displayStatus = "available";
  assert.equal(deriveCmpAuditAssessment(input, geometry as unknown as Record<string, unknown>)!.rows.find(row => row.id === "prominence")!.limitation!.code, "visual_measurement_unavailable");
});

test("scanner adapter absence stays separate from failed inspection and CMP feature absence", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "unsupported", support: { state: "unsupported", provider: "Unknown CMP", recipeVersion: null, reason: "adapter_not_available" }, controls: [], declarations: [], privacyLinks: [], controlInventoryComplete: false });
  const rows = deriveCmpAuditAssessment(input)!.rows;
  assert.ok(rows.every(row => row.status === "not_assessed"));
  assert.ok(rows.every(row => !row.limitation));
});

test("v3 basic checkpoints retain verified page facts when CMP readiness cannot complete", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "limited", action: { count: 0, intent: "options", label: null, opened: false },
    support: { state: "partial", provider: "OneTrust", recipeVersion: "bounded_cmp_preferences.v1", reason: "preference_readiness_incomplete" },
    controlInventoryComplete: false, declarationInventoryComplete: false,
    declarations: [{ name: "_ga", purpose: "", duration: "1 day", source: "cmp_api_inventory" }],
    checkpoints: { version: "cmp_partial_capture.v1", documentToken: packet.documentToken, privacyLinks: true, declarations: true, controls: true, controlsSurface: "first_layer" },
    inspectionDiagnostic: { revision: "cmp_preferences.v3", budgetMs: 3600, basicCaptureReserveMs: 1000, phase: "control_inventory",
      configuration: { version: "onetrust_loaded_configuration.v1", status: "available", groupCount: 1, retainedCookieCount: 1, truncated: false } },
    limitations: ["preference_readiness_incomplete"],
  });
  const audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: withCanonicalConsentAssessmentSnapshot({}, assessment), reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.rows.find(row => row.id === "categories")!.status, "Observed");
  assert.equal(projected.rows.find(row => row.id === "categories")!.detail, "1 category was available.");
  assert.equal(projected.rows.find(row => row.id === "privacy_access")!.status, "Observed");
  assert.equal(projected.rows.find(row => row.id === "cookie_information")!.status, "Partially assessed");
  assert.equal(projected.rows.find(row => row.id === "services")!.status, "Not assessed");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
});

test("passive Cookiebot loaded declarations use canonical assessment and concerns without Options or scoring", () => {
  const input=bundle();delete input.cmpPreferencesEvidence;delete input.cmpPreferenceLaneOutcome;
  input.completedAt="2026-10-13T00:00:02.000Z";
  input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:"pre_consent",documentIdentity:{token:"passive-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v2",sourceLane:"consent_proof",scanId:input.scanId,targetUrl:input.url,documentUrl:input.url,documentToken:"passive-loader",capturedAtMs:100,provider:"Cookiebot",controls:[],privacyLinks:[],serviceNames:[],
    loadedInventoryBinding:{version:"cookiebot_passive_loaded_inventory.v1",rootSelector:"#CybotCookiebotDialog",panelSelector:"#CybotCookiebotDialogTabContentDetails",documentToken:"passive-loader"},
    loadedInventory:{version:"cookiebot_loaded_declarations.v1",records:[{name:"_ga",purpose:"Analytics",duration:"2 years",storageType:"cookie",provider:"Google",sourceRef:"provider:0/record:0"}],truncated:true,unresolvedRecords:1},
    declarations:[{name:"_ga",purpose:"Analytics",duration:"2 years",source:"cmp_loaded_inventory"}],
    captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:"passive-loader",declarationsAtMs:90},
    limitations:["passive_first_layer_only","declaration_inventory_not_complete","loaded_declarations_not_visibility_proof"]};
  input.cookieEvents=[{cookieName:"_ga"}] as CanonicalEvidenceBundle["cookieEvents"];
  const audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==='services')?.status,'observed');
  assert.match(audit.rows.find(row=>row.id==='services')!.detail,/already-loaded/);
  assert.equal(audit.rows.find(row=>row.id==='services')?.inventory?.services?.[0]?.source,'cmp_loaded_inventory');
  assert.equal(audit.rows.find(row=>row.id==='cookie_information')?.status,'observed');
  assert.notEqual(audit.rows.find(row=>row.id==='categories')?.status,'observed');
  assert.equal(audit.rows.find(row=>row.id==='found_not_declared')?.status,'partially_assessed');
  assert.equal(audit.rows.find(row=>row.id==='found_not_declared')?.cookieComparison?.declarationInventoryComplete,false);
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
  const projected=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(projected.rows.find(row=>row.id==='services')?.status,'Observed');
  assert.ok(concerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));
  for(const patch of [{contractVersion:'certscore.cmp-basic-evidence.v1'},{documentToken:'foreign'},{provider:'OneTrust'}]){
    const bad=structuredClone(input);Object.assign(bad.cmpBasicEvidence!,patch);assert.equal(deriveCmpAuditAssessment(bad),undefined);
  }
});

test("required-lane basics survive a cancelled optional inspection through persisted concern projection", () => {
  const input = bundle(); delete input.cmpPreferencesEvidence;
  input.cmpPreferenceLaneOutcome = { status: "limited", startedAt: input.startedAt, completedAt: "2026-10-13T00:00:12.000Z", limitationCode: "preference_inspection_cancelled" };
  input.completedAt = "2026-10-13T00:00:12.000Z";
  input.domSnapshots = [{ url: input.url, capturedAtMs: 100, consentStateAtTime: "pre_consent", documentIdentity: { token: "basic-loader" } }] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence = {
    contractVersion: "certscore.cmp-basic-evidence.v1", sourceLane: "consent_proof", scanId: input.scanId, targetUrl: input.url,
    documentUrl: input.url, documentToken: "basic-loader", capturedAtMs: 100,
    provider: "Borlabs Cookie", controls: [{ label: "Analytics", kind: "category", checked: false, enabled: true }],
    privacyLinks: [{ url: `${input.url}privacy`, hitTargetBeforeAction: true }],
    declarations: [{ name: "_ga", purpose: "Analytics", duration: "2 years", source: "cmp_api_inventory" }],
    serviceNames: ["Google Analytics"], limitations: ["passive_first_layer_only", "declaration_inventory_not_complete"],
  };
  input.cookieEvents = [{ cookieName: "_ga" }, { cookieName: "unmatched" }] as CanonicalEvidenceBundle["cookieEvents"];
  const audit = deriveCmpAuditAssessment(input)!;
  for (const id of ["categories", "services", "privacy_access", "cookie_information"]) {
    const row = audit.rows.find(row => row.id === id)!;
    assert.equal(row.status, "observed", id); assert.equal(row.limitation, undefined); assert.ok(row.evidenceRefs.includes("CanonicalEvidenceBundle.json#cmpBasicEvidence"));
  }
  const configured=structuredClone(input);
  configured.cmpBasicEvidence!.provider="OneTrust";configured.cmpBasicEvidence!.controls=[];
  configured.cmpBasicEvidence!.configuredCategories=["Analytics"];
  configured.cmpBasicEvidence!.captureProgress={version:"cmp_capture_checkpoints.v1",documentToken:"basic-loader",controlsAtMs:100,declarationsAtMs:100,privacyLinksAtMs:100};
  const category=deriveCmpAuditAssessment(configured)!.rows.find(row=>row.id==="categories")!;
  assert.equal(category.status,"partially_assessed");assert.match(category.detail,/controls were not verified/);
  assert.deepEqual(category.inventory?.categories,[{name:"Analytics",checked:null}]);
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "partially_assessed");
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.cookieComparison?.declarationInventoryComplete, false);
  const redirected=structuredClone(input);
  redirected.cmpBasicEvidence!.documentBindingPolicy="passive_final_document.v1";
  redirected.cmpBasicEvidence!.documentUrl="https://redirected.example/";
  redirected.domSnapshots[0]!.url="https://redirected.example/";
  assert.equal(deriveCmpAuditAssessment(redirected)?.rows.find(row=>row.id==="services")?.status,"observed",
    "Verified passive facts follow the retained final loader while the scan target remains original");
  delete redirected.cmpBasicEvidence!.documentBindingPolicy;
  redirected.cmpBasicEvidence!.captureProgress={version:"cmp_capture_checkpoints.v1",documentToken:"basic-loader",controlsAtMs:100,declarationsAtMs:100,privacyLinksAtMs:100};
  assert.equal(deriveCmpAuditAssessment(redirected)?.rows.find(row=>row.id==="services")?.status,"incomplete",
    "Historical exact-target packets cannot silently borrow redirected proof");
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.rows.find(row => row.id === "services")?.status, "Observed");
  const historical = structuredClone(input); delete historical.cmpBasicEvidence;
  assert.equal(deriveCmpAuditAssessment(historical)?.rows.find(row => row.id === "services")?.status, "incomplete");
  for (const patch of [{scanId:"foreign"}, {documentToken:"old-loader"}, {targetUrl:"https://foreign.example/"}, {sourceLane:"runtime_evidence"}, {capturedAtMs:13000}]) {
    const drifted = structuredClone(input); Object.assign(drifted.cmpBasicEvidence!, patch);
    assert.equal(deriveCmpAuditAssessment(drifted)?.rows.find(row => row.id === "services")?.status, "incomplete");
  }
  const stale = structuredClone(input); stale.domSnapshots.push({...stale.domSnapshots[0]!,capturedAtMs:200,documentIdentity:{source:"cdp_loader_id",token:"later-loader"}});
  assert.equal(deriveCmpAuditAssessment(stale)?.rows.find(row=>row.id==="services")?.status,"incomplete");
  const recovery = structuredClone(input);
  Object.assign(recovery.domSnapshots[0]!, {artifactId:"dom_text_pre_consent",path:"primary.txt"});
  recovery.consentUiObservations = [{documentUrl:input.url,documentIdentity:{source:"cdp_loader_id",token:"basic-loader"},
    evidenceRefs:[{artifactId:"dom_text_pre_consent",refId:"dom_text_pre_consent",path:"primary.txt"}]}] as CanonicalEvidenceBundle["consentUiObservations"];
  recovery.domSnapshots.push({...recovery.domSnapshots[0]!,artifactId:"dom_text_pre_consent_recovery",path:"recovery.txt",capturedAtMs:200,documentIdentity:undefined});
  assert.equal(deriveCmpAuditAssessment(recovery)?.rows.find(row=>row.id==="services")?.status,"observed",
    "Unselected independent recovery diagnostics cannot invalidate the canonical primary session");
  for (const mutate of [
    (b:typeof recovery)=>{b.consentUiObservations=[];},
    (b:typeof recovery)=>{b.consentUiObservations[0]!.documentIdentity!.token="recovery-loader";},
    (b:typeof recovery)=>{b.consentUiObservations[0]!.evidenceRefs.push({artifactId:"dom_text_pre_consent_recovery",refId:"recovery",path:"recovery.txt"});},
    (b:typeof recovery)=>{b.domSnapshots[1]!.artifactId="dom_text_pre_consent";},
    (b:typeof recovery)=>{b.domSnapshots[0]!.path="unbound.txt";},
  ]) {
    const unbound = structuredClone(recovery); mutate(unbound);
    assert.equal(deriveCmpAuditAssessment(unbound)?.rows.find(row=>row.id==="services")?.status,"incomplete");
  }
  const deeper = bundle(); Object.assign(deeper, {completedAt:input.completedAt,domSnapshots:input.domSnapshots, cmpBasicEvidence:input.cmpBasicEvidence});
  assert.deepEqual(deriveCmpAuditAssessment(deeper)?.rows.find(row => row.id === "categories")?.inventory,
    {categories:[{name:"Analytics",checked:false}]});
});

test("passive Consentmanager table follows persisted assessment and canonical CMP projection without claiming complete inventory", () => {
  const input = bundle(); delete input.cmpPreferencesEvidence; delete input.cmpPreferenceLaneOutcome;
  input.completedAt = "2026-10-13T00:00:02.000Z";
  input.domSnapshots = [{url: input.url, capturedAtMs: 100, consentStateAtTime: "pre_consent", documentIdentity: {token: "passive-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence = {contractVersion: "certscore.cmp-basic-evidence.v3", sourceLane: "consent_proof", scanId: input.scanId, targetUrl: input.url, documentUrl: input.url, documentToken: "passive-loader", capturedAtMs: 100, provider: "Consentmanager", controls: [], privacyLinks: [], serviceNames: [],
    loadedInventoryBinding: {version: "consentmanager_passive_loaded_inventory.v1", rootSelector: "#cmpbox", panelSelector: ".cmpcookiesdescrbox table.cmpcookietbl", documentToken: "passive-loader"},
    loadedInventory: {version: "consentmanager_loaded_declarations.v1", records: [{name: "_ga", purpose: "Analytics", duration: "1 year", storageType: "cookie", provider: "Example Analytics", sourceRef: "provider:0/record:0"}], truncated: false, unresolvedRecords: 0},
    declarations: [{name: "_ga", purpose: "Analytics", duration: "1 year", source: "cmp_loaded_inventory"}],
    captureProgress: {version: "cmp_capture_checkpoints.v1", documentToken: "passive-loader", declarationsAtMs: 90},
    limitations: ["passive_first_layer_only", "declaration_inventory_not_complete", "loaded_declarations_not_visibility_proof"]};
  input.cookieEvents = [{cookieName: "_ga"}, {cookieName: "unlisted"}] as CanonicalEvidenceBundle["cookieEvents"];
  const original = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  assert.deepEqual(input, original);
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "observed");
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /already-loaded declaration table/);
  assert.equal(audit.rows.find(row => row.id === "cookie_information")?.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.status, "partially_assessed");
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")?.cookieComparison?.declarationInventoryComplete, false);
  const assessment = consentControlAssessmentSchema.parse({...observedControlAssessment, cmpAudit: audit});
  // Persistence is a typed JSON round trip, without reconstructing raw facts.
  const persisted = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment)));
  assert.deepEqual(persisted.cmpAudit, JSON.parse(JSON.stringify(audit)));
  const concerns = buildNormalizedConcerns({runtimeArtifacts: {consentControlAssessment: persisted}, reviewFindingCandidates: [], validationFindings: []});
  const projected = projectCmpAudit({scanId: input.scanId, consentControlAssessment: persisted, normalizedConcerns: concerns});
  assert.equal(projected.rows.find(row => row.id === "services")?.status, "Observed");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  for (const patch of [{documentToken: "stale"}, {provider: "Cookiebot"}, {contractVersion: "certscore.cmp-basic-evidence.v2"}]) {
    const bad = structuredClone(input); Object.assign(bad.cmpBasicEvidence!, patch);
    assert.equal(deriveCmpAuditAssessment(bad), undefined);
  }
});

test("passive Didomi configured services follow canonical persistence, concern policy and checklist without inventing cookies or controls", () => {
  const input = bundle(); delete input.cmpPreferencesEvidence; delete input.cmpPreferenceLaneOutcome;
  input.completedAt = "2026-10-13T00:00:02.000Z";
  input.domSnapshots = [{url: input.url, capturedAtMs: 100, consentStateAtTime: "pre_consent", documentIdentity: {token: "passive-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence = {contractVersion: "certscore.cmp-basic-evidence.v4", sourceLane: "consent_proof", scanId: input.scanId, targetUrl: input.url, documentUrl: input.url, documentToken: "passive-loader", capturedAtMs: 100, provider: "Didomi", controls: [], privacyLinks: [], serviceNames: ["Example Analytics"], declarations: [],
    sdkServiceInventory: {version: "didomi_required_vendors.v1", getter: "Didomi.getRequiredVendors", readiness: "already_ready_callback", rootSelector: "#didomi-host", noticeSelector: ".didomi-notice-banner, .didomi-notice-popup, #didomi-notice", documentToken: "passive-loader", sourceRecordCount: 1, inspectedRecordCount: 1, unresolvedRecordCount: 0, truncated: false, records: [{id: "c:analytics", name: "Example Analytics"}]},
    captureProgress: {version: "cmp_capture_checkpoints.v1", documentToken: "passive-loader", declarationsAtMs: 90},
    limitations: ["passive_first_layer_only", "declaration_inventory_not_complete", "loaded_configuration_not_visibility_proof", "service_inventory_not_complete"]};
  const original = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  assert.deepEqual(input, original);
  assert.equal(audit.rows.find(row => row.id === "services")?.status, "observed");
  assert.match(audit.rows.find(row => row.id === "services")!.detail, /already-loaded configuration/);
  assert.equal(audit.rows.find(row => row.id === "services")?.inventory?.services?.[0]?.sourceRef, "didomi_required_vendors.v1/record:0");
  for (const id of ["categories", "cookie_information", "declared_not_found", "found_not_declared"]) assert.equal(audit.rows.find(row => row.id === id)?.status, "not_assessed");
  const assessment = consentControlAssessmentSchema.parse({...observedControlAssessment, cmpAudit: audit});
  const persisted = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment)));
  assert.deepEqual(persisted.cmpAudit, JSON.parse(JSON.stringify(audit)));
  const concerns = buildNormalizedConcerns({runtimeArtifacts: {consentControlAssessment: persisted}, reviewFindingCandidates: [], validationFindings: []});
  const projected = projectCmpAudit({scanId: input.scanId, consentControlAssessment: persisted, normalizedConcerns: concerns});
  assert.equal(projected.rows.find(row => row.id === "services")?.status, "Observed");
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  for (const patch of [{documentToken: "stale"}, {provider: "OneTrust"}, {contractVersion: "certscore.cmp-basic-evidence.v1"}]) {
    const bad = structuredClone(input); Object.assign(bad.cmpBasicEvidence!, patch); assert.equal(deriveCmpAuditAssessment(bad), undefined);
  }
  const missingNames = structuredClone(input); missingNames.cmpBasicEvidence!.serviceNames = [];
  assert.equal(deriveCmpAuditAssessment(missingNames), undefined);
});

test("v6 retains v1 after-click facts and hashed consent storage without upgrading registration", () => {
  const input = bundle();
  const packet = completedUnconfirmedPacket("accept") as NonNullable<CanonicalEvidenceBundle["postAcceptEvidence"]>;
  packet.afterActionCapture!.policyVersion = "bounded_after_action_capture.v1";
  delete packet.afterActionCapture!.requestAncestry;
  const cookie = { storageType: "cookie" as const, name: "OptanonConsent", hostname: "example.com", identityBasis: "cookie_name_domain_path_partition" as const,
    identityHash: "a".repeat(64), valueHash: "b".repeat(64), nonEssential: false };
  packet.storage.preAction = [cookie];
  packet.storage.postAction = [{ ...cookie, valueHash: "c".repeat(64) }];
  input.postAcceptEvidence = packet;
  const original = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  const stored = audit.rows.find(row => row.id === "consent_record")!;
  assert.equal(stored.status, "observed");
  assert.deepEqual(stored.inventory!.consentStorage, [{ visit: "Accept", name: "OptanonConsent", change: "updated" }]);
  assert.equal(audit.rows.find(row => row.id === "implementation")!.inventory!.choiceActivity![0]!.requestCount, 0);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: withCanonicalConsentAssessmentSnapshot({}, assessment), reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(projected.version, "cmp_audit_report.v3");
  assert.equal(projected.rows.find(row => row.id === "consent_record")!.label, "Consent storage observed");
  assert.equal(projected.rows.find(row => row.id === "consent_record")!.status, "Observed");
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
  assert.deepEqual(input, original);
  const unchanged = structuredClone(input); unchanged.postAcceptEvidence!.storage.postAction[0]!.valueHash = cookie.valueHash;
  assert.equal(deriveCmpAuditAssessment(unchanged)!.rows.find(row => row.id === "consent_record")!.inventory!.consentStorage![0]!.change, "stored");
  for (const change of [{ parentScanId: "other-scan" }, { cancellation: { requested: true, outcome: "aborted" } }]) {
    const altered = structuredClone(input); Object.assign(altered.postAcceptEvidence!, change);
    assert.equal(deriveCmpAuditAssessment(altered)!.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  }
});

test("v6 inferred purposes remain separate from missing CMP disclosures and never establish services", () => {
  const input = bundle();
  input.cmpPreferencesEvidence!.declarations = [
    { name: "_ga", purpose: "", duration: "", source: "cmp_api_inventory" },
    { name: "OptanonConsent", purpose: "", duration: "", source: "cmp_api_inventory" },
    { name: "custom_cookie", purpose: "", duration: "Session", source: "cmp_api_inventory" },
  ];
  const audit = deriveCmpAuditAssessment(input)!;
  const detail = audit.rows.find(row => row.id === "cookie_information")!;
  assert.equal(detail.status, "partially_assessed");
  assert.match(detail.detail, /3 cookie names captured; 0 purposes and 1 storage duration retained/);
  assert.equal(detail.inventory!.declarations![0]!.inferredPurpose!.category, "analytics");
  assert.equal(detail.inventory!.declarations![1]!.inferredPurpose!.category, "consent_management");
  assert.equal(detail.inventory!.declarations![2]!.inferredPurpose, undefined);
  assert.ok(detail.inventory!.declarations!.every(row => row.purpose === ""));
  assert.equal(audit.rows.find(row => row.id === "services")!.status, "not_assessed");
  const { inferredPurpose } = detail.inventory!.declarations![0]!;
  assert.deepEqual(inferredPurpose, { category: "analytics", basis: "canonical_cookie_registry.v1" });
});

test("v6 CMP tables preserve shared first-layer reportability for an independent action", () => {
  const input = bundle(); input.postAcceptEvidence = completedUnconfirmedPacket("accept") as any;
  const audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({ ...structuredClone(observedControlAssessment), cmpAudit: audit });
  assessment.controls.accept.state = "unknown"; assessment.assessmentStatus = "limited";
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const result = projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(audit.rows.find(row=>row.id==="implementation")!.inventory!.choiceActivity!.length,1,"Original evidence remains retained");
  assert.deepEqual(result.rows.find(row=>row.id==="implementation")!.supportingEvidence!.inventory!.choiceActivity,[]);
  assert.equal(assessment.controls.accept.state,"unknown");
});

test("OneTrust service names reach the canonical assessment and report from one bounded passive visit without Options opening", {timeout:15000}, async () => {
  const {createServer}=await import("node:http");
  const {runCmpPreferencesObserver}=await import("../../../../packages/certscore-scan-core/src/cmp-preferences-observer");
  const actions:string[]=[];
  const server=createServer((req,res)=>{
    if(req.url?.startsWith('/action/')){actions.push(req.url);res.end();return;}
    res.setHeader('content-type','text/html');
    res.end(`<section id="onetrust-banner-sdk"><p id="onetrust-policy-text">For this, we use unique identifiers like your IP address and share your data with 2 partners (Vimeo, Google).</p><button aria-controls="prefs" onclick="fetch('/action/options');document.getElementById('prefs').hidden=false">Cookie settings</button><button onclick="fetch('/action/accept')">Accept all</button><button onclick="fetch('/action/reject')">Reject all</button></section><section id="prefs" hidden><label><input type="checkbox">Analytics</label><button onclick="fetch('/action/save')">Save</button></section><script>
      window.OneTrust={GetDomainData:()=>({GeneralVendors:[{VendorCustomId:'V1',Name:'Named Media'}],Groups:[{CustomGroupId:'C2',GroupName:'Analytics',GeneralVendorsIds:['V1'],VendorServices:[{CustomVendorServiceId:'S1',ServiceName:'Named Analytics'}],Hosts:[{HostId:'H1',DisplayName:'metrics.example.test',HostName:'metrics.example.test'}],FirstPartyCookies:[{Name:'_ga',Description:'Audience measurement',Lifespan:'2 years'}]}]})};
    </script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  try{
    const input=bundle(); input.url=`http://127.0.0.1:${address.port}/`;
    const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:input.scanId,exactTargetUrl:input.url}});
    assert.equal(packet.status,'completed',JSON.stringify(packet));
    assert.deepEqual(packet.serviceNames,['Named Analytics','Named Media']);
    assert.equal(packet.declarationInventoryComplete,false);
    assert.equal(packet.declarationCoverage!.unresolved,1,'A bare host stays unresolved rather than becoming a named service');
    input.cmpPreferencesEvidence=packet;
    const audit=deriveCmpAuditAssessment(input)!;
    const service=audit.rows.find(row=>row.id==='services')!;
    assert.equal(service.status,'observed');
    assert.deepEqual(service.inventory!.services!.map(row=>row.name),['Named Analytics','Named Media','Vimeo','Google']);
    const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
    const artifacts=withPersistedFirstLayerConsentEvidence({consentControlAssessment:assessment},{consent_control_assessment:assessment})!;
    const concerns=buildNormalizedConcerns({runtimeArtifacts:artifacts,reviewFindingCandidates:[],validationFindings:[]});
    const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
    assert.equal(report.rows.find(row=>row.id==='services')!.status,'Observed');
    assert.deepEqual(report.rows.find(row=>row.id==='services')!.supportingEvidence!.inventory!.services,service.inventory!.services);
    assert.ok(concerns.filter(row=>row.originKey.startsWith('consent.cmp_audit.')).every(row=>!row.scoreEffects?.length));
    assert.deepEqual(actions,[]);
    const foreign=structuredClone(input);foreign.cmpPreferencesEvidence!.finalUrl='https://foreign.test/';
    assert.equal(deriveCmpAuditAssessment(foreign),undefined,"A foreign document cannot supply service evidence");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("literal CMP partner identities are assessed without manufacturing configured inventory or tested controls", async () => {
  const {parseNamedCmpPartnerDisclosure}=await import("@certscore/contracts");
  const input=bundle(), packet=input.cmpPreferencesEvidence!;
  packet.serviceNames=[];
  packet.serviceDisclosures=[parseNamedCmpPartnerDisclosure("and share your data with 2 partners (Vimeo, Google)")!];
  packet.declarationCoverage={scope:"configured_services",configured:0,resolved:0,unresolved:0,truncated:false};
  const before=structuredClone(input);
  const audit=deriveCmpAuditAssessment(input)!;
  const service=audit.rows.find(row=>row.id==="services")!;
  assert.equal(service.status,"observed");
  assert.deepEqual(service.inventory!.services,[{name:"Vimeo",source:"cmp_named_disclosure"},{name:"Google",source:"cmp_named_disclosure"}]);
  assert.match(service.detail,/not a complete service inventory/);
  assert.match(service.detail,/controls were not tested/);
  assert.deepEqual(input,before);
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const artifacts=withPersistedFirstLayerConsentEvidence({consentControlAssessment:assessment},{consent_control_assessment:assessment})!;
  const concerns=buildNormalizedConcerns({runtimeArtifacts:artifacts,reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.deepEqual(report.rows.find(row=>row.id==="services")!.supportingEvidence!.inventory!.services,service.inventory!.services);
  assert.ok(concerns.filter(row=>row.originKey.startsWith("consent.cmp_audit.")).every(row=>!row.scoreEffects?.length));
  input.cmpPreferencesEvidence!.documentToken=null;
  assert.notEqual(deriveCmpAuditAssessment(input)?.rows.find(row=>row.id==="services")?.status,"observed");
});

function partialCookieCaptureFixture() {
  const input = bundle();
  input.cmpPreferencesEvidence!.declarations = ["_ga", "_ga_xxxxxxxxxx"].map(name => ({ name, purpose: "", duration: "", source: "cmp_api_inventory" }));
  input.cookieEvents = [{ cookieName: "baseline" }] as any;
  const packet = completedUnconfirmedPacket("accept") as NonNullable<CanonicalEvidenceBundle["postAcceptEvidence"]>;
  packet.storage.postAction = ["_ga", "_ga_S4EX53B760", "other"].map((name, i) => ({ storageType: "cookie", name, nonEssential: false,
    identityBasis: "cookie_name_domain_path_partition", identityHash: String(i + 1).repeat(64), valueHash: "a".repeat(64), expiresAtEpochSeconds: 34560100, capturedAtEpochSeconds: 100 }));
  input.postAcceptEvidence = postAcceptEvidencePacketSchema.parse(packet);
  return input;
}

test("partial cookie comparison adds completed click snapshots without changing confirmation, Review eligibility or CMP retention", () => {
  const input = partialCookieCaptureFixture(), before = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!, row = audit.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "partially_assessed");
  assert.equal(row.cookieComparison!.observedCookieNameCount, 4);
  assert.equal(row.cookieComparison!.unmatchedNameCount, 3, "Possible templates remain unverified matches");
  assert.equal(row.cookieComparison!.possibleTemplateNameCount, 1);
  const candidate = row.inventory!.cookies!.find(cookie => cookie.name === "_ga_S4EX53B760")!;
  assert.equal(candidate.matchedPattern, null);
  assert.deepEqual(candidate.possibleTemplateMatch, { pattern: "_ga_xxxxxxxxxx", basis: "ga4_placeholder.v1" });
  assert.equal(candidate.observedExpiry!.remainingSeconds, 34560000);
  const details = audit.rows.find(row => row.id === "cookie_information")!;
  assert.equal(details.status, "partially_assessed");
  assert.equal(details.inventory!.declarations![0]!.duration, "");
  assert.equal(details.inventory!.declarations![0]!.observedExpiry!.remainingSeconds, 34560000);
  assert.equal(details.inventory!.declarations![1]!.observedExpiry, undefined, "Template does not borrow a runtime cookie's expiry");
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const report = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.deepEqual(report.rows.find(row => row.id === "found_not_declared")!.supportingEvidence!.inventory, row.inventory);
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  assert.deepEqual(input, before);
  input.cmpPreferencesEvidence!.declarationInventoryComplete = true;
  const complete = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(complete.cookieComparison!.observedCookieNameCount, 1, "Unconfirmed click facts do not broaden complete-inventory Review eligibility");
  assert.deepEqual(complete.cookieComparison!.unmatchedNames, ["baseline"]);
});

test("cookie enrichments reject incomplete/foreign captures and ambiguous or invalid expiry while preserving partial assessments", () => {
  for (const mode of ["incomplete", "foreign", "ambiguous", "expiry"] as const) {
    const input = partialCookieCaptureFixture();
    if (mode === "incomplete") input.postAcceptEvidence!.afterActionCapture!.stopReason = "aborted";
    if (mode === "foreign") input.postAcceptEvidence!.parentScanId = "foreign";
    if (mode === "ambiguous") input.postAcceptEvidence!.storage.postAction.push({ ...input.postAcceptEvidence!.storage.postAction[0]!, identityHash: "f".repeat(64) });
    if (mode === "expiry") input.postAcceptEvidence!.storage.postAction[0]!.expiresAtEpochSeconds = 50;
    const audit = deriveCmpAuditAssessment(input)!;
    const cookie = audit.rows.find(row => row.id === "cookie_information")!.inventory!.declarations![0]!;
    assert.equal(cookie.observedExpiry, undefined, mode);
    const comparison = audit.rows.find(row => row.id === "found_not_declared")!;
    assert.equal(comparison.status, "partially_assessed");
    if (["incomplete", "foreign"].includes(mode)) assert.equal(comparison.cookieComparison!.observedCookieNameCount, 1, mode);
  }
});

test("shared reportability withholds after-Accept cookie details without discarding the retained assessment", () => {
  const input = partialCookieCaptureFixture(), audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({ ...structuredClone(observedControlAssessment), cmpAudit: audit });
  assessment.controls.accept.state = "unknown"; assessment.assessmentStatus = "limited";
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const report = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  const row = report.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "Partially assessed");
  assert.equal(row.supportingEvidence!.cookieComparison, undefined);
  assert.deepEqual(row.supportingEvidence!.inventory!.cookies!.map(cookie => cookie.name), ["baseline"]);
  assert.ok(report.rows.find(row => row.id === "cookie_information")!.supportingEvidence!.inventory!.declarations!.every(cookie => !cookie.observedExpiry));
  assert.equal(audit.rows.find(row => row.id === "found_not_declared")!.inventory!.cookies!.length, 4);
});

test("template counts preserve full captured totals while table rows remain bounded", () => {
  const input = bundle();
  input.cmpPreferencesEvidence!.declarations = [{ name: "_ga_xxxxxxxxxx", purpose: "", duration: "", source: "cmp_api_inventory" }];
  input.cookieEvents = Array.from({ length: 101 }, (_, i) => ({ cookieName: `_ga_${String(i).padStart(10, "0")}` })) as any;
  const row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "partially_assessed");
  assert.equal(row.cookieComparison!.possibleTemplateNameCount, 101);
  assert.equal(row.cookieComparison!.unmatchedNameCount, 101);
  assert.equal(row.inventory!.cookies!.length, 100);
});

test("unnamed and overlong action cookies retain source identity and explicit comparison accounting", () => {
  const input = partialCookieCaptureFixture();
  input.postAcceptEvidence!.artifactVersion = "certscore.post_accept_evidence.v2";
  input.postAcceptEvidence!.storage.postAction.push(...["", "x".repeat(180)].map(name => ({
    storageType: "cookie" as const, name, hostname: "example.com", identityBasis: "cookie_name_domain_path_partition" as const, identityHash: "c".repeat(64), valueHash: "d".repeat(64), nonEssential: false,
  })));
  input.postAcceptEvidence = postAcceptEvidencePacketSchema.parse(input.postAcceptEvidence);
  const before = structuredClone(input), row = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(row.status, "partially_assessed");
  assert.equal(row.cookieComparison!.observedCookieNameCount, 4);
  assert.equal(row.cookieComparison!.omittedAfterAcceptCookieCount, 2);
  assert.match(row.detail, /2 after-click cookie entries had no comparable saved name/);
  assert.deepEqual(input, before, "The original unnamed/long snapshot evidence is not filtered or renamed");
});


test("completed storage snapshots survive network overflow without claiming complete activity or registered consent", () => {
  for (const action of ["accept", "reject"] as const) {
    const input = bundle(), packet = completedUnconfirmedPacket(action);
    packet.storage.postAction = [{ storageType: "cookie", name: "osano_consentmanager", hostname: "example.com", nonEssential: false, identityBasis: "cookie_name_domain_path_partition", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 5184100, capturedAtEpochSeconds: 100 }];
    packet.afterActionCapture!.requestsDropped = 149;
    packet.captureCoverage!.requestsDroppedAfterAction = 149;
    if (action === "accept") input.postAcceptEvidence = packet as any; else input.postRefusalEvidence = packet as any;
    const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
    assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "observed");
    assert.equal(audit.rows.find(row => row.id === "duration")!.status, "observed");
    assert.equal(audit.rows.find(row => row.id === "implementation")!.status, "not_assessed");
    assert.equal(packet.productionProjectable, false);
    assert.deepEqual(input, before);
    for (const mutate of [
      (p: any) => { p.afterActionCapture.storageSnapshotRetained = false; },
      (p: any) => { p.afterActionCapture.stopReason = "aborted"; },
      (p: any) => { p.afterActionCapture.captureEndedAtMs = 200; },
      (p: any) => { p.interactionDiagnostics.click.outcome = "failed"; },
      (p: any) => { p.parentScanId = "foreign"; },
      (p: any) => { p.normalizedUrl = "https://foreign.test/"; },
      (p: any) => { p.cancellation = { requested: true, reason: "coordinator_terminal" }; },
    ]) {
      const altered = structuredClone(input), changed = action === "accept" ? altered.postAcceptEvidence! : altered.postRefusalEvidence!;
      mutate(changed);
      const rows = deriveCmpAuditAssessment(altered)!.rows;
      assert.equal(rows.find(row => row.id === "consent_record")!.status, "not_assessed");
      assert.equal(rows.find(row => row.id === "duration")!.status, "not_assessed");
    }
  }
});

test("configured consent-cookie identities require typed provider/document binding and do not become global aliases", () => {
  const input = bundle();
  const packet = completedUnconfirmedPacket("reject");
  packet.storage.postAction = [{ storageType: "cookie", name: "cookie_compliance", hostname: "example.com", nonEssential: false, identityBasis: "cookie_name_domain_path_partition", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 5184100, capturedAtEpochSeconds: 100 }];
  input.postRefusalEvidence = packet as any;
  const evidence = input.cmpPreferencesEvidence!;
  evidence.support.provider = "Drupal EU Cookie Compliance module, non-TCF";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "consent_record")!.status, "not_assessed");
  evidence.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: true, controls: true, controlsSurface: "preferences" };
  evidence.configuredConsentCookies = [{ version: "cmp_configured_cookie_identity.v1", configurationPath: "drupalSettings.eu_cookie_compliance.cookie_name", name: "cookie_compliance" }];
  const before = structuredClone(input), audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "consent_record")!.status, "observed");
  assert.equal(audit.rows.find(row => row.id === "duration")!.status, "observed");
  assert.equal(packet.productionProjectable, false); assert.deepEqual(input, before);
  for (const change of [
    (p: typeof evidence) => { p.support.provider = "OneTrust"; },
    (p: typeof evidence) => { p.configuredConsentCookies![0]!.configurationPath = "other.cookie_name"; },
    (p: typeof evidence) => { p.documentToken = "foreign-loader"; },
    (p: typeof evidence) => { p.finalUrl = "https://foreign.test/"; },
    (p: typeof evidence) => { delete p.checkpoints; },
  ]) {
    input.cmpPreferencesEvidence = structuredClone(before.cmpPreferencesEvidence); change(input.cmpPreferencesEvidence!);
    const result = deriveCmpAuditAssessment(input);
    assert.ok(!result || result.rows.find(row => row.id === "consent_record")!.status !== "observed");
  }
});

test("shared action reportability filters expiry visits while preserving baseline expiry and retained proof", () => {
  const input = bundle();
  input.postRefusalEvidence = completedUnconfirmedPacket("reject") as any;
  input.postRefusalEvidence!.storage.postAction = [{ storageType: "cookie", name: "borlabs-cookie", hostname: "example.com", nonEssential: false, identityBasis: "cookie_name_domain_path_partition", identityHash: "a".repeat(64), valueHash: "b".repeat(64), expiresAtEpochSeconds: 5184100, capturedAtEpochSeconds: 100 }];
  input.cookieSnapshots = [{ capturedAtMs: 1000, consentStateAtTime: "pre_consent", cookies: [{ name: "borlabs-cookie", domain: "example.com", path: "/", expires: Date.parse(input.startedAt) / 1000 + 1 + 5184000 }] }] as any;
  const audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  assessment.controls.reject.state = "not_observed";
  const before = structuredClone(assessment);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const projected = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  const row = projected.rows.find(row => row.id === "duration")!;
  assert.deepEqual(row.supportingEvidence!.inventory!.expiries!.map(expiry => expiry.visit), ["Before choice"]);
  assert.equal(row.status, "Observed"); assert.doesNotMatch(row.detail!, /Reject/);
  assert.equal(audit.rows.find(row => row.id === "duration")!.inventory!.expiries!.length, 2);
  assert.deepEqual(assessment, before);
});

function failedChoicePacket(action: "accept" | "reject") {
  const packet: any=structuredClone(choicePacket(action));
  delete packet.actionControlProof;
  packet.productionProjectable=false;
  packet.decisionEvidence={policyVersion:"semantic_consent_registration.v2",decision:"unknown",basis:"unverified"};
  packet[action === "accept" ? "acceptanceRegistration" : "refusalRegistration"]={status:"not_attempted",witnesses:[],
    ...(action === "accept" ? {acceptanceExercised:false} : {refusalExercised:false}),
    reason:action === "accept" ? "deterministic_accept_control_click_failed" : "transparent_consent_scope_not_ready"};
  packet.interactionDiagnostics={resolver:{snapshots:[],truncated:false},navigation:{outcome:"completed",documentCommitted:true,finalUrlAuthorized:true},
    click:{outcome:action === "accept" ? "failed_before_dispatch" : "not_attempted",...(action === "accept" ? {failureClass:"actionability_timeout"} : {}),reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}};
  packet.storage.postAction=[];
  packet.timing.observationMs=0; delete packet.timing.observationEndedAtMs; delete packet.timing.observationExitReason;
  return action === "accept" ? postAcceptEvidencePacketSchema.parse(packet) : postRefusalEvidencePacketSchema.parse(packet);
}

test("joined workers with explicit failed clicks retain specific action limitations through shared CMP projection",()=>{
  const input=bundle();input.postAcceptEvidence=failedChoicePacket("accept") as any;input.postRefusalEvidence=failedChoicePacket("reject") as any;
  const original=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  for (const id of ["implementation","consent_record","duration"]) {
    const row=audit.rows.find(row=>row.id===id)!;
    assert.equal(row.status,"incomplete");assert.equal(row.limitation?.group,"actions");assert.equal(row.inventory,undefined);
  }
  const activity=audit.rows.find(row=>row.id==='implementation')!;
  assert.match(activity.detail,/Accept: the control did not become actionable/);
  assert.match(activity.detail,/Reject: the banner did not become ready/);
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:withCanonicalConsentAssessmentSnapshot({},assessment),reviewFindingCandidates:[],validationFindings:[]});
  assert.ok(concerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  const projected=report.rows.find(row=>row.id==='implementation')!;
  assert.equal(projected.status,'Incomplete');assert.equal(projected.detail,activity.detail);
  assert.ok(report.limitationGroups?.some(group=>group.criterionIds.includes('implementation') && group.criterionIds.includes('duration')));
  assert.deepEqual(input,original);
  input.postAcceptEvidence!.parentScanId="foreign";input.postRefusalEvidence!.parentScanId="foreign";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==='implementation')!.status,'not_assessed','Unbound failed packets cannot establish coverage conclusions');
  input.postAcceptEvidence=failedChoicePacket('accept') as any;delete input.postRefusalEvidence;
  input.postAcceptEvidence!.acceptanceRegistration.status='unsupported';
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==='implementation')!.status,'not_assessed','Unsupported integration remains distinct from a failed supported check');
});


test("privacy link diagnostics remain score-neutral and source-bound through canonical projection", () => {
  let priorHash = "";
  for (const outcome of ["outside_viewport", "not_rendered", "hidden", "transparent", "inactive", "pointer_disabled", "hit_target_missed", "inspection_incomplete"] as const) {
    const input = bundle();
    input.cmpPreferencesEvidence!.privacyLinks[0] = { url: "https://example.com/privacy", hitTargetBeforeAction: false, access: { version: "privacy_link_access.v1", outcome } };
    const audit = deriveCmpAuditAssessment(input)!;
    assert.notEqual(audit.sourceSha256, priorHash); priorHash = audit.sourceSha256;
    const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
    const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consentControlAssessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
    const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "privacy_access")!;
    assert.equal(row.status, "Not assessed");
    assert.equal(row.detail, audit.rows.find(row => row.id === "privacy_access")!.detail);
    assert.ok(!/banner|unsupported/i.test(row.detail!)); assert.ok(!row.deductionPoints);
    input.cmpPreferencesEvidence!.documentToken = "wrong-loader";
    input.cmpPreferencesEvidence!.status = "limited";
    input.cmpPreferencesEvidence!.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: true, declarations: false, controls: false, controlsSurface: "first_layer" };
    const rejected = deriveCmpAuditAssessment(input);
    assert.ok(!rejected || !rejected.rows.find(row => row.id === "privacy_access")!.detail.includes("Privacy policy found."));
  }
  const legacy = bundle(); legacy.cmpPreferencesEvidence!.privacyLinks[0]!.hitTargetBeforeAction = false;
  const before = JSON.stringify(legacy);
  assert.match(deriveCmpAuditAssessment(legacy)!.rows.find(row => row.id === "privacy_access")!.detail, /did not record why/);
  assert.equal(JSON.stringify(legacy), before);
});


test("typed Options failures explain dependent checks through policy without asserting unsupported CMP features",()=>{
 for(const access of ["hidden","disabled","outside_viewport","covered","unavailable","actionable","missing"] as const){
  const input=bundle(),packet=input.cmpPreferencesEvidence!;
  Object.assign(packet,{status:"limited",action:{count:0,intent:"options",label:null,opened:false},controls:[],declarations:[],controlInventoryComplete:false,declarationInventoryComplete:false,support:{...packet.support,reason:"unique_actionable_options_not_resolved"},limitations:["unique_actionable_options_not_resolved"],checkpoints:{version:"cmp_partial_capture.v1",documentToken:packet.documentToken,privacyLinks:true,controls:false,declarations:false,controlsSurface:"first_layer"}});
  const counts={actionable:0,hidden:0,disabled:0,outside_viewport:0,covered:0,unavailable:0};if(access!=="missing")counts[access]=access==="actionable"?2:1;
  packet.inspectionDiagnostic={revision:"cmp_preferences.v3",budgetMs:17000,phase:"control_inventory",optionsResolution:{version:"cmp_options_resolution.v1",counts,overflow:false}};
  const audit=deriveCmpAuditAssessment(input)!;
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
  const row=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns}).rows.find(row=>row.id==="categories")!;
  assert.equal(row.status,"Incomplete");assert.ok(!row.deductionPoints);assert.ok(!row.detail?.includes("unsupported"));
  assert.match(row.detail!,access==="missing"?/No Options/:access==="actionable"?/More than one/:access==="unavailable"?/did not complete/:access==="disabled"?/inactive/:access==="outside_viewport"?/outside the viewport/:new RegExp(access));
 }
});


test("document-bound occluded controls explain incomplete prominence without creating a styling finding",async()=>{
 const {consentVisualFixture}=await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
 const {geometry}=await consentVisualFixture();const input=bundle();
 geometry.pageUrl=input.url;geometry.candidates.forEach(candidate=>candidate.frameContext.frameUrl=input.url);
 const reject=geometry.candidates.find(c=>c.actionType==="reject_all")!;reject.decisionStatus="covered";reject.occlusion.center=false;
 geometry.controlInspection!.candidates=geometry.controlInspection!.candidates.filter(c=>c.candidateId!==reject.candidateId);
 input.startedAt=new Date(Date.parse(geometry.capturedAt)-1000).toISOString();
 input.consentUiObservations=[{documentUrl:input.url,documentIdentity:geometry.documentIdentity}] as CanonicalEvidenceBundle["consentUiObservations"];
 input.screenshots=[{artifactId:"paired",capturedAtMs:1000,path:geometry.screenshotArtifactRef!,url:input.url,documentIdentity:geometry.documentIdentity,consentStateAtTime:"pre_consent",retentionStatus:"available",displayStatus:"available"}] as CanonicalEvidenceBundle["screenshots"];
 const audit=deriveCmpAuditAssessment(input,geometry as unknown as Record<string,unknown>)!;
 const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
 const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:assessment},reviewFindingCandidates:[],validationFindings:[]});
 const row=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns}).rows.find(row=>row.id==="prominence")!;
 assert.equal(row.status,"Incomplete");assert.match(row.detail!,/covered/);assert.ok(!row.deductionPoints);
 const foreign=structuredClone(geometry);foreign.documentIdentity!.token="wrong-loader";
 assert.equal(deriveCmpAuditAssessment(input,foreign as unknown as Record<string,unknown>)!.rows.find(row=>row.id==="prominence")!.status,"not_assessed");
});

test("CookieYes structural categories survive canonical projection without completing an empty declaration inventory", () => {
  const input = bundle();
  const packet = input.cmpPreferencesEvidence!;
  packet.support = { state: "partial", provider: "CookieYes", recipeVersion: "cookieyes_preference_categories.v1", reason: "bounded_visible_preference_inspection" };
  packet.controls = ["Functional", "Analytics", "Advertisement", "Others"].map(name => ({ label: `Enable ${name}`, kind: "category", enabled: true, checked: false }));
  packet.controlInventoryComplete = false;
  packet.declarations = [];
  packet.declarationInventoryComplete = false;
  packet.limitations = ["deeper_preference_sections_not_opened"];
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "categories")?.status, "observed");
  for (const id of ["services", "cookie_information", "declared_not_found", "found_not_declared"])
    assert.equal(audit.rows.find(row => row.id === id)?.status, "not_assessed");
  assert.ok(!audit.rows.find(row => row.id === "services")!.detail.includes("Cookie names were retained"));
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const artifacts = withPersistedFirstLayerConsentEvidence({ consentControlAssessment: assessment }, { consent_control_assessment: assessment })!;
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: artifacts, reviewFindingCandidates: [], validationFindings: [] });
  const result = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(result.rows.find(row => row.id === "categories")?.status, "Observed");
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
});

test("access-denied preference evidence remains an explicit score-neutral limitation through projection", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  Object.assign(packet, { status: "limited", finalUrl: null, documentToken: null, controls: [], declarations: [], privacyLinks: [], controlInventoryComplete: false, declarationInventoryComplete: false,
    action: { count: 0, intent: "options", label: null, opened: false },
    support: { state: "unknown", provider: null, recipeVersion: null, reason: "preference_page_access_limited" },
    inspectionDiagnostic: { revision: "cmp_preferences.v4", budgetMs: 17000, phase: "navigation", navigationHttpStatus: 403 },
    limitations: ["preference_page_access_limited", "http_status_403"] });
  const audit = deriveCmpAuditAssessment(input)!;
  const row = audit.rows.find(row => row.id === "categories")!;
  assert.equal(row.status, "incomplete"); assert.match(row.detail, /HTTP 403/);
  assert.ok(audit.rows.every(row => !["not_observed", "feature_not_supported"].includes(row.status)));
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: { consent_control_assessment: assessment }, reviewFindingCandidates: [], validationFindings: [] });
  const result = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns });
  assert.equal(result.rows.find(row => row.id === "categories")?.status, "Incomplete");
  assert.match(result.rows.find(row => row.id === "categories")!.detail!, /HTTP 403/);
  assert.ok(concerns.filter(row => row.originKey.startsWith("consent.cmp_audit.")).every(row => !row.scoreEffects?.length));
});

test("scrolled privacy evidence remains factual, source-bound and score-neutral through canonical projection", () => {
  const input = bundle();
  input.cmpPreferencesEvidence!.privacyLinks = [{ url: 'https://example.com/privacy', hitTargetBeforeAction: true,
    access: {version:'privacy_link_access.v2',outcome:'reachable',scroll:{version:'privacy_link_scroll.v1',initialOutcome:'outside_viewport',beforeY:0,inspectedY:1800,restored:true}} }];
  const audit = deriveCmpAuditAssessment(input)!;
  const assessment = consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const artifacts=withPersistedFirstLayerConsentEvidence({consentControlAssessment:assessment},{consent_control_assessment:assessment})!;
  const concerns=buildNormalizedConcerns({runtimeArtifacts:artifacts,reviewFindingCandidates:[],validationFindings:[]});
  const result=projectCmpAudit({scanId:'scan-1',consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(result.rows.find(row=>row.id==='privacy_access')?.status,'Observed');
  assert.match(result.rows.find(row=>row.id==='privacy_access')!.detail!,/after scrolling/);
  assert.ok(concerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));
  const invalid=structuredClone(input.cmpPreferencesEvidence!);
  invalid.privacyLinks[0]!.access!.scroll!.restored=false;
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(invalid).success,false);
  invalid.privacyLinks[0]!.access!.version='privacy_link_access.v1';
  assert.equal(cmpPreferencesEvidenceSchema.safeParse(invalid).success,false);
});

test("complete Borlabs service accounting survives an explicitly incomplete cookie inventory without score effects", () => {
  const input = bundle(), packet = input.cmpPreferencesEvidence!;
  packet.support.provider = "Borlabs Cookie";
  packet.checkpoints = { version: "cmp_partial_capture.v1", documentToken: "loader-1", privacyLinks: false, declarations: true, controls: false, controlsSurface: "first_layer" };
  packet.serviceNames = Array.from({ length: 8 }, (_, i) => `Service ${i}`);
  packet.declarationCoverage = { scope: "configured_services", configured: 8, resolved: 8, unresolved: 0, truncated: false };
  packet.declarationInventoryComplete = false;
  packet.limitations.push("configured_cookie_inventory_incomplete");
  const original = structuredClone(input);
  const audit = deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row => row.id === "services")!.status, "observed");
  assert.notEqual(audit.rows.find(row => row.id === "found_not_declared")!.status, "observed_gap");
  assert.deepEqual(input, original);
  const assessment = consentControlAssessmentSchema.parse({ ...observedControlAssessment, cmpAudit: audit });
  const persisted = withCanonicalConsentAssessmentSnapshot({}, assessment);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: persisted, reviewFindingCandidates: [], validationFindings: [] });
  assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
  const row = projectCmpAudit({ scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns }).rows.find(row => row.id === "services")!;
  assert.equal(row.status, "Observed");
  packet.declarationCoverage.unresolved = 1;
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "services")!.status, "not_assessed", "historical inconsistent accounting stays unverified");
});

test("prominence explains missing evidence and retained deferral without inventing a visual observation", async () => {
  const input = bundle();
  const missing = deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "prominence")!;
  assert.equal(missing.status, "not_assessed");
  assert.match(missing.detail, /same-capture Accept\/Reject pair/);
  const { consentVisualFixture } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/consent-visual-comparison");
  const { geometry } = await consentVisualFixture();
  geometry.pageUrl = input.url; geometry.candidates.forEach(c => { c.frameContext.frameUrl = input.url; });
  input.startedAt = new Date(Date.parse(geometry.capturedAt) - 1000).toISOString();
  input.consentUiObservations = [{ documentUrl: input.url, documentIdentity: geometry.documentIdentity }] as any;
  input.screenshots = [{ artifactId: "selected", capturedAtMs: 1000, path: geometry.screenshotArtifactRef!, url: input.url, documentIdentity: geometry.documentIdentity, consentStateAtTime: "pre_consent", retentionStatus: "available", displayStatus: "available" }] as any;
  input.modulesRun = [{ moduleName: "preConsentRuntimeScanner", timingBreakdown: [{label: "consent pixel comparison", detail: JSON.stringify({ artifactId: "selected", status: "deferred" })}] }] as any;
  const row = deriveCmpAuditAssessment(input, geometry as any)!.rows.find(row => row.id === "prominence")!;
  assert.equal(row.status, "incomplete");
  assert.equal(row.limitation?.code, "pixel_comparison_deferred");
  assert.match(row.detail, /interim capture/);
  input.modulesRun[0]!.timingBreakdown![0]!.detail = JSON.stringify({ artifactId: "unrelated", status: "deferred" });
  assert.equal(deriveCmpAuditAssessment(input, geometry as any)!.rows.find(row => row.id === "prominence")!.limitation?.code, "visual_measurement_unavailable");
});

test("verified sibling-panel categories follow canonical assessment, persistence and policy without scoring", () => {
  for (const provider of ["Iubenda", "TrustArc"]) {
    const input = bundle(), packet = input.cmpPreferencesEvidence!;
    packet.support = {state: "partial", provider, recipeVersion: provider === "Iubenda" ? "iubenda_purpose_categories.v1" : "trustarc_radio_categories.v1", reason: "bounded_visible_preference_inspection"};
    packet.controls = [{label: provider === "Iubenda" ? "Measurement" : "Functional Cookies", kind: "category", enabled: true, checked: provider === "TrustArc" ? null : false}];
    packet.controlInventoryComplete = false;
    packet.limitations = ["deeper_preference_sections_not_opened"];
    packet.declarations = [];
    packet.inspectionDiagnostic = {revision: "cmp_preferences.v8", budgetMs: 17000, phase: "completed",
      surfaceBinding: {version: "cmp_surface_binding.v1", mode: "registered_portal", priorMatches: 0, priorVisible: false, outcome: "opened",
        verification: {version: "cmp_panel_verification.v1", result: "verified", role: "dialog"}}};
    const retained = structuredClone(input);
    input.cmpPreferencesEvidence = cmpPreferencesEvidenceSchema.parse(packet);
    const audit = deriveCmpAuditAssessment(input)!;
    const assessment = consentControlAssessmentSchema.parse({...observedControlAssessment, cmpAudit: audit});
    const persisted = withPersistedFirstLayerConsentEvidence({}, {consent_control_assessment: assessment})!;
    const concerns = buildNormalizedConcerns({runtimeArtifacts: persisted, reviewFindingCandidates: [], validationFindings: []});
    const report = projectCmpAudit({scanId: input.scanId, consentControlAssessment: assessment, normalizedConcerns: concerns});
    const category = report.rows.find(row => row.id === "categories")!;
    assert.equal(category.status, "Observed", provider);
    assert.equal(category.supportingEvidence?.inventory?.categories?.[0]?.checked, packet.controls[0]!.checked);
    assert.equal(report.rows.find(row => row.id === "services")?.status, "Not assessed");
    assert.equal(report.rows.find(row => row.id === "found_not_declared")?.status, "Not assessed");
    assert.ok(concerns.filter(c => c.originKey.startsWith("consent.cmp_audit.")).every(c => !c.scoreEffects?.length));
    assert.deepEqual(input, retained);
    input.cmpPreferencesEvidence!.limitations.push("preference_document_changed");
    assert.notEqual(deriveCmpAuditAssessment(input)!.rows.find(row => row.id === "categories")?.status, "observed");
  }
});


test("literal visible inventory reaches persisted concerns and public service evidence without inferring completeness or scoring", () => {
  const input=bundle(),packet=input.cmpPreferencesEvidence!;
  packet.inspectionDiagnostic={revision:"cmp_preferences.v9",budgetMs:17000,phase:"completed"};
  packet.checkpoints={version:"cmp_partial_capture.v1",documentToken:"loader-1",privacyLinks:true,declarations:true,controls:true,controlsSurface:"preferences"};
  packet.visibleInventory={version:"cmp_visible_inventory.v1",records:[{ref:"table:0/row:0",fields:[{column:"cookieName",label:"Cookie name",value:"_ga"},
    {column:"provider",label:"Provider",value:"Google Analytics"},{column:"purpose",label:"Purpose",value:"Audience measurement"},{column:"duration",label:"Duration",value:"1 day"}]}],truncated:true,unresolvedRecords:1};
  input.cmpPreferencesEvidence=cmpPreferencesEvidenceSchema.parse(packet);
  const original=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const persisted=withPersistedFirstLayerConsentEvidence({}, {consent_control_assessment:assessment})!;
  const concerns=buildNormalizedConcerns({runtimeArtifacts:persisted,reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(report.rows.find(row=>row.id==="services")?.status,"Observed");
  assert.deepEqual(report.rows.find(row=>row.id==="services")?.supportingEvidence?.inventory?.services,[{name:"Google Analytics",source:"cmp_visible_inventory",sourceRef:"table:0/row:0"}]);
  assert.equal(report.rows.find(row=>row.id==="cookie_information")?.status,"Observed");
  assert.notEqual(report.rows.find(row=>row.id==="found_not_declared")?.status,"Review recommended");
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,original);
  input.cmpPreferencesEvidence!.limitations.push("preference_document_changed");
  assert.notEqual(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==="services")?.status,"observed");
});


test("passive OneTrust cookie details project canonically without changing visibility or score", () => {
  const input=bundle();delete input.cmpPreferencesEvidence;delete input.cmpPreferenceLaneOutcome;
  input.completedAt="2026-10-13T00:00:02.000Z";
  input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:"pre_consent",documentIdentity:{token:"passive-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:input.scanId,
    targetUrl:input.url,documentUrl:input.url,documentToken:"passive-loader",capturedAtMs:100,provider:"OneTrust",controls:[],privacyLinks:[],serviceNames:[],
    declarations:[{name:"site_metric",purpose:"Audience measurement",duration:"1 year",source:"cmp_api_inventory"}],
    captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:"passive-loader",declarationsAtMs:90},
    limitations:["passive_first_layer_only","declaration_inventory_not_complete","onetrust_loaded_configuration.v4","loaded_configuration_not_visibility_proof"]};
  const before=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(row=>row.id==="cookie_information")?.status,"observed");
  assert.equal(audit.rows.find(row=>row.id==="categories")?.status,"not_assessed");
  assert.notEqual(audit.rows.find(row=>row.id==="found_not_declared")?.status,"observed");
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const persisted=withCanonicalConsentAssessmentSnapshot({},assessment);
  const concerns=buildNormalizedConcerns({runtimeArtifacts:persisted,reviewFindingCandidates:[],validationFindings:[]});
  const projected=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(projected.rows.find(row=>row.id==="cookie_information")?.status,"Observed");
  assert.deepEqual(projected.rows.find(row=>row.id==="cookie_information")?.supportingEvidence?.inventory?.declarations,input.cmpBasicEvidence.declarations);
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,before);
  input.cmpBasicEvidence.declarations[0]!.purpose="";
  assert.equal(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==="cookie_information")?.status,"partially_assessed");
  input.cmpBasicEvidence.documentToken="other";
  assert.notEqual(deriveCmpAuditAssessment(input)?.rows.find(row=>row.id==="cookie_information")?.status,"observed");
});


test("Termly passive response resolves only the supported cookie comparison through persisted policy", () => {
  const input=bundle();delete input.cmpPreferencesEvidence;delete input.cmpPreferenceLaneOutcome;
  input.completedAt="2026-10-13T00:00:02.000Z";
  input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:"pre_consent",documentIdentity:{token:"passive-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.scanLaneRuns=[{laneId:"runtime_evidence",accessOutcome:"representative_page",executionOutcome:"success",challengeDetected:false,firstHttpStatus:200,firstEffectiveUrl:input.url}] as CanonicalEvidenceBundle["scanLaneRuns"];
  input.runtimeMetadataSnapshots=[{url:input.url,capturedAtMs:70,consentStateAtTime:"pre_consent",documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"}}] as CanonicalEvidenceBundle["runtimeMetadataSnapshots"];
  input.cookieSnapshots=[{capturedAtMs:80,consentStateAtTime:"pre_consent",cookies:[{name:"security"}],captureCoverage:{version:"bound_cookie_snapshot.v1",scope:"browser_context_point_in_time",targetUrl:input.url,documentUrl:input.url,documentToken:"runtime-loader",startedAtMs:70,completedAtMs:80,status:"completed"}}] as CanonicalEvidenceBundle["cookieSnapshots"];
  const tenant="9598d17a-6c78-437c-83a3-52d50ae899fd";
  const network=cmpNetworkCookieInventorySchema.parse({version:"termly_cookie_response.v1",source:"already_requested_response",documentToken:"passive-loader",documentUrl:input.url,tenantId:tenant,
    scriptUrl:`https://app.termly.io/resource-blocker/${tenant}?autoBlock=off`,responseUrl:`https://app.termly.io/api/v1/snippets/websites/${tenant}/cookies?lang=en`,requestId:"request",frameId:"main",httpStatus:200,mimeType:"application/json",completedAtMs:90,decodedBytes:100,bodySha256:"a".repeat(64),
    records:[{name:"security",purpose:"",duration:"Session",technology:"server_cookie",sourceRef:"category:1/record:0"}],truncated:false,
    inventoryManifest:{version:"cmp_inventory_manifest.v1",source:"termly_cookie_response.v1",names:["security"],sourceRecordCount:1,resolvedRecordCount:1,unresolvedRecordCount:0,unresolvedSources:0,truncated:false}});
  input.cmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v5",sourceLane:"consent_proof",scanId:input.scanId,targetUrl:input.url,documentUrl:input.url,documentToken:"passive-loader",capturedAtMs:100,provider:"Termly",controls:[],privacyLinks:[],serviceNames:[],networkCookieInventory:network,inventoryManifest:network.inventoryManifest,declarations:projectNetworkCmpCookies(network),captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:"passive-loader",declarationsAtMs:90},limitations:["passive_first_layer_only","response_inventory_not_complete"]};
  input.cookieEvents=[{cookieName:"security"}] as CanonicalEvidenceBundle["cookieEvents"];
  const original=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
  assert.equal(audit.rows.find(r=>r.id==="declared_not_found")!.status,"observed");
  assert.equal(audit.rows.find(r=>r.id==="cookie_information")!.status,"partially_assessed");
  assert.equal(audit.rows.find(r=>r.id==="found_not_declared")!.cookieComparison?.declarationInventoryComplete,false);
  for(const id of ["categories","services"])assert.equal(audit.rows.find(r=>r.id===id)!.status,"not_assessed");
  const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
  const persisted=withCanonicalConsentAssessmentSnapshot({},assessment);
  const concerns=buildNormalizedConcerns({runtimeArtifacts:persisted,reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
  assert.equal(report.rows.find(r=>r.id==="declared_not_found")!.status,"Observed");
  assert.ok(concerns.filter(c=>c.originKey.startsWith("consent.cmp_audit.")).every(c=>!c.scoreEffects?.length));
  assert.deepEqual(input,original);
  input.cmpBasicEvidence.networkCookieInventory!.documentToken="foreign";
  assert.equal(deriveCmpAuditAssessment(input),undefined);
});

test("Termly passive public policy hit tests survive canonical persistence without creating score effects",()=>{
 const input=bundle();delete input.cmpPreferencesEvidence;delete input.cmpPreferenceLaneOutcome;input.completedAt='2026-10-13T00:00:02.000Z';
 input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:'pre_consent',documentIdentity:{token:'passive-loader'}}] as CanonicalEvidenceBundle['domSnapshots'];
 input.cmpBasicEvidence={contractVersion:'certscore.cmp-basic-evidence.v1',sourceLane:'consent_proof',scanId:input.scanId,targetUrl:input.url,documentUrl:input.url,documentToken:'passive-loader',capturedAtMs:100,provider:'Termly',controls:[],privacyLinks:[{url:input.url+'our-privacy-policy/',hitTargetBeforeAction:true,access:{version:'privacy_link_access.v2',outcome:'reachable',scroll:{version:'privacy_link_scroll.v1',initialOutcome:'outside_viewport',beforeY:0,inspectedY:1800,restored:true}}}],declarations:[],serviceNames:[],privacyLinkInspection:{version:'passive_public_privacy_links.v1',scope:'same_origin_page',documentToken:'passive-loader'},captureProgress:{version:'cmp_capture_checkpoints.v1',documentToken:'passive-loader',privacyLinksAtMs:100},limitations:['passive_first_layer_only','declaration_inventory_not_complete']};
 const before=structuredClone(input),audit=deriveCmpAuditAssessment(input)!;
 assert.equal(audit.rows.find(r=>r.id==='privacy_access')?.status,'observed');
 const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
 const persisted=withCanonicalConsentAssessmentSnapshot({},assessment);
 const concerns=buildNormalizedConcerns({runtimeArtifacts:persisted,reviewFindingCandidates:[],validationFindings:[]});
 const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:assessment,normalizedConcerns:concerns});
 assert.equal(report.rows.find(r=>r.id==='privacy_access')?.status,'Observed');assert.match(report.rows.find(r=>r.id==='privacy_access')!.detail!,/after scrolling/);
 assert.ok(concerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));assert.deepEqual(input,before);
 input.cmpBasicEvidence.privacyLinks[0]!.hitTargetBeforeAction=false;
 input.cmpBasicEvidence.privacyLinks[0]!.access!.outcome='hit_target_missed';
 const unresolved=deriveCmpAuditAssessment(input)!;
 assert.equal(unresolved.rows.find(r=>r.id==='privacy_access')?.status,'not_assessed');
 assert.match(unresolved.rows.find(r=>r.id==='privacy_access')!.detail,/click-target check could not reach it/);
 assert.ok(unresolved.rows.find(r=>r.id==='privacy_access')!.evidenceRefs.length>0);
 const unresolvedAssessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:unresolved});
 const unresolvedConcerns=buildNormalizedConcerns({runtimeArtifacts:withCanonicalConsentAssessmentSnapshot({},unresolvedAssessment),reviewFindingCandidates:[],validationFindings:[]});
 const unresolvedReport=projectCmpAudit({scanId:input.scanId,consentControlAssessment:unresolvedAssessment,normalizedConcerns:unresolvedConcerns});
 assert.equal(unresolvedReport.rows.find(r=>r.id==='privacy_access')?.status,'Not assessed');
 assert.match(unresolvedReport.rows.find(r=>r.id==='privacy_access')!.detail!,/click-target check could not reach it/);
 assert.ok(unresolvedConcerns.filter(c=>c.originKey.startsWith('consent.cmp_audit.')).every(c=>!c.scoreEffects?.length));
 input.cmpPreferencesEvidence=bundle().cmpPreferencesEvidence;
 input.cmpPreferencesEvidence!.privacyLinks=[{url:input.url+'privacy',hitTargetBeforeAction:false,access:{version:'privacy_link_access.v1',outcome:'hidden'}}];
 assert.match(deriveCmpAuditAssessment(input)!.rows.find(r=>r.id==='privacy_access')!.detail,/marked hidden/,'A passive diagnostic must not overwrite another retained inspection');
 delete input.cmpPreferencesEvidence;
 input.cmpBasicEvidence.privacyLinks[0]!.url='https://foreign.test/privacy';assert.equal(deriveCmpAuditAssessment(input),undefined);
});

test('verified linked privacy choices survive persistence and canonical concern policy without becoming cookie categories or score effects',()=>{
 const input=bundle();
 input.cmpPreferencesEvidence=cmpPreferencesEvidenceSchema.parse({...input.cmpPreferencesEvidence,
   finalUrl:'https://example.com/settings',documentToken:'linked-loader',
   inspectionDiagnostic:{revision:'cmp_preferences.v17',budgetMs:6510,phase:'preference_inventory'},
   linkedPreferenceNavigation:{policyVersion:'read_only_linked_preferences.v1',sourceUrl:input.url,sourceDocumentToken:'parent-loader',label:'Privacy Settings',destinationUrl:'https://example.com/settings',documentToken:'linked-loader'},
   action:{count:0,intent:'options',label:null,opened:false},support:{state:'partial',provider:null,recipeVersion:'bounded_cmp_preferences.v1',reason:'read_only_linked_privacy_preferences'},
   controls:[{label:'Accept Standard Advertising Settings (Opt In)',kind:'unclassified',enabled:true,checked:true},{label:'Do Not Sell or Share My Personal Information (Opt Out)',kind:'unclassified',enabled:true,checked:false}],
   controlInventoryComplete:false,declarations:[],privacyLinks:[],
   checkpoints:{version:'cmp_partial_capture.v1',documentToken:'linked-loader',privacyLinks:false,declarations:false,controls:true,controlsSurface:'preferences'},
 });
 const audit=deriveCmpAuditAssessment(input)!;const row=audit.rows.find(row=>row.id==='categories')!;
 assert.equal(row.status,'partially_assessed');assert.equal(row.inventory?.privacyChoices?.length,2);assert.equal(row.inventory?.categories,undefined);
 const assessment=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:audit});
 const persisted=withPersistedFirstLayerConsentEvidence({consentControlAssessment:assessment},{consent_control_assessment:assessment})!;
 const concerns=buildNormalizedConcerns({runtimeArtifacts:persisted,reviewFindingCandidates:[],validationFindings:[]});
 const cmp=concerns.filter(concern=>concern.originKey.startsWith('consent.cmp_audit.'));
 assert.ok(cmp.every(concern=>(concern.scoreEffects?.length??0)===0));
 const report=projectCmpAudit({scanId:'scan-1',consentControlAssessment:assessment,normalizedConcerns:concerns});
 const projected=report.rows.find(row=>row.id==='categories')!;
 assert.equal(projected.label,'Privacy choices available');assert.equal(projected.status,'Partially assessed');assert.deepEqual(projected.supportingEvidence?.inventory?.privacyChoices,row.inventory?.privacyChoices);
 const forged=structuredClone(input);forged.cmpPreferencesEvidence!.linkedPreferenceNavigation!.destinationUrl='https://external.test/settings';
 assert.equal(deriveCmpAuditAssessment(forged),undefined);
});

test("core CMP facts survive with neither optional packet nor outcome through canonical projection", () => {
  const input = bundle();
  input.postRefusalEvidence = completedUnconfirmedPacket("reject") as any;
  input.postRefusalEvidence!.storage.postAction = [{storageType:"cookie",name:"borlabs-cookie",hostname:"example.com",nonEssential:false,
    identityBasis:"cookie_name_domain_path_partition",identityHash:"a".repeat(64),valueHash:"b".repeat(64),expiresAtEpochSeconds:1797130216,capturedAtEpochSeconds:1791946219.865}];
  const full = deriveCmpAuditAssessment(input)!;
  delete input.cmpPreferencesEvidence; delete input.cmpPreferenceLaneOutcome; delete input.cmpBasicEvidence;
  const before = structuredClone(input), core = deriveCmpAuditAssessment(input)!;
  for (const id of ["duration", "consent_record", "implementation"]) {
    assert.deepEqual(core.rows.find(row=>row.id===id),full.rows.find(row=>row.id===id));
  }
  for (const id of ["categories","services","privacy_access","cookie_information","declared_not_found","found_not_declared"])
    assert.equal(core.rows.find(row=>row.id===id)?.status,"not_assessed");
  const parent=consentControlAssessmentSchema.parse({...observedControlAssessment,cmpAudit:core});
  const persisted=JSON.parse(JSON.stringify(parent));
  const concerns=buildNormalizedConcerns({runtimeArtifacts:{consentControlAssessment:persisted},reviewFindingCandidates:[],validationFindings:[]});
  const report=projectCmpAudit({scanId:input.scanId,consentControlAssessment:persisted,normalizedConcerns:concerns});
  assert.equal(report.rows.find(row=>row.id==="duration")?.status,"Observed");
  assert.ok(concerns.filter(row=>row.originKey.startsWith("consent.cmp_audit.")).every(row=>!row.scoreEffects?.length));
  assert.deepEqual(input,before);
  const changed=structuredClone(input); changed.postRefusalEvidence!.parentScanId="foreign";
  assert.equal(deriveCmpAuditAssessment(changed),undefined);
  const empty=bundle();delete empty.cmpPreferencesEvidence;
  assert.equal(deriveCmpAuditAssessment(empty),undefined);
});

test("independent fallback does not mask configured-cookie facts from valid core CMP basics", () => {
  const input=bundle();delete input.cmpPreferencesEvidence;
  input.completedAt="2026-10-13T00:00:12.000Z";
  input.domSnapshots=[{url:input.url,capturedAtMs:100,consentStateAtTime:"pre_consent",documentIdentity:{token:"basic-loader"}}] as CanonicalEvidenceBundle["domSnapshots"];
  input.cmpBasicEvidence={contractVersion:"certscore.cmp-basic-evidence.v1",sourceLane:"consent_proof",scanId:input.scanId,
    targetUrl:input.url,documentUrl:input.url,documentToken:"basic-loader",capturedAtMs:100,
    provider:"Drupal EU Cookie Compliance module, non-TCF",controls:[],privacyLinks:[],declarations:[],serviceNames:[],limitations:["passive_first_layer_only"],
    configuredConsentCookies:[{version:"cmp_configured_cookie_identity.v1",configurationPath:"drupalSettings.eu_cookie_compliance.cookie_name",name:"cookie_compliance"}]};
  input.postRefusalEvidence=completedUnconfirmedPacket("reject") as any;
  input.postRefusalEvidence!.storage.postAction=["borlabs-cookie","cookie_compliance"].map((name,i)=>({storageType:"cookie",name,hostname:"example.com",nonEssential:false,
    identityBasis:"cookie_name_domain_path_partition",identityHash:String(i+1).repeat(64),valueHash:"b".repeat(64),expiresAtEpochSeconds:5184100,capturedAtEpochSeconds:100}));
  assert.deepEqual(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==="duration")!.inventory!.expiries!.map(row=>row.name),["borlabs-cookie","cookie_compliance"]);
  input.cmpBasicEvidence.documentToken="foreign";
  assert.deepEqual(deriveCmpAuditAssessment(input)!.rows.find(row=>row.id==="duration")!.inventory!.expiries!.map(row=>row.name),["borlabs-cookie"]);
});
