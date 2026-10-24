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
import {chromium} from "playwright";
import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization,saleSharingOptOutEvidenceSchema,classifyConsentControlLabel} from "@certscore/contracts";
import {runSaleSharingOptOutObserver} from "./sale-sharing-opt-out-observer";

// All site identities below terminate on this fixture's loopback TLS server.
// The CONNECT proxy refuses any other host; no live-site requests are made.
test("route-scoped Settings openings preserve explicit submission, proof and budgets",{timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),"certscore-settings-"));
  const hosts=["readcube.com","www.readcube.com","about.readcube.com","gimbal.com","infillion.com","cdn.cookielaw.org"];
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(root,"key.pem"),"-out",join(root,"cert.pem"),"-days","1","-subj","/CN=gimbal.com","-addext",`subjectAltName=${hosts.map(h=>`DNS:${h}`).join(',')}`],{stdio:"ignore"});
  const key=await readFile(join(root,"key.pem")),cert=await readFile(join(root,"cert.pem"));
  const spki=createHash("sha256").update(new X509Certificate(cert).publicKey.export({type:"spki",format:"der"})).digest("base64");
  let mode="",source="",opens:string[]=[],submits=0,documents:string[]=[],denied:string[]=[];
  const site=httpsServer({key,cert},(req,res)=>{
    if(mode==="gimbal-script" && req.headers.host==="cdn.cookielaw.org" && req.url==="/scripttemplates/202604.1.0/otBannerSdk.js"){
      res.setHeader("Content-Type","text/javascript");
      const timer=setTimeout(()=>res.end("window.__gpp=(command,cb)=>{reads++;cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);};"),150);
      res.on("close",()=>clearTimeout(timer));return;
    }
    if(mode==="gimbal-script" && req.url==="/slow-readiness.js"){
      res.setHeader("Content-Type","text/javascript");const timer=setTimeout(()=>res.end(),2000);
      res.on("close",()=>clearTimeout(timer));return;
    }
    if(req.url?.startsWith("/opened")){opens.push(req.url);res.end();return;}
    if(req.url==="/submitted"){submits++;res.end();return;}
    const url=`https://${req.headers.host}${req.url}`;
    documents.push(url);
    const route=[source,...(saleSharingExactRouteAuthorization(source)?.targets??[])];
    const position=route.indexOf(url);
    if(position<0){res.writeHead(404);res.end();return;}
    if(position<route.length-1&&mode!=="direct-original"){res.writeHead(302,{Location:mode==="skip-route-hop"?route.at(-1)!:route[position+1]!});res.end();return;}
    const readcube=source.includes("readcube"),label=readcube?"Cookies settings":"Cookie Settings";
    const accessible=readcube?"Cookies settings, Opens the preference center dialog":mode==="old-gimbal-label"?"Cookie Settings, Opens preference center dialog":"Cookie Settings, Opens the preference center dialog";
    const button=`<button id="onetrust-pc-btn-handler" type="${mode==="submit-entrance"?'submit':'button'}" ${mode==="hidden-native"?'hidden':''} ${mode==="disabled"?'disabled':''} ${mode==="associated-form"?'form="external"':''} aria-label="${mode==="wrong-name"?'Accept all':accessible}">${mode==="wrong-visible"?'Accept all':label}</button>`;
    const anchor=`<a id="ot-sdk-btn" class="ot-sdk-show-settings" href="${mode==="external-href"?'https://privacyportal.onetrust.com/webform/excluded':mode==="absolute-href"?url+'#':'#'}" ${mode==="anchor-target"?'target="_blank"':''} ${mode==="anchor-download"?'download':''}>${label}</a>`;
    const anchorOnly=mode.startsWith("anchor")||["external-href","absolute-href","base-href","hash-drift","external-navigation","history-bounce","readcube-anchor"].includes(mode);
    let entry=anchorOnly?anchor:button;
    if(["native-preferred","hidden-native"].includes(mode))entry+=anchor;
    if(mode==="duplicate")entry+=button;
    if(mode==="entrance-form"||mode==="anchor-form")entry=`<form>${entry}</form>`;
    if(mode==="external-form-only")entry='<a href="https://privacyportal.onetrust.com/webform/excluded">Your Privacy Choices</a>';
    if(mode==="shadow-control")entry='<div id="shadow-host"></div>';
    const fields=mode==="fields"?'<input type="checkbox">':mode==="dialog-form"?'<form><input name="email"></form>':'';
    res.setHeader("Content-Type","text/html");
    res.end(`<!doctype html><html><head>${mode==="base-href"?'<base href="https://privacyportal.onetrust.com/">':''}</head><body>${entry}
      <div id="onetrust-pc-sdk" hidden>${fields}<button type="button" class="save-preference-btn-handler onetrust-close-btn-handler">${mode==="generic-save"?'Save':mode==="cookie-reject"?'Reject all':'Do Not Sell or Share My Personal Information'}</button></div>
      <script>let choice=${mode==="already-opted-out"?1:2},reads=0;
      ${mode==="shadow-control"?`document.getElementById('shadow-host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(button)};`:''}
      ${["no-gpp","gimbal-script"].includes(mode)?'':`window.__gpp=(command,cb)=>{reads++;cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:${mode==="terminal-reversal"?'reads===3?2:choice':'choice'},SharingOptOut:choice}}},true);};`}
      for(const entry of document.querySelectorAll('#onetrust-pc-btn-handler,#ot-sdk-btn'))entry.onclick=event=>{
        ${mode==="hash-drift"?'':'event.preventDefault();'}
        fetch('/opened?'+entry.tagName);document.getElementById('onetrust-pc-sdk').hidden=false;
        ${mode==="external-navigation"?'location.href="https://privacyportal.onetrust.com/webform/excluded";':''}
        ${mode==="history-bounce"?'history.pushState({},"","/changed");history.replaceState({},"","/");':''}
      };
      document.querySelector('.save-preference-btn-handler').onclick=()=>{fetch('/submitted');${mode==="unconfirmed"?'':'choice=1;'}};
      </script>${mode==="gimbal-script"?'<script async src="https://cdn.cookielaw.org/scripttemplates/202604.1.0/otBannerSdk.js"></script><script defer src="/slow-readiness.js"></script>':''}</body></html>`);
  });
  await new Promise<void>(r=>site.listen(0,"127.0.0.1",r));const address=site.address();assert.ok(address&&typeof address!=="string");
  const sockets=new Set<import("node:net").Socket>(),proxy=httpServer((_req,res)=>{res.writeHead(403);res.end();});
  proxy.on("connect",(req,socket,head)=>{
    if(!hosts.some(h=>`${h}:443`===req.url)){denied.push(req.url??"");socket.destroy();return;}
    const upstream=connect(address.port,"127.0.0.1",()=>{socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    sockets.add(upstream);upstream.on("close",()=>sockets.delete(upstream));upstream.on("error",()=>socket.destroy());socket.on("error",()=>upstream.destroy());socket.on("close",()=>upstream.destroy());
  });
  await new Promise<void>(r=>proxy.listen(0,"127.0.0.1",r));const proxyAddress=proxy.address();assert.ok(proxyAddress&&typeof proxyAddress!=="string");
  const browser=await chromium.launch({headless:true,proxy:{server:`http://127.0.0.1:${proxyAddress.port}`},args:[`--ignore-certificate-errors-spki-list=${spki}`]});
  const cases=[
    {site:"readcube",mode:"valid",actions:2},
    ...["valid","anchor","native-preferred","old-gimbal-label","handler-deadline","gimbal-script"].map(mode=>({site:"gimbal",mode,actions:2})),
    ...["hidden-native","disabled","duplicate","wrong-name","wrong-visible","submit-entrance","associated-form","entrance-form","anchor-form","external-href","absolute-href","anchor-target","anchor-download","base-href","external-form-only","tight-budget","handler-setup-spent","shadow-control","direct-original"].map(mode=>({site:"gimbal",mode,actions:0})),
    ...["fields","dialog-form","generic-save","cookie-reject","no-gpp","already-opted-out","hash-drift","external-navigation","history-bounce"].map(mode=>({site:"gimbal",mode,actions:1})),
    ...["unconfirmed","terminal-reversal"].map(mode=>({site:"gimbal",mode,actions:2})),
    {site:"readcube",mode:"readcube-anchor",actions:0},
    {site:"readcube",mode:"skip-route-hop",actions:0},
    {site:"readcube",mode:"direct-final",actions:0},
    {site:"gimbal",mode:"direct-final",actions:0},
  ];
  try{
    for(const row of cases)await t.test(`${row.site} ${row.mode}`,async()=>{
      mode=row.mode;source=mode==="direct-final"?(row.site==="readcube"?"https://about.readcube.com/":"https://infillion.com/"):`https://${row.site}.com/`;
      opens=[];submits=0;documents=[];denied=[];
      const started=Date.now();
      const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:"a".repeat(64),...(mode==="tight-budget"?{deadlineAtMs:started+1300}:mode==="handler-deadline"?{deadlineAtMs:started+3000-100}:mode==="handler-setup-spent"?{deadlineAtMs:started+3000-1700}:{}),config:mode==="direct-final"
        ?{enabled:true,policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:mode,exactTargetUrl:source}
        :{enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:mode,exactTargetUrl:source,exactRouteAuthorization:saleSharingExactRouteAuthorization(source)}});
      assert.ok(saleSharingOptOutEvidenceSchema.safeParse(packet).success);
      assert.equal(packet.actionCount,row.actions,JSON.stringify(packet));
      assert.equal(opens.length,row.actions>0?1:0,JSON.stringify(packet));
      assert.equal(submits,row.actions===2?1:0,JSON.stringify(packet));
      const complete=["valid","anchor","native-preferred","old-gimbal-label","handler-deadline","gimbal-script"].includes(mode);
      assert.equal(packet.status==="complete",complete,JSON.stringify(packet));
      if(complete){
        assert.equal(packet.recipeVersion,`onetrust.${row.site}_settings.${row.site==="gimbal"?'v2':'v1'}`);assert.equal(packet.registration,"confirmed");
        assert.equal(packet.observationWindowMs,500);assert.deepEqual(packet.executionDiagnostics?.decisionReads.map(r=>r.phase),["before","after","terminal"]);
        assert.deepEqual(opens,[mode==="anchor"?"/opened?A":"/opened?BUTTON"]);
      }else{assert.equal(packet.captureComplete,false);assert.deepEqual(packet.requests,[]);}
      if(["hash-drift","external-navigation","history-bounce"].includes(mode)){assert.equal(packet.documentToken,null);assert.ok(packet.limitations.includes("document_changed"));}
      assert.deepEqual(denied,[],"no external form connection");assert.ok(documents.every(url=>hosts.includes(new URL(url).hostname)));
      assert.ok(Date.now()-started<3250);assert.ok(Buffer.byteLength(JSON.stringify(packet))<32000);
      const timing=packet.executionDiagnostics?.timing;
      if(timing){assert.ok(Buffer.byteLength(JSON.stringify(timing))<500);assert.ok((timing.readiness?.checks??0)<=2);}
      if(mode==="handler-deadline")assert.ok(timing!.captureMs<=2650);
      if(mode==="gimbal-script"){assert.equal(timing!.readiness?.reason,"script_recipe");assert.equal(timing!.readiness?.checks,1);}
      if(mode==="handler-setup-spent"){assert.ok(timing!.captureMs<=1050);assert.equal(timing!.readiness?.reason,"cutoff");}
    });
    assert.equal(classifyConsentControlLabel({label:"Cookies Settings",usage:"action",hasConsentContext:true}).intent,"unknown","global action classifier stays unchanged");
  }finally{await browser.close();for(const s of sockets)s.destroy();proxy.closeAllConnections();site.closeAllConnections();await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>site.close(()=>r()))]);await rm(root,{recursive:true,force:true});}
});
