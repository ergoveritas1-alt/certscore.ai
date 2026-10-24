import assert from "node:assert/strict";
import test from "node:test";
import {createServer as httpServer} from "node:http";
import {createServer as httpsServer} from "node:https";
import {connect} from "node:net";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash,X509Certificate} from "node:crypto";
import {createSecureContext} from "node:tls";
import {chromium} from "playwright";
import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization,saleSharingOptOutEvidenceSchema} from "@certscore/contracts";
import {exactRouteSources} from "../../certscore-contracts/src/sale-sharing-exact-route.fixture";
import {runSaleSharingOptOutObserver} from "./sale-sharing-opt-out-observer";

// Public hostnames are fixture identities only. Every CONNECT is mapped to this
// loopback HTTPS server; the proxy rejects every other destination, without DNS.
test("ten approved exact routes use native HTTPS under the unchanged observer budget",{timeout:45000},async t=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-exact-routes-"));
  const hosts=[...new Set(exactRouteSources.flatMap(s=>[s,...saleSharingExactRouteAuthorization(s)!.targets]).map(s=>new URL(s).hostname))];
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(root,"key.pem"),"-out",join(root,"cert.pem"),"-days","1","-subj","/CN=jaguar.com","-addext",`subjectAltName=${hosts.map(h=>`DNS:${h}`).join(',')}`],{stdio:"ignore"});
  const key=await readFile(join(root,"key.pem")),cert=await readFile(join(root,"cert.pem"));
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(root,"bad-key.pem"),"-out",join(root,"bad-cert.pem"),"-days","1","-subj","/CN=untrusted"],{stdio:"ignore"});
  const bad=createSecureContext({key:await readFile(join(root,"bad-key.pem")),cert:await readFile(join(root,"bad-cert.pem"))}),good=createSecureContext({key,cert});
  const spki=createHash("sha256").update(new X509Certificate(cert).publicKey.export({type:"spki",format:"der"})).digest("base64");
  let mode="valid",route:string[]=[],clicks=0,requests:string[]=[],denied:string[]=[];
  const site=httpsServer({key,cert,SNICallback:(host,cb)=>cb(null,(mode==="intermediate-tls"&&host==="cognitionads.com"||mode==="final-tls"&&host==="www.cognitionads.com")?bad:good)},(req,res)=>{
    const url=`https://${req.headers.host}${req.url}`;
    if(req.url==="/clicked"){clicks++;res.end();return;}
    requests.push(url);const index=route.indexOf(url);
    if(index<0){res.writeHead(404);res.end();return;}
    if(mode==="stalled-final"&&index===route.length-1)return;
    if(index<route.length-1&&!(mode==="direct"&&index===0)&&!(mode==="intermediate-200"&&index===1)){
      let next=route[index+1]!;
      if(index===0&&mode==="skip-first")next=route.at(-1)!;
      if(index===0&&mode==="wrong-intermediate")next="https://about.readcube.com/";
      if(index===1){
        if(mode==="duplicate-query")next+="&akam_redirect=true";
        if(mode==="extra-query")next+="&extra=1";
        if(mode==="query-value")next=next.replace("true","false");
        if(mode==="wrong-path")next="https://www.jaguar.com/account";
        if(mode==="loop")next=route[0]!;
      }
      res.writeHead(index===0?301:308,{Location:next});res.end();return;
    }
    if(mode==="third-hop"){res.writeHead(302,{Location:route[0]!});res.end();return;}
    if(mode==="http-error")res.statusCode=403;
    res.setHeader("Content-Type","text/html");
    res.end(`<!doctype html><html><body><div id="onetrust-pc-sdk"><button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">Do Not Sell or Share My Personal Information</button></div><script>
      let choice=2;window.__gpp=(cmd,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);
      document.querySelector('button').onclick=()=>{choice=1;fetch('/clicked');};
      ${mode==="client-redirect"?`location.href=${JSON.stringify(route[0])};`:mode==="history-bounce"?`history.pushState({},'', '/changed');history.replaceState({},'', ${JSON.stringify(new URL(route.at(-1)!).pathname+new URL(route.at(-1)!).search)});`:""}
    </script></body></html>`);
  });
  await new Promise<void>(resolve=>site.listen(0,"127.0.0.1",resolve));const address=site.address();assert.ok(address&&typeof address!=="string");
  const sockets=new Set<import("node:net").Socket>(),proxy=httpServer((_req,res)=>{res.writeHead(403);res.end();});
  proxy.on("connect",(req,socket,head)=>{
    if(!hosts.some(h=>`${h}:443`===req.url)){denied.push(req.url??"");socket.destroy();return;}
    const upstream=connect(address.port,"127.0.0.1",()=>{socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    sockets.add(upstream);upstream.on("close",()=>sockets.delete(upstream));upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());socket.on("close",()=>upstream.destroy());
  });
  await new Promise<void>(resolve=>proxy.listen(0,"127.0.0.1",resolve));const proxyAddress=proxy.address();assert.ok(proxyAddress&&typeof proxyAddress!=="string");
  const options={headless:true,proxy:{server:`http://127.0.0.1:${proxyAddress.port}`}},browser=await chromium.launch({...options,args:[`--ignore-certificate-errors-spki-list=${spki}`]});
  try{
    const cases=[...exactRouteSources.map(original=>({original,scenario:"valid"})),...["direct","skip-first","wrong-intermediate","intermediate-200","duplicate-query","extra-query","query-value","wrong-path","loop","third-hop","client-redirect","history-bounce","http-error","tight-budget","stalled-final","intermediate-tls","final-tls"].map(scenario=>({original:scenario.endsWith("-tls")?"https://cognitiondigital.io/":"https://jaguar.com/",scenario}))];
    for(const {original,scenario} of cases)await t.test(`${original} ${scenario}`,async()=>{
      mode=scenario;route=[original,...saleSharingExactRouteAuthorization(original)!.targets];clicks=0;requests=[];denied=[];const started=Date.now();
      const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:"a".repeat(64),...(mode==="tight-budget"?{deadlineAtMs:started+500}:{}),config:{enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:scenario,exactTargetUrl:original,exactRouteAuthorization:saleSharingExactRouteAuthorization(original)}});
      const success=["valid","direct"].includes(mode);assert.equal(packet.status==="complete",success,JSON.stringify(packet));assert.ok(saleSharingOptOutEvidenceSchema.safeParse(packet).success);
      assert.equal(packet.targetUrl,original);assert.equal(packet.contractVersion,"certscore.sale-sharing-opt-out-evidence.v3");assert.equal(clicks,success?1:0);assert.equal(packet.actionCount,success?1:0);assert.ok(Date.now()-started<3250);assert.ok(Buffer.byteLength(JSON.stringify(packet))<32000);
      if(success){assert.equal(packet.observationWindowMs,500);assert.equal(packet.tlsValidated,true);assert.equal(packet.actionTargetUrl,mode==="direct"?original:route.at(-1));assert.equal(packet.exactRouteProof?.hops.length??0,mode==="direct"?0:route.length-1);assert.deepEqual(requests,mode==="direct"?[original]:route);}
      else assert.deepEqual(packet.requests,[]);
      if(["skip-first","wrong-intermediate","intermediate-tls"].includes(mode))assert.deepEqual(requests,route.slice(0,1));
      if(["intermediate-200","duplicate-query","extra-query","query-value","wrong-path","loop","final-tls"].includes(mode))assert.deepEqual(requests,route.slice(0,2),"forbidden final destination never requested");
      if(["third-hop","client-redirect","history-bounce"].includes(mode))assert.deepEqual(requests,route,"no fourth document request");
      assert.deepEqual(denied,[]);t.diagnostic(`${original} ${mode}: ${Date.now()-started} ms, ${Buffer.byteLength(JSON.stringify(packet))} bytes`);
    });
    await t.test("invalid initial TLS cannot create proof or action",async()=>{
      const untrusted=await chromium.launch(options);
      try{mode="valid";route=["https://gimbal.com/","https://infillion.com/"];requests=[];clicks=0;
        const packet=await runSaleSharingOptOutObserver({browser:untrusted,parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:"tls",exactTargetUrl:route[0]!,exactRouteAuthorization:saleSharingExactRouteAuthorization(route[0]!)}});
        assert.equal(packet.actionCount,0);assert.equal(packet.tlsValidated,false);assert.equal(packet.exactRouteProof,null);assert.deepEqual(requests,[]);
      }finally{await untrusted.close();}
    });
  }finally{await browser.close();for(const s of sockets)s.destroy();proxy.closeAllConnections();site.closeAllConnections();await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>site.close(()=>r()))]);await rm(root,{recursive:true,force:true});}
});
