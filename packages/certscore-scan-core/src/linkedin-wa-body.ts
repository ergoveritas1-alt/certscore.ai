import {readBoundedProtocolJson, isAdvertisingIdentityValue, type ProtocolJson as Json} from "@certscore/vendor-resolver";
import {gunzipSync} from "node:zlib";

const limit=32768;
const fail=(code="unsupported_body"):never=>{throw Error(code);};

const strings=new Set(["domain","url","websiteSignalRequestId","pageLoadId","pageTitle","pageInstanceId","liFatId","liGiant","hem","href","dwellSegmentId"]);
const numbers=new Set(["scriptVersion","time","dwellMs","pauseMs"]);
const booleans=new Set(["isTranslated","isLinkedInApp","isFilteredByClient"]);
const processing=new Set(["gpp","gpp_sid","us_privacy"]);
const domFields=new Set(["elementSemanticType","elementValue","elementType","tagName","backgroundImageSrc","imageSrc","imageAlt","innerText","elementTitle","cursor","formAction","onClick"]);
const object=(v:Json):v is {[key:string]:Json}=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const stringOrNull=(v:Json)=>v===null||typeof v==="string";
function dom(v:Json):boolean {
 return object(v)&&Object.entries(v).every(([key,value])=>domFields.has(key)?stringOrNull(value):key==="isFormSubmission"&&typeof value==="boolean");
}
function crumb(v:Json):boolean {
 return object(v)&&Object.entries(v).every(([key,value])=>
  ["tagName","id"].includes(key)?typeof value==="string":key==="nthChild"?typeof value==="number"&&Number.isInteger(value)&&value>=0:
  key==="classes"?Array.isArray(value)&&value.every(x=>typeof x==="string"):
  key==="attributes"?object(value)&&Object.entries(value).every(([name,x])=>typeof x==="string"&&(/^(?:data-|.*click)/i.test(name)||["name","type","href","src","action","method"].includes(name))):false);
}

/** LinkedIn's reviewed /wa/ format: fmt=g is base64(gzip(JSON)), b is
 * base64(JSON), a is JSON. No arbitrary endpoint, opaque nested privacy state,
 * page/session ID or DOM value can establish an advertising identifier. */
export function decodeLinkedInWaBody(url:URL,method:string,body:string) {
 if(url.hostname!=="px.ads.linkedin.com"||!/^\/wa\/?$/.test(url.pathname)||method!=="POST"||url.searchParams.getAll("fmt").length!==1)return null;
 const fmt=url.searchParams.get("fmt");if(!["g","b","a"].includes(fmt??""))return null;
 if(body.length>limit||Buffer.byteLength(body)>limit)fail("body_limit");
 let bytes:Buffer;
 if(fmt==="a")bytes=Buffer.from(body);
 else {
  if(!body || body.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body))fail();
  bytes=Buffer.from(body,"base64");if(bytes.toString("base64")!==body)fail();
  if(fmt==="g")try{bytes=gunzipSync(bytes,{maxOutputLength:limit});}catch(error){if((error as NodeJS.ErrnoException).code==="ERR_BUFFER_TOO_LARGE")fail("body_limit");return fail();}
 }
 if(bytes.length>limit)fail("body_limit");
 const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes),root=readBoundedProtocolJson(text,[...url.searchParams].length);
 if(!object(root))return fail("unsupported_fields");
 if(!["PAGE_VISIT","CLICK"].includes(String(root.signalType)))return fail("unsupported_fields");
 const fields=new URLSearchParams();
 for(const [key,value] of Object.entries(root)){
  if(url.searchParams.has(key))fail("duplicate_fields");
  let valid=false;
  if(strings.has(key))valid=stringOrNull(value);
  else if(numbers.has(key))valid=typeof value==="number"&&Number.isFinite(value);
  else if(booleans.has(key))valid=typeof value==="boolean";
  else if(processing.has(key)){valid=typeof value==="string"||typeof value==="number"||typeof value==="boolean";if(valid)fields.append(key,String(value));}
  else if(key==="signalType")valid=true;
  else if(key==="signalSubType")valid=value==="DWELL";
  else if(key==="pids")valid=Array.isArray(value)&&value.every(x=>typeof x==="number"&&Number.isInteger(x)&&x>0);
  else if(key==="misc")valid=object(value)&&Object.keys(value).length===1&&value.psbState===-4;
  else if(key==="domAttributes")valid=dom(value);
  else if(key==="innerElements")valid=value===null||Array.isArray(value)&&value.every(dom);
  else if(key==="elementCrumbsTree")valid=Array.isArray(value)&&value.every(crumb);
  if(!valid)fail("unsupported_fields");
 }
 // Preserve exact original identifier spelling in proof and qualification.
 for (const key of ["liFatId", "hem"]) if (typeof root[key] === "string") fields.append(key, root[key]);
 const identifierDispositions = (["liFatId", "hem", "liGiant"] as const).map(field => {
  const value = root[field];
  const status = value === undefined ? "absent" : value === null ? "null" : value === "" ? "empty" :
   field === "liGiant" ? "excluded" : isAdvertisingIdentityValue(field, value) ? "valid" : "invalid";
  return {field, status} as const;
 });
 return {fields,identifierDispositions,decodedBytes:bytes,encoding:fmt==="g"?"base64_gzip" as const:fmt==="b"?"base64" as const:"identity" as const};
}
