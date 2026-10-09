import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';
import {buildPostAcceptCmpActionRecipe} from './post-accept-cmp-recipes';
import {buildPostRefusalCmpActionRecipe} from './post-refusal-cmp-recipes';

for (const scenario of ['recovers', 'rerender', 'fade', 'opposite', 'conflicting', 'duplicate', 'too_late', 'aborted'] as const)
for (const action of ['accept', 'reject'] as const) {
  test(`${action}: ${scenario} preserves the canonical choice and original search boundary`, async () => {
    const controller=new AbortController();
    const initialLabel=scenario==='fade' ? (action==='accept'?'Accept all':'Reject all') : scenario==='opposite' ? (action==='accept'?'Reject all':'Accept all') : scenario==='conflicting' ? 'Accept all or reject all' : (action==='accept'?'OK':'Personalisation settings');
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const clicked:string[]=[];
    const server=createServer((req,res)=>{
      if(req.url?.startsWith('/clicked/')){clicked.push(req.url.split('/').pop()!);res.end('ok');return;}
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<style>section{position:fixed;top:20px;left:20px;background:white;padding:20px}button{padding:12px}</style>
      <section id="fundingchoices" role="dialog" aria-label="Cookie consent preferences" style="opacity:${scenario==='fade'?0:1}"><p>Choose your consent for optional analytics cookies.</p>
      <button class="${action==='accept'?'fc-cta-consent':'fc-cta-do-not-consent'}" onclick="fetch('/clicked/'+this.dataset.phase)" data-phase="unverified">${initialLabel}</button></section>
      <script>setTimeout(()=>{let b=document.querySelector('button');${scenario==='rerender'?"const replacement=b.cloneNode(true);b.replaceWith(replacement);b=replacement;":''}b.textContent=${JSON.stringify(action==='accept'?'Tümünü Kabul Et':'Tümünü Reddet')};b.dataset.phase='canonical';${scenario==='fade'?"document.querySelector('section').style.opacity='1';":''}${scenario==='duplicate'?"b.after(b.cloneNode(true))":''}},${scenario==='too_late'?5000:scenario==='fade'?800:1600})</script>`);
    });
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    try {
      const common={url:`http://127.0.0.1:${(server.address() as any).port}/`,scanId:`late-label-${action}`,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},signal:controller.signal,actionSearchTimeoutMs:scenario==='too_late'?2000:4000,confirmationTimeoutMs:100,observationWindowMs:50,productionProjectable:true};
      if(scenario==='aborted') abortTimer=setTimeout(()=>controller.abort(),500);
      const packet=action==='accept'
        ?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,recipe:buildPostAcceptCmpActionRecipe({cmpCanonicalName:'Google Funding Choices',confirmation:{kind:'local_storage_equals',key:'consent',expectedValue:'granted'}})!})
        :await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,recipe:buildPostRefusalCmpActionRecipe({cmpCanonicalName:'Google Funding Choices',confirmation:{kind:'local_storage_equals',key:'consent',expectedValue:'denied'}})!});
      // Opacity settling is bounded and still requires a complete rebuilt proof.
      const recovered=['recovers','rerender','fade'].includes(scenario);
      assert.deepEqual(clicked,recovered?['canonical']:[],JSON.stringify({limitations:packet.limitations,diagnostics:packet.interactionDiagnostics}));
      if(!recovered){
        assert.equal(packet.afterActionCapture,undefined);assert.equal(packet.productionProjectable,false);
        return;
      }
      const reads=packet.interactionDiagnostics?.resolver?.snapshots.filter(s=>s.source==='control_proof')??[];
      if(scenario!=='fade')assert.ok(reads.some(s=>s.controlLabels.includes(initialLabel)),JSON.stringify(reads));
      assert.ok(reads.some(s=>s.controlLabels.includes(action==='accept'?'Tümünü Kabul Et':'Tümünü Reddet')));
      assert.ok(reads.every(s=>s.binding?.selectorSha256.length===64&&s.binding.frameIdentitySha256.length===64));
      assert.equal(packet.actionControlProof?.classifierIntent,action);
      assert.equal(packet.afterActionCapture?.activationStatus,'completed');
      assert.equal(packet.afterActionCapture?.stopReason,'window_elapsed');
      assert.equal(packet.afterActionCapture?.requestsDropped,0);
      assert.equal(packet.productionProjectable,false);
    } finally {if(abortTimer)clearTimeout(abortTimer);await new Promise<void>(r=>server.close(()=>r()));}
  });
}
