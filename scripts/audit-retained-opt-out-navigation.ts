import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";
import {saleSharingOptOutEvidenceSchema} from "../packages/certscore-contracts/src/sale-sharing-opt-out";

const read=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const count=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(key=>[key,values.filter(v=>v===key).length]));

/** Offline audit. Passive context is never substituted for an action-session fact. */
export async function auditRetainedOptOutNavigation(root:string,receiptPath:string){
  const inventory=await read(join(root,"inventory.json")),receipts=await read(receiptPath);
  const rows=[];const seen=new Set<string>();
  for(const row of inventory){
    if(typeof row.id!=="string"||!/^[a-zA-Z0-9-]+$/.test(row.id)||seen.has(row.id))throw new Error("Invalid or duplicate scan identity");
    seen.add(row.id);
    const path=join(root,"scans",row.id,"original","CanonicalEvidenceBundle.json"),bytes=await readFile(path);
    const receipt=receipts.find((r:{output?:string})=>typeof r.output==="string"&&resolve(r.output)===resolve(path));
    if(!receipt||sha(bytes)!==receipt.expected.sha256||bytes.length!==receipt.expected.sizeBytes)throw new Error(`Original bundle integrity failed: ${row.id}`);
    const bundle=JSON.parse(bytes.toString()),wrapped=bundle.saleSharingOptOut;
    if(bundle.scanId!==row.id)throw new Error(`Original bundle scan binding failed: ${row.id}`);
    if(!wrapped)continue;
    const packetBytes=Buffer.from(JSON.stringify(wrapped.evidence));
    if(wrapped.verificationStatus!=="verified"||sha(packetBytes)!==wrapped.sha256||packetBytes.length!==wrapped.sizeBytes)throw new Error(`Embedded packet integrity failed: ${row.id}`);
    const packet=saleSharingOptOutEvidenceSchema.parse(wrapped.evidence);
    if(packet.scanId!==row.id)throw new Error(`Packet scan binding failed: ${row.id}`);
    if(!packet.limitations.some(reason=>reason.startsWith("navigation_")))continue;
    const target=packet.targetUrl;
    const transports=(bundle.transportSecurityObservations??[]).filter((r:{requestedUrl?:string;sourceScanner?:string})=>r.requestedUrl===target&&r.sourceScanner==="pre_consent_runtime");
    const finalUrl=transports.length===1?transports[0].finalUrl??null:null;
    const requests=new Set((bundle.networkEvents??[]).filter((r:{isMainFrame?:boolean;resourceType?:string;sourceScanner?:string})=>r.isMainFrame===true&&r.resourceType==="document"&&r.sourceScanner==="pre_consent_runtime").map((r:{requestId?:string})=>r.requestId).filter(Boolean));
    const responses=(bundle.networkResponseEvents??[]).filter((r:{requestId?:string;sourceScanner?:string})=>r.requestId&&requests.has(r.requestId)&&r.sourceScanner==="pre_consent_runtime")
      .map((r:{responseUrl?:string;status?:number;timestampMs?:number})=>({url:r.responseUrl??null,status:r.status??null,elapsedMs:r.timestampMs??null}));
    const exactSuccess=responses.filter((r:{url:string|null;status:number|null})=>r.url===target&&r.status!==null&&r.status>=200&&r.status<300);
    const targetRelation=finalUrl===null?"unknown":finalUrl===target?"same_target":"different_target";
    const passiveHttpError=responses.some((r:{status:number|null})=>r.status!==null&&r.status>=400);
    const category=targetRelation==="different_target"?"different_target_context":targetRelation==="same_target"&&passiveHttpError?"same_target_http_error_context":targetRelation==="same_target"&&exactSuccess.length?"same_target_success_context":"unresolved_context";
    rows.push({scanId:row.id,targetUrl:target,bundleSha256:sha(bytes),packetSha256:wrapped.sha256,
      targetAlreadySerialized:new URL(target).href===target,limitation:packet.limitations[0],diagnostic:packet.executionDiagnostic??null,
      observerElapsedMs:Date.parse(packet.completedAt)-Date.parse(packet.startedAt),
      passiveContext:{finalUrl,targetRelation,httpErrorObserved:passiveHttpError,responses},category,
      recoveryProven:false});
  }
  return {source:resolve(root),verifiedOriginalBundles:seen.size,navigationFailures:rows.length,
    note:"Independent passive-session context only. Historical action packets lack committed-response/readiness facts. No per-scan recovery is proven; no historical evidence is upgraded.",
    counts:{categories:count(rows.map(r=>r.category)),diagnostics:count(rows.map(r=>r.diagnostic?.code??"unknown")),limitations:count(rows.map(r=>r.limitation??"unknown")),nonSerializedTargets:rows.filter(r=>!r.targetAlreadySerialized).length},rows};
}
if(process.argv[1]?.endsWith("audit-retained-opt-out-navigation.ts")){
  const [root,receipts]=process.argv.slice(2);
  if(!root||!receipts)throw new Error("Usage: audit-retained-opt-out-navigation.ts COHORT_DIRECTORY RECEIPTS_JSON");
  void auditRetainedOptOutNavigation(root,receipts).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
