import assert from "node:assert/strict";
import test from "node:test";
import {EventEmitter} from "node:events";
import {parseTermlyCookieResponse,installPassiveTermlyInventoryCapture,termlyInventoryTenant} from "./termly-network-inventory.js";
import {cmpBasicEvidenceSchema,projectNetworkCmpCookies,completeConfiguredCmpNames} from "@certscore/contracts";
const tenant="9598d17a-6c78-437c-83a3-52d50ae899fd",target="https://example.test/";
const script=`https://app.termly.io/resource-blocker/${tenant}?autoBlock=off`,url=`https://app.termly.io/api/v1/snippets/websites/${tenant}/cookies?lang=en`;
const source=()=>({cookies:{unclassified:[],essential:[{name:"security",purpose:"Protect requests",expire:"Session",tracker_type:"server_cookie",value:"SECRET",domain:".provider.test"}],performance:[],analytics:[{name:"_ga",purpose:"Measure visits",expire:"2 years",tracker_type:"http_cookie"},{name:"local",purpose:"Local",expire:"persistent",tracker_type:"html_local_storage"}],advertising:[],social_networking:[],prefix:[]}});
const proof=(body:Buffer)=>({documentToken:"loader",documentUrl:target,tenantId:tenant,scriptUrl:script,responseUrl:url,requestId:"request",frameId:"main",httpStatus:200 as const,mimeType:"application/json" as const,completedAtMs:50,decodedBytes:body.length});
const packet=(inventory:NonNullable<ReturnType<typeof parseTermlyCookieResponse>>)=>({contractVersion:"certscore.cmp-basic-evidence.v5",sourceLane:"consent_proof",scanId:"s",targetUrl:target,documentUrl:target,documentToken:"loader",capturedAtMs:60,provider:"Termly",networkCookieInventory:inventory,declarations:projectNetworkCmpCookies(inventory),inventoryManifest:inventory.inventoryManifest,controls:[],privacyLinks:[],serviceNames:[],captureProgress:{version:"cmp_capture_checkpoints.v1",documentToken:"loader",declarationsAtMs:50},limitations:["passive_first_layer_only","response_inventory_not_complete"]});
test("passive Termly response keeps cookie declarations, not storage keys, provider domains or private values",()=>{
 const body=Buffer.from(JSON.stringify(source())),v=parseTermlyCookieResponse(body,proof(body))!;
 assert.deepEqual(v.records.map(r=>r.name),["security","_ga"]);assert.equal(v.records[0]!.technology,"server_cookie");
 assert.deepEqual(v.inventoryManifest.names,["security","_ga"]);assert.equal(v.inventoryManifest.unresolvedSources,0);
 assert.equal(completeConfiguredCmpNames(v.inventoryManifest),false);assert.ok(!JSON.stringify(v).includes("SECRET"));assert.ok(!JSON.stringify(v).includes("provider.test"));
 assert.equal(cmpBasicEvidenceSchema.safeParse(packet(v)).success,true);
});
test("passive response contract fails closed on borrowed declarations, source binding, versions and timing",()=>{
 const body=Buffer.from(JSON.stringify(source())),v=parseTermlyCookieResponse(body,proof(body))!;
 for(const mutate of [(p:any)=>p.documentToken="different",(p:any)=>p.provider="OneTrust",(p:any)=>p.contractVersion="certscore.cmp-basic-evidence.v1",(p:any)=>p.declarations[0].purpose="invented",(p:any)=>p.captureProgress.declarationsAtMs=49,(p:any)=>p.networkCookieInventory.tenantId="00000000-0000-4000-8000-000000000000",(p:any)=>p.networkCookieInventory.scriptUrl+="&private=secret"]){const p=structuredClone(packet(v));mutate(p);assert.equal(cmpBasicEvidenceSchema.safeParse(p).success,false);}
});
test("unrecognized, missing, malformed, filtered and oversized response sources stay partial or unavailable",()=>{
 for(const text of ["bad",'{}','{"cookies":[]}',JSON.stringify({cookies:{unknown:[]}})]){const b=Buffer.from(text);assert.equal(parseTermlyCookieResponse(b,proof(b)),undefined);}
 const input=source();input.cookies.prefix=[{name:"prefix",tracker_type:"http_cookie"}] as any;
 input.cookies.essential.push({name:"bad name",purpose:"bad",expire:"bad",tracker_type:"server_cookie",value:"",domain:""});
 const b=Buffer.from(JSON.stringify(input)),v=parseTermlyCookieResponse(b,proof(b))!;
 assert.equal(v.inventoryManifest.unresolvedSources,1);assert.equal(v.inventoryManifest.unresolvedRecordCount,1);assert.ok(!v.inventoryManifest.names.includes("prefix"));
 assert.equal(parseTermlyCookieResponse(b,{...proof(b),decodedBytes:b.length+1}),undefined);
 assert.equal(parseTermlyCookieResponse(Buffer.alloc(65537),{...proof(b),decodedBytes:65537}),undefined);
 for(const u of [url+"&include_tcf_cookies=false",url+"#frag",url.replace("app.termly.io","other.test"),url.replace(tenant,"x"),url+"&token=secret"]){assert.equal(termlyInventoryTenant(u,"cookies"),undefined);}
});
function harness(options:{body?:Buffer;delay?:boolean;fail?:boolean}={}){
 const body=options.body??Buffer.from(JSON.stringify(source()));const session=new EventEmitter() as any;
 let calls=0,current=true,binding={url:target,token:"loader"},resolve:(v:any)=>void=()=>{};
 session.send=async (method:string)=>{calls++;assert.equal(method,"Network.getResponseBody");if(options.fail)throw Error("buffer unavailable");if(options.delay)return await new Promise(r=>resolve=r);return{body:body.toString(),base64Encoded:false};};
 const capture=installPassiveTermlyInventoryCapture({session,mainFrameId:"main",targetUrl:target,now:()=>50,readBinding:()=>binding,isCurrent:()=>current});
 const req=(id:string,type:string,u:string,extra={})=>session.emit("Network.requestWillBeSent",{requestId:id,type,frameId:"main",loaderId:"loader",documentURL:target,request:{url:u,method:"GET"},...extra});
 const scriptRequest=()=>req("script","Script",script);
 const begin=(extra={})=>req("request","XHR",url,extra);
 const response=(extra={})=>session.emit("Network.responseReceived",{requestId:"request",frameId:"main",loaderId:"loader",response:{url,status:200,mimeType:"application/json",...extra}});
 const finish=(size=body.length)=>{session.emit("Network.dataReceived",{requestId:"request",dataLength:size});session.emit("Network.loadingFinished",{requestId:"request"});};
 return{capture,req,scriptRequest,begin,response,finish,calls:()=>calls,flush:()=>new Promise<void>(r=>setImmediate(r)),drift:()=>binding={url:target,token:"changed"},expire:()=>current=false,resolve:()=>resolve({body:body.toString(),base64Encoded:false})};
}
test("one already-loaded main-document response is read once without another protocol or network action",async()=>{
 const h=harness();h.scriptRequest();h.begin();h.response();h.finish();await h.flush();assert.equal(h.calls(),1);assert.equal(h.capture.snapshot()?.records.length,2);
 h.expire();assert.equal(h.capture.snapshot()?.records.length,2,"Completed evidence survives the end of its budget");h.capture.close();assert.equal(h.capture.snapshot(),undefined);
});
test("oversize, redirects, wrong documents, service workers, failures and ambiguous responses never project",async()=>{
 for(const kind of ["oversize","redirect","wrongframe","wrongloader","wrongdocument","no_script","worker","mime","http","duplicate","failed"]){
  const h=harness();if(kind!=="no_script")h.scriptRequest();
  h.begin(kind==="redirect"?{redirectResponse:{status:302}}:kind==="wrongframe"?{frameId:"child"}:kind==="wrongloader"?{loaderId:"foreign"}:kind==="wrongdocument"?{documentURL:"https://other.test/"}:{});
  h.response(kind==="worker"?{fromServiceWorker:true}:kind==="mime"?{mimeType:"text/html"}:kind==="http"?{status:403}:{});
  if(kind==="duplicate")h.req("second","Fetch",url);
  if(kind==="failed")(h as any).req("request","XHR",url,{redirectResponse:{status:302}});
  h.finish(kind==="oversize"?65537:undefined);await h.flush();assert.equal(h.capture.snapshot(),undefined,kind);assert.equal(h.calls(),0,kind);h.capture.close();
 }
});
test("late body completion, document drift and producer closure cannot reopen publication",async()=>{
 for(const kind of ["drift","closed","expired"]){const h=harness({delay:true});h.scriptRequest();h.begin();h.response();h.finish();if(kind==="drift")h.drift();if(kind==="closed")h.capture.close();if(kind==="expired")h.expire();h.resolve();await h.flush();assert.equal(h.capture.snapshot(),undefined,kind);h.capture.close();}
});

