import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { runPostAcceptObserver } from './post-accept-observer';
import { runPostRefusalObserver } from './post-refusal-observer';
import { buildCanonicalPostAcceptActionRecipes } from './post-accept-cmp-recipes';
import { buildCanonicalPostRefusalActionRecipes } from './post-refusal-cmp-recipes';

for(const action of ['accept','reject'] as const)for(const tcfSucceeds of [false,true])test(`${action}: invalid OneTrust baseline ${tcfSucceeds?'preserves independent TCF confirmation':'retains initial/terminal diagnostics without repeated cookie IPC'}`,{timeout:15000},async t=>{
  let clicks=0,cookieReads=0;
  const id=action==='accept'?'onetrust-accept-btn-handler':'onetrust-reject-all-handler';
  const server=createServer((req,res)=>{
    if(req.url==='/click'){clicks++;res.writeHead(200).end('ok');return;}
    res.setHeader('content-type','text/html');res.end(`<section id="onetrust-banner-sdk"><p>Choose optional cookies</p><button id="${id}" onclick="document.cookie='OptanonConsent=groups=C0001:1,C0002:${action==='accept'?1:0}&receipt=after;path=/';${tcfSucceeds?'setTimeout(()=>{window.tcfAfter=true;window.tcfListeners.forEach(cb=>cb(window.tcfData(),true));},150);':''}setTimeout(()=>document.cookie='OptanonConsent=groups=C0001:1,C0002:${action==='accept'?1:0}&receipt=terminal;path=/',700);fetch('/click');this.parentElement.hidden=true">${action==='accept'?'Accept all':'Reject all'}</button></section><script>
      document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
      // No category API: the pre-action universe is permanently unavailable.
      window.tcfAfter=false;window.tcfListeners=[];
      window.tcfData=()=>{const consents=Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,window.tcfAfter?${action==='accept'}:${action!=='accept'}]));
        const bytes=new Uint8Array(32);bytes[0]=8;for(let id=1;id<=24;id++)if(consents[id]){const bit=152+id-1;bytes[Math.floor(bit/8)]|=1<<(7-bit%8);}
        const tcString=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        return {gdprApplies:true,cmpStatus:'loaded',tcfPolicyVersion:4,cmpId:28,cmpVersion:1,eventStatus:window.tcfAfter?'useractioncomplete':'tcloaded',tcString,purpose:{consents}};};
      window.__tcfapi=(command,_version,callback)=>{if(command==='addEventListener')window.tcfListeners.push(callback);callback(window.tcfData(),true);};
    </script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true}),original=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await original(options),read=context.cookies.bind(context);context.cookies=async(...args)=>{cookieReads++;return read(...args);};return context;};
  try{
    const common={scanId:`invalid-baseline-${action}`,url:`http://127.0.0.1:${address.port}/`,browser,
      interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'} as const,fulfillThirdPartyRequestsLocally:true,
      actionSearchTimeoutMs:3000,confirmationTimeoutMs:500,observationWindowMs:1100};
    const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:buildCanonicalPostAcceptActionRecipes().find(r=>r.cmpId==='OneTrust')!})
      :await runPostRefusalObserver({...common,recipe:buildCanonicalPostRefusalActionRecipes().find(r=>r.cmpId==='OneTrust')!});
    assert.equal(clicks,1);assert.equal(packet.interactionDiagnostics?.click.outcome,'completed');
    const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;
    if(tcfSucceeds){
      assert.equal(registration.status,'confirmed');
      assert.ok(registration.witnesses.some(row=>row.witnessType==='tcf_user_action_complete'));
      assert.equal(packet.decisionEvidence?.tcfPurposeEvidence?.policyVersion,'iab_tcf_sparse_purposes.v1');
      assert.equal(packet.decisionEvidence?.oneTrustGroupEvidence,undefined);
      assert.ok(cookieReads<=16,`cookie IPC reads=${cookieReads}`);
      t.diagnostic(JSON.stringify({action,cookieReads,independentTcfConfirmed:true}));return;
    }
    assert.equal(registration.status,'unconfirmed');assert.equal(packet.terminalDecisionEvidence,undefined);
    const phases=new Set(packet.consentReceiptCapture?.observations.map(row=>row.phase));
    assert.ok(phases.has('initial')&&phases.has('terminal'),JSON.stringify(packet.consentReceiptCapture));
    const observations=packet.consentReceiptCapture!.observations.filter(row=>row.source==='cookie'&&row.valueSha256);
    const first=observations.find(row=>row.phase==='initial'),last=observations.find(row=>row.phase==='terminal');
    assert.ok(first&&last);assert.notEqual(first.valueSha256,last.valueSha256,'terminal invocation must read the later receipt independently');
    assert.equal(packet.consentReceiptCapture?.observationsTruncated,true,'skipped intermediate diagnostic snapshots remain explicit');
    assert.ok(packet.confirmationDiagnostics?.initialPasses!>1,'independent TCF verification continues polling');
    assert.ok(cookieReads<=16,`cookie IPC reads=${cookieReads}; invalid branch must not re-read on every TCF pass`);
    t.diagnostic(JSON.stringify({action,cookieReads,initialPasses:packet.confirmationDiagnostics?.initialPasses,terminalPasses:packet.confirmationDiagnostics?.terminalPasses,initialAndTerminalSnapshotsRetained:true,observationsTruncated:packet.consentReceiptCapture?.observationsTruncated}));
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
