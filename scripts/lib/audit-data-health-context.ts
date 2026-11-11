import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

/** Exact local receipts only. No directory enumeration or remote acquisition. */
export function auditHealthContext(data:any){
 const refs=(data.sources??[]).filter((r:any)=>r.file.endsWith('/cache-manifest.json'));
 if(!refs.length)return {};
 assert.equal(refs.length,1,'Ambiguous data-health cache source');
 const files=new Map<string,any>();
 function read(ref:any){
  assert.ok(ref.bytes>0&&ref.bytes<=32_000_000,'Data-health source exceeds bound');
  assert.equal(statSync(ref.file).size,ref.bytes);
  const key=ref.file+'/'+ref.sha256;
  if(files.has(key))return files.get(key);
  const bytes=readFileSync(ref.file);assert.equal(bytes.length,ref.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256,'Data-health source hash mismatch');
  const value=JSON.parse(bytes.toString());files.set(key,value);return value;
 }
 const manifest=read(refs[0]);const ids=new Set<string>();
 const pending=manifest.receipts.filter((r:any)=>r.state==='source_unavailable').map((r:any)=>{
  assert.ok(!ids.has(r.scanId),'Duplicate pending data-health entry');ids.add(r.scanId);
  const ref=r.selectionInventory??manifest.directInventory,inventory=read(ref);
  assert.equal(inventory.readOnly,true);assert.equal(inventory.version,'certscore.mac-mini-direct-id-inventory.v1');
  assert.ok(inventory.rows.length<=5000);
  const rows=inventory.rows.filter((item:any)=>item.scanId===r.scanId);assert.equal(rows.length,1);
  const row=rows[0];assert.equal(row.isMacMini,true);assert.equal(row.isCanary,false);assert.ok(row.originalRequestId);
  assert.ok(Number.isFinite(Date.parse(row.created_at)));
  return {scanId:r.scanId,createdAt:row.created_at,status:row.status??'unavailable'};
 });
 return {cache:refs[0],pending};
}
