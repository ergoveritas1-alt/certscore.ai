import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import {summarizeOptOutFunnel,type OptOutFunnelInput} from "./lib/sale-sharing-opt-out-funnel";

const read=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

/** Original bundle bytes must match retained retrieval receipts. No network. */
export async function auditRetainedOptOutCohort(root:string,receiptPath:string){
  const inventory=await read(join(root,"inventory.json"));
  const receipts=await read(receiptPath);
  const inputs:OptOutFunnelInput[]=[],cmpCounts:Record<string,number>={},retainedReports:Array<{scanId:string;sha256:string;bindingStatus:"valid"|"unavailable"}>=[];
  const seen=new Set<string>();
  for(const row of inventory){
    if(typeof row.id!=="string" || !/^[a-zA-Z0-9-]+$/.test(row.id) || seen.has(row.id))throw new Error("Invalid or duplicate scan identity");
    seen.add(row.id);
    const path=join(root,"scans",row.id,"original","CanonicalEvidenceBundle.json"),bytes=await readFile(path);
    const receipt=receipts.find((r:{output?:string})=>typeof r.output==="string"&&resolve(r.output)===resolve(path));
    if(!receipt || sha(bytes)!==receipt.expected.sha256 || bytes.length!==receipt.expected.sizeBytes)throw new Error(`Original bundle integrity failed: ${row.id}`);
    const bundle=JSON.parse(bytes.toString()),observation=bundle.saleSharingOptOut;
    if(bundle.scanId!==row.id)throw new Error(`Original bundle scan binding failed: ${row.id}`);
    if(observation){
      const packetBytes=Buffer.from(JSON.stringify(observation.evidence));
      if(sha(packetBytes)!==observation.sha256 || packetBytes.length!==observation.sizeBytes)throw new Error(`Embedded packet integrity failed: ${row.id}`);
    }
    let findingIds:string[]|undefined;
    const reportPath=join(root,"scans",row.id,"report.json");
    if(existsSync(reportPath)){
      const reportBytes=await readFile(reportPath),report=JSON.parse(reportBytes.toString());
      const bound=report.artifactType==="certscore_canonical_report_export" && report.scan?.id===row.id && Array.isArray(report.projection?.unifiedFindings);
      if(bound)findingIds=report.projection.unifiedFindings.map((f:{unifiedFindingId?:string})=>f.unifiedFindingId).filter((id:unknown):id is string=>typeof id==="string");
      retainedReports.push({scanId:row.id,sha256:sha(reportBytes),bindingStatus:bound?"valid":"unavailable"});
    }
    inputs.push({scanId:row.id,findingIds,evidence:observation?.evidence,evidenceVerified:observation?.verificationStatus==="verified",laneOutcome:bundle.saleSharingOptOutLaneOutcome});
    if(observation?.evidence?.limitations?.includes("no_unique_registered_recipe")){
      // Independent passive CMP identity is prioritization context, not action proof.
      const vendors=new Set<string>((bundle.cmpRuntimeObservations??[]).map((r:{vendor?:string})=>r.vendor).filter((v:unknown)=>typeof v==="string"));
      for(const vendor of vendors)cmpCounts[vendor]=(cmpCounts[vendor]??0)+1;
    }
  }
  return {source:resolve(root),verifiedOriginalBundles:inputs.length,
    note:"Retained operational coverage only. Missing historical checkpoints remain unknown. Passive CMP names do not establish action support or detector recall.",
    retainedReports,unsupportedPathPassiveCmpCounts:cmpCounts,...summarizeOptOutFunnel(inputs)};
}
if(process.argv[1]?.endsWith("audit-retained-opt-out-funnel.ts")){
  const [root,receipts]=process.argv.slice(2);
  if(!root||!receipts)throw new Error("Usage: audit-retained-opt-out-funnel.ts COHORT_DIRECTORY RECEIPTS_JSON");
  void auditRetainedOptOutCohort(root,receipts).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
