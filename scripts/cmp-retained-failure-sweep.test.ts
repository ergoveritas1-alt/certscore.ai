import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,writeFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assessCmpFailure,classifyCmpFailureStage,summarizeFailureRows,summarizeProviderFailures,sweepRetainedCmp,type DetailedSweepRow,type SweepRow} from "./cmp-retained-failure-sweep";
const base={confirmed:false,notification:false,navigation:false,click:true,observation:true,categoryExposure:false,receiptExposure:false};
test("the earliest unresolved stage wins without hiding later diagnostic exposures",()=>{
 assert.equal(classifyCmpFailureStage({...base,click:false,categoryExposure:true,receiptExposure:true}),"control_resolution");
 assert.equal(classifyCmpFailureStage({...base,observation:false,categoryExposure:true}),"capture_completion");
 assert.equal(classifyCmpFailureStage({...base,categoryExposure:true,receiptExposure:true}),"category_source_binding");
 assert.equal(classifyCmpFailureStage({...base,receiptExposure:true}),"receipt_protocol");
 assert.equal(classifyCmpFailureStage({...base,navigation:true,click:false}),"navigation_or_authorization");
 assert.equal(classifyCmpFailureStage({...base,confirmed:true,receiptExposure:true}),"confirmed");
 assert.equal(classifyCmpFailureStage({...base,confirmed:true,observation:false}),"capture_completion");
 assert.equal(classifyCmpFailureStage({...base,notification:true}),"notification_acknowledgment");
 assert.equal(classifyCmpFailureStage({...base,click:null,observation:null}),"execution_unknown");
});
test("rankings count unique scans/sites separately, retaining unknown providers and distinct cohorts",()=>{
 const row:SweepRow={cohort:"candidate",scanId:"one",site:"example.test",action:"accept",contacted:true,primary:"control_resolution",provider:null,confirmed:false,clickCompleted:false,observationCompleted:false,reasons:["missing"],resolverStates:[],categoryExposure:false,receiptExposure:false};
 const groups=summarizeFailureRows([row,{...row,action:"reject"},{...row,cohort:"reference"}]);
 assert.equal(groups.length,2);assert.deepEqual(groups[0],{cohort:"candidate",primary:"control_resolution",actions:2,scans:1,sites:1,providers:{"Unverified CMP":2},reasons:{missing:2},resolverStates:{}});
});
test("sweep fails closed on duplicate identities, missing source and hash drift before creating output",()=>{
 const dir=mkdtempSync(join(tmpdir(),"certscore-cmp-sweep-"));
 try{const manifest=join(dir,"input.json"),out=join(dir,"report"),row={cohort:"candidate",scanId:"one",site:"example.test",action:"accept",contacted:false};
  const run=(rows:unknown[])=>{writeFileSync(manifest,JSON.stringify({policyVersion:"cmp_retained_sweep_input.v1",rows}));return ()=>sweepRetainedCmp(manifest,out);};
  assert.throws(run([row,row]),/Duplicate/);assert.equal(existsSync(out),false);
  assert.throws(run([{...row,contacted:true}]),/original packet/);assert.equal(existsSync(out),false);
  const packet=join(dir,"packet.json");writeFileSync(packet,"{}");
  assert.throws(run([{...row,contacted:true,source:{file:packet,sha256:"a".repeat(64)}}]),/hash\/size/);assert.equal(existsSync(out),false);
  const result=run([row])();assert.equal(result.totals[0]?.contacted,0);assert.equal(result.totals[0]?.planned,1);
  assert.throws(()=>sweepRetainedCmp(manifest,out),/immutable/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

const complete = {click: true, observation: true, confirmed: false, notification: false};
const diagnostics = (initialReasons: string[], terminalReasons: string[], terminalRead = "unverified") => ({
 policyVersion: "consent_confirmation_diagnostics.v3", initialReasons, terminalReasons, terminalRead,
 reasons: [...new Set([...initialReasons, ...terminalReasons])],
});

test("terminal failure classification cannot reuse a recovered initial SDK reason", () => {
 const d = diagnostics(["api_unavailable"], ["receipt_missing"]);
 const result = assessCmpFailure({...complete, diagnostics: d, reasons: d.reasons});
 assert.equal(result.primary, "receipt_missing_or_unsupported");
 assert.deepEqual(result.primaryReasons, ["receipt_missing"]);
 assert.equal(result.basisPhase, "terminal");
 assert.deepEqual(result.contributing, [
  {category: "capture_or_sdk_readiness", reasons: ["api_unavailable"]},
  {category: "receipt_missing_or_unsupported", reasons: ["receipt_missing"]},
 ]);
 const emptyTerminal = diagnostics(["api_unavailable"], []);
 assert.equal(assessCmpFailure({...complete, diagnostics: emptyTerminal, reasons: emptyTerminal.reasons}).primary,
  "insufficient_or_unavailable_evidence");
});

test("historical phase limits stay unknown while a positive coarse gate remains useful", () => {
 const absent = assessCmpFailure({...complete, reasons: ["cmp_acceptance_state_not_observed"]});
 assert.equal(absent.primary, "historical_schema_limitations");
 assert.equal(absent.evidenceStrength, "unknown");
 assert.equal(absent.basisPhase, "legacy_unseparated");
 const missingPacket = assessCmpFailure({...complete, historicalPacketMissing: true, reasons: ["receipt_missing"]});
 assert.equal(missingPacket.primary, "historical_schema_limitations");
 assert.deepEqual(missingPacket.primaryReasons, ["original_action_packet_not_retained"]);
 assert.ok(missingPacket.contributing.some(reason => reason.category === "receipt_missing_or_unsupported"));
 const legacy = assessCmpFailure({...complete, reasons: ["configuration_or_groups_unverified"], diagnostics: {
  policyVersion: "consent_confirmation_diagnostics.v1", reasons: ["configuration_or_groups_unverified"], terminalRead: "unverified",
 }});
 assert.equal(legacy.primary, "category_applicability");
 assert.equal(legacy.evidenceStrength, "coarse_historical_gate");
 assert.equal(legacy.basisPhase, "legacy_unseparated");
 const independentStorage = assessCmpFailure({...complete,
  reasons: ["configuration_or_groups_unverified", "origin_storage_authorized_target_binding_limited"],
  diagnostics: {policyVersion: "consent_confirmation_diagnostics.v1", reasons: ["configuration_or_groups_unverified"], terminalRead: "unverified"}});
 assert.equal(independentStorage.primary, "category_applicability");
 assert.ok(independentStorage.contributing.some(reason => reason.category === "source_session_target_binding"));
 assert.deepEqual(legacy.addressability, {
  retainedConfirmationRecoveryLowerBound: 0, retainedConfirmationRecoveryUpperBound: 0,
  futureCaptureCandidate: true,
  rationale: "Packet-only diagnostic replay cannot create missing runtime proof. Future-capture exposure is an upper bound for investigation, not predicted recovered confirmations.",
 });
});

test("notification-only and inapplicable categories do not become recovery claims", () => {
 const notification = assessCmpFailure({...complete, notification: true, reasons: ["receipt_missing"]});
 assert.equal(notification.primary, "notification_acknowledgment");
 assert.equal(notification.addressability.futureCaptureCandidate, false);
 const d = diagnostics([], ["category_no_optional"]);
 const inapplicable = assessCmpFailure({...complete, diagnostics: d, reasons: d.reasons});
 assert.equal(inapplicable.primary, "category_applicability");
 assert.equal(inapplicable.addressability.futureCaptureCandidate, false);
 assert.equal(inapplicable.addressability.retainedConfirmationRecoveryUpperBound, 0);
});

test("wrong-document proof and conflicting receipts remain separate blockers", () => {
 const d = diagnostics([], ["sdk_document_changed", "receipt_readback_mismatch"]);
 const result = assessCmpFailure({...complete, diagnostics: d, reasons: d.reasons});
 assert.equal(result.primary, "source_session_target_binding");
 assert.deepEqual(result.primaryReasons, ["sdk_document_changed"]);
 assert.equal(result.contributing[1]?.category, "contradictory_evidence");
 const conflicting = diagnostics([], ["opposite_or_mixed_decision"]);
 assert.equal(assessCmpFailure({...complete, diagnostics: conflicting, reasons: conflicting.reasons}).primary,
  "contradictory_evidence");
});

test("an unattempted control veto precedes SDK confirmation prerequisites", () => {
 const d = diagnostics(["sdk_unreviewed"], [], "not_started");
 const result = assessCmpFailure({...complete, click: false, observation: false, diagnostics: d,
  reasons: ["sdk_unreviewed", "label_mismatch", "resolved_control_label_conflict:semantic_veto"]});
 assert.equal(result.primary, "control_resolution_or_stale_document");
 assert.equal(result.basisPhase, "execution");
 assert.deepEqual(result.primaryReasons, ["label_mismatch", "resolved_control_label_conflict:semantic_veto"]);
 assert.ok(result.contributing.some(reason => reason.category === "source_session_target_binding" && reason.reasons.includes("sdk_unreviewed")));
 // Once the action completes, the same positive SDK source gate may become decisive.
 const afterClick = assessCmpFailure({...complete, diagnostics: d, reasons: d.reasons});
 assert.equal(afterClick.primary, "source_session_target_binding");
 assert.deepEqual(afterClick.primaryReasons, ["sdk_unreviewed"]);
});

test("actual action-target authority failures still precede control resolution", () => {
 const result = assessCmpFailure({...complete, click: false, observation: false,
  reasons: ["redirect_target_not_authorized", "sdk_unreviewed", "label_mismatch"]});
 assert.equal(result.primary, "source_session_target_binding");
 assert.deepEqual(result.primaryReasons, ["redirect_target_not_authorized"]);
 const sdkOnly = assessCmpFailure({...complete, click: false, observation: false, reasons: ["sdk_document_changed"]});
 assert.equal(sdkOnly.primary, "control_resolution_or_stale_document");
 assert.deepEqual(sdkOnly.primaryReasons, ["canonical_click_not_completed"]);
});

test("completed decisions and incomplete observations remain independent", () => {
 const d = diagnostics(["api_unavailable"], ["verified_decision"], "verified");
 const confirmed = assessCmpFailure({...complete, confirmed: true, diagnostics: d, reasons: d.reasons});
 assert.equal(confirmed.primary, "confirmed");
 assert.equal(confirmed.addressability.futureCaptureCandidate, false);
 assert.deepEqual(confirmed.primaryReasons, []);
 const incomplete = assessCmpFailure({...complete, confirmed: true, observation: false, diagnostics: d, reasons: d.reasons});
 assert.equal(incomplete.primary, "capture_or_sdk_readiness");
 assert.equal(incomplete.basisPhase, "execution");
 const unknown = assessCmpFailure({...complete, click: null, observation: null, confirmed: null, reasons: []});
 assert.equal(unknown.primary, "historical_schema_limitations");
 assert.equal(unknown.evidenceStrength, "unknown");
 const missingControlProof = assessCmpFailure({...complete, click: false,
  historicalControlProofMissing: true, reasons: []});
 assert.equal(missingControlProof.primary, "historical_schema_limitations");
 assert.deepEqual(missingControlProof.primaryReasons, ["completed_click_missing_control_proof"]);
});

test("provider failure table retains unknowns, cohort boundaries and source references", () => {
 const d = diagnostics([], ["receipt_missing", "no_fresh_decision"]);
 const row: DetailedSweepRow = {
  cohort: "reference", scanId: "one", site: "example.test", action: "accept", contacted: true,
  source: {file: "/retained/original.json", sha256: "a".repeat(64)},
  primary: "receipt_protocol", provider: null, confirmed: false, clickCompleted: true, observationCompleted: true,
  reasons: d.reasons, resolverStates: [], categoryExposure: false, receiptExposure: false,
  initialReasons: [], terminalReasons: d.terminalReasons,
  blocker: assessCmpFailure({...complete, diagnostics: d, reasons: d.reasons}),
 };
 const result = summarizeProviderFailures([row, {...row, action: "reject"}, {...row, cohort: "candidate"},
  {...row, cohort: "planned", contacted: false}]);
 assert.equal(result.length, 2);
 const reference = result.find(group => group.cohort === "reference")!;
 assert.equal(reference.provider, "Unverified CMP");
 assert.equal(reference.actions, 2);
 assert.equal(reference.sites, 1);
 assert.deepEqual(reference.initialRegistration, {unknown: 2});
 assert.deepEqual(reference.terminalChoice, {verified: 0, notVerified: 0, unknown: 2});
 assert.equal(reference.addressability.futureCaptureExposureUpperBound, 2);
 assert.equal(reference.addressability.futureCaptureSitesUpperBound, 1);
 assert.equal(reference.addressability.expectedRecoveredConfirmations, null);
 assert.equal(reference.representativeEvidence[0]?.source?.sha256, row.source?.sha256);
 assert.deepEqual(reference.primaryReasons, {receipt_missing: 2});
 assert.deepEqual(reference.contributingReasons, {no_fresh_decision: 2, receipt_missing: 2});
});
