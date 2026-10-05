/** Offline calibration from verified pilot artifacts. Never contacts a website or AWS. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {gpcImpactRequestSetHash} from '../../../packages/certscore-scan-core/src/gpc-impact-capture.ts';
import {gpcEndpointEvidence} from '../../../packages/certscore-scan-core/src/gpc-vendor-evidence.ts';
const pilot=path.resolve('artifacts/research-analysis/gpc-production-20260930');
const out=path.resolve('artifacts/research/gpc-controlled-study-2026');
const pop=JSON.parse(fs.readFileSync(path.join(pilot,'private/ca-population.json'),'utf8'));
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const records:any[]=[];
for(const row of pop.filter((r:any)=>r.build==='cef8e72983a277dc2c1994bca833405a183a9073'&&!r.canary&&r.activity_traffic?.class!=='internal')){
 const a=row.persisted_gpc??row.research_gpc;
 for(const lane of ['baseline','gpc']){
  const p=path.join(pilot,'private/raw',`${row.id}-${lane}.json.gz`);if(!fs.existsSync(p))continue;
  const bytes=zlib.gunzipSync(fs.readFileSync(p));const ptr=a.comparison[lane+'Artifact'];
  if(bytes.length!==ptr.sizeBytes||sha(bytes)!==ptr.sha256)throw Error('artifact_integrity');
  const b=JSON.parse(bytes.toString()),c=b.gpcImpactCapture,d=c?.document,commit=d?.committedAtMs;
  const record:any={scanId:row.id,lane,access:b.scanLaneRuns[0]?.accessOutcome,signalLimits:b.gpcSignalObservation?.limitationKeys??[],requestsDropped:c?.requestsDropped??null,timing:{},windows:[],diagnosticWindows:[]};
  for(const t of b.modulesRun.find((m:any)=>m.moduleName==='preConsentRuntimeScanner')?.timingBreakdown??[]){
   if(['browser launch','browser context','page navigation','page evidence: consolidated snapshot','GPC signal readback','GPC opt-out prototype','cookie capture','passive evidence quiet wait'].includes(t.label))record.timing[t.label]=t.durationMs;
  }
  record.timing['worker total']=Date.parse(b.completedAt)-Date.parse(b.startedAt);
  if(Number.isFinite(commit)){
   record.timing['commit from worker start']=commit;
   record.timing['impact capture after commit']=c.capturedAtMs-commit;
   record.timing['semantic after commit']=(b.gpcImpactSemanticObservation??b.gpcObservationSession?.semanticObservation)?.capturedAtMs-commit;
   record.timing['cookie snapshot after commit']=b.cookieSnapshots[0]?.capturedAtMs-commit;
   record.timing['storage snapshot after commit']=b.storageSnapshots[0]?.capturedAtMs-commit;
   const declared=c.windows??[];
   const complete=(h:number)=>{
    const w=declared.find((x:any)=>x.durationMs===h);if(!w)return false;
    const ev=b.networkEvents.filter((e:any)=>e.timestampMs>=commit&&e.timestampMs<commit+h);
    return b.runtimeCoverage?.coverageStatus==='usable'&&record.access==='representative_page'&&c.retentionStatus!=='incomplete'&&!c.requestsDropped&&!c.limitationKeys.length&&!c.invalidationReasons?.length&&c.readbackDocumentToken===d.token&&c.capturedAtMs>=commit+h&&w.requestCount===ev.length&&new Set(ev.map((e:any)=>e.eventId)).size===ev.length&&w.requestSetSha256===gpcImpactRequestSetHash(ev);
   };
   const metric=(h:number)=>{
    const ev=b.networkEvents.filter((e:any)=>e.timestampMs>=commit&&e.timestampMs<commit+h),ids=new Set(ev.map((e:any)=>e.eventId));
    const v=b.normalizedVendorObservations.filter((v:any)=>v.matchedEvidenceIds.some((id:string)=>ids.has(id)&&gpcEndpointEvidence(v,id)==='verified'));
    const group=(purposes:string[])=>{const vv=v.filter((v:any)=>purposes.includes(v.purpose));const ids2=new Set(vv.flatMap((v:any)=>v.matchedEvidenceIds.filter((id:string)=>ids.has(id)&&gpcEndpointEvidence(v,id)==='verified')));return {requests:ev.filter((e:any)=>ids2.has(e.eventId)).length,services:new Set(vv.map((v:any)=>JSON.stringify([v.vendor,v.product??'unspecified',v.purpose]))).size};};
    return {horizonMs:h,requests:ev.length,thirdParty:ev.filter((e:any)=>e.thirdParty).length,trackers:group(['advertising','marketing','analytics','session_replay']),advertising:group(['advertising','marketing']),analytics:group(['analytics','session_replay']),cookieWriteEvents:b.cookieEvents.filter((e:any)=>e.timestampMs>=commit&&e.timestampMs<commit+h&&['document_cookie','set_cookie_header'].includes(e.operation)).length};
   };
   for(const h of [250,500,1000,2000,5000,10000]){
    const m=metric(h);record.diagnosticWindows.push({...m,complete:complete(h)});
    if(complete(h))record.windows.push(m);
   }
   record.maxCertifiedHorizonMs=Math.max(0,...record.windows.map((w:any)=>w.horizonMs));
   record.lastObservedRequestAfterCommit=Math.max(0,...b.networkEvents.map((e:any)=>e.timestampMs-commit));
  }
  for(const k of Object.keys(record.timing))if(!Number.isFinite(record.timing[k]))delete record.timing[k];
  records.push(record);
 }
}
fs.mkdirSync(path.join(out,'private'),{recursive:true,mode:0o700});
fs.writeFileSync(path.join(out,'private/calibration-records.json'),JSON.stringify(records),{mode:0o600});
console.log(JSON.stringify({lanes:records.length,completeByHorizon:Object.fromEntries(['baseline','gpc'].map(l=>[l,Object.fromEntries([250,500,1000,2000,5000,10000].map(h=>[h,records.filter(r=>r.lane===l&&r.windows.some((w:any)=>w.horizonMs===h)).length]))]))}));
