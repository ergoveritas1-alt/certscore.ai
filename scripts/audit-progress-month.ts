import { evidenceMetricRegistry, QUANTITIES, COVERAGE_MAP, quantityCsv } from "./lib/audit-progress-evidence";
/** Local, immutable month view. No network calls; archive samples + sealed audit coverage. */
import {createHash} from "node:crypto";
import {readFileSync,realpathSync,statSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildDashboard} from "./audit-progress-dashboard";
import {METRICS,PROGRESS_VERSION,summarizeDays,mergeVerifiedProgress,type ProgressRow} from "./lib/audit-progress";
import {extractExportRow,exportIsTest} from "./lib/audit-progress-export";
import {renderProgressDashboard} from "./lib/audit-progress-html";
const sha=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
function load(file:string){if(statSync(file).size>80_000_000)throw Error("Input exceeds bound");return JSON.parse(readFileSync(file,"utf8"));}
const receipt=(file:string)=>({file:realpathSync(file),sha256:sha(readFileSync(file)),bytes:statSync(file).size});
export async function buildMonth(input:{runsFile:string;originsFile:string;cacheRoot:string;out:string;issuesFile?:string;releaseWatchFile?:string}){
  if(existsSync(input.out))throw Error("Fresh output directory required");
  const cacheRoot=realpathSync(input.cacheRoot),manifestFile=path.join(cacheRoot,"cache-manifest.json"),manifest=load(manifestFile);
  if(manifest.version!=="certscore.mac-mini-evidence-cache.v1"||manifest.sourceWrites!==0||!Array.isArray(manifest.receipts)||manifest.receipts.length>15000)throw Error("Unsupported cache manifest");
  const start=Date.parse(manifest.start),end=Date.parse(manifest.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>32*86400000)throw Error("Month window exceeds bound");
  mkdirSync(input.out,{recursive:true});
  const recent=await buildDashboard({...input,evidenceDir:path.join(cacheRoot,"evidence"),out:path.join(input.out,"sealed-audits")});
  const originInput=load(input.originsFile),origins=new Map<string,any>(originInput.rows.map((r:any)=>[r.scanId,r]));
  const rows=new Map<string,ProgressRow>(),recentMap=new Map<string,ProgressRow>(recent.rows.map(r=>[r.scanId,r])),accounting:any[]=load(path.join(input.out,"sealed-audits","exclusions.json")),errors:any[]=[...recent.errors],seen=new Set<string>();
  for(const entry of manifest.receipts){
    if(entry.state!=="copied")continue;
    if(seen.has(entry.scanId))throw Error("Duplicate cache scan ID");seen.add(entry.scanId);
    try{
      const file=realpathSync(entry.file);
      if(file!==path.join(cacheRoot,"evidence",entry.scanId+".json")||statSync(file).size>6*1024*1024)throw Error("Cache path/bound mismatch");
      const bytes=readFileSync(file);if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error("Cache hash/size mismatch");
      const packet=JSON.parse(bytes.toString("utf8")),row=extractExportRow(packet,{file,sha256:entry.sha256,role:"hash_verified_bot_archive_export"}),time=Date.parse(row.createdAt);
      if(row.scanId!==entry.scanId||time<start||time>=end)throw Error("Cache identity/window mismatch");
      const origin=origins.get(row.scanId),verified=recentMap.get(row.scanId);
      const reason=exportIsTest(packet)||origin?.isCanary?"excluded_canary_or_test":origin?.isMacMini===false?"excluded_other_origin":origin&&!verified?"origin_unverified":null;
      if(reason){if(!accounting.some(a=>a.scanId===row.scanId&&a.reason===reason))accounting.push({scanId:row.scanId,reason});continue;}
      if(verified){
        // Public canonical finding IDs are consistent across the month. Internal assessments
        // supplement missing export fields only, with the joined generation proof retained.
        if(verified.states.evidence!=="generation_matched"){rows.set(row.scanId,verified);accounting.push({scanId:row.scanId,reason:"archive_generation_not_joined_to_audit"});continue;}
        Object.assign(row,mergeVerifiedProgress(row,verified));
        row.states.outcome=verified.states.outcome!;row.reportable=verified.reportable;
        row.producer=verified.producer;row.profile=verified.profile;row.assessmentVersion=verified.assessmentVersion;row.originRequestId=verified.originRequestId;row.refs.push(...verified.refs.filter(ref=>ref.file!==file));
        (row as any).originProof="original_credential_verified";
      }else (row as any).originProof="mac_mini_archive";
      rows.set(row.scanId,row);
    }catch(error){errors.push({scanId:entry.scanId,kind:"cache_export",reason:String(error)});}
  }
  for(const row of recent.rows)if(!rows.has(row.scanId)&&Date.parse(row.createdAt)>=start&&Date.parse(row.createdAt)<end){
    // An unexported report has no comparable public finding inventory.
    rows.set(row.scanId,{...row,findings:[],findingInventory:false,originProof:"original_credential_verified"} as ProgressRow);
  }
  const selected=[...rows.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const dynamic=recent.metrics.filter(m=>m.id.startsWith("cmp_check.")),metrics=[...METRICS,...evidenceMetricRegistry(selected),...dynamic];
  for(const row of selected)if(row.reportable)for(const metric of metrics.filter(m=>m.id.startsWith("cmp_check.")||m.id.startsWith("checklist.")))row.states[metric.id]??="not_checked";
  const windows=[...recent.windows,{start:manifest.start,end:manifest.end,runId:"mac-mini-local-archive",completeInventory:false}],days=summarizeDays(selected,windows,metrics),exclusionCounts:Record<string,number>={};
  for(const item of accounting)exclusionCounts[item.reason]=(exclusionCounts[item.reason]??0)+1;
  const data={...recent,rows:selected,metrics,quantities:QUANTITIES,coverageMap:COVERAGE_MAP,days,windows,includedRows:selected.length,inputRows:new Set([...seen,...recent.rows.map(r=>r.scanId),...accounting.map(a=>a.scanId)]).size,errors,exclusionCounts,cohort:"Mac mini retained export archive; recent original-credential-verified bot attempts supplement missing exports. Canary/test targets excluded before denominators.",sources:[...recent.sources,receipt(manifestFile)],limitations:[
    "Historical dates are retained-export samples, not complete attempt inventories. Missing historical exports and failures cannot be counted as zero.",
    "The archive folder establishes Mac mini provenance. Original creation credentials are independently verified only for the recent sealed audit interval; use the origin-proof filter to inspect that subset.",
    "Partial days and partial samples show descriptive percentage-point changes. Compare sample sizes, inventory hours, site mix and versions before interpreting movement.",
    "Historical public findings use their returned canonical IDs without reclassification. Export caps and missing inventories remain explicit. Headline/top selection is unavailable in historical exports and is shown as unknown.",
    "Control metrics use generation-matched persisted assessments where available, otherwise returned canonical checklist states; first-layer fallback remains explicitly labelled. Historical and recent assessment versions are not an accuracy comparison.",
    "Controls, execution, choice registration, GPC delivery and GPC findings are separate measures. Missing evidence does not become absence or success.",
    "Publication readiness and optional CMP worker details require the recent sealed evidence. Their absence in an older export is not failure.",
    "No scans, model calls, public target visits, production changes or historical report rewrites were performed. This view cannot independently close backlog issues."
  ]};
  writeFileSync(path.join(input.out,"dashboard.json"),JSON.stringify(data,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard.html"),renderProgressDashboard(data),{flag:"wx"});
  const quote=(v:any)=>'"'+String(v??"").replaceAll('"','""')+'"';
  const csv=["date,completeDay,inventoryHours,metric,state,count,denominator,percent,deltaPp,comparison"];
  for(const day of days)for(const metric of metrics){const v=day.metrics[metric.id];for(const state of Object.keys(v.stateDeltaPp)){const n=v.counts[state]??0;csv.push([day.date,day.completeDay,day.inventoryHours,metric.id,state,n,v.denominator,v.denominator?100*Number(n)/v.denominator:null,v.stateDeltaPp[state],v.comparison].map(quote).join(","));}}
  writeFileSync(path.join(input.out,"daily-metrics.csv"),csv.join("\n")+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-volumes.csv"),quantityCsv(days),{flag:"wx"});
  writeFileSync(path.join(input.out,"exclusions.json"),JSON.stringify(accounting,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard-seal.json"),JSON.stringify({version:PROGRESS_VERSION,files:["dashboard.json","dashboard.html","daily-metrics.csv","daily-volumes.csv","exclusions.json"].map(f=>receipt(path.join(input.out,f))),productionWrites:0,newScans:0,scheduledInvocationsAdded:0},null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({included:selected.length,days:days.length,errors:errors.length,exclusionCounts}));return data;
}
if(process.argv[1]&&pathToFileURL(realpathSync(process.argv[1])).href===import.meta.url){
  const [runsFile,originsFile,cacheRoot,out,issuesFile,releaseWatchFile]=process.argv.slice(2);
  if(!runsFile||!originsFile||!cacheRoot||!out)throw Error("Supply runs.json origins.json cache-root fresh-out [issues.json] [release-watch.json]");
  buildMonth({runsFile,originsFile,cacheRoot,out,issuesFile,releaseWatchFile}).catch(error=>{console.error(error);process.exitCode=1;});
}
