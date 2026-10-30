import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {postAcceptEvidencePacketSchema,postRefusalEvidencePacketSchema,projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport,assessConsentActionStages,ONETRUST_REVIEWED_SDKS} from "../packages/certscore-contracts/src/index";

type Packet=ReturnType<typeof postAcceptEvidencePacketSchema.parse>|ReturnType<typeof postRefusalEvidencePacketSchema.parse>;
export type SweepInput={cohort:string;action:"accept"|"reject";site:string;scanId:string;contacted:boolean;source?:{file:string;sha256:string;bytes?:number};expectedRegistration?:string;capturedAt?:string};
export type SweepRow=SweepInput & {primary:string;provider:string|null;confirmed:boolean|null;clickCompleted:boolean|null;observationCompleted:boolean|null;reasons:string[];resolverStates:string[];categoryExposure:boolean;receiptExposure:boolean};

export type FailureCategory =
  | "capture_or_sdk_readiness" | "control_resolution_or_stale_document"
  | "receipt_missing_or_unsupported" | "category_applicability"
  | "source_session_target_binding" | "historical_schema_limitations"
  | "contradictory_evidence" | "insufficient_or_unavailable_evidence";
type DiagnosticInput = {
  policyVersion: string;
  reasons: readonly string[];
  initialReasons?: readonly string[];
  terminalReasons?: readonly string[];
  terminalRead: string;
};
export type FailureAssessment = {
  primary: FailureCategory | "confirmed" | "notification_acknowledgment" | "not_contacted";
  primaryReasons: string[];
  contributing: Array<{ category: FailureCategory; reasons: string[] }>;
  basisPhase: "initial" | "terminal" | "legacy_unseparated" | "execution";
  evidenceStrength: "direct_gate" | "coarse_historical_gate" | "unknown";
  addressability: {
    retainedConfirmationRecoveryLowerBound: 0;
    retainedConfirmationRecoveryUpperBound: 0;
    futureCaptureCandidate: boolean;
    rationale: string;
  };
};
export type DetailedSweepRow = SweepRow & {
  blocker: FailureAssessment;
  initialReasons: string[] | null;
  terminalReasons: string[] | null;
  evidenceStages?: ReturnType<typeof assessConsentActionStages>["evidenceStages"];
};

const successfulReasons = new Set([
  "verified_decision", "category_applicability_verified", "category_exclusion_unneeded",
]);

/** A prerequisite order, not an inference about unretained event chronology. */
const failureOrder: FailureCategory[] = [
  "source_session_target_binding", "control_resolution_or_stale_document",
  "capture_or_sdk_readiness", "category_applicability", "receipt_missing_or_unsupported",
  "contradictory_evidence", "historical_schema_limitations", "insufficient_or_unavailable_evidence",
];

export function cmpReasonCategory(reason: string): FailureCategory | null {
  if (successfulReasons.has(reason)) return null;
  if (/^(sdk_document_changed|receipt_identity_changed|configuration_changed|script_url_mismatch|sdk_body_mismatch|sdk_response_unverified|sdk_multiple_requests|sdk_unreviewed|script_multiple_elements|origin_storage_authorized_target_binding_limited|redirect_target_not_authorized)$/.test(reason) ||
    /^(unauthorized|public_network|target_redirect_resolution_failed)(:|$)/.test(reason)) return "source_session_target_binding";
  if (/^(label_mismatch|label_unverifiable|resolved_control_|multiple_deterministic_|deterministic_(accept|reject)_control_not_found|resolver_|transparent_consent_scope_not_ready|abort_requested_during_control_resolution)/.test(reason)) return "control_resolution_or_stale_document";
  if (/^(api_unavailable|sdk_capture_unavailable|sdk_not_observed|sdk_body_pending|sdk_body_unavailable|script_inventory_limit|script_element_missing|confirmation_aborted|abort_requested_during_confirmation|post_action_network_capture_truncated|window_truncated)$/.test(reason) ||
    /^(target_navigation_failed|observer_result_budget_exhausted|after_action_capture:aborted)(:|_|$)/.test(reason)) return "capture_or_sdk_readiness";
  if (/^(category_|configuration_|group_universe_|receipt_groups_)/.test(reason)) return "category_applicability";
  if (["receipt_missing", "receipt_malformed", "receipt_malformed_or_unsupported", "receipt_format_unsupported"].includes(reason)) return "receipt_missing_or_unsupported";
  if (["opposite_or_mixed_decision", "receipt_readback_mismatch", "receipt_ambiguous"].includes(reason)) return "contradictory_evidence";
  if (["no_registered_complete_decision", "no_fresh_decision", "baseline_receipt_unverified", "api_saved_event_unverified"].includes(reason)) return "insufficient_or_unavailable_evidence";
  return null;
}

