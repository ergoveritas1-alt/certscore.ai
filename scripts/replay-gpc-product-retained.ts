/** Internal local evaluation only. Requires original adjacent receipt metadata;
 * never reconstructs a receipt, retrieves an object or writes source/report data. */
import {readFile,stat,writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {resolve} from "node:path";
import {buildGpcCmpStateComparison} from "../packages/certscore-scan-core/src/gpc-cmp-state-comparison";
import {readVerifiedGpcImpactSource,buildGpcImpactAssessment} from "../packages/certscore-scan-core/src/gpc-impact-assessment";

async function main(){
  const [baselinePath,gpcPath,out]=process.argv.slice(2);
  if(!baselinePath||!gpcPath||!out||process.argv.length!==5)throw Error('Usage: tsx scripts/replay-gpc-product-retained.ts <original-baseline.json> <original-gpc.json> <separate-internal-output.json>');
  if([baselinePath,gpcPath,baselinePath+'.metadata.json',gpcPath+'.metadata.json'].some(p=>resolve(p)===resolve(out)))throw Error('Output must be separate from original evidence and receipts.');
  const source=async(path:string)=>{
    if((await stat(path)).size>20_000_000)throw Error('Source exceeds retained bound.');
    const receipt=JSON.parse(await readFile(path+'.metadata.json','utf8'));
    if(typeof receipt.sha256!=='string'||!Number.isSafeInteger(receipt.sizeBytes))throw Error('Original receipt missing; do not manufacture a replacement.');
    return {bytes:await readFile(path),pointer:{sha256:receipt.sha256,sizeBytes:receipt.sizeBytes}};
  };
  const [baseline,gpc]=await Promise.all([source(baselinePath),source(gpcPath)]);
  const b=readVerifiedGpcImpactSource(baseline),g=readVerifiedGpcImpactSource(gpc);
  if(!b||!g||b.scanId!==g.scanId)throw Error('Original pair unverified.');
  const input={scanId:g.scanId,targetUrl:b.normalizedUrl,baseline,gpc},impact=buildGpcImpactAssessment(input);
  const packet=buildGpcCmpStateComparison(input);
  const times:number[]=[];
  for(let i=0;i<22;i++){const start=performance.now();buildGpcCmpStateComparison(input);if(i>=2)times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  const result={internalOnly:true,historicalReportsModified:false,sourceBytesModified:false,objectFetches:0,
    producerTiming:{samples:20,medianMs:times[10],p95Ms:times[19]},
    sourceHashes:{baseline:baseline.pointer.sha256,gpc:gpc.pointer.sha256},
    sourceByteLengths:{baseline:baseline.bytes.length,gpc:gpc.bytes.length},
    internalImpactStatus:impact.status,internalCmpComparable:impact.cmpComparison?.comparable??false,
    baselineSemanticRetained:Boolean(b.gpcImpactSemanticObservation),baselineSignalCaptureBindingRetained:Boolean(b.gpcSignalObservation?.prototypeCaptureBinding),
    gpcSessionRetained:Boolean(g.gpcObservationSession),publicPacketEligible:Boolean(packet),
    scope:'One convenience local retained pair; no production population or latency claim.'};
  await writeFile(out,JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({publicPacketEligible:Boolean(packet),baselineSignalCaptureBindingRetained:result.baselineSignalCaptureBindingRetained})+'\n');
}
void main();
