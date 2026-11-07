import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const script=path.resolve('scripts/prepare-audit-opt-out-inputs.ts');
test('daily refresh carries historical controls and appends the current one-query inventory',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'opt-out-forward-'));
 const write=(name:string,value:any)=>{const file=path.join(dir,name);writeFileSync(file,JSON.stringify(value));return file;};
 const history=write('history.json',{version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:'certscore.audit-choice-summary.v1',start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z',rows:[]});
 const b=readFileSync(history),rec={file:history,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};
 const prior=write('dashboard.json',{optOutExtracts:[rec],retainedReports:[{...rec,artifacts:rec}],windows:[{runId:'mac-mini-local-archive',start:'2026-10-03T00:00:00Z'}]});
 const inventory={version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:'certscore.audit-choice-summary.v2',start:'2026-10-30T00:00:00Z',end:'2026-11-02T00:00:00Z'};
 const row={status:'completed',control_assessment:{},choice_audit:{version:inventory.choiceAuditVersion,availability:'size_bound'}};
 const current=write('delta.json',{...inventory,rows:[row]});
 const out=path.join(dir,'inputs.json');
 execFileSync(process.execPath,['--import','tsx',script,prior,current,out]);
 const manifest=JSON.parse(readFileSync(out,'utf8'));assert.equal(manifest.sources.length,2);assert.deepEqual(manifest.reportProjections,[{...rec,artifacts:rec}]);assert.deepEqual(manifest.sources[0],rec);assert.equal(manifest.sources[1].file,realpathSync(current));
 const reject=(name:string,data:unknown,reason:RegExp)=>{
  assert.throws(()=>execFileSync(process.execPath,['--import','tsx',script,prior,write(name+'.json',data),path.join(dir,name+'-out.json')],{stdio:'pipe'}),reason);
 };
 reject('missing-choice',{...inventory,rows:[{status:'completed',control_assessment:{}}]},/omitted approved v2/);
 reject('v1-inventory',{...inventory,choiceAuditVersion:'certscore.audit-choice-summary.v1',rows:[row]},/omitted approved v2/);
 reject('v1-row',{...inventory,rows:[{...row,status:'completed_limited',choice_audit:{version:'certscore.audit-choice-summary.v1'}}]},/omitted approved v2/);
 reject('missing-control',{...inventory,rows:[{status:'completed',choice_audit:row.choice_audit}]},/omitted opt-out control/);
 writeFileSync(history,'tampered');
 assert.throws(()=>execFileSync(process.execPath,['--import','tsx',script,prior,current,path.join(dir,'bad.json')],{stdio:'pipe'}));
});

test('daily preparation admits a privacy/form receipt only when the latest retained selection matches',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'privacy-form-forward-'));
 const write=(name:string,value:unknown)=>{const file=path.join(dir,name);writeFileSync(file,JSON.stringify(value));return file;};
 const start='2026-11-01T00:00:00Z',end='2026-11-02T00:00:00Z';
 const binding={scanId:'11111111-1111-4111-8111-111111111111',createdAt:start,generation:'scan-report-projection-v27',projectionSourceHash:'a'.repeat(64),projectionPayloadSha256:'b'.repeat(64),originalRequestId:'pulse_req_fixture'};
 const ref={file:'/fixture.json',bytes:200,sha256:'c'.repeat(64),binding};
 const prior=write('prior.json',{windows:[{runId:'mac-mini-local-archive',start}]});
 const incoming=write('incoming.json',[ref]);
 const version='certscore.audit-choice-summary.v2';
 const inventory={version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,choiceAuditVersion:version,start,end};
 const row={scanId:binding.scanId,created_at:start,isMacMini:true,isCanary:false,originalRequestId:binding.originalRequestId,status:'completed',
  projection_status:'ready',projection_version:binding.generation,projection_source_hash:binding.projectionSourceHash,
  projection_payload_sha256:binding.projectionPayloadSha256,control_assessment:null,choice_audit:{version}};
 const prepare=(name:string,data:unknown,previous=prior,list=incoming)=>{
  const out=path.join(dir,name+'-out.json');
  execFileSync(process.execPath,['--import','tsx',script,previous,write(name+'.json',data),out,list]);
  return JSON.parse(readFileSync(out,'utf8'));
 };
 assert.equal(prepare('waiting',{...inventory,rows:[]}).privacyFormReceipts,undefined);
 const admitted=prepare('admitted',{...inventory,rows:[row]});
 assert.deepEqual(admitted.privacyFormReceipts,[ref]);
 const priorWithReceipt=write('prior-with-receipt.json',{...admitted,optOutExtracts:admitted.sources,windows:[{runId:'mac-mini-local-archive',start}]});
 const newer={...inventory,end:'2026-11-03T00:00:00Z'};
 assert.deepEqual(prepare('carry',{...newer,rows:[]},priorWithReceipt,write('empty.json',[])).privacyFormReceipts,[ref]);
 assert.equal(prepare('superseded',{...newer,rows:[{...row,projection_payload_sha256:'d'.repeat(64)}]},priorWithReceipt).privacyFormReceipts,undefined);
 const retained=path.join(dir,'retained-only.json');
 execFileSync(process.execPath,['--import','tsx',script,'--retained-only',priorWithReceipt,retained,incoming]);
 const local=JSON.parse(readFileSync(retained,'utf8'));
 assert.equal(local.retainedOnly,true);
 assert.deepEqual(local.sources,admitted.sources);
 assert.deepEqual(local.privacyFormReceipts,[ref]);
});
