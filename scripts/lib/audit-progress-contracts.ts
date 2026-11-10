/** Versioned audit semantics. This module never changes product assessments. */
import type { Metric, ProgressRow } from './audit-progress';
export const METRIC_CONTRACT_VERSION = 'certscore.audit-metrics.v1';
export const PUBLIC_VERSIONS = ['pulse-public-v4', 'pulse-public-v5', 'pulse-public-v10', 'pulse-public-v11'];
export const PROJECTION_VERSIONS = ['scan-report-projection-v26', 'scan-report-projection-v27'];
// Reviewed pairs only: v10/v11 use v27, never v26.
export const PUBLIC_SOURCE_PAIRS = [
  ...['pulse-public-v4', 'pulse-public-v5'].flatMap(a=>PROJECTION_VERSIONS.map(b=>`${a}/${b}`)),
  'pulse-public-v10/scan-report-projection-v27',
  'pulse-public-v11/scan-report-projection-v27',
];
export function returnedState(value: unknown, present = value !== undefined): string {
  if (!present) return 'unavailable';
  if (value === null) return 'unknown';
  if (typeof value !== 'string' || !value.trim()) return 'unsupported_state';
  // Preserve the returned vocabulary. A concern/gap is never a control observation.
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}
export function checklistEvidence(row: any): string {
  if (!row) return 'unavailable';
  if (Object.hasOwn(row, 'evidenceState')) return returnedState(row.evidenceState);
  if (Object.hasOwn(row, 'evidenceLabel')) return returnedState(row.evidenceLabel);
  return 'unavailable'; // status is a verdict, not evidence-state fallback
}
export function publicSource(report: any): string {
  const a=report.meta?.projectionVersion, b=report.meta?.reportProjectionVersion;
  if (a && !PUBLIC_VERSIONS.includes(a) || b && !PROJECTION_VERSIONS.includes(b)) throw Error(`Unreviewed public schema: ${a}/${b}`);
  if ((a === 'pulse-public-v10' || a === 'pulse-public-v11') && !PUBLIC_SOURCE_PAIRS.includes(`${a}/${b}`)) throw Error(`Unreviewed public schema: ${a}/${b}`);
  return `public_export/${a??'historical_unversioned'}/${b??'historical_unversioned'}`;
}
export function sealedSource(row: ProgressRow): string {
  return `sealed_assessment/${row.assessmentVersion}/${row.projectionVersion}`;
}
export function isSealedMetric(id:string):boolean {
  return /^(outcome|evidence|publication|control\.|execution\.|click\.|registration\.|terminal\.|topic\.|privacy_policy|policy_|gpc_|cmp_|detail\.sealed\.|checklist\.|verdict\.)/.test(id);
}
export function namespaceSealed(row: ProgressRow): ProgressRow {
  const source=sealedSource(row), states:Record<string,string>={}, sources:Record<string,string>={}, measurements:Record<string,number>={};
  for(const [id,value] of Object.entries(row.states)){if(id.startsWith('sealed.opt_out.')||id.startsWith('sealed.choice_finding.')||id.startsWith('sealed.operations.')){states[id]=value;sources[id]=row.metricSources?.[id]??source;continue;}if(!isSealedMetric(id))continue;states[`sealed.${id}`]=value;sources[`sealed.${id}`]=source+(row.metricSources?.[id]?`/${row.metricSources[id]}`:'');}
  for(const [id,value] of Object.entries(row.measurements??{})){
    // Public measurements read from the identical export need no second copy.
    if(!/^(site|technology|graph|form)\./.test(id)) continue;
    measurements[id]=value;sources[id]=source+(id.startsWith('graph.')?`/${row.states['detail.sealed.relationships']}`:'');
  }
  return {...row,states,metricSources:sources,measurements,metricLabels:{}};
}
export function monthMetricRegistry(base:Metric[], recent:Metric[]):Metric[] {
  const list=[...base,...recent.filter(m=>isSealedMetric(m.id)).map(m=>({...m,success:m.id==="evidence"?["generation_matched"]:m.success,id:`sealed.${m.id}`,label:m.id==="control.privacyOptOut"?"Opt-out control presence · retained assessment":m.id==="evidence"?"Export generation joined to sealed evidence":m.id==="gpc_finding"?"GPC result record · retained assessment":m.id.startsWith("control.")?`${m.id.slice(8)} persisted control state`:`${m.label} · retained assessment`,group:m.id==="control.privacyOptOut"?"Controls":`Retained · ${m.group}`,denominator:/^(registration|terminal)\./.test(m.id)?"Completed sealed clicks; unavailable witnesses remain in the denominator":m.id==="gpc_path"||m.id==="gpc_delivery"?"Explicitly enabled sealed GPC attempts; enablement is not inferred from public objects":"Retained sealed eligibility plus reportable rows with unavailable sealed evidence"}))];
  return [...new Map(list.map(m=>[m.id,m])).values()];
}
export function metricContract(m:any,kind='state') {
  const id=String(m.id),sealed=id.startsWith('sealed.'),key=id.replace(/^sealed\./,''),quantity=kind==='quantity';
  let source=sealed?'Verified sealed assessment; never used as a public-export fallback':'Retained public export; no persisted-assessment fallback';
  let meaning=m.label,eligible=m.denominator??'Readable reportable cohort rows, including rows with unavailable measurements';
  let mapping='Preserve the named returned state; missing field = unavailable, explicit null = unknown. No evidence/verdict substitution.';
  let field=key;
  if(key.startsWith('opt_out.')||key.startsWith('choice_finding.')){source='Generation-matched persisted summary or checksum-verified full retained report; no public fallback';field=key.startsWith('choice_finding.')?'canonicalReportProjection.globalUnifiedFindings exact ID + surfacing/presentation decisions':'choice_audit fixed typed projection from scan configuration and consentControlAssessment.californiaPrivacyReview';mapping='Preserve canonical broad presence, inspection scope, configured enablement, returned packet, action completion, initial/terminal choice confirmation, confirmation basis, post-confirmation observation coverage, semantic sale/sharing registration and outcome separately. Terminal CMP choice confirmation does not establish sale/sharing state or a post-confirmation observation window. No packet is not action failure; enabled is not dispatched. Unknown/missing remains unavailable. Canonical records include neutral evidence and are not failure counts.';}
  if(key==='opt_out.dispatch'){source='Original verified manifest/bundle, or generation-matched persisted result verification receipt';field='privacyCaptureProfile + saleSharingOptOutLaneOutcome, or result artifactVerification.optOutDispatch';mapping='A verified presence-only profile proves exclusion; a retained lane outcome proves dispatch was recorded. Conflicting proof is explicit. Missing proof is unavailable. Configuration and packet absence cannot establish dispatch.';}
  if(['opt_out.action_completion','opt_out.choice_confirmation','opt_out.post_confirmation_observation'].includes(key)){
    source='Generation-matched typed execution assessment, verified legacy packet or pre-action worker facts, or verified dispatch disposition';
    mapping='Separate completed action, initial GPP confirmation, terminal CMP confirmation, and the post-confirmation observation window. Not dispatched and excluded by profile are explicit dispositions. Missing or invalid outcome evidence remains unavailable.';
  }
  if(key.startsWith('control.')){meaning=sealed?'Persisted control assessment state':'Pre-interaction first-layer control presence';field=sealed?'consentControlAssessment.controls.<control>.state':'consentSurfaceEvidence.firstLayerConsentChoices.<control>ControlObserved';mapping=sealed?'Persisted observed / not_observed / unknown, otherwise unavailable':'true with first-layer pre-interaction capture = observed; false plus complete inventory and capture = not_observed; incomplete or null = unknown; missing = unavailable';}
  if(['opt_out.conditional_control','opt_out.supported_route','opt_out.dispatch_reason','opt_out.decision_remaining_ms','opt_out.dispatch_elapsed_ms'].includes(key)){
    source='Checksum-verified original manifest and bundle, or their verified artifactVerification event in the matched report generation';
    field='conditionalOptOutDecision v2; scan-bound terminal decision with coherent effective dispatch';
    mapping='Presence is scoped to the verified consent inventory. Supported route is scheduling eligibility, not action success. Timing is measured at the decision; dispatch elapsed time requires an actual dispatch. Historical v1 or missing diagnostics remain unavailable, never zero.';
  }
  if(key==='control.privacyOptOut'&&sealed){source='Original sealed assessment or authenticated generation-matched persisted control extract; no public fallback';field='consentControlAssessment.controls.privacyOptOut.state; persisted_control_extract retains schema, original creator and exact report-generation binding';mapping='Preserve persisted observed / not_observed / unknown. Binary extract states need matched first-layer identity; explicit canonical unknown stays unknown when document/layer coverage is unresolved. Missing, malformed or changed-generation extracts remain unavailable. Never infer route presence or action success.';}
  if(key==='control.privacyOptOut'&&!sealed){field='consentSurfaceEvidence.firstLayerConsentChoices.privacyOptOutControlObserved + privacyOptOutControlInventoryComplete';mapping='v11/v27 only: true with captured pre-interaction first layer = observed; false with opt-out-specific complete inspection and capture = not_observed; explicit null or incomplete facts = unknown; missing = unavailable. v4/v5/v10 do not export this field and display Not exported. No raw label, route/instruction or execution fallback.';}
  if(key.startsWith('checklist.')||key.startsWith('topic.')||key==='privacy_policy'){field=sealed?'canonicalReportProjection.checklistRows[id].evidenceState (never status)':'gdprEprivacyChecklistRows.items[id].evidenceState OR evidenceLabel (never status)';meaning='Returned checklist evidence state; concern/gap are assessed states, not underlying control presence';}
  if(key.startsWith('verdict.')){field=sealed?'canonicalReportProjection.checklistRows[id].status':'gdprEprivacyChecklistRows.items[id].status';meaning='Returned checklist verdict, separately retained from evidence state';}
  if(sealed&&key.endsWith('.accessibility_consent_controls')&&/^(checklist|verdict)\./.test(key)){
    source='Verified retained assessment or generation-matched private bounded extract; no public fallback';
    mapping='Keep the exact consent/privacy-control evidence state and verdict separate. Missing and not testable remain distinct. General page accessibility results cannot substitute for this assessment.';
  }
  if(key.startsWith('execution.')){field='postAccept/RefusalObservation.execution';mapping='Validate choice_path_execution.v1; retain status; missing = unavailable; invalid = unsupported_schema';}
  if(key.startsWith('click.'))field='Validated execution.clickCompleted; sealed original packet fallback is a separately named source';
  if(key.startsWith('registration.')){field='postAccept/RefusalObservation.registrationStatus or legacy status';mapping='confirmed_clean / confirmed_observation -> confirmed; unconfirmed and aborted retained; missing unavailable; never execution consentConfirmed';}
  const allClickActivity=/^detail\.(accept|reject)\.activity_all$/.test(id);
  if(allClickActivity){
    source='Returned confirmed activity verdict or generation-matched retained projection';
    field='Confirmed verdict or classified post-click request or storage write bound to the completed action';
    mapping='Count each scan once. No completed click and unavailable classification remain separate. Unclassified request and storage counts do not qualify.';
  }
  const usableChoiceFunnel=/^(control|click|registration)\.(accept|reject)$|^detail\.(accept|reject)\.verdict$/.test(id);
  if(usableChoiceFunnel&&key.startsWith('registration.'))mapping+='; known uncompleted clicks are counted separately as no_completed_click; missing click evidence remains unavailable';
  if(key.startsWith('terminal.')){field='source-bound terminalDecision plus afterActionCapture';mapping='Valid bound witness = verified; explicit invalid witness = unverified; missing = unavailable';}
  if(key.startsWith('terminal.audit_')){
    source='Generation-matched v2 daily audit extract';
    field='priorityEvidence.accept or priorityEvidence.reject from the persisted action projection';
    mapping='Completed clicks qualify. Verify the matching action, authorized target, decision witness and capture window. Missing witnesses remain unavailable. Terminal verification is separate from initial registration.';
  }
  if(key.startsWith('choice_evidence.')){
    source='Generation-matched v2 daily audit extract';
    field='priorityEvidence.cmp from the persisted GPC assessment and independent CMP snapshots';
    mapping='Bind the scan, source hashes, document, scope and section version. Report the two retained settings as a descriptive transition. Missing or unbound evidence cannot establish a transition.';
  }
  if(key.startsWith('priority_evidence.')){source='Generation-matched v2 query coverage receipt; historical omissions remain unavailable';field='priorityEvidence.coverage plus priorityEvidence.transport';mapping='Source missing, explicit no completed click, eligibility unknown, transport size-bound, invalid/unbound and included remain distinct. This is delivery coverage, not action success or a site finding.';}
  if(key.startsWith('operations.')){
    source='Generation-matched persisted report or bounded v2 audit extract; original result receipt required';
    field=({
      'operations.policy_fetch':'policy_disclosure_summary.discoveredPrivacyPolicyDetails and source-bound retained document fetch states',
      'operations.policy_owner':'policyTextEvidenceProjection.documents: fetched, usable, policy_document and target_controller/first_party_brand',
      'operations.policy_text_receipt':'policyTextEvidenceProjection.documents: artifact and retained-text checksums, extraction and source coverage',
      'operations.transfer_framework_check':'policyReceipt.t: versioned outcome from the matcher and verified policy-document scope',
      'operations.transfer_framework_reasons':'policyReceipt.r: bit mask of failed producer completion prerequisites',
      'operations.transfer_supplement_disposition':'policyReceipt.s: bit mask from the retained unresolved material child records',
      'operations.cmp_coordinator':'original result event: lambdaLaneTimingSummary.cmpPreferenceInspection',
    } as Record<string,string>)[key]!;
    mapping='Keep candidate retrieval, producer ownership, text receipt and coordinator attempt distinct. A receipt does not re-verify local text bytes; a limited attempt does not establish worker completion. Missing records stay unavailable.';
    if(key==='operations.transfer_framework_check')mapping='Keep completed checks, qualifying signals during partial coverage, inconclusive assessments, explicit not assessed and unknown distinct. No inference from an omitted checklist row.';
    if(key==='operations.transfer_framework_reasons')mapping='A report can have multiple failed prerequisites. A zero mask records no blockers. Missing masks are unavailable.';
    if(key==='operations.transfer_supplement_disposition')mapping='Count each retained disposition at most once per report. Missing detail is unavailable. Explicit unknown dispositions remain distinct.';
  }
  if(key.startsWith('gpc_'))eligible=sealed?'Original explicitly enabled GPC attempts (sealed source)':'Readable reportable scans; unavailable GPC fields stay in the denominator; presence of a GPC object is not enablement proof';
  const exact:Record<string,string>={outcome:sealed?'inventory.status + persisted no-go + publication status (retained only)':'scanStatus + resultDisposition',evidence:sealed?'export hash + persisted projection sourceHash join':'cache receipt hash/size/embedded UUID + exact local file',publication:'sealed snapshot publication record',policy_fetch:'sealed policy inspection.policyFetches',policy_owner:'sealed policy inspection.metadataUsablePolicyCandidates',policy_full_text:'sealed verified privacy-policy bytes + complete retained text metadata',cmp_provider:sealed?'consentControlAssessment.cmpAudit.support.provider':'executiveSummary.consentPlatform',cmp_dispatch:'sealed sourceFacts.facets.cmp_dispatch.state',gpc_path:sealed?'explicit lambda_config enablement + retained GPC observation or separately labelled source facet':'gpcResponse.observation.status',gpc_delivery:'gpcResponse.observation.delivery.httpHeaderRetained AND mainNavigatorReadbackRetained',gpc_finding:sealed?'Persisted GPC assessment record; existence is not an adverse finding':'projectedFindings.items exact GPC IDs in this public list only; omitted canonical GPC results are not evidence of absence',accessibility:'accessibilityAudit.status (exclude required=false)','accessibility.results':'accessibilityAudit.failedRuleCount is nonnegative integer','accessibility.review':'accessibilityAudit.reviewRuleCount > 0 / = 0 / unavailable','accessibility.examples':'accessibilityAudit.exampleCoverage.omittedNodeCount > 0 / = 0 / unavailable','accessibility.coverage':'accessibilityAudit.status + valid failedRuleCount; missing and failed status never imply completed','selection.status':'retained bounded production ID receipt.status; no detailed report eligibility'};
  if(exact[key])field=exact[key]!;
  const action=key.match(/^detail\.(accept|reject)\.(verdict|projectable|reason|stop)$/);
  if(action)field=`${action[1]==='accept'?'postAcceptObservation':'postRefusalObservation'}.${({verdict:'verdict',projectable:'productionProjectable',reason:'indeterminateReason (confirmed disposition + null -> not_indeterminate)',stop:'afterAction.stopReason'} as Record<string,string>)[action[2]!]}`;
  const gpcDetails:Record<string,string>={cmp_receipt:'observation.registration.cmpGpcSignal',semantic_readiness:'observation.semanticReadiness.reason',paired_sale_transition:'cmpStateComparison baseline.sale -> gpc.sale',paired_sharing_transition:'cmpStateComparison baseline.sharing -> gpc.sharing',paired_advertising_opportunity:'activityComparison.activity.advertisingMarketing baselineRequests and gpcRequests',early_zero_later_collection:'validated paired gpcRequests compared with independently bound full-visit advertisingCollectionCount',request_sample_cap:'observation.requests.samplesTruncated'};
  for(const side of ['baseline','gpc'])for(const axis of ['sale','sharing'])gpcDetails['paired_'+side+'_'+axis]='cmpStateComparison.'+side+'.'+axis+' after shared scan/source/scope binding';
  if(gpcDetails[key.slice(11)]){field='gpcResponse.'+gpcDetails[key.slice(11)];mapping='Strict schema and original-source binding; descriptive facts only. Missing reason is reason_not_retained; receipt, current state, independent-visit differences and early zero never establish honoring.';}
  else if(key.startsWith('detail.gpc.session_')){field='gpcResponse.observation.requests with strict schema, scan, original GPC source, session and document binding';mapping='Whole-visit retained positive evidence and request coverage; independent of paired-window availability, zero never establishes absence';}
  else if(key.startsWith('detail.gpc.paired_')){field='gpcResponse.activityComparison with strict schema, scan and original source pair binding; collection samples also agree with bounded GPC evidence';mapping='Availability and retained-sample coverage only; missing is unavailable, zero never proves absence, differences never establish GPC causation';}
  else if(key.startsWith('detail.gpc.'))field='gpcResponse.'+(({response:'status',semantic_probe:'observation.semanticProbe',acknowledgment:'observation.acknowledgment.observed (negative requires captureComplete)',sale:'observation.registration.sale',sharing:'observation.registration.sharing',activity_comparison:'activityComparison.status'} as Record<string,string>)[key.slice(11)]??'unavailable');
  if(key.startsWith('detail.forms.'))field='formsSummary.'+(({count:'countStatus',before:'preConsentCapture',after:'afterAcceptCapture'} as Record<string,string>)[key.slice(13)]??'unavailable');
  if(key==='detail.storage.classification')field='executiveSummary.preConsentStorageAssessment.status';
  if(key.startsWith('detail.inventory.'))field=(({cookies:'cookieStorageInventory',vendors:'trackerVendorInventory',requests:'requestEvidenceInventory',findings:'projectedFindings',policy:'policySurfaceCoverage'} as Record<string,string>)[key.slice(17)]??'unavailable')+'.cap.truncated; inconsistent totals retained separately';
  if(key==='detail.navigation.host')field='coverageDiagnostics.navigationSummary.landedOnDifferentHost';
  if(key.startsWith('detail.sealed.'))field='typed runtime projection schema + scanId + original bundle source hash; missing projection unavailable, failed binding unverified';
  if(key.startsWith('customer_cmp_check.')||key==='checklist.consent_optional_defaults_on'){
    source='Retained public export; customer packet values require exact scan, time and report generation binding';
    field=key.startsWith('customer_cmp_check.')?'customerConsentEvidence.criteria[id].status':'Exported checklist evidenceState or evidenceLabel, then customerConsentEvidence.checklist[id].evidenceState when absent';
    mapping='Use the named returned state only. Keep explicit not assessed, not applicable and limitations separate from unavailable. Customer packet series includes the packet and assessment versions.';
  }
  if(key.startsWith('cmp_check.'))field='consentControlAssessment.cmpAudit.rows[id].status; status is not provider/action success';
  if(key==='detail.gpc.assessment_coverage'){field='Schema-validated gpcResponse.comparison.comparable';mapping='assessed / inconclusive / unavailable; assessability is not reduction or honoring';}
  if(key==='detail.gpc.california_collection'){field='Schema-validated gpcResponse.californiaPolicy.applied plus source-bound policy-qualified collection';mapping='recorded / not_recorded / unavailable; excludes neutral canonical presence and acknowledgment-only contradictions. Not recorded is not no risk.';}
  if(key==='cmp_provider')mapping='Returned provider string; null/absent = unknown/unavailable, never no-CMP inference';
  if(key.startsWith('accessibility')){eligible='Readable reportable scans except explicit required=false; missing required or counts remain unavailable';mapping+=' Engine, engine version and scope are separate comparison series.';}
  if(quantity){field=m.path;mapping='Only nonnegative safe integers; missing/null/invalid values excluded from median, counted as missing within the eligible population. Zero remains measured.';}
  if(key.startsWith('gpc.session.')&&quantity){field='Validated gpcResponse.observation.requests';mapping='Whole-visit retained positives and horizon; separate qualification/coverage series, not matched-window counts or evidence of absence';}
  else if(key.startsWith('gpc.paired.')&&quantity){field='Validated gpcResponse.activityComparison';mapping='Matched duration and retained samples only; separate source/policy/window series, no absence or causal inference';}
  if(/^(site|technology|graph|form)\./.test(key)&&quantity){source='Source-bound sealed projection only';mapping+=' Deferred graph references and inline graph counts use separate series.';}
  return {id,kind,version:METRIC_CONTRACT_VERSION,...(allClickActivity||/^detail\.(accept|reject)\.verdict$/.test(id)?{definitionVersion:'certscore.audit.post-click-activity.v1'}:usableChoiceFunnel?{definitionVersion:'certscore.audit.usable-choice-funnel.v1'}:{}),...(key==='detail.forms.after'?{definitionVersion:'certscore.audit.forms-after-retained.v2'}:{}),...((key.startsWith('gpc.paired.')||key.startsWith('gpc.session.'))||(key.startsWith('detail.gpc.paired_')||key.startsWith('detail.gpc.session_'))?{definitionVersion:'certscore.audit.gpc-paired.v1'}:{}),meaning,eligiblePopulation:eligible,numerator:quantity?'Sum and median of valid measured values':m.success?.length?m.success:'No primary success rate; state-specific counts only',denominator:quantity?'measured for median; all eligible plus missing shown':eligible,source,field,stateMapping:mapping,supportedVersions:sealed?['retained typed schema validation; each assessment/projection version separated']:PUBLIC_SOURCE_PAIRS,comparison:'Same metric, source, schema, policy/engine scope and population only. Mixed-source aggregate rate and delta are null; per-source series remain visible. No interpolation across missing days.',direction:'Descriptive prevalence/coverage only; not accuracy, improvement or compliance'};
}
export function makeContracts(metrics:any[],quantities:any[]) {
  return {version:METRIC_CONTRACT_VERSION,metrics:metrics.map(m=>metricContract(m)),quantities:quantities.map(m=>metricContract(m,'quantity')),findings:{version:METRIC_CONTRACT_VERSION,meaning:'Returned canonical finding prevalence, without reclassification or rescoring',numerator:'Reports containing the exact returned canonical ID within a complete valid inventory',denominator:'Complete returned inventories of the same source/schema; incomplete/unavailable inventories and their positive findings remain separately counted',source:'Public projectedFindings.items and cap only; never internal finding-ID fallback',stateMapping:'Positive returned IDs retained even in truncated inventories; absent ID is not zero unless inventory completeness is explicit and coherent; top selection unknown when unavailable',supportedVersions:PUBLIC_VERSIONS,comparison:'Separate public schema/projection/resolver/policy series; no mixed-series delta'},missing:'Unavailable fields/files are distinct from explicit unknown, not_confirmed, not_testable and genuinely not_checked. ID-selection proof never implies detailed evidence verification.'};
}
