import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Socket } from 'node:net';
import type { LaunchOptions } from 'playwright';
import type { NetworkDestination } from '@certscore/contracts';
import { extractNetlogSockets } from './proxy-netlog-sockets.js';
import { normalizePublicIpAddress } from './public-ip-address.js';
import { enrichNetworkDestination } from './network-destination.js';

type Attempt = { id:string; authority:string; clientPort:number; bridgePort:number; connected:boolean };
type Binding = { requestId:string; connectionId:number; authority:string };
const MAX_CONNECTIONS=512;
const digest=(key:string, text:string)=>createHmac('sha256',key).update(text).digest('hex');

/** An authenticated, nonce-bound response containing only the requested opaque tunnel IDs. */
async function readRecords(endpoint:URL,key:string,ids:string[],signal:AbortSignal):Promise<string[]> {
 const nonce=randomBytes(24).toString('hex');
 const body=JSON.stringify({version:1,nonce,ids});
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-CertScore-Proof':digest(key,body)},body,signal});
 if(!response.ok || !response.body)throw Error('proxy_records_unavailable');
 let bytes=0;const chunks:Uint8Array[]=[];
 const reader=response.body.getReader();
 try {while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>262144)throw Error('proxy_records_limit');chunks.push(next.value);}} finally {await reader.cancel().catch(()=>{});}
 const text=Buffer.concat(chunks).toString('utf8');
 const signature=response.headers.get('X-CertScore-Proof')??'';
 const expected=digest(key,`${nonce}\n${text}`);
 if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw Error('proxy_records_unverified');
 const data=JSON.parse(text);
 if(data.version!==1||!Array.isArray(data.records)||data.records.length>1024||data.records.some((s:unknown)=>typeof s!=='string'||s.length>512))throw Error('proxy_records_invalid');
 return data.records;
}

