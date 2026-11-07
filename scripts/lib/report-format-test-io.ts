/** Test-only inspection of actual document bytes; no network or artifact reconstruction. */
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
export const normalizeDocumentText=(s:string)=>s.replace(/\s+/g,' ').trim();
export function pdfText(buffer:Buffer){
 assert.equal(buffer.subarray(0,5).toString(),'%PDF-');
 return normalizeDocumentText([...buffer.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m=>m[1]!.replace(/\\([0-7]{3}|[\\()nrtbf])/g,(_,c:string)=>/^[0-7]/.test(c)?String.fromCharCode(parseInt(c,8)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[c]??c))).join(' '));
}
export function docxParts(buffer:Buffer){
 const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));assert.ok(end>0);let offset=buffer.readUInt32LE(end+16);const parts=new Map<string,string>();
 for(let i=0;i<buffer.readUInt16LE(end+10);i++){
  assert.equal(buffer.readUInt32LE(offset),0x02014b50);const method=buffer.readUInt16LE(offset+10),length=buffer.readUInt32LE(offset+20),nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
  const name=buffer.toString('utf8',offset+46,offset+46+nameLength),start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
  if(name.endsWith('.xml')||name.endsWith('.rels')){assert.ok(method===0||method===8);const b=buffer.subarray(start,start+length);parts.set(name,(method===8?inflateRawSync(b):b).toString());}offset+=46+nameLength+extra+comment;
 }
 return parts;
}
export function docxText(buffer:Buffer){const xml=docxParts(buffer).get('word/document.xml');assert.ok(xml);return normalizeDocumentText([...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]!.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'")).join(' '));
}
