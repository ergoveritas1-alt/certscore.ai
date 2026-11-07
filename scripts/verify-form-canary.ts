import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {postAcceptEvidencePacketSchema} from '@certscore/contracts';
import {projectPostAcceptForms} from '../apps/web/lib/scans/post-accept-form-projection';
import {verifiedPostAcceptFormSnapshotForRow,verifiedPostAcceptFormSnapshots} from '../apps/web/server/scans/form-snapshot-evidence';

async function main(){
 const args=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw Error('Use --scan-id UUID --region Ireland --egress-sha256 HASH --min-forms N --min-fields N --min-images N --output FILE');args.set(process.argv[i]!,process.argv[i+1]!)}
 const scanId=args.get('--scan-id')??'';if(!/^[a-f0-9-]{36}$/i.test(scanId))throw Error('A local scan ID is required.');
 const region=args.get('--region'),egress=args.get('--egress-sha256');if(!region||!/^sha256:[a-f0-9]{64}$/.test(egress??''))throw Error('Explicit region and independently established egress hash are required.');
 const minimum=(key:string)=>{const raw=args.get(key);if(!raw||!/^\d+$/.test(raw))throw Error(`${key} must specify this cohort’s minimum, not a universal prevalence target.`);return Number(raw)};
 const minima={forms:minimum('--min-forms'),fields:minimum('--min-fields'),images:minimum('--min-images')};
 const dbUrl=new URL(process.env.DATABASE_URL??'http://invalid');if(!['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname))throw Error('This verifier only reads a localhost database.');
 const root=path.resolve('artifacts/local-v2-dag-lambda-simulated',scanId);
 const packet=postAcceptEvidencePacketSchema.parse(JSON.parse(await readFile(path.join(root,'lanes/accept_observation/PostAcceptEvidencePacket.json'),'utf8')));
 const proofs=await Promise.all(['consent_proof','runtime_evidence','policy_evidence','gpc_observation'].map(async lane=>{
  try{const p=JSON.parse(await readFile(path.join(root,'lanes',lane,'EgressPreflight.json'),'utf8'));return {lane,verified:p.probeStatus==='available'&&p.expectedEgressRegion===region&&p.expectedEgressPublicIpHash===egress&&p.proxyModeEnabled===true&&`sha256:${createHash('sha256').update(p.observed?.ip??'').digest('hex')}`===egress};}catch{return {lane,verified:false}}
 }));
 const {loadAnonymousPersistedScanReportProjection}=await import('../apps/web/server/scans/scan-report-projection');
 const report=await loadAnonymousPersistedScanReportProjection({scanId});
 const rows=report?projectPostAcceptForms(report).rows:[];
 const images=verifiedPostAcceptFormSnapshots(packet.formSnapshotCapture);
 const forms=packet.formCapture?.frames.flatMap(x=>x.forms)??[];
 const reportImages=rows.filter(row=>verifiedPostAcceptFormSnapshotForRow(packet,row));
 const capturedImages=images?.images.filter(x=>x.snapshot.status==='available'||x.snapshot.status==='withheld').length??0;
 const stages={activityWindow:{pass:packet.timing.observationMs===packet.observationWindowMs&&packet.timing.observationExitReason==='window_elapsed',requestedMs:packet.observationWindowMs,observedMs:packet.timing.observationMs,exitReason:packet.timing.observationExitReason},regionalEgress:{pass:proofs.every(x=>x.verified),proofs},acceptance:{pass:packet.acceptanceRegistration.status==='confirmed',status:packet.acceptanceRegistration.status},
  formDiscovery:{pass:forms.length>=minima.forms&&forms.reduce((n,f)=>n+f.fields.length,0)>=minima.fields,forms:forms.length,fields:forms.reduce((n,f)=>n+f.fields.length,0),coverage:packet.formCapture?.status??'unknown'},
  imageCapture:{pass:capturedImages>=minima.images,captured:capturedImages,unavailable:images?.images.filter(x=>x.snapshot.status==='unavailable').length??0,diagnostics:packet.formImageDiagnostics??null},
  safetyReview:{pass:(images?.images.filter(x=>x.bytes).length??0)>=minima.images,available:images?.images.filter(x=>x.bytes).length??0,withheld:images?.images.filter(x=>x.snapshot.status==='withheld').length??0},
  reportDelivery:{pass:rows.length>=minima.forms&&rows.reduce((n,r)=>n+r.form.fields.length,0)>=minima.fields&&reportImages.length>=minima.images,forms:rows.length,fields:rows.reduce((n,r)=>n+r.form.fields.length,0),verifiedImages:reportImages.length}};
 const passed=Object.values(stages).every(x=>x.pass);
 const result={version:'certscore.form_canary.v1',checkedAt:new Date().toISOString(),scanId,region,minima,passed,stages,
  scope:'Read-only verification of an explicitly run local regional canary. Live changes or safety withholding require investigation, not relaxed evidence rules.'};
 if(args.get('--output'))await writeFile(path.resolve(args.get('--output')!),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));process.exit(passed?0:1);
}
void main().catch(error=>{console.error(error.message);process.exit(1)});
