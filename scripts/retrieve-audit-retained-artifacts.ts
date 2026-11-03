import { parseCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
/** Bounded exact-object recovery; never lists buckets or visits scanned sites. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';import {createHash} from 'node:crypto';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {verifiedReceipt} from './lib/audit-progress-retained-artifacts';
const [inputFileArg,outArg]=process.argv.slice(2);if(!inputFileArg||!outArg)throw Error('Supply projection receipt list and fresh recovery directory');
const inputFile:string=inputFileArg,out:string=outArg;
const inputs=JSON.parse(readFileSync(inputFile,'utf8'));if(!Array.isArray(inputs)||inputs.length>1500)throw Error('Projection count bound');
mkdirSync(out,{recursive:true});const s3=new S3Client({region:'us-west-1',maxAttempts:2});let total=0,completed=0,position=0;
const refs:any[]=[],errors:any[]=[];
async function recover(ref:any){
 const e=JSON.parse(verifiedReceipt(ref).toString()),p=e.snapshot.report_projection_payload,id=e.scanId;
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid scan ID');
 const events=(p.events??[]).filter((x:any)=>x.eventType==='v2_lambda_result.received');if(events.length!==1)throw Error('Ambiguous result event');
 const event=events[0].metadataJson,root=path.resolve(out,id);mkdirSync(root,{recursive:true});const receipts:any[]=[];
 async function get(kind:string,uri:string,expected:any){
  const prefix='s3://certscore-v2-dag-local-artifacts-us-west-1-199536052647/v2-dag-lambda/local/'+id+'/';
  if(!uri?.startsWith(prefix)||uri.includes('..')||!/^[-a-zA-Z0-9_.]+$/.test(kind)||!Number.isSafeInteger(expected?.sizeBytes)||expected.sizeBytes<1||expected.sizeBytes>20_000_000||!/^[a-f0-9]{64}$/.test(expected.sha256))throw Error('Invalid exact object proof');
  total+=expected.sizeBytes;if(total>3_000_000_000)throw Error('3GB acquisition cap');
  const file=path.join(root,kind),receipt={file,kind,uri,bytes:expected.sizeBytes,sha256:expected.sha256};
  if(!existsSync(file)){
   const key=uri.slice(('s3://certscore-v2-dag-local-artifacts-us-west-1-199536052647/').length);
   const response=await s3.send(new GetObjectCommand({Bucket:'certscore-v2-dag-local-artifacts-us-west-1-199536052647',Key:key}));
   if(response.ContentLength!==expected.sizeBytes)throw Error('S3 size mismatch');
   const b=Buffer.from(await response.Body!.transformToByteArray());if(b.length!==expected.sizeBytes||createHash('sha256').update(b).digest('hex')!==expected.sha256)throw Error('S3 checksum mismatch');
   writeFileSync(file,b,{flag:'wx'});
  }
  const b=verifiedReceipt(receipt);receipts.push(receipt);return b;
 }
 const bundle=parseCanonicalEvidenceArtifact(await get('scanArtifactUri',event.artifactPointers.scanArtifactUri,event.artifactMetadata.scanArtifactUri)) as any;
 const manifest=JSON.parse((await get('manifestUri',event.artifactPointers.manifestUri,event.artifactMetadata.manifestUri)).toString());
 if(bundle.scanId!==id||manifest.scanId!==id)throw Error('Wrong original scan');
 const names=new Set((bundle.policySurfaceObservations??[]).filter((o:any)=>o.surfaceType==='privacy_policy').flatMap((o:any)=>o.artifactRefs??[]).filter((a:any)=>String(a.artifactId).startsWith('policy_surface_text_')).map((a:any)=>path.basename(a.path)));
 const wanted=(manifest.auxiliaryArtifacts??[]).filter((a:any)=>a.fileName==='LocalV2DagLambdaShardSummary.json'||names.has(a.fileName));if(wanted.length>20)throw Error('Auxiliary bound');
 for(const a of wanted)await get(a.fileName,a.uri,a);
 const file=path.join(root,'receipts.json'),b=Buffer.from(JSON.stringify({version:'certscore.audit-retained-artifacts.v1',scanId:id,root,receipts}));
 if(existsSync(file)){if(!readFileSync(file).equals(b))throw Error('Conflicting acquisition receipt');}else writeFileSync(file,b,{flag:'wx'});
 refs.push({...ref,artifacts:{file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}});completed++;
 if(completed%25===0)console.log(JSON.stringify({completed,expectedBytes:total}));
}
async function main(){await Promise.all(Array.from({length:16},async()=>{while(position<inputs.length){const ref=inputs[position++];try{await recover(ref);}catch(e){errors.push({file:ref.file,error:String(e)});}}}));
writeFileSync(path.join(out,'projection-receipts.json'),JSON.stringify(refs,null,2)+'\n',{flag:'wx'});writeFileSync(path.join(out,'errors.json'),JSON.stringify(errors,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({completed,errors:errors.length,expectedBytes:total}));if(errors.length)process.exitCode=1;

}
main().catch(e=>{console.error(e);process.exitCode=1;});
