import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {consentConfirmationDiagnosticsSchema,projectPostAcceptEvidenceForReport} from "@certscore/contracts";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes.js";
import {runPostAcceptObserver} from "./post-accept-observer.js";

for(const mode of ["granted","opposite","partial","late"] as const)test(`Accept: silent TCF cannot delay a ${mode} OneTrust terminal receipt`,async()=>{
 let clicks=0;
 const groups=mode==="opposite"?"C0001:1,C0002:0":mode==="partial"?"C0001:1":"C0001:1,C0002:1";
 const delay=mode==="late"?1600:600;
 const server=createServer((req,res)=>{
  if(req.url==="/click"){clicks++;res.writeHead(204).end();return;}
  res.setHeader("content-type","text/html");res.end(`<section id="onetrust-banner-sdk"><p>Choose optional cookies</p><button id="onetrust-accept-btn-handler" onclick="fetch('/click');this.parentElement.hidden=true;setTimeout(()=>document.cookie='OptanonConsent=groups=${groups}&receipt=after;path=/',${delay})">Accept all</button></section><script>document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};window.__tcfapi=()=>{};</script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();assert.ok(address&&typeof address!=="string");
 try{
  const packet=await runPostAcceptObserver({scanId:"accept-confirmation-coverage",url:`http://127.0.0.1:${address.port}/`,recipe:buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==="OneTrust")!,interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},allowCanonicalAcceptDiscovery:true,fulfillThirdPartyRequestsLocally:true,actionSearchTimeoutMs:3000,confirmationTimeoutMs:100,observationWindowMs:1200});
  assert.equal(clicks,1);assert.equal(packet.acceptanceRegistration.status,"unconfirmed");
  assert.equal(packet.terminalDecisionEvidence?.evidence.decision==="granted",mode==="granted",JSON.stringify(packet.confirmationDiagnostics));
  assert.ok(consentConfirmationDiagnosticsSchema.safeParse(packet.confirmationDiagnostics).success);
  if(mode==="granted"){
   assert.equal(packet.afterActionCapture?.requestedWindowMs,1200);
   assert.ok(packet.terminalDecisionEvidence!.readCompletedAtMs<=packet.afterActionCapture!.actionDispatchedAtMs+1200);
   assert.equal(packet.confirmationDiagnostics?.terminalRead,"verified");
   assert.equal(packet.confirmationDiagnostics?.policyVersion,"consent_confirmation_diagnostics.v3");
   if(packet.confirmationDiagnostics?.policyVersion==="consent_confirmation_diagnostics.v3"){assert.ok(packet.confirmationDiagnostics.terminalReasons.includes("verified_decision"));assert.ok(!packet.confirmationDiagnostics.initialReasons.includes("verified_decision"));}
   const projected=projectPostAcceptEvidenceForReport({packet});assert.equal(projected.registrationStatus,"unconfirmed");assert.equal(projected.acceptanceExercised,false);
  }
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

for(const value of ["accepted","opaque-receipt"] as const)test(`Accept: registered storage ${value} remains independent of silent TCF`,async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<section><p>Choose optional cookies</p><button id="accept" onclick="this.parentElement.hidden=true;setTimeout(()=>localStorage.setItem('uc_settings','${value}'),600)">Accept all</button></section><script>localStorage.setItem('uc_settings','rejected');window.__tcfapi=()=>{};</script>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  const packet=await runPostAcceptObserver({scanId:'accept-storage-confirmation',url:`http://127.0.0.1:${address.port}/`,recipe:{artifactVersion:'certscore.post_accept_action_recipe.v1',recipeId:'local-registered-storage',controlSelector:'#accept',confirmation:{kind:'tcf_purposes_granted_or_cmp_storage_keys_changed',purposeIds:[1],storageType:'local_storage',keys:['uc_settings']}},interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},fulfillThirdPartyRequestsLocally:true,confirmationTimeoutMs:100,actionSearchTimeoutMs:3000,observationWindowMs:1200});
  assert.equal(packet.acceptanceRegistration.status,'unconfirmed');assert.equal(packet.terminalDecisionEvidence?.evidence.decision==='granted',value==='accepted',JSON.stringify(packet.confirmationDiagnostics));
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

// These fixtures exercise the actual named-CMP recipe and the existing API
// listener. Every request is loopback; no public CMP scripts are loaded.
for (const provider of ["hubspot", "osano"] as const) {
  for (const mode of ["valid", "opposite", "mixed", "partial", "unchanged", "notify", "notify_stale", "unavailable", "terminal", "too_late"] as const) {
    test(`Accept ${provider}: ${mode} keeps diagnostics separate from confirmation`, { timeout: 12_000 }, async () => {
      let clicks = 0;
      const cmpId = provider === "hubspot" ? "HubSpot Consent Banner" : "Osano";
      const recipe = buildCanonicalPostAcceptActionRecipes().find(row => row.cmpId === cmpId)!;
      const banner = provider === "hubspot" ? 'id="hs-eu-cookie-confirmation"' : 'class="osano-cm-window"';
      const button = provider === "hubspot" ? 'id="hs-eu-confirmation-button"' : 'class="osano-cm-accept-all"';
      const server = createServer((req, res) => {
        if (req.url === "/click") { clicks++; res.writeHead(204).end(); return; }
        res.setHeader("content-type", "text/html");
        res.end(`<section ${banner}><p>Choose optional cookies</p><button ${button}>Accept all</button></section><script>
          const provider=${JSON.stringify(provider)},mode=${JSON.stringify(mode)};
          const complete=(a,b=a,c=a)=>provider==='hubspot'?{categories:{necessary:true,analytics:a,advertisement:b,functionality:c}}:{ANALYTICS:a?'ACCEPT':'DENY',MARKETING:b?'ACCEPT':'DENY',PERSONALIZATION:c?'ACCEPT':'DENY',ESSENTIAL:'ACCEPT','OPT-OUT':'ACCEPT',STORAGE:'DENY'};
          let state=['unchanged','notify','notify_stale'].includes(mode)?complete(true):complete(false);const handlers=[];
          if(mode==='notify_stale')document.cookie='__hs_notify_banner_dismiss=true;path=/';
          if(mode!=='unavailable'){
            if(provider==='hubspot')window._hsp={push:([name,fn])=>{if(name!=='addPrivacyConsentListener')throw Error('unexpected API');handlers.push(fn);fn(state);}};
            else window.Osano={cm:{getConsent:()=>state,addEventListener:(name,fn)=>{if(name!=='osano-cm-consent-saved')throw Error('unexpected event');handlers.push(fn);}}};
          }else if(provider==='hubspot')window._hsp={push:null};
          document.querySelector('button').onclick=()=>{
            fetch('/click');document.querySelector('section').hidden=true;
            if(mode==='notify'){document.cookie='__hs_notify_banner_dismiss=true;path=/';return;}
            if(['unchanged','notify_stale','unavailable'].includes(mode))return;
            setTimeout(()=>{state=mode==='partial'?(provider==='hubspot'?{categories:{analytics:true}}:{ANALYTICS:'ACCEPT'}):mode==='opposite'?complete(false):mode==='mixed'?complete(true,false):complete(true);handlers.forEach(fn=>fn(state));},mode==='terminal'?600:mode==='too_late'?1800:0);
          };
        </script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      try {
        const packet = await runPostAcceptObserver({
          scanId: `api-accept-${provider}-${mode}`, url: `http://127.0.0.1:${address.port}/`, recipe,
          interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" },
          fulfillThirdPartyRequestsLocally: true, actionSearchTimeoutMs: 3000, confirmationTimeoutMs: 150, observationWindowMs: 1200,
        });
        assert.equal(clicks, 1, JSON.stringify(packet));
        assert.equal(!!packet.notificationAcknowledgment,provider === "hubspot" && mode === "notify",JSON.stringify({notification:packet.notificationAcknowledgment,proof:packet.actionControlProof,capture:packet.afterActionCapture,storage:packet.storage}));
        if (packet.notificationAcknowledgment) {
          const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:"a".repeat(64)});
          assert.ok(projection.notificationAcknowledgment);
          assert.equal(projection.execution?.consentConfirmed,false);
          assert.equal(projectPostAcceptEvidenceForReport({packet}).notificationAcknowledgment,undefined);
        }
        assert.equal(packet.acceptanceRegistration.status, mode === "valid" ? "confirmed" : "unconfirmed");
        const diagnostic = packet.confirmationDiagnostics;
        assert.equal(diagnostic?.policyVersion, "consent_confirmation_diagnostics.v3");
        if (diagnostic?.policyVersion !== "consent_confirmation_diagnostics.v3") throw Error("Missing diagnostics");
        assert.ok(consentConfirmationDiagnosticsSchema.safeParse(diagnostic).success);
        const reason = mode === "unavailable" ? "api_unavailable" : ["unchanged","notify","notify_stale"].includes(mode) ? "api_saved_event_unverified"
          : mode === "partial" ? "receipt_format_unsupported" : ["opposite", "mixed", "terminal", "too_late"].includes(mode) ? "opposite_or_mixed_decision" : undefined;
        if (reason) assert.ok(diagnostic.initialReasons.includes(reason), JSON.stringify(diagnostic));
        if (mode === "terminal") {
          assert.equal(packet.terminalDecisionEvidence?.evidence.decision, "granted");
          assert.equal(diagnostic.terminalRead, "verified");
          assert.ok(diagnostic.terminalReasons.includes("verified_decision"));
          assert.ok(!diagnostic.initialReasons.includes("verified_decision"));
          assert.equal(projectPostAcceptEvidenceForReport({packet}).registrationStatus, "unconfirmed");
        } else if (mode !== "valid") assert.equal(packet.terminalDecisionEvidence, undefined);
        assert.doesNotMatch(JSON.stringify(diagnostic), /ANALYTICS|categories|canonicalState/);
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }
}
