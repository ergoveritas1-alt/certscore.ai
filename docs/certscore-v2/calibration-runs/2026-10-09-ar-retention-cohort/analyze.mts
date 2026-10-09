import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
const ns=await import('../../packages/certscore-contracts/src/index.ts');
const c=ns.default??ns;
const root='artifacts/ar-retention-cohort-20261009';
const sites:any[]=[], contacts:any[]=[], validation:any[]=[];
for(const [group,file] of [['public','summary.json'],['owned','owned-summary.json'],['owned_repair','owned-repair-summary.json']]) {
 const summary=JSON.parse(await readFile(`${root}/${file}`,'utf8'));
 for(const v of summary.visits) {
  assert.ok(v.completedAt, `unfinished visit ${v.url}`);
  const r=JSON.parse(await readFile(v.resultPath,'utf8'));
  assert.equal(r.lanes.length,3);
  const consent=r.lanes.find((x:any)=>x.lane==='consent');
  const noGo=consent.runtime?.noGoCandidate===true;
  const site:any={group,url:v.url,version:v.version,visitStatus:v.status,noGo,noGoReasons:consent.runtime?.noGoReasons??[],durationMs:Date.parse(v.completedAt)-Date.parse(v.startedAt),consent:{status:consent.status,moduleStatus:consent.moduleStatus,observations:consent.observations?.map((o:any)=>({accept:o.accept,reject:o.reject,options:o.options,inventoryOutcome:o.inventoryOutcome,captureStatus:o.captureStatus})),screenshots:consent.screenshots,geometryScreenshot:consent.geometry?.screenshotArtifactRef},actions:[]};
  for(const lane of r.lanes) {
   contacts.push({group,url:v.url,scanId:lane.scanId,startedAt:lane.startedAt,completedAt:lane.completedAt,scannerRuntimeStarted:lane.scannerRuntimeStarted,status:lane.status,runtime:{noGoCandidate:noGo,noGoReasons:site.noGoReasons}});
   if(lane.lane==='consent') continue;
   const packetPath=v.resultPath.replace('result.json',`${lane.lane}/${lane.lane==='accept'?'PostAcceptEvidencePacket':'PostRefusalEvidencePacket'}.json`);
   let bytes:Buffer;
   try {bytes=await readFile(packetPath);} catch {site.actions.push({action:lane.lane,status:lane.status,packetMissing:true,error:lane.error});validation.push({group,url:v.url,version:v.version,action:lane.lane,packetMissing:true});continue;}
   const p=JSON.parse(bytes.toString('utf8')); assert.equal(p.scanId,lane.scanId); const packetSha256=createHash('sha256').update(bytes).digest('hex');
   const schema=lane.lane==='accept'?c.postAcceptEvidencePacketSchema:c.postRefusalEvidencePacketSchema;
   const parsed=schema.safeParse(p); assert.ok(parsed.success,`${v.url} ${lane.lane}: ${JSON.stringify(parsed.error)}`);
   const projection=lane.lane==='accept'?c.projectPostAcceptEvidenceForReport({packet:p,packetSha256}):c.projectPostRefusalEvidenceForReport({packet:p,packetSha256});
   if(lane.click?.outcome==='completed')assert.ok(c.consentActionControlProofSchema.safeParse(lane.actionControlProof).success);
   const registration=lane.lane==='accept'?p.acceptanceRegistration:p.refusalRegistration;
   site.actions.push({action:lane.lane,status:lane.status,packetPath,packetSha256,click:lane.click?.outcome,found:lane.resolver?.found,cmp:lane.resolver?.cmpId,registration,execution:projection.execution,captureCoverage:p.captureCoverage,retainedNetworkRows:p.network.requests.length,postRegistrationNonEssentialRequests:(p.network.postAcceptNonEssentialRequests??p.network.postRefusalNonEssentialRequests??[]).length,observationTypes:p.observations.map((o:any)=>o.observationType),capture:p.afterActionCapture?{stopReason:p.afterActionCapture.stopReason,requestedWindowMs:p.afterActionCapture.requestedWindowMs,elapsedMs:p.afterActionCapture.captureEndedAtMs-p.afterActionCapture.actionDispatchedAtMs}:undefined,timing:p.timing,limitations:p.limitations});
   validation.push({group,url:v.url,version:v.version,action:lane.lane,packetValid:true,packetSha256});
  }
  sites.push(site);
 }
}
assert.equal(new Set(contacts.map(x=>x.scanId)).size,contacts.length);
for(const group of ['public','owned','owned_repair']) {
 const rows=contacts.filter(x=>x.group===group);
 await writeFile(`${root}/${group}-contacts-summary.json`,JSON.stringify({generatedAt:new Date().toISOString(),contactNoGoPolicy:'Each isolated lane contact inherits the authoritative consent-proof visit no-go outcome; not an independent action-lane diagnosis.',results:rows},null,2)+'\n');
 await writeFile(`${root}/${group}-outcomes-summary.json`,JSON.stringify({generatedAt:new Date().toISOString(),results:sites.filter(s=>s.group===group).map(s=>({url:s.url,status:s.visitStatus,scannerRuntimeStarted:true,completedAt:rows.filter(r=>r.url===s.url).map(r=>r.completedAt).sort().at(-1),runtime:{noGoCandidate:s.noGo,noGoReasons:s.noGoReasons}}))},null,2)+'\n');
}
const counts:any={};
for(const version of ['baseline','candidate']) {
 const rows=sites.filter(s=>s.group==='public'&&s.version===version),actions=rows.flatMap(s=>s.actions);
 counts[version]={visits:rows.length,noGo:rows.filter(s=>s.noGo).length,usable:rows.filter(s=>!s.noGo&&s.consent.status==='completed').length};
 for(const action of ['accept','reject']) {const a=actions.filter(x=>x.action===action);counts[version][action]={packets:a.length,clicks:a.filter(x=>x.click==='completed').length,confirmed:a.filter(x=>x.registration?.status==='confirmed').length,succeeded:a.filter(x=>x.click==='completed'&&x.execution?.status==='succeeded').length,limited:a.filter(x=>x.click==='completed'&&x.execution?.status==='limited').length,unclickedLimited:a.filter(x=>x.click!=='completed'&&x.execution?.status==='limited').length,overflow:a.filter(x=>x.captureCoverage?.requestsDroppedAfterAction>0).length,dropped:a.reduce((n,x)=>n+(x.captureCoverage?.requestsDroppedAfterAction??0),0),replacements:a.reduce((n,x)=>n+(x.captureCoverage?.postActionRetention?.replacements??0),0)};}
}
const pairs=[...new Set(sites.filter(s=>s.group==='public').map(s=>s.url))].map(url=>{
 const b=sites.find(s=>s.group==='public'&&s.url===url&&s.version==='baseline'),a=sites.find(s=>s.group==='public'&&s.url===url&&s.version==='candidate');
 return {url,paired:!!b&&!!a,usable:!!b&&!!a&&!b.noGo&&!a.noGo&&b.consent.status==='completed'&&a.consent.status==='completed',durationDeltaMs:b&&a?a.durationMs-b.durationMs:null,baselineObservation:b?.consent.observations?.[0],candidateObservation:a?.consent.observations?.[0],actions:['accept','reject'].map(action=>({action,baseline:b?.actions.find((x:any)=>x.action===action)?.execution,candidate:a?.actions.find((x:any)=>x.action===action)?.execution}))};
});
const deltas=pairs.filter(p=>p.usable).map(p=>p.durationDeltaMs!).sort((a,b)=>a-b);
const quantile=(p:number)=>deltas.length?deltas[Math.min(deltas.length-1,Math.ceil(deltas.length*p)-1)]:null;
const metrics={scope:'Ten-site local counterbalanced diagnostic cohort plus two owned candidate canaries. Prior working baseline, not last deployed. Different live streams/local concurrency; no production or internet-wide reliability/speed claim.',counts,pairing:{attemptedSites:pairs.length,usablePairs:pairs.filter(p=>p.usable).length,medianVisitDeltaMs:quantile(.5),p95VisitDeltaMs:quantile(.95)},pairs,sites,validation,contacts:contacts.length};
await writeFile(`${root}/metrics.json`,JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({counts,pairing:metrics.pairing,owned:sites.filter(s=>s.group==='owned').map(s=>({url:s.url,noGo:s.noGo,actions:s.actions.map((a:any)=>({action:a.action,registration:a.registration?.status,execution:a.execution,requests:a.postRegistrationNonEssentialRequests,observations:a.observationTypes}))})),packetsValidated:validation.filter(v=>v.packetValid).length,contacts:contacts.length},null,2));
