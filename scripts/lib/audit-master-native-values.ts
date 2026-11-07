import {publicSiteIntegritySchema} from './audit-public-site-integrity';
import {customerConsentEvidenceSchema} from '../../packages/certscore-api-contracts/src/customer-consent-evidence';
import {gpcVerificationScopes} from './audit-gpc-verification-scopes';
/** Exact retained values only. These readers never interpret display labels as evidence. */
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {publicCmsSecuritySchema} from '../../packages/certscore-api-contracts/src/detailed-evidence';
import {cmsSecurityProjectionSchema} from '../../packages/certscore-contracts/src/cms-security';
import {accessibilityAuditObservationSchema} from '../../packages/certscore-contracts/src/accessibility-audit';
import {siteIntegrityProjectionSchema} from '../../packages/certscore-contracts/src/site-integrity';
import type {ValueSample} from './audit-master-values';
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const count=z.number().int().nonnegative(),text=z.string().min(1).max(8192);
const identity=(doc:any)=>doc.scanId??doc.scan?.id;
const sample=(recordKey:string,value:unknown,qualification:string,availability='available'):ValueSample=>({recordKey,value,qualification,availability});
const unique=(rows:ValueSample[])=>{if(new Set(rows.map(r=>r.recordKey)).size!==rows.length)throw Error('Duplicate native record identity');return rows;};
export const EXTRA_NATIVE_PATHS:Record<string,Partial<Record<'report'|'standard'|'full'|'audit',string>>>={};
const add=(ids:string[],views:('report'|'standard'|'full'|'audit')[],path:string)=>{for(const id of ids)EXTRA_NATIVE_PATHS[id]=Object.fromEntries(views.map(view=>[view,path]));};
add(['gpc.delivery.verification'],['report','full'],'gpcResponse → bounded_main_document / matched_paired_window');
add(['consent.cmp.criterion.banner','consent.cmp.criterion.reject','consent.cmp.criterion.privacy_link'],['standard'],'customerConsentEvidence.criteria (versioned local extension)');
add(['technology.detections.count','technology.detection.product','technology.detection.version','technology.advisories.count','technology.advisory.record'],['report','full'],'cmsSecurity → verified detections/advisories');
add(['integrity.finding','integrity.links.inspected_count','integrity.links.evidence_count','integrity.links.evidence'],['report','full'],'siteIntegritySummary.findings / siteIntegrity → verified projection');
add(['policies.passage.text','policies.passage.source_ref'],['report','full'],'gdprTransparencyRows[*].policyEvidence.sections[*]');
add(['accessibility.examples.coverage','accessibility.examples.node'],['report'],'accessibilityEvidence → exampleCoverage / violations / reviewItems');
add(['tracking.inventory.cookie_record'],['standard'],'cookieStorageInventory.items + cap');
add(['tracking.inventory.vendor_record'],['standard'],'trackerVendorInventory.items + cap');
add(['operations.provenance.original_creator'],['audit'],'originProof + originRequestId');
add(['operations.provenance.source_hash'],['audit'],'publicProjectionSourceHash + projectionVersion + refs');
add(['operations.inventory.record_identity'],['audit'],'findings[*].id + findingInventory + topInventory');
add(['privacy.choice.result_record'],['audit'],'states[sealed.choice_finding.*] + metricSources');

