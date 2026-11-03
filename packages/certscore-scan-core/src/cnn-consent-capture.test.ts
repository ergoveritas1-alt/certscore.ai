import assert from "node:assert/strict";
import {createServer} from "node:http";
import test from "node:test";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes";

for(const action of ["accept","reject"] as const) for(const actualChoice of [false,true]) {
 test(`${action} ignores unrelated Agree and preserves safe ${actualChoice?"late registered control execution":"no-click outcome"}`,{timeout:15000},async()=>{
  let clicks=0,terms=0;const unexpected:string[]=[];
  const server=createServer((req,res)=>{
   if(req.url==="/choice"){clicks++;res.end("ok");return;}
   if(req.url==="/terms"){terms++;res.end("ok");return;}
   if(req.url!=="/"){unexpected.push("unexpected_local_request");res.writeHead(404).end();return;}
   res.setHeader("content-type","text/html");res.end(`<!doctype html><body><section role="dialog" aria-hidden="true"><h2>Legal Terms</h2><button onclick="fetch('/terms')">Agree</button></section><script>
    window.OneTrust={};
    ${actualChoice?`setTimeout(()=>{const banner=document.createElement('section');banner.id='onetrust-banner-sdk';banner.innerHTML='<p>We use cookies for analytics. Choose your cookie consent.</p><button id="onetrust-${action==='accept'?'accept-btn':'reject-all'}-handler">${action==='accept'?'Accept all':'Reject all'}</button>';document.body.append(banner);banner.querySelector('button').onclick=()=>{document.cookie='OptanonConsent=groups=C0001:1,C0002:${action==='accept'?'1':'0'};path=/';fetch('/choice');banner.remove()};},500);`:""}
   </script></body>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  const url=`http://127.0.0.1:${address.port}/`;
  try {
   const common={url,parentScanId:"safe-cnn-fixture",scanId:`safe-cnn-fixture:${action}`,actionSearchTimeoutMs:2000,confirmationTimeoutMs:250,observationWindowMs:100,
    interactionAuthorization:{kind:"loopback" as const,authorizationId:"loopback_local_lab" as const},productionProjectable:true};
   const packet=action==="accept"?await (async()=>{const recipeCandidates=buildCanonicalPostAcceptActionRecipes();return runPostAcceptObserver({...common,recipe:recipeCandidates[0]!,recipeCandidates,recipeSetId:"canonical-consent-control-accept-v6",allowCanonicalAcceptDiscovery:true});})()
    :await (async()=>{const recipeCandidates=buildCanonicalPostRefusalActionRecipes();return runPostRefusalObserver({...common,recipe:recipeCandidates[0]!,recipeCandidates,recipeSetId:"canonical-consent-control-reject-v23",allowCanonicalRejectDiscovery:true});})();
   assert.equal(terms,0,"A page-wide OneTrust global cannot authorize an unrelated terms control");
   assert.equal(clicks,actualChoice?1:0);assert.deepEqual(unexpected,[]);
   assert.equal(packet.interactionDiagnostics?.click?.outcome,actualChoice?"completed":"not_attempted");
   if(actualChoice){assert.equal(packet.actionControlProof?.uniquelyActionable,true);assert.equal(packet.actionControlProof?.action,action);}
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
}

test('CNN-shaped aria-hidden dialog executes one context-bound DOM Accept without changing ARIA', {timeout:15000}, async()=>{
 let clicks=0;const server=createServer((req,res)=>{
  if(req.url==='/choice'){clicks++;res.end('ok');return;}
  if(req.url!=='/'){res.writeHead(404).end();return;}
  res.setHeader('content-type','text/html');res.end('<div aria-hidden="true"><section role="dialog" aria-modal="true"><h2>Legal Terms and Privacy</h2><p>By clicking Agree, you agree to collection and use of information by cookies and similar technologies.</p><a role="button" onclick="fetch(\'/choice\');this.closest(\'section\').hidden=true">Agree</a></section></div><script>window.OneTrust={};</script>');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 try {
  const recipeCandidates=buildCanonicalPostAcceptActionRecipes();
  const packet=await runPostAcceptObserver({url:`http://127.0.0.1:${address.port}/`,scanId:'cnn-hidden-dialog',parentScanId:'cnn-hidden-parent',recipe:recipeCandidates[0]!,recipeCandidates,recipeSetId:'canonical-consent-control-accept-v6',allowCanonicalAcceptDiscovery:true,actionSearchTimeoutMs:1800,confirmationTimeoutMs:250,observationWindowMs:100,interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}});
  assert.equal(clicks,1);assert.equal(packet.interactionDiagnostics?.click.outcome,'completed');
  assert.ok(packet.actionControlProof?.uniquelyActionable);assert.equal(packet.actionControlProof?.action,'accept');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
