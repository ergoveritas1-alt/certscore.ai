import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const ns=await import('../../packages/certscore-contracts/src/index.ts');
const c=ns.default??ns;
const root='artifacts/ar-request-retention-20261009';
const s=JSON.parse(await readFile(`${root}/summary.json`,'utf8'));
assert.equal(s.visits.length,2); assert.ok(s.visits.every((v:any)=>v.completedAt));
const sites=[],contacts=[],validation=[];
for(const v of s.visits){
 const r=JSON.parse(await readFile(v.resultPath,'utf8'));
 assert.equal(r.lanes.length,3);
 const consent=r.lanes.find((x:any)=>x.lane==='consent');
 const noGo=consent.runtime?.noGoCandidate===true;
 const site:any={url:v.url,version:v.version,visitStatus:v.status,noGo,consent:{status:consent.status,moduleStatus:consent.moduleStatus,observations:consent.observations?.map((o:any)=>({accept:o.accept,reject:o.reject,options:o.options,inventoryOutcome:o.inventoryOutcome,captureStatus:o.captureStatus})),screenshots:consent.screenshots?.map((x:any)=>({path:x.path,capturedAtMs:x.capturedAtMs,artifactId:x.artifactId}))},actions:[]};
 for(const lane of r.lanes){
  contacts.push({url:v.url,scanId:lane.scanId,startedAt:lane.startedAt,completedAt:lane.completedAt,scannerRuntimeStarted:lane.scannerRuntimeStarted,status:lane.status,runtime:{noGoCandidate:noGo,noGoReasons:noGo?consent.runtime.noGoReasons:[]}});
  if(lane.lane==='consent')continue;
  const packetBytes=await readFile(v.resultPath.replace('result.json',`${lane.lane}/${lane.lane==='accept'?'PostAcceptEvidencePacket':'PostRefusalEvidencePacket'}.json`));
  const p=JSON.parse(packetBytes.toString('utf8'));
  const packetSha256=createHash('sha256').update(packetBytes).digest('hex');
  const schema=lane.lane==='accept'?c.postAcceptEvidencePacketSchema:c.postRefusalEvidencePacketSchema;
  const parsed=schema.safeParse(p);assert.ok(parsed.success,`${v.url} ${lane.lane}: ${JSON.stringify(parsed.error)}`);
  const projection=lane.lane==='accept'?c.projectPostAcceptEvidenceForReport({packet:p,packetSha256}):c.projectPostRefusalEvidenceForReport({packet:p,packetSha256});
  if(lane.click?.outcome==='completed')assert.ok(c.consentActionControlProofSchema.safeParse(lane.actionControlProof).success);
  site.actions.push({action:lane.lane,status:lane.status,captureCoverage:p.captureCoverage,retainedNetworkRows:p.network.requests.length,retainedNonEssentialRows:p.network.requests.filter((r:any)=>r.nonEssential).length,found:lane.resolver?.found,cmp:lane.resolver?.cmpId,click:lane.click?.outcome,registration:lane.registration,execution:projection.execution,capture:lane.afterActionCapture?{stopReason:lane.afterActionCapture.stopReason,startedAtMs:lane.afterActionCapture.actionDispatchedAtMs,endedAtMs:lane.afterActionCapture.captureEndedAtMs}:undefined,timing:lane.timing,limitations:lane.limitations});
  validation.push({url:v.url,lane:lane.lane,packetValid:true,execution:projection.execution});
 }
 sites.push(site);
}
assert.equal(new Set(contacts.map(x=>x.scanId)).size,6);
await writeFile(`${root}/contacts-summary.json`,JSON.stringify({generatedAt:s.generatedAt,contactNoGoPolicy:'Each isolated lane contact inherits the authoritative consent-proof visit no-go outcome; not an independent lane diagnosis.',results:contacts},null,2)+'\n');
await writeFile(`${root}/outcomes-summary.json`,JSON.stringify({generatedAt:s.generatedAt,results:sites.map(site=>({url:site.url,scannerRuntimeStarted:true,status:site.visitStatus,completedAt:s.visits.find((v:any)=>v.url===site.url&&v.version===site.version).completedAt,runtime:{noGoCandidate:site.noGo,noGoReasons:contacts.find(x=>x.url===site.url)?.runtime.noGoReasons}}))},null,2)+'\n');
await writeFile(`${root}/metrics.json`,JSON.stringify({scope:'One FullStory baseline/candidate diagnostic pair, three isolated browser lanes each; different live request streams, no population or causal same-stream improvement claim.',sites,validation,contacts:contacts.length},null,2)+'\n');
console.log(JSON.stringify(sites.map(x=>({url:x.url,noGo:x.noGo,consent:x.consent.observations,actions:x.actions.map((a:any)=>({action:a.action,click:a.click,registration:a.registration?.status,execution:a.execution}))})),null,2));