/** Internal triage only. Diagnostics never supply a missing consent witness. */
export function assessCmpFailure(input: {
  click: boolean | null;
  observation: boolean | null;
  confirmed: boolean | null;
  notification: boolean;
  reasons: string[];
  diagnostics?: DiagnosticInput;
  historicalControlProofMissing?: boolean;
  historicalPacketMissing?: boolean;
}): FailureAssessment {
  const diagnostics = input.diagnostics;
  const separated = diagnostics?.initialReasons !== undefined && diagnostics.terminalReasons !== undefined;
  const terminalAttempted = diagnostics && diagnostics.terminalRead !== "not_started";
  const phaseReasons = separated
    ? terminalAttempted ? diagnostics.terminalReasons! : diagnostics.initialReasons!
    : diagnostics?.reasons ?? [];
  // An origin-storage snapshot limitation does not invalidate an independent
  // cookie/SDK decision. Preserve it as context without treating it as the
  // semantic confirmation blocker.
  const operationalReasons = input.reasons.filter(reason => !diagnostics?.reasons.includes(reason) &&
    reason !== "origin_storage_authorized_target_binding_limited");
  const decisiveReasons = [...new Set([...phaseReasons, ...operationalReasons])];
  const contributors = new Map<FailureCategory, string[]>();
  for (const reason of input.reasons) {
    const category = cmpReasonCategory(reason);
    if (category) contributors.set(category, [...(contributors.get(category) ?? []), reason]);
  }
  if (input.historicalPacketMissing) contributors.set("historical_schema_limitations", ["original_action_packet_not_retained"]);
  let primary: FailureAssessment["primary"];
  let primaryReasons: string[] = [];
  let basisPhase: FailureAssessment["basisPhase"] = separated
    ? terminalAttempted ? "terminal" : "initial" : "legacy_unseparated";
  let evidenceStrength: FailureAssessment["evidenceStrength"] = "direct_gate";
  // SDK/receipt source checks gate confirmation, not a separately authorized
  // bounded DOM click. Before dispatch, only action-target/network authority
  // failures can precede a retained control-resolution veto.
  const executionSourceReasons = decisiveReasons.filter(reason =>
    reason === "redirect_target_not_authorized" || /^(unauthorized|public_network|target_redirect_resolution_failed)(:|$)/.test(reason));
  const navigationReasons = decisiveReasons.filter(reason => /^target_navigation_failed(:|$)/.test(reason));

  // A completed decision can still have an incomplete observation. Successful
  // phases must not inherit a transient earlier diagnostic as a final blocker.
  if (input.historicalControlProofMissing) {
    primary = "historical_schema_limitations";
    primaryReasons = ["completed_click_missing_control_proof"];
    evidenceStrength = "unknown";
    basisPhase = "execution";
  } else if (input.click === null) {
    primary = "historical_schema_limitations";
    primaryReasons = ["execution_evidence_unavailable"];
    evidenceStrength = "unknown";
    basisPhase = "execution";
  } else if (!input.click) {
    primary = executionSourceReasons.length ? "source_session_target_binding"
      : navigationReasons.length ? "capture_or_sdk_readiness" : "control_resolution_or_stale_document";
    primaryReasons = executionSourceReasons.length ? executionSourceReasons : navigationReasons.length ? navigationReasons
      : decisiveReasons.filter(reason => cmpReasonCategory(reason) === primary);
    if (!primaryReasons.length) primaryReasons = ["canonical_click_not_completed"];
    basisPhase = "execution";
  } else if (input.observation !== true) {
    primary = input.observation === null ? "historical_schema_limitations" : "capture_or_sdk_readiness";
    primaryReasons = [input.observation === null ? "observation_evidence_unavailable" : "canonical_observation_not_completed"];
    evidenceStrength = input.observation === null ? "unknown" : "direct_gate";
    basisPhase = "execution";
  } else if (input.confirmed === true) {
    primary = "confirmed";
    basisPhase = "execution";
  } else if (input.notification) {
    primary = "notification_acknowledgment";
    primaryReasons = ["verified_notification_receipt_is_not_a_consent_decision"];
    basisPhase = "execution";
  } else if (input.historicalPacketMissing) {
    primary = "historical_schema_limitations";
    primaryReasons = ["original_action_packet_not_retained"];
    evidenceStrength = "unknown";
  } else {
    const categories = decisiveReasons.map(cmpReasonCategory);
    primary = failureOrder.find(category => categories.includes(category)) ?? "insufficient_or_unavailable_evidence";
    primaryReasons = decisiveReasons.filter(reason => cmpReasonCategory(reason) === primary);
    // Missing legacy diagnostics cannot identify an adapter defect. A retained
    // coarse positive reason still takes precedence over that historical limit.
    if (!diagnostics && primary === "insufficient_or_unavailable_evidence") {
      primary = "historical_schema_limitations";
      primaryReasons = ["confirmation_diagnostics_not_retained"];
      evidenceStrength = "unknown";
    } else if (!primaryReasons.length) {
      primaryReasons = ["no_decisive_reason_retained"];
      evidenceStrength = "unknown";
    } else if (primaryReasons.includes("configuration_or_groups_unverified")) {
      evidenceStrength = "coarse_historical_gate";
    }
  }
  const futureCaptureCandidate = !["confirmed", "notification_acknowledgment", "not_contacted"].includes(primary) &&
    !primaryReasons.includes("category_no_optional");
  return {
    primary, primaryReasons, basisPhase, evidenceStrength,
    contributing: failureOrder.flatMap(category => contributors.has(category)
      ? [{ category, reasons: [...new Set(contributors.get(category)!)] }] : []),
    addressability: {
      retainedConfirmationRecoveryLowerBound: 0,
      retainedConfirmationRecoveryUpperBound: 0,
      futureCaptureCandidate,
      rationale: primary === "notification_acknowledgment"
        ? "Acknowledgment attribution only; no consent decision is expected from this receipt."
        : primaryReasons.includes("category_no_optional")
          ? "No optional choice is evidenced; do not invent an applicable decision or count this as recoverable confirmation."
          : primary === "confirmed"
            ? "The retained decision is already verified."
            : "Packet-only diagnostic replay cannot create missing runtime proof. Future-capture exposure is an upper bound for investigation, not predicted recovered confirmations.",
    },
  };
}
export function classifyCmpFailure(packet:Packet, action:"accept"|"reject", hash:string){
 const projection=action==="accept"?projectPostAcceptEvidenceForReport({packet:packet as ReturnType<typeof postAcceptEvidencePacketSchema.parse>,packetSha256:hash}):projectPostRefusalEvidenceForReport({packet:packet as ReturnType<typeof postRefusalEvidencePacketSchema.parse>,packetSha256:hash});
 const stages=assessConsentActionStages(projection);
 const registration=action==="accept"?(packet as ReturnType<typeof postAcceptEvidencePacketSchema.parse>).acceptanceRegistration:(packet as ReturnType<typeof postRefusalEvidencePacketSchema.parse>).refusalRegistration;
 const reasons=[...new Set([...(packet.confirmationDiagnostics?.reasons??[]),...(packet.resolver.reason?[packet.resolver.reason]:[]),...(registration.reason?[registration.reason]:[]),...packet.limitations])];
 const categoryExposure=stages.provider==="OneTrust"&&reasons.some(r=>/^(sdk_|script_|category_|configuration_|group_universe_|receipt_groups_)/.test(r)&&!['category_applicability_verified','category_exclusion_unneeded','verified_decision'].includes(r));
 const receiptExposure=reasons.some(r=>['receipt_format_unsupported','receipt_malformed_or_unsupported','receipt_malformed'].includes(r));
 const navigation=reasons.some(r=>/target_navigation_failed|target_redirect_resolution_failed|redirect_target_not_authorized|unauthorized|public_network/.test(r));
 const click=stages.measures.clickCompleted,observation=stages.measures.observationCompleted,confirmed=stages.measures.decisionVerified;
 // Earliest failed stage wins. Detailed exposures overlap and are never summed.
 const primary=classifyCmpFailureStage({confirmed,notification:stages.outcome==='notification_acknowledged',navigation,click,observation,categoryExposure,receiptExposure});
 const diagnostics=packet.confirmationDiagnostics;
 const blocker=assessCmpFailure({click,observation,confirmed,notification:stages.outcome==='notification_acknowledged',reasons,diagnostics,
  historicalControlProofMissing:packet.interactionDiagnostics?.click.outcome==='completed'&&!packet.actionControlProof});
 return {primary,provider:stages.provider,confirmed,clickCompleted:click,observationCompleted:observation,reasons,resolverStates:packet.interactionDiagnostics?.resolver?.snapshots.map(s=>s.state)??[],categoryExposure,receiptExposure,registration:projection.registrationStatus,
  blocker,evidenceStages:stages.evidenceStages,
  initialReasons:diagnostics&&'initialReasons' in diagnostics?[...diagnostics.initialReasons]:null,
  terminalReasons:diagnostics&&'terminalReasons' in diagnostics?[...diagnostics.terminalReasons]:null};
}
export function classifyCmpFailureStage({confirmed,notification,navigation,click,observation,categoryExposure,receiptExposure}:{confirmed:boolean|null;notification:boolean;navigation:boolean;click:boolean|null;observation:boolean|null;categoryExposure:boolean;receiptExposure:boolean}){
 return navigation?'navigation_or_authorization':click===null?'execution_unknown':click!==true?'control_resolution':observation!==true?'capture_completion':confirmed===true?'confirmed':notification?'notification_acknowledgment':categoryExposure?'category_source_binding':receiptExposure?'receipt_protocol':'semantic_evidence_unresolved';
}
export function summarizeFailureRows(rows:SweepRow[]){
 const groups=[...new Set(rows.map(r=>JSON.stringify([r.cohort,r.primary])))].map(key=>{
  const [cohort,primary]=JSON.parse(key) as [string,string];const sample=rows.filter(r=>r.cohort===cohort&&r.primary===primary);
  return {cohort,primary,actions:sample.length,scans:new Set(sample.map(r=>r.scanId)).size,sites:new Set(sample.map(r=>r.site)).size,providers:counts(sample.map(r=>r.provider??'Unverified CMP')),reasons:counts(sample.flatMap(r=>r.reasons)),resolverStates:counts(sample.flatMap(r=>[...new Set(r.resolverStates)]))};
 });
 return groups.sort((a,b)=>a.cohort.localeCompare(b.cohort)||b.actions-a.actions);
}

