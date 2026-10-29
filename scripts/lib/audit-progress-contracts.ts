/** Versioned audit semantics. This module never changes product assessments. */
import type { Metric, ProgressRow } from './audit-progress';
export const METRIC_CONTRACT_VERSION = 'certscore.audit-metrics.v1';
export const PUBLIC_VERSIONS = ['pulse-public-v4', 'pulse-public-v5'];
export const PROJECTION_VERSIONS = ['scan-report-projection-v26', 'scan-report-projection-v27'];
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
  for(const [id,value] of Object.entries(row.states)){if(!isSealedMetric(id))continue;states[`sealed.${id}`]=value;sources[`sealed.${id}`]=source+(row.metricSources?.[id]?`/${row.metricSources[id]}`:'');}
  for(const [id,value] of Object.entries(row.measurements??{})){
    // Public measurements read from the identical export need no second copy.
    if(!/^(site|technology|graph|form)\./.test(id)) continue;
    measurements[id]=value;sources[id]=source+(id.startsWith('graph.')?`/${row.states['detail.sealed.relationships']}`:'');
  }
  return {...row,states,metricSources:sources,measurements,metricLabels:{}};
}
export function monthMetricRegistry(base:Metric[], recent:Metric[]):Metric[] {
  const list=[...base,...recent.filter(m=>isSealedMetric(m.id)&&(!/^(checklist|verdict)\./.test(m.id)||!base.some(b=>b.id===m.id))).map(m=>({...m,success:m.id==="evidence"?["generation_matched"]:m.success,id:`sealed.${m.id}`,label:m.id==="evidence"?"Export generation joined to sealed evidence":m.id.startsWith("control.")?`${m.id.slice(8)} persisted control state`:`${m.label} · sealed assessment`,group:`Sealed · ${m.group}`,denominator:/^(registration|terminal)\./.test(m.id)?"Completed sealed clicks; unavailable witnesses remain in the denominator":m.id==="gpc_path"||m.id==="gpc_delivery"?"Explicitly enabled sealed GPC attempts; enablement is not inferred from public objects":"Retained sealed eligibility plus reportable rows with unavailable sealed evidence"}))];
  return [...new Map(list.map(m=>[m.id,m])).values()];
}
export function metricContract(m:any,kind='state') {
  const id=String(m.id),sealed=id.startsWith('sealed.'),key=id.replace(/^sealed\./,''),quantity=kind==='quantity';
  let source=sealed?'Verified sealed assessment; never used as a public-export fallback':'Retained public export; no persisted-assessment fallback';
  let meaning=m.label,eligible=m.denominator??'Readable reportable cohort rows, including rows with unavailable measurements';
  let mapping='Preserve the named returned state; missing field = unavailable, explicit null = unknown. No evidence/verdict substitution.';
  let field=key;
  if(key.startsWith('control.')){meaning=sealed?'Persisted control assessment state':'Pre-interaction first-layer control presence';field=sealed?'consentControlAssessment.controls.<control>.state':'consentSurfaceEvidence.firstLayerConsentChoices.<control>ControlObserved';mapping=sealed?'Persisted observed / not_observed / unknown, otherwise unavailable':'true with first-layer pre-interaction capture = observed; false plus complete inventory and capture = not_observed; incomplete or null = unknown; missing = unavailable';}
  if(key.startsWith('checklist.')||key.startsWith('topic.')||key==='privacy_policy'){field=sealed?'canonicalReportProjection.checklistRows[id].evidenceState (never status)':'gdprEprivacyChecklistRows.items[id].evidenceState OR evidenceLabel (never status)';meaning='Returned checklist evidence state; concern/gap are assessed states, not underlying control presence';}
  if(key.startsWith('verdict.')){field=sealed?'canonicalReportProjection.checklistRows[id].status':'gdprEprivacyChecklistRows.items[id].status';meaning='Returned checklist verdict, separately retained from evidence state';}
  if(key.startsWith('execution.')){field='postAccept/RefusalObservation.execution';mapping='Validate choice_path_execution.v1; retain status; missing = unavailable; invalid = unsupported_schema';}
  if(key.startsWith('click.'))field='Validated execution.clickCompleted; sealed original packet fallback is a separately named source';
  if(key.startsWith('registration.')){field='postAccept/RefusalObservation.registrationStatus or legacy status';mapping='confirmed_clean / confirmed_observation -> confirmed; unconfirmed and aborted retained; missing unavailable; never execution consentConfirmed';}
  if(key.startsWith('terminal.')){field='source-bound terminalDecision plus afterActionCapture';mapping='Valid bound witness = verified; explicit invalid witness = unverified; missing = unavailable';}
  if(key.startsWith('gpc_'))eligible=sealed?'Original explicitly enabled GPC attempts (sealed source)':'Readable reportable scans; unavailable GPC fields stay in the denominator; presence of a GPC object is not enablement proof';
  const exact:Record<string,string>={outcome:sealed?'inventory.status + persisted no-go + publication status (retained only)':'scanStatus + resultDisposition',evidence:sealed?'export hash + persisted projection sourceHash join':'cache receipt hash/size/embedded UUID + exact local file',publication:'sealed snapshot publication record',policy_fetch:'sealed policy inspection.policyFetches',policy_owner:'sealed policy inspection.metadataUsablePolicyCandidates',policy_full_text:'sealed verified privacy-policy bytes + complete retained text metadata',cmp_provider:sealed?'consentControlAssessment.cmpAudit.support.provider':'executiveSummary.consentPlatform',cmp_dispatch:'sealed sourceFacts.facets.cmp_dispatch.state',gpc_path:sealed?'explicit lambda_config enablement + retained GPC observation or separately labelled source facet':'gpcResponse.observation.status',gpc_delivery:'gpcResponse.observation.delivery.httpHeaderRetained AND mainNavigatorReadbackRetained',gpc_finding:'projectedFindings.items exact GPC IDs; no-finding requires complete inventory and complete observation',accessibility:'accessibilityAudit.status (exclude required=false)','accessibility.results':'accessibilityAudit.failedRuleCount is nonnegative integer','accessibility.review':'accessibilityAudit.reviewRuleCount > 0 / = 0 / unavailable','accessibility.examples':'accessibilityAudit.exampleCoverage.omittedNodeCount > 0 / = 0 / unavailable','accessibility.coverage':'accessibilityAudit.status + valid failedRuleCount; missing and failed status never imply completed','selection.status':'retained bounded production ID receipt.status; no detailed report eligibility'};
  if(exact[key])field=exact[key]!;
  const action=key.match(/^detail\.(accept|reject)\.(verdict|projectable|reason|stop)$/);
  if(action)field=`${action[1]==='accept'?'postAcceptObservation':'postRefusalObservation'}.${({verdict:'verdict',projectable:'productionProjectable',reason:'indeterminateReason (confirmed disposition + null -> not_indeterminate)',stop:'afterAction.stopReason'} as Record<string,string>)[action[2]!]}`;
  if(key.startsWith('detail.gpc.'))field='gpcResponse.'+(({response:'status',semantic_probe:'observation.semanticProbe',acknowledgment:'observation.acknowledgment.observed (negative requires captureComplete)',sale:'observation.registration.sale',sharing:'observation.registration.sharing',activity_comparison:'activityComparison.status'} as Record<string,string>)[key.slice(11)]??'unavailable');
  if(key.startsWith('detail.forms.'))field='formsSummary.'+(({count:'countStatus',before:'preConsentCapture',after:'afterAcceptCapture'} as Record<string,string>)[key.slice(13)]??'unavailable');
  if(key==='detail.storage.classification')field='executiveSummary.preConsentStorageAssessment.status';
  if(key.startsWith('detail.inventory.'))field=(({cookies:'cookieStorageInventory',vendors:'trackerVendorInventory',requests:'requestEvidenceInventory',findings:'projectedFindings',policy:'policySurfaceCoverage'} as Record<string,string>)[key.slice(17)]??'unavailable')+'.cap.truncated; inconsistent totals retained separately';
  if(key==='detail.navigation.host')field='coverageDiagnostics.navigationSummary.landedOnDifferentHost';
  if(key.startsWith('detail.sealed.'))field='typed runtime projection schema + scanId + original bundle source hash; missing projection unavailable, failed binding unverified';
  if(key.startsWith('cmp_check.'))field='consentControlAssessment.cmpAudit.rows[id].status; status is not provider/action success';
  if(key==='cmp_provider')mapping='Returned provider string; null/absent = unknown/unavailable, never no-CMP inference';
  if(key.startsWith('accessibility')){eligible='Readable reportable scans except explicit required=false; missing required or counts remain unavailable';mapping+=' Engine, engine version and scope are separate comparison series.';}
  if(quantity){field=m.path;mapping='Only nonnegative safe integers; missing/null/invalid values excluded from median, counted as missing within the eligible population. Zero remains measured.';}
  if(/^(site|technology|graph|form)\./.test(key)&&quantity){source='Source-bound sealed projection only';mapping+=' Deferred graph references and inline graph counts use separate series.';}
  return {id,kind,version:METRIC_CONTRACT_VERSION,meaning,eligiblePopulation:eligible,numerator:quantity?'Sum and median of valid measured values':m.success?.length?m.success:'No primary success rate; state-specific counts only',denominator:quantity?'measured for median; all eligible plus missing shown':eligible,source,field,stateMapping:mapping,supportedVersions:sealed?['retained typed schema validation; each assessment/projection version separated']:PUBLIC_VERSIONS.flatMap(a=>PROJECTION_VERSIONS.map(b=>`${a}/${b}`)),comparison:'Same metric, source, schema, policy/engine scope and population only. Mixed-source aggregate rate and delta are null; per-source series remain visible. No interpolation across missing days.',direction:'Descriptive prevalence/coverage only; not accuracy, improvement or compliance'};
}
export function makeContracts(metrics:any[],quantities:any[]) {
  return {version:METRIC_CONTRACT_VERSION,metrics:metrics.map(m=>metricContract(m)),quantities:quantities.map(m=>metricContract(m,'quantity')),findings:{version:METRIC_CONTRACT_VERSION,meaning:'Returned canonical finding prevalence, without reclassification or rescoring',numerator:'Reports containing the exact returned canonical ID within a complete valid inventory',denominator:'Complete returned inventories of the same source/schema; incomplete/unavailable inventories and their positive findings remain separately counted',source:'Public projectedFindings.items and cap only; never internal finding-ID fallback',stateMapping:'Positive returned IDs retained even in truncated inventories; absent ID is not zero unless inventory completeness is explicit and coherent; top selection unknown when unavailable',supportedVersions:PUBLIC_VERSIONS,comparison:'Separate public schema/projection/resolver/policy series; no mixed-series delta'},missing:'Unavailable fields/files are distinct from explicit unknown, not_confirmed, not_testable and genuinely not_checked. ID-selection proof never implies detailed evidence verification.'};
}
