/** Offline triage over the existing independently sealed audit sources. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {verifiedLocalBytes} from "./lib/daily-policy-audit";
import {actionConfirmationReview,unsupportedProtocolReview,rankProtocolReviews} from "./lib/audit-retained-priorities";
const [runsFile,originsFile,out]=process.argv.slice(2);if(!runsFile||!originsFile||!out||existsSync(out))throw Error("Supply retained runs, original origins and a fresh output directory");
const read=(file:string)=>{if(statSync(file).size>80_000_000)throw Error("Input exceeds bound");return JSON.parse(readFileSync(file,"utf8"));};
const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const origins=read(originsFile),runs=read(runsFile),ids=new Set(origins.rows.filter((r:any)=>r.isMacMini===true&&!r.isCanary).map((r:any)=>r.scanId));
const actions:any[]=[],protocols:any[]=[],sources:any[]=[],seen=new Set<string>();
for(const run of runs){
 const root=realpathSync(run.path),seal=read(path.join(root,"pass-a-seal.json"));if(sha(readFileSync(seal.file))!==seal.sha256)throw Error("Independent Pass A seal mismatch");
 const receipts=read(path.join(root,"evidence-retrieval-receipts.json")),inventory=read(path.join(root,"work-inventory-v2.json"));
 for(const rec of receipts){
  if(!ids.has(rec.scanId)||!['postAcceptPacketUri','postRefusalPacketUri'].includes(rec.kind)||seen.has(rec.scanId+rec.kind))continue;
  const original=inventory.find((i:any)=>i.id===rec.scanId)?.retained?.[0];
  if(original?.pointers?.[rec.kind]!==rec.uri||original?.hashes?.[rec.kind]?.sha256!==rec.expected?.sha256)throw Error("Original action pointer mismatch");
  const bytes=verifiedLocalBytes(root,rec,20_000_000),packet=JSON.parse(bytes.toString());if(packet.parentScanId!==rec.scanId)throw Error("Action identity mismatch");seen.add(rec.scanId+rec.kind);
  actions.push({scanId:rec.scanId,...actionConfirmationReview(packet,rec.kind==='postAcceptPacketUri'?'accept':'reject'),source:{file:rec.localPath,sha256:sha(bytes)}});
 }
 const gpcFile=path.join(root,"gpc-retrieval-receipts.json");if(!existsSync(gpcFile))continue;
 for(const rec of read(gpcFile)){
  if(!ids.has(rec.scanId)||rec.kind!=="CanonicalEvidenceBundle.json"||seen.has(rec.scanId+"gpc"))continue;
  const canonical=receipts.find((r:any)=>r.scanId===rec.scanId&&r.kind==='scanArtifactUri'&&(r.eventIndex===undefined||r.eventIndex===0));if(!canonical)continue;
  const original=inventory.find((i:any)=>i.id===rec.scanId)?.retained?.[0];
  if(original?.pointers?.scanArtifactUri!==canonical.uri||original?.hashes?.scanArtifactUri?.sha256!==canonical.expected?.sha256)throw Error("Original canonical pointer mismatch");
  const originalBytes=verifiedLocalBytes(root,canonical,20_000_000),main=JSON.parse(originalBytes.toString()),expected=main.gpcResponseAssessment?.comparison?.gpcArtifact;
  if(main.scanId!==rec.scanId)throw Error("Original canonical identity mismatch");
  if(!expected||main.gpcResponseAssessment?.observation?.sourceSha256!==expected.sha256||expected.uri!==rec.uri)throw Error("Original GPC comparison binding mismatch");
  const bytes=verifiedLocalBytes(root,{...rec,verified:true,expected:{sha256:expected.sha256,sizeBytes:expected.sizeBytes}},20_000_000),bundle=JSON.parse(bytes.toString());if(bundle.scanId!==rec.scanId)throw Error("GPC identity mismatch");seen.add(rec.scanId+'gpc');
  const source={file:rec.localPath,sha256:sha(bytes),bytes:bytes.length,parentFile:canonical.localPath,parentSha256:sha(originalBytes),parentBytes:originalBytes.length,originalWorkerUri:expected.uri};sources.push(source);for(const row of unsupportedProtocolReview(bundle))protocols.push({scanId:rec.scanId,...row,source});
 }
}
mkdirSync(out,{recursive:true});
writeFileSync(path.join(out,'retained-review.json'),JSON.stringify({version:'certscore.retained-priorities.v2',sourceOnly:true,cohort:'original-credential-verified Mac mini; canaries/tests excluded',actions,unsupportedRequests:protocols,rankedProtocols:rankProtocolReviews(protocols),sources,productionWrites:0,newScans:0,newFindings:0},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({actions:actions.length,unsupportedRequests:protocols.length,rankedProtocols:rankProtocolReviews(protocols).map(r=>({origin:r.origin,path:r.path,requests:r.requests}))}));