/** One exclusive provider/blocker row per contacted action. Contributing reasons
 * overlap and are deliberately excluded from the coverage denominator. */
export function summarizeProviderFailures(rows: DetailedSweepRow[]) {
 const contacted = rows.filter(row => row.contacted);
 const keys = [...new Set(contacted.map(row => JSON.stringify([row.cohort, row.provider, row.blocker.primary])))];
 return keys.map(key => {
  const [cohort, provider, blocker] = JSON.parse(key) as [string, string | null, FailureAssessment["primary"]];
  const sample = contacted.filter(row => row.cohort === cohort && row.provider === provider && row.blocker.primary === blocker);
  const future = sample.filter(row => row.blocker.addressability.futureCaptureCandidate);
  return {
   cohort, provider: provider ?? "Unverified CMP", blocker,
   actions: sample.length, sites: new Set(sample.map(row => row.site)).size,
   completedClicks: sample.filter(row => row.clickCompleted === true).length,
   initialRegistration: counts(sample.map(row => row.evidenceStages?.registrationStatus ?? "unknown")),
   terminalChoice: {
    verified: sample.filter(row => row.evidenceStages?.terminalChoiceStateVerified === true).length,
    notVerified: sample.filter(row => row.evidenceStages?.terminalChoiceStateVerified === false).length,
    unknown: sample.filter(row => row.evidenceStages?.terminalChoiceStateVerified == null).length,
   },
   primaryReasons: counts(sample.flatMap(row => row.blocker.primaryReasons)),
   contributingReasons: counts(sample.flatMap(row => row.blocker.contributing.flatMap(item => item.reasons))),
   evidenceStrength: counts(sample.map(row => row.blocker.evidenceStrength)),
   addressability: {
    retainedConfirmationRecoveryLowerBound: 0,
    retainedConfirmationRecoveryUpperBound: 0,
    futureCaptureExposureUpperBound: future.length,
    futureCaptureSitesUpperBound: new Set(future.map(row => row.site)).size,
    expectedRecoveredConfirmations: null,
    interpretation: "Exposure bounds are not additive across contributing reasons and are not a success forecast. Historical packet replay retains existing decisions.",
   },
   representativeEvidence: sample.slice(0, 3).map(row => ({scanId: row.scanId, action: row.action, site: row.site,
    source: row.source, primaryReasons: row.blocker.primaryReasons, basisPhase: row.blocker.basisPhase,
    initialReasons: row.initialReasons, terminalReasons: row.terminalReasons})),
  };
 }).sort((a, b) => a.cohort.localeCompare(b.cohort) || b.actions - a.actions || a.provider.localeCompare(b.provider) || a.blocker.localeCompare(b.blocker));
}
function counts(values:string[]){const c:Record<string,number>=Object.create(null);for(const v of values)c[v]=(c[v]??0)+1;return Object.fromEntries(Object.entries(c).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function sweepRetainedCmp(manifestPath:string,out:string){
 if(existsSync(out))throw Error('Choose a new immutable output directory');
 const inputBytes=readFileSync(manifestPath);const input=JSON.parse(inputBytes.toString()) as {policyVersion:string;rows:SweepInput[]};
 if(input.policyVersion!=='cmp_retained_sweep_input.v1'||!Array.isArray(input.rows))throw Error('Unsupported manifest');
 const rows:DetailedSweepRow[]=[],seen=new Set<string>();
 for(const entry of input.rows){
  if(!entry.cohort||!entry.site||!entry.scanId||!['accept','reject'].includes(entry.action)||typeof entry.contacted!=='boolean')throw Error('Invalid identity');
  const identity=JSON.stringify([entry.cohort,entry.scanId,entry.action]);if(seen.has(identity))throw Error('Duplicate scan/action identity in cohort');seen.add(identity);
  if(!entry.source){if(entry.contacted)throw Error('Contacted row requires original packet evidence');rows.push({...entry,primary:'not_contacted',provider:null,confirmed:null,clickCompleted:null,observationCompleted:null,reasons:[],resolverStates:[],categoryExposure:false,receiptExposure:false,
   initialReasons:null,terminalReasons:null,blocker:{primary:'not_contacted',primaryReasons:[],contributing:[],basisPhase:'execution',evidenceStrength:'unknown',addressability:{retainedConfirmationRecoveryLowerBound:0,retainedConfirmationRecoveryUpperBound:0,futureCaptureCandidate:false,rationale:'No contact occurred; excluded from contacted denominators.'}}});continue;}
  if(!entry.contacted)throw Error('A retained action packet cannot be an uncontacted slot');
  const bytes=readFileSync(entry.source.file);if(digest(bytes)!==entry.source.sha256||(entry.source.bytes!==undefined&&bytes.length!==entry.source.bytes))throw Error('Retained packet hash/size mismatch: '+entry.source.file);
  const packet=(entry.action==='accept'?postAcceptEvidencePacketSchema:postRefusalEvidencePacketSchema).parse(JSON.parse(bytes.toString()));
  if(packet.parentScanId!==entry.scanId)throw Error('Packet/scan identity mismatch');
  const result=classifyCmpFailure(packet,entry.action,entry.source.sha256);
  if(entry.expectedRegistration!==undefined&&result.registration!==entry.expectedRegistration)throw Error('Historical registration changed');
  rows.push({...entry,...result});
 }
 const groups=summarizeFailureRows(rows),providerFailures=summarizeProviderFailures(rows);
 const totals=[...new Set(rows.map(r=>r.cohort))].map(cohort=>{const planned=rows.filter(r=>r.cohort===cohort),contacted=planned.filter(r=>r.contacted),complete=contacted.filter(r=>r.clickCompleted===true);return {cohort,planned:planned.length,contacted:contacted.length,sites:new Set(contacted.map(r=>r.site)).size,clickCompleted:complete.length,observationCompleted:contacted.filter(r=>r.observationCompleted===true).length,confirmed:contacted.filter(r=>r.confirmed===true).length,categoryExposure:contacted.filter(r=>!r.confirmed&&r.categoryExposure).length,receiptExposure:contacted.filter(r=>!r.confirmed&&r.receiptExposure).length};});
 const result={policyVersion:'cmp_retained_failure_sweep.v2',generatedAt:new Date().toISOString(),input:{file:resolve(manifestPath),sha256:digest(inputBytes)},interpretation:'Current candidate canonical replay of original bytes; no recapture or historical repair. Cohorts and arms remain separate. Legacy primary groups are preserved; blocker selects the earliest known unsatisfied prerequisite, not unretained event chronology or a proven root cause. Unknown control/provider does not mean absent control/CMP. Initial and terminal phase reasons remain separate; historical unseparated reasons are not assigned to either phase. Contributing exposures overlap. Historical evidence cannot acquire missing runtime proof.',candidateReviewedSdkPins:ONETRUST_REVIEWED_SDKS,totals,groups,providerFailures,rows};
 mkdirSync(out,{recursive:true});writeFileSync(join(out,'sweep.json'),JSON.stringify(result,null,2)+'\n');
 const csvRows=[['Cohort','Provider','Earliest blocker','Actions','Distinct sites','Completed clicks','Primary reasons','Contributing reasons','Retained replay recovery lower','Retained replay recovery upper','Future capture exposure upper','Future capture sites upper','Expected recovered confirmations','Representative evidence'],
  ...providerFailures.map(row=>[row.cohort,row.provider,row.blocker,row.actions,row.sites,row.completedClicks,JSON.stringify(row.primaryReasons),JSON.stringify(row.contributingReasons),0,0,row.addressability.futureCaptureExposureUpperBound,row.addressability.futureCaptureSitesUpperBound,'unknown',JSON.stringify(row.representativeEvidence)])];
 writeFileSync(join(out,'provider-failures.csv'),csvRows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\n')+'\n');
 const e=(x:unknown)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 writeFileSync(join(out,'provider-failures.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>CertScore.ai CMP blocker ranking</title>
 <style>body{font:15px system-ui;margin:28px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}details{max-width:480px;overflow-wrap:anywhere}p{max-width:1100px}</style>
 <h1>CertScore.ai CMP provider and failure reason</h1><p>${e(result.interpretation)}</p>
 <p>Retained confirmation recovery is zero for this packet-only replay. Future-capture counts are exposure upper bounds; expected recoveries are unknown. Confirmed and notification-only rows remain visible. <a href="provider-failures.csv">CSV table</a> · <a href="sweep.json">Complete source-bound rows</a></p>
 <table><thead><tr><th>Cohort / provider</th><th>Earliest blocker</th><th>Actions / sites</th><th>Future-capture exposure upper bound</th><th>Evidence</th></tr></thead><tbody>
 ${providerFailures.map(row=>`<tr><td>${e(row.cohort)}<br>${e(row.provider)}</td><td>${e(row.blocker)}</td><td>${row.actions} / ${row.sites}</td><td>${row.addressability.futureCaptureExposureUpperBound} actions / ${row.addressability.futureCaptureSitesUpperBound} sites</td><td><details><summary>Primary and contributing reasons</summary><p>${e(JSON.stringify(row.primaryReasons))}</p><p>${e(JSON.stringify(row.contributingReasons))}</p><p>${e(JSON.stringify(row.representativeEvidence))}</p></details></td></tr>`).join('')}
 </tbody></table></html>`);
 writeFileSync(join(out,'sweep.html'),`<!doctype html><meta charset="utf-8"><title>CertScore.ai retained CMP sweep</title><style>body{font:15px system-ui;color:#172033;background:#f6f7fb;margin:32px}table{border-collapse:collapse;background:white;width:100%;margin:24px 0}td,th{padding:12px;border:1px solid #ddd;text-align:left}p{max-width:1000px;line-height:1.5}details{max-width:650px}h2{overflow-wrap:anywhere}</style><h1>CertScore.ai retained CMP failure groups</h1><p>${e(result.interpretation)}</p>${totals.map(t=>`<h2>${e(t.cohort)}</h2><p>${t.contacted} contacted / ${t.planned} planned; ${t.sites} sites; ${t.clickCompleted} clicks; ${t.observationCompleted} completed observations; ${t.confirmed} confirmed decisions.</p><table><tr><th>First unresolved stage</th><th>Actions</th><th>Scans</th><th>Sites</th><th>Providers and reasons</th></tr>${groups.filter(g=>g.cohort===t.cohort).map(g=>`<tr><td>${e(g.primary)}</td><td>${g.actions}</td><td>${g.scans}</td><td>${g.sites}</td><td><details><summary>Evidence</summary><p>${e(JSON.stringify(g.providers))}</p><p>${e(JSON.stringify(g.reasons))}</p></details></td></tr>`).join('')}</table>`).join('')}`);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [manifest,out]=process.argv.slice(2);if(!manifest||!out)throw Error('Usage: cmp-retained-failure-sweep.ts <manifest.json> <new output directory>');const result=sweepRetainedCmp(manifest,out);console.log(JSON.stringify({totals:result.totals,groups:result.groups.map(({cohort,primary,actions,scans,sites})=>({cohort,primary,actions,scans,sites}))},null,2));}
