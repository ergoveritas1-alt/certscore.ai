import { progressEngine } from './lib/audit-progress-engine';
import { evidenceMetricRegistry, QUANTITIES, COVERAGE_MAP, quantityCsv } from "./lib/audit-progress-evidence";
/** Local-only CertScore.ai dashboard over retained bot exports and sealed audits. */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BOT_ORIGIN_VERSION, type BotOrigin } from "./lib/audit-bot-origin";
import { METRICS, PROGRESS_VERSION, TIMEZONE, arr, obj, cohortDecision, extractProgressRow, summarizeDays, type ProgressRow } from "./lib/audit-progress";
import { sourceFacets, actionFacts } from "./lib/daily-reliability-scorecard";
import { inspectPolicyCapture } from "./lib/daily-policy-audit";
import { renderProgressDashboard } from "./lib/audit-progress-html";
const hash=(v:string|Uint8Array)=>createHash("sha256").update(v).digest("hex");
const read=(file:string,max=80_000_000)=>{if(statSync(file).size>max)throw Error("Input exceeds byte bound");return JSON.parse(readFileSync(file,"utf8"));};
function fingerprint(file:string){const bytes=readFileSync(file);return {file:realpathSync(file),sha256:hash(bytes),bytes:bytes.length};}
function boundedFile(root:string,file:string,max=20_000_000){const f=realpathSync(file);if(!f.startsWith(realpathSync(root)+path.sep)||statSync(f).size>max)throw Error("Evidence escapes retained run or exceeds bound");return readFileSync(f);}
export async function buildDashboard(input:{runsFile:string;originsFile:string;evidenceDir:string;out:string;issuesFile?:string;releaseWatchFile?:string}){
  if(existsSync(input.out))throw Error("Use a fresh dashboard output directory");
  const runInputs=read(input.runsFile);if(!Array.isArray(runInputs)||!runInputs.length||runInputs.length>30)throw Error("Supply 1–30 retained runs");
  const originInput=read(input.originsFile);if(originInput.version!==BOT_ORIGIN_VERSION||originInput.readOnly!==true||!Array.isArray(originInput.rows))throw Error("Verified read-only original-request provenance required");
  const origins=new Map<string,BotOrigin>();for(const origin of originInput.rows){if(origins.has(origin.scanId))throw Error("Duplicate original-request provenance");origins.set(origin.scanId,origin);}
  const require=createRequire(import.meta.url);require.cache[require.resolve("server-only")]={exports:{},loaded:true} as any;
  const {readPersistedScanReportProjection}=require("../apps/web/server/scans/scan-report-projection-contract");
  const rows:ProgressRow[]=[],accounting:{scanId:string;reason:string}[]=[],windows:{start:string;end:string;runId:string;completeInventory?:boolean}[]=[],sources:any[]=[],errors:any[]=[];
  const evidenceRoot=realpathSync(input.evidenceDir),seen=new Set<string>();
  mkdirSync(input.out,{recursive:true});
  for(const entry of runInputs){
    const root=realpathSync(entry.path),begin=read(path.join(root,"begin.json")),sealFile=path.join(root,"pass-a-seal.json"),seal=read(sealFile);
    if(hash(boundedFile(root,seal.file))!==seal.sha256)throw Error("Independent audit Pass A seal invalid");
    const start=begin.windowStartUtc,end=begin.windowEndUtc??begin.auditEndUtc;
    if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))throw Error("Missing frozen audit interval");
    windows.push({start,end,runId:entry.runId??begin.runId});sources.push(fingerprint(sealFile),fingerprint(path.join(root,"work-inventory-v2.json")));
    const inventory=read(path.join(root,"work-inventory-v2.json")),receipts=[...read(path.join(root,"evidence-retrieval-receipts.json")),...(existsSync(path.join(root,"support-retrieval-receipts.json"))?read(path.join(root,"support-retrieval-receipts.json")):[])];
    if(!Array.isArray(inventory)||inventory.length>5000)throw Error("Unsupported inventory");
    windows[windows.length-1]!.completeInventory=inventory.every(i=>origins.has(i.id));
    for(const i of inventory){
      if(!/^[a-f0-9-]{36}$/i.test(i.id)||!Number.isFinite(Date.parse(i.created_at)))throw Error("Invalid inventory identity/time");
      if(Date.parse(i.created_at)<Date.parse(start)||Date.parse(i.created_at)>=Date.parse(end))throw Error("Inventory outside frozen window");
      if(seen.has(i.id)){accounting.push({scanId:i.id,reason:"overlap_not_counted_twice"});continue;}seen.add(i.id);
      const origin=origins.get(i.id);const early=cohortDecision(origin,i);
      if(early!=="included"){accounting.push({scanId:i.id,reason:early});continue;}
      const refs:ProgressRow["refs"]=[];
      const load=(kind:string)=>{
        const matches=receipts.filter(r=>r.scanId===i.id&&r.kind===kind&&(r.eventIndex===undefined||r.eventIndex===0));if(!matches.length)return undefined;
        if(matches.length!==1){errors.push({scanId:i.id,kind,reason:"ambiguous_source"});return undefined;}
        try{
          const r=matches[0],bytes=boundedFile(root,r.localPath),expected=obj(r.expected),event=obj(arr(i.retained)[0]);
          if(r.verified!==true||hash(bytes)!==expected.sha256||bytes.length!==expected.sizeBytes)throw Error("source_hash_or_size");
          if(["scanArtifactUri","manifestUri","postAcceptPacketUri","postRefusalPacketUri"].includes(kind)&&(obj(obj(event.hashes)[kind]).sha256!==expected.sha256||obj(obj(event.hashes)[kind]).sizeBytes!==expected.sizeBytes||obj(event.pointers)[kind]!==r.uri))throw Error("source_event_binding");
          const value=JSON.parse(bytes.toString("utf8"));const action=kind==="postAcceptPacketUri"?"accept_observation":kind==="postRefusalPacketUri"?"reject_observation":null;
          if(action?(value.parentScanId!==i.id||![i.id,`${i.id}:${action}`].includes(value.scanId)):value.scanId!==i.id)throw Error("source_scan_binding");
          refs.push({file:r.localPath,sha256:expected.sha256,role:kind});return value;
        }catch(error){errors.push({scanId:i.id,kind,reason:String(error)});return undefined;}
      };
      const bundle=load("scanArtifactUri"),decision=cohortDecision(origin,i,bundle);
      if(decision!=="included"){accounting.push({scanId:i.id,reason:decision});continue;}
      const manifest=load("manifestUri"),support=load("LocalV2DagLambdaShardSummary.json"),facets=bundle?sourceFacets(bundle,manifest??{},support??{}):{};
      const sourceFacts={profile:manifest?.privacyCaptureProfile??"unknown",facets,actions:{accept:actionFacts(load("postAcceptPacketUri")),reject:actionFacts(load("postRefusalPacketUri"))}};
      let record:any=null,report:any=null,exportState="missing",snapshot:any=null;
      const snapshotFile=path.join(root,"scans",i.id,"persisted","snapshot.json");
      if(existsSync(snapshotFile))try{
        const bytes=boundedFile(root,snapshotFile);snapshot=JSON.parse(bytes.toString("utf8"));
        if(snapshot.scan_id!==i.id)throw Error("snapshot_identity");
        record=readPersistedScanReportProjection({scan:{id:i.id,status:i.status},snapshot});
        if(record)refs.push({file:snapshotFile,sha256:hash(bytes),role:"checksum_verified_projection"});
      }catch(error){errors.push({scanId:i.id,kind:"snapshot",reason:String(error)});}
      const botFile=path.join(evidenceRoot,i.id+".json");
      try{
        const size=(await stat(botFile)).size;if(size>6*1024*1024)throw Error("bot_export_too_large");
        const bytes=await readFile(botFile),packet=JSON.parse(bytes.toString("utf8"));
        if(packet.scanId!==i.id||packet.scan_id&&packet.scan_id!==i.id)throw Error("bot_export_identity");
        const expected=snapshot?.report_projection_source_hash??i.projection_fingerprint?.sourceHash;
        if(typeof expected==="string"&&/^[a-f0-9]{64}$/.test(expected)&&packet.meta?.reportProjectionSourceHash===expected){report=packet;exportState="generation_matched";}
        else exportState="generation_unverified";
        refs.push({file:botFile,sha256:hash(bytes),role:exportState});
      }catch(error:any){if(error?.code!=="ENOENT"){exportState="invalid";errors.push({scanId:i.id,kind:"bot_export",reason:String(error)});}}
      const progress=extractProgressRow({inventory:i,origin:origin!,record,report,bundle,sourceFacts,refs,exportState});
      if(bundle){
        const policy=inspectPolicyCapture({root,scanId:i.id,site:i.hostname,region:i.scan_from,status:i.status,bundle,receipts});
        const privacy=policy.documents.filter(d=>d.surfaceType==="privacy_policy");
        progress.states.policy_fetch=policy.policyFetches===null?"unavailable":policy.policyFetches>0?"fetched":policy.inspection?.retrievalCoverage==="complete"?"no_fetch_returned":"unknown";
        progress.states.policy_owner=policy.metadataUsablePolicyCandidates===null?"unavailable":policy.metadataUsablePolicyCandidates>0?"producer_declared_usable":"unknown";
        progress.states.policy_full_text=privacy.some(d=>d.verification==="verified_local_bytes"&&d.textCoverage==="complete"&&!d.limitations.includes("retained_text_length_does_not_match_metadata"))?"verified_full_text":privacy.some(d=>d.verification==="invalid_local_bytes")?"invalid_local_bytes":privacy.some(d=>d.verification==="verified_local_bytes")?"verified_partial_or_unspecified":"unavailable";
        for(const doc of privacy)if(doc.file&&doc.verification==="verified_local_bytes")refs.push({file:path.join(root,doc.file.relativePath),sha256:doc.file.sha256,role:"verified_policy_text"});
      }
      rows.push(progress);
      if(rows.length%100===0)console.log(JSON.stringify({readBotScans:rows.length}));
    }
  }
  const dynamicMetrics=[...new Set(rows.flatMap(row=>Object.keys(row.states).filter(k=>k.startsWith("cmp_check."))))].sort().map(id=>({id,label:id.slice(10).replaceAll("_"," "),group:"CMP details",denominator:"Readable reportable scans; not assessed is distinct from failure",success:["observed"]}));
  for(const row of rows)if(row.reportable)for(const metric of dynamicMetrics)row.states[metric.id]??="unavailable";
  const metrics=[...METRICS,...evidenceMetricRegistry(rows),...dynamicMetrics];
  for(const row of rows)if(row.reportable)for(const metric of metrics.filter(m=>m.id.startsWith("checklist.")))row.states[metric.id]??="unavailable";
  const days=summarizeDays(rows,windows,metrics),exclusionCounts:Record<string,number>={};for(const a of accounting)exclusionCounts[a.reason]=(exclusionCounts[a.reason]??0)+1;
  const issues:any[]=[];
  function collectIssues(x:any){if(Array.isArray(x)){x.forEach(collectIssues);return;}if(!x||typeof x!=="object")return;if(x.id&&x.title&&x.status){issues.push({id:x.id,title:x.title,status:x.status,productionVerified:x.status==="production verified",evidence:arr(x.evidence).filter(v=>typeof v==="string"),lastSeen:x.lastSeen??null});return;}Object.values(x).forEach(collectIssues);}
  if(input.issuesFile){collectIssues(read(input.issuesFile));sources.push(fingerprint(input.issuesFile));}
  const releaseMarkers:any[]=[];
  function collectReleases(x:any){if(Array.isArray(x)){x.forEach(collectReleases);return;}if(!x||typeof x!=="object")return;const revision=x.revision??x.deploymentRevision??x.deployedRevision;const at=x.verifiedAt??x.recordedAtUtc??x.deployedAtUtc??x.recordedAt;if(typeof revision==="string"&&/^[a-f0-9]{40}$/.test(revision)&&typeof at==="string"&&Number.isFinite(Date.parse(at)))releaseMarkers.push({revision,at,status:String(x.status??(x.productionVerified?"production verified":"recorded; verification status unspecified"))});Object.values(x).forEach(collectReleases);}
  if(input.releaseWatchFile){collectReleases(read(input.releaseWatchFile));sources.push(fingerprint(input.releaseWatchFile));}
  const data={version:PROGRESS_VERSION,generatedAtUtc:new Date().toISOString(),timezone:TIMEZONE,cohort:"Original-request credential-bound Mac mini scan bot; canary/synthetic targets excluded",inputRows:seen.size,includedRows:rows.length,exclusionCounts,windows,metrics,quantities:QUANTITIES,coverageMap:COVERAGE_MAP,days,rows,issues,releaseMarkers:[...new Map(releaseMarkers.map(v=>[v.revision+v.at,v])).values()],errors,sources:[fingerprint(input.runsFile),fingerprint(input.originsFile),...sources],limitations:["Day-over-day percentage-point changes are descriptive, not accuracy or causal claims.","Partial calendar days show descriptive deltas with counts and coverage labels.","Independent action sessions do not form a strict funnel; registration is separate from execution.","Missing evidence remains not checked; intentionally omitted CMP workers remain separate.","Bot exports are fingerprinted and generation-joined; canonical findings require checksum-verified retained projections.","No source scans, findings or audit checkpoints were rewritten."]};
  writeFileSync(path.join(input.out,"dashboard.json"),JSON.stringify(data,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard.html"),renderProgressDashboard(data),{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-metrics.csv"),progressEngine().stateCsv(days,metrics),{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-volumes.csv"),progressEngine().quantityCsv(days,QUANTITIES),{flag:"wx"});
  writeFileSync(path.join(input.out,"exclusions.json"),JSON.stringify(accounting,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard-seal.json"),JSON.stringify({version:PROGRESS_VERSION,files:["dashboard.json","dashboard.html","daily-metrics.csv","daily-volumes.csv","exclusions.json"].map(f=>fingerprint(path.join(input.out,f))),scheduledInvocationsAdded:0,productionWrites:0,newScans:0},null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({included:rows.length,exclusionCounts,days:days.map(d=>({date:d.date,complete:d.completeDay,attempts:d.attempts})),errors:errors.length}));return data;
}
if(process.argv[1]&&pathToFileURL(realpathSync(process.argv[1])).href===import.meta.url){
  const [runsFile,originsFile,evidenceDir,out,issuesFile,releaseWatchFile]=process.argv.slice(2);
  if(!runsFile||!originsFile||!evidenceDir||!out)throw Error("Supply runs.json origins.json evidence-directory fresh-output-directory [issues.json] [release-watch.json]");
  buildDashboard({runsFile,originsFile,evidenceDir,out,issuesFile,releaseWatchFile}).catch(error=>{console.error(String(error));process.exitCode=1;});
}
