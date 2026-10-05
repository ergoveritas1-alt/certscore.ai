/** Offline independent raw-to-window recomputation and protocol audit. */
import fs from 'node:fs';import path from 'node:path';
import {readCsv} from './csv.ts';import {sha,summarize} from './metrics.ts';
const root=path.resolve(process.argv[2]??'artifacts/research/gpc-controlled-study-2026'),mode=process.argv[3]??'pilot-v1';
const config=JSON.parse(fs.readFileSync(root+'/frozen_config.json','utf8'));
const planned=new Map(readCsv(root+'/randomization.csv').map(r=>[r.visit_id,r]));
const records=fs.readdirSync(root+'/private/'+mode).filter(p=>/^site_.*\.json$/.test(p)).sort().map(p=>JSON.parse(fs.readFileSync(root+'/private/'+mode+'/'+p,'utf8')));
const errors:string[]=[],counts:Record<string,number>={},limits:Record<string,number>={},browsers=new Set(),contexts=new Set(),sites=new Map<string,any[]>();let verified=0,complete=0,delivery=0,snapshots=0;
for(const r of records){
 const id=r.visit.visit_id,p=planned.get(id);if(!p){errors.push(id+':unplanned');continue;}
 for(const k of ['site_id','condition','block','position','assigned_order','design'])if(String(r.visit[k])!==p[k])errors.push(id+':assignment_'+k);
 if(r.configSha256!==sha(config))errors.push(id+':config');
 counts[r.status]=(counts[r.status]??0)+1;for(const l of r.coverage?.limitations??[])limits[l]=(limits[l]??0)+1;
 if(!sites.has(r.visit.site_id))sites.set(r.visit.site_id,[]);sites.get(r.visit.site_id)!.push(r);
 if(!r.artifact)continue;
 const raw={...r};delete raw.artifact;delete raw.configSha256;
 if(sha(raw)!==r.artifact.sha256||Buffer.byteLength(JSON.stringify(raw))!==r.artifact.sizeBytes)errors.push(id+':artifact_hash');else verified++;
 for(const k of ['imageDigest','chromiumVersion','runnerBundleSha256','lambdaBundleSha256','publicSuffixDataSha256','resolverVersion','egressIdSha256'])if(r.provenance[k]!==config[k])errors.push(id+':provenance_'+k);
 for(const [key,set] of [['browserId',browsers],['contextId',contexts]] as const){if(set.has(r.provenance[key]))errors.push(id+':reused_'+key);set.add(r.provenance[key]);}
 if(r.observed.delivery?.length)delivery++;
 for(const w of r.derived.windows){const expected=summarize(r.observed.requests,r.observed.document.committedAt,w.horizonMs);for(const [k,v] of Object.entries(expected))if(JSON.stringify(w[k])!==JSON.stringify(v))errors.push(id+':window_'+w.horizonMs+'_'+k);if(w.complete){complete++;if(r.coverage.limitations.length||r.coverage.requestsDropped)errors.push(id+':false_complete');}}
 for(const s of r.observed.snapshots){snapshots++;if(s.horizonMs!==1000&&s.horizonMs!==5000&&s.horizonMs!==10000)errors.push(id+':unexpected_horizon');}
}
for(const rr of sites.values()){
 const contacted=rr.filter(r=>r.status!=='not_contacted').sort((a,b)=>a.visit.block-b.visit.block||a.visit.position-b.visit.position);
 for(let i=1;i<contacted.length;i++){const a=contacted[i-1],b=contacted[i];if(!b.provenance?.startedAt)continue;const spacing=a.visit.block===b.visit.block?config.withinPairSpacingMs:config.blockSpacingMs;if(Date.parse(b.provenance.startedAt)-Date.parse(a.provenance.completedAt)<spacing)errors.push(b.visit.visit_id+':spacing');}
}
const result={run:mode,terminalVisits:records.length,status:counts,artifactHashesVerified:verified,deliveryProofVisits:delivery,completeNetworkWindows:complete,snapshots,uniqueBrowserIds:browsers.size,uniqueContextIds:contexts.size,limitations:limits,errors};
fs.mkdirSync(root+'/exports',{recursive:true});fs.writeFileSync(root+'/exports/'+mode+'_audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
