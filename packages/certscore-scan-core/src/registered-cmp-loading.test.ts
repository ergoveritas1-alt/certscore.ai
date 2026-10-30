import {projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport} from "@certscore/contracts";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import test from "node:test";
import {chromium} from "playwright";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";

for(const cmp of ["CookieYes","Cookiebot","Osano","HubSpot Consent Banner"] as const) for(const action of ["accept","reject"] as const) for(const mode of ["visible","wrong_label","missing_receipt","opposite_receipt","underscore_key"] as const) {
 if (mode==="underscore_key" && cmp!=="Osano") continue;
 if ((mode==="missing_receipt" && !(cmp==="CookieYes"&&action==="accept")) || (mode==="opposite_receipt" && !(cmp==="CookieYes"&&action==="reject"))) continue;
 test(`${cmp} ${action} while loading: ${mode} preserves completion and decision proof`,{timeout:10000},async()=>{
  let clicks=0,state:string|undefined;const timers=new Set<ReturnType<typeof setTimeout>>();
  const selector=cmp==="CookieYes"?`.cky-btn-${action}`:cmp==="Cookiebot"?(action==="accept"?"#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll":"#CybotCookiebotDialogBodyButtonDecline"):cmp==="Osano"?(action==="accept"?".osano-cm-accept-all":".osano-cm-deny-all"):(action==="accept"?"#hs-eu-confirmation-button":"#hs-eu-decline-button");
  const banner=cmp==="CookieYes"?'id="cookieyes-banner" class="cky-consent-container"':cmp==="Cookiebot"?'id="CybotCookiebotDialog"':cmp==="Osano"?'class="osano-cm-window"':'id="hs-eu-cookie-confirmation"';
  const attributes=selector[0]==="#"?`id="${selector.slice(1)}"`:`class="${selector.slice(1)}"`;
  const runtime=cmp==="HubSpot Consent Banner"?'hubspot-cookie-banner.js':cmp.toLowerCase()+'.js';
  const server=createServer((req,res)=>{
   if(req.url?.startsWith('/click')){clicks++;state=new URL(req.url,'http://fixture').searchParams.get('state')??undefined;res.writeHead(204).end();return;}
   if(req.url==='/parser-block.js'){const timer=setTimeout(()=>{timers.delete(timer);res.end('');},2500);timers.add(timer);return;}
   if(req.url?.endsWith('.js')){res.end('');return;}
   res.setHeader('content-type','text/html;charset=utf-8');res.end(`<!doctype html><html><body><script src="/${runtime}"></script>
   <section ${banner} style="position:fixed;top:10px;background:white;padding:20px"><p>Choose optional analytics cookies</p><button ${attributes}>${mode==='wrong_label'?'Privacy policy':cmp==='CookieYes'&&action==='reject'?'Rejeitar todos os cookies não-necessários':cmp==='Cookiebot'&&action==='reject'?'Accept Only Required':action==='accept'?'Accept all':'Reject all'}</button></section>
   <script>
   let callbacks=[],categories={analytics:false,advertisement:false,functionality:false};window._hsp={push:([key,fn])=>{callbacks.push(fn);fn({allowed:false,categories:{...categories,necessary:true}});}};
   let consent={ESSENTIAL:'ACCEPT',ANALYTICS:'DENY',MARKETING:'DENY',PERSONALIZATION:'DENY',STORAGE:'DENY','${mode==='underscore_key'?'OPT_OUT':'OPT-OUT'}':'DENY'};window.Osano={cm:{getConsent:()=>({...consent}),addEventListener:(name,fn)=>callbacks.push(fn)}};
   document.cookie='CookieConsent='+encodeURIComponent(JSON.stringify({stamp:'before',necessary:true,preferences:false,statistics:false,marketing:false}))+';path=/';
   document.querySelector('button').onclick=()=>{console.log('fixtureClick:'+document.readyState);if(${mode==='missing_receipt'}){document.querySelector('section').hidden=true;return;}const accepted=${mode==='opposite_receipt'||action==='accept'};
    categories={analytics:accepted,advertisement:accepted,functionality:accepted};for(const key of Object.keys(consent))if(key!=='ESSENTIAL')consent[key]=accepted?'ACCEPT':'DENY';
    for(const callback of callbacks)callback(${JSON.stringify(cmp)}==='Osano'?{...consent}:{allowed:accepted,categories:{...categories,necessary:true}});
    document.cookie='cookieyes-consent=consentid:fixture,action:${mode==='opposite_receipt'?'accept':action},necessary:yes,analytics:'+(accepted?'yes':'no')+',advertisement:'+(accepted?'yes':'no')+';path=/';
    document.cookie='CookieConsent='+encodeURIComponent(JSON.stringify({stamp:'after',necessary:true,preferences:accepted,statistics:accepted,marketing:accepted}))+';path=/';document.querySelector('section').hidden=true;
   };
   </script><script src="/parser-block.js"></script></body></html>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await newContext(options);context.on('page',page=>page.on('console',message=>{if(message.text().startsWith('fixtureClick:')){clicks++;state=message.text().slice('fixtureClick:'.length);}}));return context;};
  try{
   const common={browser,url:`http://127.0.0.1:${address.port}/`,scanId:`loading-${cmp}-${action}-${mode}`,interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}as const,actionSearchTimeoutMs:1000,resultBudgetMs:5000,confirmationTimeoutMs:200,observationWindowMs:3000,productionProjectable:true};
   const recipes=action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
   const selected=recipes.filter(r=>r.cmpId===cmp);
   const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:selected[0]!,recipeCandidates:selected,allowCanonicalAcceptDiscovery:true}):await runPostRefusalObserver({...common,recipe:selected[0]!,recipeCandidates:selected,allowCanonicalRejectDiscovery:true});
   const packetSha=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
   const measured='acceptanceRegistration'in packet?projectPostAcceptEvidenceForReport({packet,packetSha256:packetSha}):projectPostRefusalEvidenceForReport({packet,packetSha256:packetSha});
   console.log('OWNED_CMP_RESULT '+JSON.stringify({cmp,action,mode,clicks,state,execution:measured.execution,packetSha256:packetSha}));
   const registration='acceptanceRegistration'in packet?packet.acceptanceRegistration:packet.refusalRegistration;
   assert.equal(clicks,mode==='wrong_label'?0:1,JSON.stringify(packet.interactionDiagnostics));
   if(mode==='visible'||mode==='underscore_key'){assert.equal(state,'loading');assert.equal(registration.status,'confirmed',JSON.stringify(packet));const projection='acceptanceRegistration'in packet?projectPostAcceptEvidenceForReport({packet,packetSha256:packetSha}):projectPostRefusalEvidenceForReport({packet,packetSha256:packetSha});assert.equal(projection.execution?.clickCompleted,true,JSON.stringify(projection));assert.equal(projection.execution?.observationCompleted,true,JSON.stringify({projection,packet}));assert.equal(projection.execution?.consentConfirmed,true,JSON.stringify(projection));}
   else {assert.notEqual(registration.status,'confirmed');if(mode!=='wrong_label'){const projection='acceptanceRegistration'in packet?projectPostAcceptEvidenceForReport({packet,packetSha256:packetSha}):projectPostRefusalEvidenceForReport({packet,packetSha256:packetSha});assert.equal(projection.execution?.observationCompleted,true,JSON.stringify(projection));assert.equal(projection.execution?.consentConfirmed,false);}}
  }finally{await browser.close();for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
}