test("consent-proof joins an already-requested Termly body without an Options action or extra request",{timeout:20000},async()=>{
 const {createServer}=await import("node:http");const {mkdtemp,rm}=await import("node:fs/promises");const {tmpdir}=await import("node:os");
 const {createArtifactWriter}=await import("./artifact-writer.js");const {preConsentRuntimeScanner}=await import("./scanners/pre-consent-runtime-scanner.js");
 const server=createServer((_req,res)=>{res.setHeader("content-type","text/html");res.end(`<main>Local deterministic Termly inventory fixture.</main><section data-termly-part="consent-banner"><p>We use cookies.</p><div data-termly-part="banner-actions"><button>Accept all</button><button>Reject all</button><button onclick="fetch('/unexpected-options')">Manage preferences</button></div></section><script src="${script}"></script>`);});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");const targetUrl=`http://127.0.0.1:${address.port}/`;const root=await mkdtemp(`${tmpdir()}/termly-passive-`);
 try{
  const result=await preConsentRuntimeScanner({url:targetUrl,normalizedUrl:targetUrl,scanStartedAtMs:Date.now(),internalBudgetMs:6500,cmpBasicScanId:"termly-fixture",captureScope:"consent_proof",screenshotMode:"always",artifactWriter:await createArtifactWriter(root),routeFulfillers:[
   {urlPattern:/^https:\/\/app\.termly\.io\/resource-blocker\//,status:200,contentType:"application/javascript",body:`fetch('${url}').then(r=>r.json()).then(()=>window.loaded=true);`},
   {urlPattern:/^https:\/\/app\.termly\.io\/api\/v1\/snippets\/websites\//,status:200,headers:{"access-control-allow-origin":"*"},contentType:"application/json",body:JSON.stringify(source())},
  ]});
  assert.equal(result.networkEvents.filter(r=>r.url===url).length,1);assert.equal(result.networkEvents.filter(r=>r.url===script).length,1);assert.equal(result.cmpBasicEvidence?.contractVersion,"certscore.cmp-basic-evidence.v5",JSON.stringify(result.moduleRun.timingBreakdown?.filter(r=>r.label==="passive CMP basics")));
  assert.deepEqual(result.cmpBasicEvidence?.declarations.map(r=>r.name),["security","_ga"]);
  assert.equal(result.networkEvents.some(r=>r.url.includes("unexpected-options")),false);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});


test("large declaration lists preserve bounded names separately from sampled detail without claiming completeness",()=>{
 const input=source();input.cookies.analytics=Array.from({length:200},(_,i)=>({name:`cookie_${i}`,purpose:"p".repeat(240),expire:"1 day",tracker_type:"http_cookie"}));
 const b=Buffer.from(JSON.stringify(input)),v=parseTermlyCookieResponse(b,proof(b));
 // The transport ceiling precedes parsing, even when the parsed lists could fit.
 if(b.length>65536){assert.equal(v,undefined);return;}
 assert.ok(v);assert.ok(v.records.length<=100);assert.ok(v.records.reduce((n,r)=>n+r.name.length+r.purpose.length+r.duration.length,0)<=16000);
 assert.equal(v.truncated,true);assert.equal(completeConfiguredCmpNames(v.inventoryManifest),false);
});

test("missing completion, unavailable buffers, wrong decoded length and multiple tenants remain unavailable",async()=>{
 const pending=harness();pending.scriptRequest();pending.begin();pending.response();await pending.flush();assert.equal(pending.calls(),0);assert.equal(pending.capture.snapshot(),undefined);pending.capture.close();
 const unavailable=harness({fail:true});unavailable.scriptRequest();unavailable.begin();unavailable.response();unavailable.finish();await unavailable.flush();assert.equal(unavailable.capture.snapshot(),undefined);unavailable.capture.close();
 const mismatch=harness();mismatch.scriptRequest();mismatch.begin();mismatch.response();mismatch.finish(10);await mismatch.flush();assert.equal(mismatch.capture.snapshot(),undefined);mismatch.capture.close();
 const invalid=harness({body:Buffer.from("not json")});invalid.scriptRequest();invalid.begin();invalid.response();invalid.finish();await invalid.flush();assert.equal(invalid.capture.snapshot(),undefined);invalid.capture.close();
 const duplicate=harness();duplicate.scriptRequest();duplicate.begin();duplicate.response();duplicate.finish();await duplicate.flush();assert.ok(duplicate.capture.snapshot());
 duplicate.req("second-script","Script",script.replace(tenant,"00000000-0000-4000-8000-000000000000"));assert.equal(duplicate.capture.snapshot(),undefined);duplicate.capture.close();
});
