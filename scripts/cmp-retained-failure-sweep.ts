import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {postAcceptEvidencePacketSchema,postRefusalEvidencePacketSchema,projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport,assessConsentActionStages,ONETRUST_REVIEWED_SDKS} from "../packages/certscore-contracts/src/index";

type Packet=ReturnType<typeof postAcceptEvidencePacketSchema.parse>|ReturnType<typeof postRefusalEvidencePacketSchema.parse>;
export type SweepInput={cohort:string;action:"accept"|"reject";site:string;scanId:string;contacted:boolean;source?:{file:string;sha256:string;bytes?:number};expectedRegistration?:string;capturedAt?:string};
export type SweepRow=SweepInput & {primary:string;provider:string|null;confirmed:boolean|null;clickCompleted:boolean|null;observationCompleted:boolean|null;reasons:string[];resolverStates:string[];categoryExposure:boolean;receiptExposure:boolean};
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
 return {primary,provider:stages.provider,confirmed,clickCompleted:click,observationCompleted:observation,reasons,resolverStates:packet.interactionDiagnostics?.resolver?.snapshots.map(s=>s.state)??[],categoryExposure,receiptExposure,registration:projection.registrationStatus};
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
function counts(values:string[]){const c:Record<string,number>=Object.create(null);for(const v of values)c[v]=(c[v]??0)+1;return Object.fromEntries(Object.entries(c).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export function sweepRetainedCmp(manifestPath:string,out:string){
 if(existsSync(out))throw Error('Choose a new immutable output directory');
 const inputBytes=readFileSync(manifestPath);const input=JSON.parse(inputBytes.toString()) as {policyVersion:string;rows:SweepInput[]};
 if(input.policyVersion!=='cmp_retained_sweep_input.v1'||!Array.isArray(input.rows))throw Error('Unsupported manifest');
 const rows:SweepRow[]=[],seen=new Set<string>();
 for(const entry of input.rows){
  if(!entry.cohort||!entry.site||!entry.scanId||!['accept','reject'].includes(entry.action)||typeof entry.contacted!=='boolean')throw Error('Invalid identity');
  const identity=JSON.stringify([entry.cohort,entry.scanId,entry.action]);if(seen.has(identity))throw Error('Duplicate scan/action identity in cohort');seen.add(identity);
  if(!entry.source){if(entry.contacted)throw Error('Contacted row requires original packet evidence');rows.push({...entry,primary:'not_contacted',provider:null,confirmed:null,clickCompleted:null,observationCompleted:null,reasons:[],resolverStates:[],categoryExposure:false,receiptExposure:false});continue;}
  if(!entry.contacted)throw Error('A retained action packet cannot be an uncontacted slot');
  const bytes=readFileSync(entry.source.file);if(digest(bytes)!==entry.source.sha256||(entry.source.bytes!==undefined&&bytes.length!==entry.source.bytes))throw Error('Retained packet hash/size mismatch: '+entry.source.file);
  const packet=(entry.action==='accept'?postAcceptEvidencePacketSchema:postRefusalEvidencePacketSchema).parse(JSON.parse(bytes.toString()));
  if(packet.parentScanId!==entry.scanId)throw Error('Packet/scan identity mismatch');
  const result=classifyCmpFailure(packet,entry.action,entry.source.sha256);
  if(entry.expectedRegistration!==undefined&&result.registration!==entry.expectedRegistration)throw Error('Historical registration changed');
  rows.push({...entry,...result});
 }
 const groups=summarizeFailureRows(rows);
 const totals=[...new Set(rows.map(r=>r.cohort))].map(cohort=>{const planned=rows.filter(r=>r.cohort===cohort),contacted=planned.filter(r=>r.contacted),complete=contacted.filter(r=>r.clickCompleted===true);return {cohort,planned:planned.length,contacted:contacted.length,sites:new Set(contacted.map(r=>r.site)).size,clickCompleted:complete.length,observationCompleted:contacted.filter(r=>r.observationCompleted===true).length,confirmed:contacted.filter(r=>r.confirmed===true).length,categoryExposure:contacted.filter(r=>!r.confirmed&&r.categoryExposure).length,receiptExposure:contacted.filter(r=>!r.confirmed&&r.receiptExposure).length};});
 const result={policyVersion:'cmp_retained_failure_sweep.v1',generatedAt:new Date().toISOString(),input:{file:resolve(manifestPath),sha256:digest(inputBytes)},interpretation:'Current candidate canonical replay of original bytes; no recapture or historical repair. Cohorts and arms remain separate. Primary groups describe earliest unresolved stages, not proven root causes. Unknown control/provider does not mean absent control/CMP. Exposures overlap. Historical evidence cannot acquire missing runtime proof.',candidateReviewedSdkPins:ONETRUST_REVIEWED_SDKS,totals,groups,rows};
 mkdirSync(out,{recursive:true});writeFileSync(join(out,'sweep.json'),JSON.stringify(result,null,2)+'\n');
 const e=(x:unknown)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 writeFileSync(join(out,'sweep.html'),`<!doctype html><meta charset="utf-8"><title>CertScore.ai retained CMP sweep</title><style>body{font:15px system-ui;color:#172033;background:#f6f7fb;margin:32px}table{border-collapse:collapse;background:white;width:100%;margin:24px 0}td,th{padding:12px;border:1px solid #ddd;text-align:left}p{max-width:1000px;line-height:1.5}details{max-width:650px}h2{overflow-wrap:anywhere}</style><h1>CertScore.ai retained CMP failure groups</h1><p>${e(result.interpretation)}</p>${totals.map(t=>`<h2>${e(t.cohort)}</h2><p>${t.contacted} contacted / ${t.planned} planned; ${t.sites} sites; ${t.clickCompleted} clicks; ${t.observationCompleted} completed observations; ${t.confirmed} confirmed decisions.</p><table><tr><th>First unresolved stage</th><th>Actions</th><th>Scans</th><th>Sites</th><th>Providers and reasons</th></tr>${groups.filter(g=>g.cohort===t.cohort).map(g=>`<tr><td>${e(g.primary)}</td><td>${g.actions}</td><td>${g.scans}</td><td>${g.sites}</td><td><details><summary>Evidence</summary><p>${e(JSON.stringify(g.providers))}</p><p>${e(JSON.stringify(g.reasons))}</p></details></td></tr>`).join('')}</table>`).join('')}`);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [manifest,out]=process.argv.slice(2);if(!manifest||!out)throw Error('Usage: cmp-retained-failure-sweep.ts <manifest.json> <new output directory>');const result=sweepRetainedCmp(manifest,out);console.log(JSON.stringify({totals:result.totals,groups:result.groups.map(({cohort,primary,actions,scans,sites})=>({cohort,primary,actions,scans,sites}))},null,2));}
