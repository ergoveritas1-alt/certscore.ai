import { readFile } from "node:fs/promises";
import path from "node:path";
import { postAcceptEvidencePacketSchema } from "@certscore/contracts";
import { verifiedPostAcceptFormSnapshots } from "../../../../../server/scans/form-snapshot-evidence";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(process.env.NODE_ENV!=="development")return new Response(null,{status:404});
  const source=new URL(request.url).searchParams.get('source');
  const artifact=source==='sits'?'sits-local-accept-handoff-20261007':'post-accept-form-handoff-local';
  const packet=postAcceptEvidencePacketSchema.parse(JSON.parse(await readFile(path.resolve(process.cwd(),
    `../../artifacts/${artifact}/PostAcceptEvidencePacket.json`),'utf8')));
  const formRef=new URL(request.url).searchParams.get('formRef');
  const image=verifiedPostAcceptFormSnapshots(packet.formSnapshotCapture)?.images.find(image=>image.snapshot.formRef===formRef);
  if(!image?.bytes)return new Response(null,{status:404});
  return new Response(new Uint8Array(image.bytes),{headers:{'content-type':'image/jpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
