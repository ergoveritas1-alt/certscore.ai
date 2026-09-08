import { createReadStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
const DEFAULTS={maxBytes:16*1024*1024,maxLineBytes:128*1024,maxSockets:512};

/** Chromium JSON NetLog reader. Retains only socket tuples, never URLs/headers/bodies.
 * Unsupported formats, malformed candidate records and exceeded budgets fail closed.
 * Success means extracted records, not proof that the bounded browser log is exhaustive.
 */
export async function extractNetlogSockets(file: string,{signal,...options}: { signal?: AbortSignal; maxBytes?: number; maxLineBytes?: number; maxSockets?: number }={}){
 const limits={...DEFAULTS,...options};
 for(const key of (Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>))if(!Number.isSafeInteger(limits[key])||limits[key]<=0||limits[key]>DEFAULTS[key])throw Error(`Invalid ${key}`);
 const stream=createReadStream(file,{highWaterMark:16*1024,signal});
 const decoder=new StringDecoder('utf8');let pending='',bytesRead=0,lineNumber=0,stage='header'; let tcp: number, socketType: number, endPhase: number, reason: string | undefined;
 const sockets: Array<{connectionId:number;clientPort:number;bridgePort:number}>=[];const ids=new Set();
 const fail=(value:string)=>{reason=value;};
 function line(raw:string){
  if(Buffer.byteLength(raw)>limits.maxLineBytes){fail('line_limit');return;}
  const value=raw.trim();if(!value)return;
  lineNumber++;
  if(stage==='header'){
   if(!value.startsWith('{"constants":')||!value.endsWith(',')){fail('unsupported_format');return;}
   try{const c=JSON.parse(value.slice(0,-1)+'}').constants;tcp=c.logEventTypes.TCP_CONNECT;socketType=c.logSourceType.SOCKET;endPhase=c.logEventPhase.PHASE_END;
   if(![tcp,socketType,endPhase].every(Number.isSafeInteger))throw Error();}catch{fail('invalid_header');return;}stage='array';return;
  }
  if(stage==='array'){if(value!=='"events": ['){fail('unsupported_format');return;}stage='events';return;}
  if(stage==='events'){
   let event=value;
   if(event.endsWith('],')){event=event.slice(0,-2);stage='tail';}
   else if(event.endsWith(','))event=event.slice(0,-1);
   // Avoid parsing irrelevant events. This is extraction, not general JSON validation.
   if(!event.includes('"local_address"')||!event.includes('"remote_address"'))return;
   try{
    const e=JSON.parse(event);if(e.type!==tcp||e.source?.type!==socketType||e.phase!==endPhase)return;
    if(!Number.isSafeInteger(e.source.id)||e.source.id<0)throw Error();
    const endpoint=(text:unknown)=>{if(typeof text!=='string')throw Error();const m=/^(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})$/.exec(text);const port=Number(m?.[1]);if(!m||port<1||port>65535)throw Error();return port;};
    const record={connectionId:e.source.id,clientPort:endpoint(e.params.local_address),bridgePort:endpoint(e.params.remote_address)};
    if(ids.has(record.connectionId)){fail('duplicate_socket');return;}
    if(sockets.length>=limits.maxSockets){fail('socket_limit');return;}
    ids.add(record.connectionId);sockets.push(record);
   }catch{fail('invalid_socket');}return;
  }
  if(stage==='tail'&&value==='}')stage='closed';
 }
 try{
  for await(const chunk of stream){
   bytesRead+=chunk.length;if(bytesRead>limits.maxBytes){fail('byte_limit');break;}
   pending+=decoder.write(chunk);let split;
   while((split=pending.indexOf('\n'))>=0&&!reason){line(pending.slice(0,split));pending=pending.slice(split+1);}
   if(reason)break;
   if(Buffer.byteLength(pending)>limits.maxLineBytes){fail('line_limit');break;}
  }
  if(!reason){pending+=decoder.end();if(pending)line(pending);if(stage!=='closed')fail('incomplete_log');}
 }catch{fail(signal?.aborted?'aborted':'read_failed');}finally{stream.destroy();}
 return reason?{status:'unavailable',reason,sockets:[],bytesRead}:{status:'extracted',coverage:'bounded',sockets,bytesRead};
}
export const NETLOG_MAX_SIZE_MB = 16;
