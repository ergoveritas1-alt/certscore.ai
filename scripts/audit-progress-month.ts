import { verifyProgressPins } from './lib/audit-progress-pins';
import { namespaceSealed, monthMetricRegistry, makeContracts, METRIC_CONTRACT_VERSION } from './lib/audit-progress-contracts';
import { progressEngine } from './lib/audit-progress-engine';
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
  const toolSources=verifyProgressPins();
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
        if(verified.states.evidence!=="generation_matched"){Object.assign(row.states,{"sealed.evidence":verified.states.evidence});row.metricSources!["sealed.evidence"]="unjoined_sealed_audit";rows.set(row.scanId,row);accounting.push({scanId:row.scanId,reason:"archive_generation_not_joined_to_audit"});continue;}
        Object.assign(row,mergeVerifiedProgress(row,verified));
        // Public disposition remains public; sealed outcomes are separate.
        row.producer=verified.producer;row.profile=verified.profile;row.originRequestId=verified.originRequestId;row.refs.push(...verified.refs.filter(ref=>ref.file!==file));
        (row as any).originProof="original_credential_verified";
      }else (row as any).originProof="mac_mini_archive";
      rows.set(row.scanId,row);
    }catch(error){errors.push({scanId:entry.scanId,kind:"cache_export",reason:String(error)});}
  }
  for(const row of recent.rows)if(!rows.has(row.scanId)&&Date.parse(row.createdAt)>=start&&Date.parse(row.createdAt)<end){
    // An unexported report has no comparable public finding inventory.
    const separated=namespaceSealed(row);separated.states.outcome="export_unavailable";separated.states.evidence="unavailable";
    separated.metricSources!.outcome="sealed_id_selection/no_public_export";separated.metricSources!.evidence="sealed_id_selection/no_public_export";
    rows.set(row.scanId,{...separated,findings:[],findingInventory:false,originProof:"original_credential_verified"} as ProgressRow);
  }
  // Exact IDs from the already-retained bounded query. No live queries or archive enumeration.
  if(manifest.directInventory){
    const rec=manifest.directInventory, file=rec.file??rec.path;
    if(!file||sha(readFileSync(file))!==rec.sha256)throw Error("Direct inventory receipt mismatch");
    const inventory=load(file);if(inventory.readOnly!==true||!Array.isArray(inventory.rows))throw Error("Invalid retained ID selection");
    for(const entry of manifest.receipts.filter((r:any)=>r.state!=="copied")){
      if(rows.has(entry.scanId))continue;
      const i=inventory.rows.find((r:any)=>r.scanId===entry.scanId);
      if(!i||i.isMacMini!==true||i.isCanary||!i.originalRequestId)continue;
      if(/^(www\.)?ergoveritas\.com$|localhost|\.(test|invalid)$/i.test(i.hostname)){accounting.push({scanId:i.scanId,reason:"excluded_canary_or_test"});continue;}
      const time=Date.parse(i.created_at);if(time<start||time>=end)continue;
      rows.set(i.scanId,{scanId:i.scanId,site:i.hostname,createdAt:new Date(i.created_at).toISOString(),region:i.scan_from,producer:"unavailable",profile:"unavailable",assessmentVersion:"unavailable",projectionVersion:"unavailable",originRequestId:i.originalRequestId,originProof:"production_id_selection_only",states:{outcome:"export_unavailable",evidence:"unavailable", "selection.status":i.status},metricSources:{outcome:"retained_production_id_selection/v1",evidence:"retained_production_id_selection/v1","selection.status":"retained_production_id_selection/v1"},findings:[],findingInventory:false,reportable:false,refs:[{file,sha256:rec.sha256,role:"ID selection only; detailed evidence unavailable"}]});
    }
  }
  const selected=[...rows.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const base=[...METRICS,...evidenceMetricRegistry(selected),{id:"selection.status",label:"Production ID-only status (no detailed export)",group:"Publication & evidence",denominator:"Retained ID-only rows; completion status does not establish usable report or detailed evidence",success:[]}];
  const metrics=monthMetricRegistry(base,recent.metrics);
  const quantities=QUANTITIES;
  const metricIds=new Set(metrics.map(m=>m.id));
  for(const row of selected)for(const id of Object.keys(row.states))if(!metricIds.has(id)){delete row.states[id];delete row.metricSources?.[id];}
  for(const row of selected){
    // Retain unavailable public evidence in its eligible population, never backfill it.
    if(row.reportable)for(const metric of base){
      if(/^(registration|terminal)\./.test(metric.id)||metric.id==="publication"||metric.id==="selection.status")continue;
      if(metric.id.startsWith("accessibility")&&row.states.accessibility===undefined&&row.metricSources?.accessibility)continue;
      row.states[metric.id]??="unavailable";
      row.metricSources??={};if(!row.defaultSource)row.metricSources[metric.id]??="unavailable_public_export";
    }
    if(row.reportable)for(const q of quantities){row.metricSources??={};if(!row.defaultSource)row.metricSources[q.id]??="unavailable_sealed_projection";}

  }
  const windows=[...recent.windows,{start:manifest.start,end:manifest.end,runId:"mac-mini-local-archive",completeInventory:false}],calendar=summarizeDays(selected,windows,metrics),exclusionCounts:Record<string,number>={};
  const findingIds=[...new Set(selected.flatMap(r=>r.findings.map(f=>f.id)))].sort();
  const days=progressEngine().aggregate({days:calendar,metrics,quantities,findingIds},selected);
  for(const item of accounting)exclusionCounts[item.reason]=(exclusionCounts[item.reason]??0)+1;
  const contracts=makeContracts(metrics,quantities);
  for(const row of selected)delete row.metricLabels;
  const data={...recent,toolSources,rows:selected,metrics,quantities,metricContractVersion:METRIC_CONTRACT_VERSION,contracts,findingIds,coverageMap:COVERAGE_MAP,days,windows,includedRows:selected.length,inputRows:new Set([...seen,...recent.rows.map(r=>r.scanId),...accounting.map(a=>a.scanId)]).size,errors,exclusionCounts,cohort:"Mac mini retained export archive; recent original-credential-verified bot attempts supplement missing exports. Canary/test targets excluded before denominators.",sources:[...recent.sources,receipt(manifestFile)],limitations:[
    "Historical dates are retained-export samples, not complete attempt inventories. Missing historical exports and failures cannot be counted as zero.",
    "The archive folder establishes Mac mini provenance. Original creation credentials are independently verified only for the recent sealed audit interval; use the origin-proof filter to inspect that subset.",
    "Partial days and partial samples show descriptive percentage-point changes. Compare sample sizes, inventory hours, site mix and versions before interpreting movement.",
    "Historical public findings use their returned canonical IDs without reclassification. Export caps and missing inventories remain explicit. Headline/top selection is unavailable in historical exports and is shown as unknown.",
    "Public first-layer control presence, checklist evidence states, checklist verdicts and sealed assessments are distinct metrics. No persisted fallback overwrites public evidence. Source/schema/engine boundaries split trends and suppress incompatible deltas.",
    "Controls, execution, choice registration, GPC delivery and GPC findings are separate measures. Missing evidence does not become absence or success.",
    "Publication readiness, policy-byte verification and CMP worker details require sealed evidence and have separate named metrics. Missing exports remain unavailable; ID-only selection does not verify detailed evidence or reportability.",
    "No scans, model calls, public target visits, production changes or historical report rewrites were performed. This view cannot independently close backlog issues."
  ]};
  writeFileSync(path.join(input.out,"dashboard.json"),JSON.stringify(data)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard.html"),renderProgressDashboard(data),{flag:"wx"});
  writeFileSync(path.join(input.out,"metric-contracts.json"),JSON.stringify(contracts,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-metrics.csv"),progressEngine().stateCsv(days,metrics),{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-volumes.csv"),progressEngine().quantityCsv(days,quantities),{flag:"wx"});
  writeFileSync(path.join(input.out,"daily-findings.csv"),progressEngine().findingCsv(days,findingIds),{flag:"wx"});
  writeFileSync(path.join(input.out,"exclusions.json"),JSON.stringify(accounting,null,2)+"\n",{flag:"wx"});
  writeFileSync(path.join(input.out,"dashboard-seal.json"),JSON.stringify({version:PROGRESS_VERSION,files:["dashboard.json","dashboard.html","daily-metrics.csv","daily-volumes.csv","daily-findings.csv","metric-contracts.json","exclusions.json"].map(f=>receipt(path.join(input.out,f))),productionWrites:0,newScans:0,scheduledInvocationsAdded:0},null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({included:selected.length,days:days.length,errors:errors.length,exclusionCounts}));return data;
}
if(process.argv[1]&&pathToFileURL(realpathSync(process.argv[1])).href===import.meta.url){
  const [runsFile,originsFile,cacheRoot,out,issuesFile,releaseWatchFile]=process.argv.slice(2);
  if(!runsFile||!originsFile||!cacheRoot||!out)throw Error("Supply runs.json origins.json cache-root fresh-out [issues.json] [release-watch.json]");
  buildMonth({runsFile,originsFile,cacheRoot,out,issuesFile,releaseWatchFile}).catch(error=>{console.error(error);process.exitCode=1;});
}