/** Opt-in additive metadata capture. Existing regional proxy still owns egress/TLS/network guards. */
export async function createProxyDestinationCapture(launch:LaunchOptions) {
 if(process.env.CERTSCORE_PROXY_DESTINATION_ENABLED!=='1'||!launch.proxy?.server)return undefined;
 const endpointText=process.env.CERTSCORE_PROXY_RECORDS_URL;
 const key=process.env.CERTSCORE_PROXY_RECORDS_KEY;
 if(!endpointText||!key||key.length<32)return undefined;
 let proxy:URL, endpoint:URL;
 try {proxy=new URL(launch.proxy.server);endpoint=new URL(endpointText);}catch{return undefined;}
 if(!['http:','https:'].includes(proxy.protocol)||!['http:','https:'].includes(endpoint.protocol)||endpoint.hostname!==proxy.hostname||endpoint.pathname!=='/records'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)return undefined;
 let directory:string;
 try{directory=await mkdtemp(join(tmpdir(),'certscore-dest-'));}catch{return undefined;}
 const log=join(directory,'netlog.json');
 const sockets=new Set<Socket>();const attempts:Attempt[]=[];const bindings:Binding[]=[];
 let overflow=false,terminal=false,tracked=0;
 const bridge=createServer((q,s)=>{
  // Preserve ordinary HTTP proxy traffic; only CONNECT traffic has tunnel proof.
  const headers={...q.headers};
  if(launch.proxy?.username)headers['proxy-authorization']='Basic '+Buffer.from(`${launch.proxy.username}:${launch.proxy.password??''}`).toString('base64');
  const forwarded=(proxy.protocol==='https:'?httpsRequest:httpRequest)(proxy,{method:q.method,path:q.url,headers},response=>{
   s.writeHead(response.statusCode??502,response.headers);response.pipe(s);
  });
  forwarded.on('error',()=>{if(!s.headersSent)s.writeHead(502);s.end();});
  s.on('close',()=>forwarded.destroy());q.pipe(forwarded);
 });
 bridge.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 bridge.on('connect',(q,client,head)=>{
  if (!(client instanceof Socket)) { client.destroy(); return; }
  sockets.add(client);client.on('close',()=>sockets.delete(client));client.on('error',()=>{});
  const authority=q.url??'';
  if(authority.length>260||/[\s/@?#]/.test(authority)){client.destroy();return;}
  const attempt:Attempt={id:randomUUID(),authority,clientPort:client.remotePort??0,bridgePort:client.localPort??0,connected:false};
  if(attempts.length<MAX_CONNECTIONS&&!terminal)attempts.push(attempt);else overflow=true;
  const headers:Record<string,string>={'X-CertScore-Tunnel':attempt.id};
  if(launch.proxy?.username)headers['Proxy-Authorization']='Basic '+Buffer.from(`${launch.proxy.username}:${launch.proxy.password??''}`).toString('base64');
  const upstream=(proxy.protocol==='https:'?httpsRequest:httpRequest)(proxy,{method:'CONNECT',path:authority,headers});
  upstream.on('connect',(response,socket,proxyHead)=>{
   sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
   attempt.connected=response.statusCode===200;
   if(!attempt.connected){socket.destroy();client.destroy();return;}
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)socket.write(head);if(proxyHead.length)client.write(proxyHead);
   client.pipe(socket);socket.pipe(client);
   client.on('close',()=>socket.destroy());socket.on('close',()=>client.destroy());socket.on('error',()=>client.destroy());client.on('error',()=>socket.destroy());
  });
  upstream.on('error',()=>client.destroy());client.on('close',()=>upstream.destroy());upstream.end();
 });
 try{await new Promise<void>((resolve,reject)=>{bridge.once('error',reject);bridge.listen(0,'127.0.0.1',resolve);});}
 catch{bridge.close();await rm(directory,{recursive:true,force:true});return undefined;}
 const address=bridge.address();if(!address||typeof address==='string')throw Error('bridge_address_unavailable');
 return {
  launch:{...launch,proxy:{server:`http://127.0.0.1:${address.port}`,bypass:launch.proxy?.bypass},args:[...(launch.args??[]),`--log-net-log=${log}`,'--net-log-max-size-mb=16']} as LaunchOptions,
  track(requestId:string, connectionId:number|undefined, url:string){
   tracked++;
   if(terminal||!Number.isSafeInteger(connectionId)||!connectionId||connectionId<1)return;
   if(bindings.length>=30000){overflow=true;return;}
   try{const u=new URL(url);if(u.protocol!=='https:')return;bindings.push({requestId,connectionId,authority:`${u.hostname}:${u.port||'443'}`});}catch{}
  },
  /** Called once after normal browser close and before result publication, inside the owning deadline. */
  async resolve(deadline:number,parent?:AbortSignal):Promise<Map<string,NetworkDestination>>{
   terminal=true;const result=new Map<string,NetworkDestination>();
   const remaining=deadline-Date.now();
   const diagnostic:Record<string,string|number|boolean>={event:'proxy_destination_finalized',tracked,bindings:bindings.length,attempts:attempts.length,remainingMs:remaining,overflow,resolved:0};
   const report=()=>console.info(JSON.stringify(diagnostic));
   if(overflow||remaining<=0||parent?.aborted){diagnostic.reason='budget_or_abort';report();return result;}
   const signal=parent?AbortSignal.any([parent,AbortSignal.timeout(Math.min(remaining,300))]):AbortSignal.timeout(Math.min(remaining,300));
   try{
    const [extracted,lines]=await Promise.all([extractNetlogSockets(log,{signal}),readRecords(endpoint,key,attempts.map(a=>a.id),signal)]);
    diagnostic.netlogStatus=extracted.status;diagnostic.netlogReason=extracted.reason??'none';diagnostic.sockets=extracted.sockets.length;diagnostic.records=lines.length;
    if(extracted.status!=='extracted'||signal.aborted)return result;
    const byConnection=new Map<number,Attempt[]>();
    for(const socket of extracted.sockets)byConnection.set(socket.connectionId,attempts.filter(a=>a.clientPort===socket.clientPort&&a.bridgePort===socket.bridgePort));
    for(const binding of bindings){
     if(signal.aborted)return new Map();
     const candidates=byConnection.get(binding.connectionId);if(candidates?.length!==1)continue;
     const attempt=candidates[0]!;if(!attempt.connected||attempt.authority!==binding.authority)continue;
     const records=lines.filter(line=>line.split(/\s+/)[1]===attempt.id);if(records.length!==1)continue;
     const line=records[0]!,fields=line.split(/\s+/),ip=normalizePublicIpAddress(fields[5]);
     if(fields.length!==7||fields[2]!=='CONNECT'||fields[3]!==attempt.authority||fields[4]!=='200'||fields[6]!=='TCP_TUNNEL'||!ip)continue;
     const destination=await enrichNetworkDestination({ip,source:'proxy_connect',locationLabel:'server location (may be CDN edge)',proxyConnection:{version:'chromium_connection.v1',connectionId:binding.connectionId,tunnelId:attempt.id,authority:attempt.authority,recordHash:createHash('sha256').update(line).digest('hex')}});
     if(destination)result.set(binding.requestId,destination);
    }
    diagnostic.resolved=signal.aborted?0:result.size;return signal.aborted?new Map():result;
   }catch(error){diagnostic.reason=signal.aborted?'aborted':error instanceof Error && /^proxy_records_[a-z]+$/.test(error.message)?error.message:'resolution_failed';return new Map();}
   finally{report();}
  },
  async close(){terminal=true;for(const socket of sockets)socket.destroy();await new Promise<void>(r=>bridge.close(()=>r()));await rm(directory,{recursive:true,force:true});},
 };
}
