const fail=(code="unsupported_body"):never=>{throw Error(code);};
export type ProtocolJson=null|string|number|boolean|ProtocolJson[]|{[key:string]:ProtocolJson};

/** Small bounded JSON reader: detect decoded duplicate keys before an ordinary
 * JSON parser can discard them. Count nested members against the shared field cap. */
export function readBoundedProtocolJson(text:string,queryFields:number):ProtocolJson {
 if(new TextEncoder().encode(text).length>32768)fail("body_limit");
 let at=0,count=queryFields;
 const whitespace=()=>{while(/[\x20\t\r\n]/.test(text[at]??"x"))at++;};
 const member=()=>{if(++count>128)fail("body_limit");};
 const string=():string=>{
  const start=at++;while(at<text.length){const ch=text[at++]!;if(ch==='"')return JSON.parse(text.slice(start,at)) as string;if(ch==='\\')at++;}
  return fail();
 };
 const value=(depth:number):ProtocolJson=>{
  if(depth>8)fail("body_limit");whitespace();const ch=text[at];
  if(ch==='"')return string();
  if(ch==="{" || ch==="["){
   at++;whitespace();const object=ch==="{";const end=object?"}":"]";
   const result=object?Object.create(null) as {[key:string]:ProtocolJson}:[] as ProtocolJson[];
   if(text[at]===end){at++;return result;}
   for(;;){
    member();whitespace();let key="";
    if(object){if(text[at]!=='"')fail();key=string();if(Object.hasOwn(result,key))fail("duplicate_fields");if(["__proto__","constructor","prototype"].includes(key))fail("unsupported_fields");whitespace();if(text[at++]!==":")fail();}
    const item=value(depth+1);if(object)(result as {[key:string]:ProtocolJson})[key]=item;else(result as ProtocolJson[]).push(item);
    whitespace();if(text[at]===end){at++;break;}if(text[at++]!==",")fail();
   }
   return result;
  }
  const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
  if(!match)return fail();at+=match[0].length;const result=JSON.parse(match[0]) as ProtocolJson;
  if(typeof result==="number"&&!Number.isFinite(result))fail();return result;
 };
 const result=value(0);whitespace();if(at!==text.length)fail();return result;
}
