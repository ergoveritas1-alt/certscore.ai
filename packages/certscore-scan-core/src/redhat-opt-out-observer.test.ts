import test,{mock} from 'node:test';import assert from 'node:assert/strict';import dns from 'node:dns/promises';
import {chromium,type Browser} from 'playwright';
import {createServer as httpsServer} from 'node:https';import {createServer as httpServer} from 'node:http';import {connect} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash,X509Certificate} from 'node:crypto';
import {runSaleSharingOptOutObserver} from './sale-sharing-opt-out-observer';
import {REDHAT_OPT_OUT_POLICY,REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT,deriveOptOutExecutionAssessment,saleSharingOptOutEvidenceSchema} from '@certscore/contracts';
const config={enabled:true as const,policyVersion:REDHAT_OPT_OUT_POLICY,scanId:'owned-redhat',exactTargetUrl:REDHAT_OPT_OUT_TARGET,redHatAuthorization:{version:'redhat.opt-out-source.v1' as const,sourceSha256:'a'.repeat(64),observationId:'owned-control',documentUrl:REDHAT_OPT_OUT_DOCUMENT,documentToken:'original-consent-source'}};
test('production observer completes the exact reload and terminal state within existing caps; wrong actions and cancelled work stay neutral',{timeout:35000},async()=>{
 const dnsMock=mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
 const root=await mkdtemp(join(tmpdir(),'redhat-owned-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(root,'key.pem'),'-out',join(root,'cert.pem'),'-days','1','-subj','/CN=redhat.com','-addext','subjectAltName=DNS:redhat.com,DNS:www.redhat.com'],{stdio:'ignore'});
 const key=await readFile(join(root,'key.pem')),cert=await readFile(join(root,'cert.pem'));
 const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
 let mode='valid',navigations=0,clicks=0;const errors:string[]=[],sockets=new Set<import('node:net').Socket>();
 const site=httpsServer({key,cert},(req,res)=>{
  if(req.headers.host==='redhat.com'){res.writeHead(301,{location:REDHAT_OPT_OUT_DOCUMENT});res.end();return;}
  if(req.headers.host!=='www.redhat.com'||req.url!=='/en'){res.writeHead(404);res.end();return;}navigations++;
  if(navigations>1&&mode==='redirect_reload'){res.writeHead(302,{location:'https://www.redhat.com/other'});res.end();return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><body><div class="truste_box_overlay_inner" role="dialog" id="pop-div3123"><div name="trustarc_cm" class="trustarc_newcm_container truste_popframe" id="pop-frame123"></div></div><script>
   const saved=sessionStorage.getItem('choice')==='1';let state={source:saved?'asserted':'implied',consentDecision:[saved?1:0]};window.truste={eu:{popdiv3:'pop-div3123',popframe:'pop-frame123'},cma:{callApi(){return state;}}};
   const root=document.getElementById('pop-frame123').attachShadow({mode:'open'});root.innerHTML='<div class="pdynamicbutton"><button type="button">${mode==='wrong_label'?'Reject all':'Do Not Sell or Share My Personal Information'}</button><button type="button">Accept All</button></div>';
   root.querySelector('button').onclick=()=>{window.markClick();setTimeout(()=>{${mode==='unconfirmed'?'':"sessionStorage.setItem('choice','1');"}location.reload();},50)};
  </script>`);
 });
 await new Promise<void>(resolve=>site.listen(0,'127.0.0.1',resolve));const siteAddress=site.address();assert(siteAddress&&typeof siteAddress!=='string');
 const proxy=httpServer();proxy.on('connect',(req,socket,head)=>{
  if(!['redhat.com:443','www.redhat.com:443'].includes(req.url??'')){socket.destroy();return;}
  const upstream=connect(siteAddress.port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
  sockets.add(upstream);sockets.add(socket);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
 });await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const proxyAddress=proxy.address();assert(proxyAddress&&typeof proxyAddress!=='string');
 const browser=await chromium.launch({headless:true,proxy:{server:`http://127.0.0.1:${proxyAddress.port}`},args:[`--ignore-certificate-errors-spki-list=${spki}`,'--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost']});
 try{for(const scenario of ['valid','wrong_label','redirect_reload','unconfirmed']){
  mode=scenario;navigations=0;clicks=0;errors.length=0;
  const fixtureBrowser={newContext:async(options:any)=>{const context=await browser.newContext(options);context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));await context.exposeFunction('markClick',()=>{clicks++;});return context;}} as unknown as Browser;
  const packet=await runSaleSharingOptOutObserver({config,parentDispatchSha256:'b'.repeat(64),browser:fixtureBrowser});assert(saleSharingOptOutEvidenceSchema.safeParse(packet).success);
  const execution=deriveOptOutExecutionAssessment(packet,'c'.repeat(64));
  if(mode==='valid'){assert.equal(execution.choiceConfirmation,'confirmed_terminal',JSON.stringify({packet,errors,navigations}));assert.equal(navigations,2);assert.equal(clicks,1);assert.equal(packet.redHatChoice!.reads.length,3);assert.equal(execution.observationWindowMs,0);}
  else{assert.notEqual(execution.choiceConfirmation,'confirmed_terminal');assert.equal(clicks,mode==='wrong_label'?0:1);}
  assert.equal(packet.status,'limited');assert.equal(packet.registration,packet.submitted?'unconfirmed':'not_attempted');assert.deepEqual(packet.requests,[]);assert.ok(packet.redHatChoice!.captureFinishedMs<=3000);
 }
 const controller=new AbortController();controller.abort();let created=0;
 const cancelled=await runSaleSharingOptOutObserver({config,parentDispatchSha256:'b'.repeat(64),signal:controller.signal,browser:{newContext:async()=>{created++;throw Error('unexpected');}} as never});
 assert.equal(created,0);assert.equal(cancelled.actionCount,0);
 }finally{dnsMock.mock.restore();await browser.close();for(const socket of sockets)socket.destroy();proxy.closeAllConnections();site.closeAllConnections();await Promise.all([new Promise<void>(resolve=>proxy.close(()=>resolve())),new Promise<void>(resolve=>site.close(()=>resolve()))]);await rm(root,{recursive:true,force:true});}
});