export function extraNativeSamples(doc:any,id:string,view:string):ValueSample[]|undefined{
 if(!EXTRA_NATIVE_PATHS[id]?.[view as 'report'])return undefined;
 if(id==='gpc.delivery.verification')return gpcVerificationScopes(doc);
 if(id.startsWith('consent.cmp.criterion.')){
  if(!doc.customerConsentEvidence)return [];const p=customerConsentEvidenceSchema.parse(doc.customerConsentEvidence);
  if(p.binding.scanId!==doc.scanId||p.binding.reportSourceHash!==doc.meta?.reportProjectionSourceHash||p.binding.reportVersion!==doc.meta?.reportProjectionVersion||Date.parse(p.binding.createdAt)!==Date.parse(doc.timestamps?.createdAt))throw Error('Customer CMP packet generation mismatch');
  if(p.status!=='available')return [];
  return unique(p.criteria.filter(c=>c.id===id.split('.').at(-1)).map(c=>sample(c.id,c.status,p.version+'/'+p.binding.reportSourceHash+'/'+p.assessment!.sourceHash,c.status==='Not assessed'?'not_assessed':'available')));
 }
 if(id.startsWith('technology.')){
  if(!doc.cmsSecurity)return [];
  const raw=doc.cmsSecurity;
  let meta:any,detections:any[],advisories:any[];
  if(raw.version==='certscore.cms-report.v1'){
   const c=publicCmsSecuritySchema.parse(raw);meta=c;detections=c.detections;advisories=c.advisories;
  }else{
   const c=cmsSecurityProjectionSchema.parse(raw);meta={...c,...c.assessment,assessmentContractVersion:c.contractVersion};detections=c.assessment.detections;
   advisories=c.assessment.matches.map(a=>({evidenceRef:a.evidenceRef,detectionRef:a.detectionRef,observedVersion:a.observedVersion,confidence:a.confidence,kind:a.record.kind,title:a.record.title,sourceUrl:a.record.sourceUrl,fixedVersions:a.record.fixedVersions??[],matchedRange:a.matchedRange,advisoryId:a.record.id,qualification:a.record.qualification,severity:a.record.severity}));
  }
  if(meta.scanId!==identity(doc))throw Error('Technology scan mismatch');
  const scope=['cms-assessment',meta.assessmentContractVersion,meta.sourceHash,meta.documentUrl,meta.capturedAt,meta.catalogueVersion].join('/');
  if(id.endsWith('.count'))return [sample('scope',id.includes('advisories')?advisories.length:detections.length,scope)];
  if(id==='technology.advisory.record')return unique(advisories.map(a=>sample(a.evidenceRef+'/'+a.detectionRef+'/'+a.advisoryId,a,scope)));
  return unique(detections.map(d=>sample(d.evidenceRef,id.endsWith('.product')?{product:d.product,name:d.name}:{version:d.version,versionStatus:d.versionStatus,versionBasis:d.versionBasis,confidence:d.confidence,observedVersions:d.observedVersions},scope,d.version===null&&id.endsWith('.version')?'unknown':'available')));
 }
 if(id.startsWith('integrity.')){
  const source=view==='full'?doc.reportEvidence:doc;
  const findings=source?.siteIntegritySummary?.findings??(source?.siteIntegrity?[source.siteIntegrity]:[]);
  if(!Array.isArray(findings)||findings.length>1000)throw Error('Invalid integrity inventory');
  const values:ValueSample[]=[];
  for(const f of findings){const p=view==='full'?publicSiteIntegritySchema.parse(f.evidence):siteIntegrityProjectionSchema.parse(f.evidence);if(p.scanId!==identity(doc)||f.findingId!=='site_integrity_hidden_outbound_links')throw Error('Integrity scan/finding mismatch');
   const scope=[p.contractVersion,p.sourceHash,p.observationHash,p.observation.documentUrl,p.observation.capturedAt,p.observation.truncated].join('/');
   const key=p.contractVersion==='certscore.site-integrity-projection.v2'?p.pageId+'/'+p.attemptId:p.scanId;
   if(id==='integrity.links.evidence')for(const link of p.observation.links)values.push(sample(key+'/'+link.evidenceRef,link,scope));
   else values.push(sample(key,id==='integrity.finding'?f:id==='integrity.links.inspected_count'?p.observation.inspectedLinks:p.observation.links.length,scope));
  }return unique(values);
 }
 if(id.startsWith('policies.passage.')){
  const rows=z.array(z.object({id:text,policyEvidence:z.object({capturedAt:z.string().refine(v=>Number.isFinite(Date.parse(v))),documentTitle:z.string().max(8192),sourceUrl:z.string().url(),sections:z.array(z.object({excerpt:text,heading:z.string().max(8192)})).max(200)}).optional()})).max(200).parse(doc.gdprTransparencyRows??[]);
  return unique(rows.flatMap(r=>r.policyEvidence?.sections.map(s=>{const p=r.policyEvidence!;return sample(r.id+'/'+digest([p.sourceUrl,p.capturedAt,s.heading,s.excerpt]),id.endsWith('.text')?s.excerpt:{sourceUrl:p.sourceUrl,capturedAt:p.capturedAt,documentTitle:p.documentTitle,heading:s.heading},'retained-policy-passage/'+p.sourceUrl+'/'+p.capturedAt);})??[]));
 }
 if(id.startsWith('accessibility.examples.')){
  if(!doc.accessibilityEvidence)return [];const p=accessibilityAuditObservationSchema.parse(doc.accessibilityEvidence);if(p.scanId!==identity(doc))throw Error('Accessibility scan mismatch');
  const scope=[p.contractVersion,p.engine,p.engineVersion,p.documentUrl,p.startedAt,p.completedAt,JSON.stringify(p.frameCoverage??null)].join('/');
  if(id.endsWith('.coverage'))return p.exampleCoverage?[sample('scope',p.exampleCoverage,scope)]:[];
  return unique((['violations','reviewItems'] as const).flatMap(kind=>p[kind].flatMap(rule=>rule.representativeNodes.map(node=>sample(kind+'/'+rule.ruleId+'/'+digest(node.selectors),{ruleId:rule.ruleId,kind,node},scope+'/observed_'+rule.nodeCount)))));
 }
 if(view==='standard'){
  const packet=doc[id.endsWith('.cookie_record')?'cookieStorageInventory':'trackerVendorInventory'];if(packet===undefined)return [];
  const p=z.object({items:z.array(z.record(z.unknown())).max(150),cap:z.object({shown:count,total:count,truncated:z.boolean()}).strict()}).strict().parse(packet);
  if(p.cap.shown!==p.items.length||p.cap.total<p.cap.shown||p.cap.truncated!==(p.cap.total>p.cap.shown))throw Error('Inventory cap mismatch');
  const scope='public-inventory/'+doc.meta.projectionVersion+'/'+JSON.stringify(p.cap);
  if(p.items.length===0)return [sample('@inventory',[],scope,p.cap.total===0?'empty_inventory':'no_records_retained')];
  return unique(p.items.map(row=>{
   // Observation provenance distinguishes repeated cookie writes/snapshots. Vendor
   // signatures distinguish independent recognitions, never new recipient entities.
   const key=id.endsWith('.cookie_record')?JSON.stringify([text.parse(row.cookieName),z.string().nullable().parse(row.domain),row.party,
    row.setMethod??null,row.firstObservedAtMs??null,row.setAtMs??null,row.sourceRequestUrl??null,row.responseUrl??null,row.initiatorUrl??null]):
    JSON.stringify([text.parse(row.name),z.array(z.string()).parse(row.domains).slice().sort(),z.array(z.string()).parse(row.attributionSignatures??[]).slice().sort()]);
   // Existing customer-safe projected inventory, never raw cookie values or requests.
   if(['value','cookieValue','rawValue','body'].some(k=>Object.hasOwn(row,k)))throw Error('Unexpected raw inventory value');
   return sample(key,row,scope);
  }));
 }
 if(id==='operations.provenance.original_creator')return [sample('origin',{proof:doc.originProof??'unverified_archive_provenance',requestId:doc.originRequestId},'audit-original-creator-context',doc.originProof==='original_credential_verified'?'available':'unknown')];
 if(id==='operations.provenance.source_hash')return [sample('generation',{sourceHash:doc.publicProjectionSourceHash,generation:doc.projectionVersion,receipts:doc.refs},'audit-generation-receipts')];
 if(id==='operations.inventory.record_identity')return unique((doc.findings??[]).map((f:any)=>sample(text.parse(f.id),{id:f.id,label:f.label,family:f.family,top:f.top,inventoryComplete:doc.findingInventory,topInventory:doc.topInventory??false},'canonical-finding-inventory/'+String(doc.metricSources?.findings??doc.defaultSource))));
 if(id==='privacy.choice.result_record')return Object.entries(doc.states??{}).filter(([key])=>key.startsWith('sealed.choice_finding.')).map(([key,value])=>{
  if(!['surfaced','not_surfaced','not_returned','unavailable'].includes(String(value)))throw Error('Invalid canonical choice record state');
  const scope=doc.metricSources?.[key];if(typeof scope!=='string'||!scope.includes('certscore.audit-choice-summary.'))throw Error('Missing canonical record source');
  return sample(key,{id:key.slice('sealed.choice_finding.'.length),state:value},scope,value==='unavailable'?'not_retained':'available');
 });
 return [];
}
