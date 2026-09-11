import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';

import {runPostAcceptObserver} from './post-accept-observer.js';
import {runPostRefusalObserver} from './post-refusal-observer.js';
for(const action of ['accept','reject'] as const){
 for(const variant of ['visible','hidden','inert','covered','duplicate','nested_inert','nested_aria_hidden'] as const){
 test(`${action}: ${variant} control inside a boxless open-shadow consent scope`,async()=>{
 let clicks=0;
 const server=createServer((req,res)=>{
  if(req.url==='/click'){clicks++;res.writeHead(204).end();return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><body><example-cmp role="dialog" aria-label="Cookie consent" ${variant === 'hidden' ? 'hidden' : variant === 'inert' ? 'inert' : ''} style="display:block;height:0">We use optional cookies. Choose your cookie preferences.</example-cmp><script>
  const host=document.querySelector('example-cmp');const root=host.attachShadow({mode:'open'});
  root.innerHTML='<style>.actions{position:fixed;bottom:40px;left:40px;background:white;padding:20px}button{width:100px;height:40px}</style><slot></slot><div class="actions" ${variant === 'nested_inert' ? 'inert' : variant === 'nested_aria_hidden' ? 'aria-hidden="TRUE"' : ''}><button>Accept</button><button>Decline</button><button>Preferences</button>${variant === 'duplicate' ? `<button>${action === 'accept' ? 'Accept' : 'Decline'}</button>` : ''}</div>';
  root.querySelectorAll('button').forEach(b=>b.onclick=()=>{fetch('/click');host.hidden=true});</script>${variant === 'covered' ? '<div style="position:fixed;inset:0;z-index:9999;background:white">Overlay</div>' : ''}`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr==='object');
 const input={url:`http://127.0.0.1:${addr.port}/`,scanId:`boxless-${action}`,recipeSetId:'boxless-test',actionSearchTimeoutMs:1600,confirmationTimeoutMs:50,observationWindowMs:50,interactionAuthorization:{authorizationId:'loopback_local_lab',kind:'loopback' as const}};
 const recipe={recipeId:'unmatched-fixture',controlSelector:'#absent',resolverMethod:'local_fixture_recipe' as const,confirmation:{kind:'local_storage_equals' as const,key:'consent',expectedValue:action==='accept'?'granted':'denied'}};
 try{
 const packet=action==='accept'?await runPostAcceptObserver({...input,allowCanonicalAcceptDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}}):await runPostRefusalObserver({...input,allowCanonicalRejectDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
 assert.equal(clicks,variant === 'visible' ? 1 : 0,JSON.stringify({resolver:packet.resolver,diagnostics:packet.interactionDiagnostics}));
 if(variant === 'visible')assert.ok(packet.actionControlProof?.uniquelyActionable);
 else assert.equal(packet.actionControlProof,undefined);
 const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;assert.notEqual(registration.status,'confirmed');
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 }
}
