import {protocolLimit} from "./protocol-limit";
import type {ProtocolJsonLimitContext} from "@certscore/contracts";
const fail=(code="unsupported_body"):never=>{throw Error(code);};
export type ProtocolJson=null|string|number|boolean|ProtocolJson[]|{[key:string]:ProtocolJson};

/** Small bounded JSON reader: detect decoded duplicate keys before an ordinary
 * JSON parser can discard them. Count nested members against the shared field cap. */
export function readBoundedProtocolJson(text:string,queryFields:number):ProtocolJson {
 return readProtocolJson(text,queryFields,false);
}
/** Exact Magnite collector callers only. Full traversal and duplicate detection,
 * with a separately versioned structural allowance; never skip metadata. */
export function readMagniteProtocolJson(text:string,queryFields:number):ProtocolJson {
 return readProtocolJson(text,queryFields,true);
}
function readProtocolJson(text:string,queryFields:number,magnite:boolean):ProtocolJson {
 if(new TextEncoder().encode(text).length>32768)protocolLimit("bytes");
 const maxMembers=magnite?256:128,maxDepth=magnite?10:8;
 let at=0,count=queryFields,membersInspected=0;
 type Section=ProtocolJsonLimitContext["section"];
 const sectionMembers=new Map<Section,number>();
 const section=(path:readonly string[]):Section=>{
  if(!path.length)return "envelope";
  if(path[0]==="regs")return "privacy";
  if(path[0]==="user")return path[1]==="eids"||path[1]==="ext"&&path[2]==="eids"?"identity":"user_metadata";
  if(path[0]==="imp"){
   if(path[2]==="banner")return "banner";
   if(path[2]==="ext"&&path[3]==="prebid"&&path[4]==="bidder")return ["visitor","inventory"].includes(path[6]??"")?"publisher_fpd":"publisher_route";
   return "impression_metadata";
  }
  if(path[0]==="site"||path[0]==="device"||path[0]==="source")return path[0];
  if(path[0]==="ext")return "auction_metadata";
  return "other";
 };
 const context=(depth:number,path:readonly string[]):ProtocolJsonLimitContext=>({contractVersion:magnite?"bounded_json_limit_context.v2-magnite":"bounded_json_limit_context.v1",section:section(path),depth,membersInspected,
  sectionMembers:[...sectionMembers].map(([section,members])=>({section,members}))});
 const whitespace=()=>{while(/[\x20\t\r\n]/.test(text[at]??"x"))at++;};
 const member=(depth:number,path:readonly string[])=>{const s=section(path);membersInspected++;sectionMembers.set(s,(sectionMembers.get(s)??0)+1);if(++count>maxMembers)protocolLimit("members",context(depth,path));};
 const string=():string=>{
  const start=at++;while(at<text.length){const ch=text[at++]!;if(ch==='"')return JSON.parse(text.slice(start,at)) as string;if(ch==='\\')at++;}
  return fail();
 };
 const value=(depth:number,path:readonly string[]):ProtocolJson=>{
  if(depth>maxDepth)protocolLimit("depth",context(depth,path));whitespace();const ch=text[at];
  if(ch==='"')return string();
  if(ch==="{" || ch==="["){
   at++;whitespace();const object=ch==="{";const end=object?"}":"]";
   const result=object?Object.create(null) as {[key:string]:ProtocolJson}:[] as ProtocolJson[];
   if(text[at]===end){at++;return result;}
   for(;;){
    member(depth,path);whitespace();let key="";
    if(object){if(text[at]!=='"')fail();key=string();if(Object.hasOwn(result,key))fail("duplicate_fields");if(["__proto__","constructor","prototype"].includes(key))fail("unsupported_fields");whitespace();if(text[at++]!==":")fail();}
    const item=value(depth+1,[...path,object?key:"*"]);if(object)(result as {[key:string]:ProtocolJson})[key]=item;else(result as ProtocolJson[]).push(item);
    whitespace();if(text[at]===end){at++;break;}if(text[at++]!==",")fail();
   }
   return result;
  }
  const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
  if(!match)return fail();at+=match[0].length;const result=JSON.parse(match[0]) as ProtocolJson;
  if(typeof result==="number"&&!Number.isFinite(result))fail();return result;
 };
 const result=value(0,[]);whitespace();if(at!==text.length)fail();return result;
}
