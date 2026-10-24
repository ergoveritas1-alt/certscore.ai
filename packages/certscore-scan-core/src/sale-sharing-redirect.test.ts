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
import {SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_REDIRECT_AUTHORIZATION,saleSharingOptOutEvidenceSchema} from "@certscore/contracts";
import {runSaleSharingOptOutObserver} from "./sale-sharing-opt-out-observer";

// A local CONNECT proxy maps fixture hosts exclusively to loopback. The generated
// test certificate is explicitly trusted by SPKI for the positive browser only;
// runtime contexts still use ignoreHTTPSErrors:false. No public-site connections.
test("one-hop HTTPS redirect authorizes only its exact apex/www document",{timeout:35000},async t=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-redirect-tls-"));
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(root,"key.pem"),"-out",join(root,"cert.pem"),"-days","1","-subj","/CN=example.com","-addext","subjectAltName=DNS:example.com,DNS:www.example.com"],{stdio:"ignore"});
  const key=await readFile(join(root,"key.pem")),cert=await readFile(join(root,"cert.pem"));
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(root,"bad-key.pem"),"-out",join(root,"bad-cert.pem"),"-days","1","-subj","/CN=www.example.com"],{stdio:"ignore"});
  const badContext=createSecureContext({key:await readFile(join(root,"bad-key.pem")),cert:await readFile(join(root,"bad-cert.pem"))}),goodContext=createSecureContext({key,cert});
  const spki=createHash("sha256").update(new X509Certificate(cert).publicKey.export({type:"spki",format:"der"})).digest("base64");
  let mode="",clicks=0;let requests:string[]=[];let blockedConnects:string[]=[];
  const site=httpsServer({key,cert,SNICallback:(host,callback)=>callback(null,mode==="destination-tls"&&host==="www.example.com"?badContext:goodContext)},(req,res)=>{
    const url=`https://${req.headers.host}${req.url}`;requests.push(url);
    if(req.url==="/clicked"){clicks++;res.end();return;}
    if(req.headers.host===(mode==="reverse"?"www.example.com":"example.com")&&!["direct","client-redirect","meta-refresh"].includes(mode)){
      res.writeHead(mode.startsWith("status-")?Number(mode.slice(7)):302,{Location:mode==="cross-domain"?"https://other.com/":mode==="path"?"https://www.example.com/account":mode==="query"?"https://www.example.com/?token=secret":mode==="downgrade"?"http://www.example.com/":mode==="reverse"?"https://example.com/":"https://www.example.com/"});res.end();return;
    }
    if(mode==="second-hop"){res.writeHead(301,{Location:"https://example.com/"});res.end();return;}
    if(mode==="http-error")res.statusCode=403;
    res.setHeader("Content-Type","text/html");
    res.end(`<!doctype html><html>${mode==="meta-refresh"?'<meta http-equiv="refresh" content="0;url=https://www.example.com/">':''}<body><div id="onetrust-pc-sdk"><button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">Do Not Sell or Share My Personal Information</button></div><script>
      let choice=2;window.__gpp=(cmd,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);
      document.querySelector('button').onclick=()=>{choice=1;fetch('/clicked');};
      ${mode==="client-redirect"?"location.href='https://www.example.com/';":mode==="history-bounce"?"history.pushState({},'', '/away');history.replaceState({},'', '/');":""}
    </script></body></html>`);
  });
  await new Promise<void>(resolve=>site.listen(0,"127.0.0.1",resolve));
  const addr=site.address();assert.ok(addr&&typeof addr!=="string");
  const sockets=new Set<import("node:net").Socket>();
  const proxy=httpServer((_req,res)=>{res.writeHead(403);res.end();});
  proxy.on("connect",(req,socket,head)=>{
    if(!["example.com:443","www.example.com:443"].includes(req.url??"")){blockedConnects.push(req.url??"");socket.destroy();return;}
    const upstream=connect(addr.port,"127.0.0.1",()=>{socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    sockets.add(upstream);upstream.on("close",()=>sockets.delete(upstream));upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());socket.on("close",()=>upstream.destroy());
  });
  await new Promise<void>(resolve=>proxy.listen(0,"127.0.0.1",resolve));
  const proxyAddr=proxy.address();assert.ok(proxyAddr&&typeof proxyAddr!=="string");
  const options={headless:true,proxy:{server:`http://127.0.0.1:${proxyAddr.port}`}};
  const browser=await chromium.launch({...options,args:[`--ignore-certificate-errors-spki-list=${spki}`]});
  try{
    for(const scenario of ["valid","reverse","status-301","status-303","status-307","status-308","direct","cross-domain","path","query","downgrade","second-hop","http-error","client-redirect","meta-refresh","history-bounce","destination-tls","tight-budget"]){
      await t.test(scenario,async()=>{
        mode=scenario;clicks=0;requests=[];blockedConnects=[];
        const original=scenario==="reverse"?"https://www.example.com/":"https://example.com/",alternate=scenario==="reverse"?"https://example.com/":"https://www.example.com/";
        const started=Date.now();
        const packet=await runSaleSharingOptOutObserver({browser,...(scenario==="tight-budget"?{deadlineAtMs:started+500}:{}),parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:SALE_SHARING_REDIRECT_POLICY,scanId:scenario,exactTargetUrl:original,redirectAuthorization:{version:SALE_SHARING_REDIRECT_AUTHORIZATION,alternateTargetUrl:alternate}}});
        assert.ok(Date.now()-started<3250,"unchanged capture plus cleanup budget");
        assert.ok(saleSharingOptOutEvidenceSchema.safeParse(packet).success);
        const success=["valid","reverse","direct"].includes(scenario)||scenario.startsWith("status-");
        assert.equal(packet.status==="complete",success,JSON.stringify(packet));assert.equal(clicks,success?1:0);
        assert.equal(packet.targetUrl,original);
        assert.ok(Buffer.byteLength(JSON.stringify(packet))<32000);
        if(success){assert.equal(packet.actionTargetUrl,scenario==="direct"?original:alternate);assert.equal(Boolean(packet.redirectProof),scenario!=="direct");assert.equal(packet.tlsValidated,true);assert.equal(packet.observationWindowMs,500);}
        else{assert.equal(packet.actionCount,0);assert.deepEqual(packet.requests,[]);}
        if(["cross-domain","path","query","downgrade","client-redirect","meta-refresh","destination-tls"].includes(scenario))assert.deepEqual(requests,["https://example.com/"],"unapproved redirect never sent");
        if(scenario==="second-hop")assert.deepEqual(requests,["https://example.com/","https://www.example.com/"],"loop request never sent");
        assert.deepEqual(blockedConnects,[]);
        t.diagnostic(`${scenario}: ${Date.now()-started} ms, ${Buffer.byteLength(JSON.stringify(packet))} bytes`);
      });
    }
    await t.test("invalid TLS never creates a choice",async()=>{
      const untrusted=await chromium.launch(options);
      try{clicks=0;requests=[];mode="valid";
        const packet=await runSaleSharingOptOutObserver({browser:untrusted,parentDispatchSha256:"a".repeat(64),config:{enabled:true,policyVersion:SALE_SHARING_REDIRECT_POLICY,scanId:"tls",exactTargetUrl:"https://example.com/",redirectAuthorization:{version:SALE_SHARING_REDIRECT_AUTHORIZATION,alternateTargetUrl:"https://www.example.com/"}}});
        assert.equal(packet.actionCount,0);assert.equal(packet.tlsValidated,false);assert.equal(packet.captureComplete,false);assert.equal(clicks,0);assert.deepEqual(requests,[]);
      }finally{await untrusted.close();}
    });
  }finally{await browser.close();for(const socket of sockets)socket.destroy();proxy.closeAllConnections();site.closeAllConnections();await Promise.all([new Promise<void>(resolve=>proxy.close(()=>resolve())),new Promise<void>(resolve=>site.close(()=>resolve()))]);await rm(root,{recursive:true,force:true});}
});
