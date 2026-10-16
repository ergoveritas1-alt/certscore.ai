import assert from "node:assert/strict";
import test from "node:test";
import {chromium, type Page} from "playwright";
import {readCmpApiConsentSnapshot} from "./cmp-api-consent-state.js";

async function fixture(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.partial=true;window.enabled=false;window.regulation='GDPR';window.ids=['analytics','ads'];
      window.vendorIds=[{id:'c:vendor',purposeIds:['analytics','ads']},{id:'essential-vendor',purposeIds:[]}];
      window.didomiFixtureStatus=()=>({user_id:'private-id',consent_string:'private-tc-string',regulation:window.regulation,
        purposes:{essential:{enabled:true},analytics:{enabled:window.enabled},ads:{enabled:window.enabled}},
        vendors:{'c:vendor':{enabled:window.enabled},'essential-vendor':{enabled:true}}});
      window.Didomi={getUserStatus:()=>({purposes:{essential:window.essentialIds||[]}}),getCurrentUserStatus:()=>window.didomiFixtureStatus(),getRequiredPurposeIds:()=>window.ids,
        getRequiredVendors:()=>window.vendorIds,isUserStatusPartial:()=>window.partial};
      window.didomiOnReady={push:callback=>callback(window.Didomi)};
      window.handlers=[];window.didomiEventListeners={push:handler=>window.handlers.push(handler)};
      window.emit=(action='click')=>window.handlers.forEach(h=>h.listener({action}));
    </script>`);
    await run(page);
  } finally {await browser.close();}
}

test("Didomi complete documented choices require fresh bound click event; essential state does not vote", async () => {
  await fixture(async page => {
    const before=await readCmpApiConsentSnapshot(page,"didomi");
    assert.equal(before?.decision,"unknown");assert.equal(before.eventSequence,0);
    await page.evaluate(()=>{(window as any).partial=false;(window as any).enabled=true;(window as any).emit();});
    const accepted=await readCmpApiConsentSnapshot(page,"didomi");
    assert.equal(accepted?.decision,"granted");assert.equal(accepted.eventSequence,1);assert.ok(accepted.eventObservedAtEpochMs);
    assert.ok(!JSON.stringify(accepted).includes('private-'));
    await page.evaluate(()=>{(window as any).enabled=false;(window as any).emit();});
    const rejected=await readCmpApiConsentSnapshot(page,"didomi");
    assert.equal(rejected?.decision,"denied");assert.equal(rejected.eventSequence,2);
    assert.equal(await page.evaluate(()=>(window as any).handlers.length),1,"listener installed once");
  });
});

test("Didomi defaults, partial state, mixed choices, nonclick events and stale event state do not confirm", async () => {
  await fixture(async page=>{
    await readCmpApiConsentSnapshot(page,"didomi");
    await page.evaluate(()=>{(window as any).partial=false;});
    assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.eventSequence,0,"false defaults alone are not refusal");
    for(const action of ['external','navigate']){
      await page.evaluate(action=>(window as any).emit(action),action);
      assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.eventSequence,0);
    }
    await page.evaluate(()=>{(window as any).enabled=true;(window as any).emit();(window as any).enabled=false;});
    assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.eventSequence,0,"changed live value cannot inherit old witness");
    await page.evaluate(()=>{(window as any).partial=true;(window as any).emit();});
    assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.decision,"unknown");
    await page.evaluate(()=>{(window as any).partial=false;const old=(window as any).didomiFixtureStatus;(window as any).didomiFixtureStatus=()=>({...old(),purposes:{analytics:{enabled:true},ads:{enabled:false}}});(window as any).emit();});
    assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.decision,"mixed");
  });
});

for(const mode of ['missing-purpose','missing-vendor','wrong-type','extra-config','duplicates','empty','overflow','wrong-regulation','replacement','malformed-update']) test(`Didomi ${mode} stays unverifiable`,async()=>{
  await fixture(async page=>{
    await readCmpApiConsentSnapshot(page,"didomi");
    await page.evaluate(mode=>{
      const w=window as any;w.partial=false;w.enabled=true;
      const old=w.didomiFixtureStatus;
      if(mode==='missing-purpose')w.didomiFixtureStatus=()=>({...old(),purposes:{analytics:{enabled:true}}});
      if(mode==='missing-vendor')w.didomiFixtureStatus=()=>({...old(),vendors:{}});
      if(mode==='wrong-type')w.didomiFixtureStatus=()=>({...old(),purposes:{analytics:{enabled:'yes'},ads:{enabled:true}}});
      if(mode==='extra-config')w.ids=['analytics'];
      if(mode==='duplicates')w.ids=['analytics','analytics'];
      if(mode==='empty')w.ids=[];
      if(mode==='overflow')w.ids=Array.from({length:97},(_,i)=>'p'+i);
      if(mode==='wrong-regulation')w.regulation='NONE';
      if(mode==='replacement')w.Didomi={...w.Didomi};
      w.emit();
      if(mode==='malformed-update'){w.didomiFixtureStatus=()=>null;w.emit();w.didomiFixtureStatus=old;}
    },mode);
    const state=await readCmpApiConsentSnapshot(page,"didomi");
    if(mode==='malformed-update')assert.equal(state?.eventSequence,0);else assert.equal(state,undefined);
  });
});

test("Didomi waits for documented readiness without waiting or creating fresh action evidence",async()=>{
  await fixture(async page=>{
    await page.evaluate("window.ready=[];window.didomiOnReady={push:cb=>window.ready.push(cb)}");
    assert.equal(await readCmpApiConsentSnapshot(page,"didomi"),undefined);
    await page.evaluate(()=>(window as any).ready.forEach((cb:any)=>cb((window as any).Didomi)));
    assert.equal((await readCmpApiConsentSnapshot(page,"didomi"))?.eventSequence,0);
  });
});

test("Didomi status objects use own boolean fields without executing accessors or requiring a prototype",async()=>{
  await fixture(async page=>{
    await page.evaluate(`class Status {enabled=false;}
      window.didomiFixtureStatus=()=>({regulation:'GDPR',purposes:{analytics:new Status(),ads:Object.assign(Object.create(null),{enabled:false})},vendors:{'c:vendor':new Status()}});`);
    const before=await readCmpApiConsentSnapshot(page,'didomi');assert.equal(before?.decision,'unknown');
    await page.evaluate(()=>{(window as any).partial=false;(window as any).emit();});
    assert.equal((await readCmpApiConsentSnapshot(page,'didomi'))?.eventSequence,1);
    await page.evaluate(()=>{
      const w=window as any;w.accessorCalls=0;const old=w.didomiFixtureStatus;
      w.didomiFixtureStatus=()=>({...old(),purposes:{analytics:{get enabled(){w.accessorCalls++;return false;}},ads:{enabled:false}}});
    });
    assert.equal(await readCmpApiConsentSnapshot(page,'didomi'),undefined);
    assert.equal(await page.evaluate(()=>(window as any).accessorCalls),0);
  });
});

for (const mode of ['didomi_id','iab_id','duplicate_status','shared_status','alias_drift'] as const) test(`Didomi declared vendor identity ${mode} binds exactly or fails closed`,async()=>{
  await fixture(async page=>{
    await page.evaluate(mode=>{
      const w=window as any;w.vendorIds=[{id:42,didomiId:'vendor-sdk-id',purposeIds:['analytics','ads']}];
      const old=w.didomiFixtureStatus;
      w.didomiFixtureStatus=()=>({...old(),vendors:mode==='duplicate_status'?{'42':{enabled:w.enabled},'vendor-sdk-id':{enabled:w.enabled}}:
        {[mode==='iab_id'?'42':'vendor-sdk-id']:{enabled:w.enabled}}});
      if(mode==='shared_status')w.vendorIds.push({id:43,didomiId:'vendor-sdk-id',purposeIds:['analytics']});
    },mode);
    const before=await readCmpApiConsentSnapshot(page,'didomi');
    if(mode==='duplicate_status'||mode==='shared_status'){assert.equal(before,undefined);return;}
    assert.equal(before?.decision,'unknown');
    await page.evaluate(mode=>{const w=window as any;w.partial=false;w.enabled=true;if(mode==='alias_drift')w.vendorIds[0].didomiId='changed-sdk-id';w.emit();},mode);
    const after=await readCmpApiConsentSnapshot(page,'didomi');
    if(mode==='alias_drift')assert.equal(after,undefined);else {assert.equal(after?.decision,'granted');assert.equal(after.eventSequence,1);}
  });
});

test("Didomi explicitly declared essential purposes and essential-only vendors do not veto a complete Reject",async()=>{
  await fixture(async page=>{
    await page.evaluate(()=>{
      const w=window as any;w.ids=['analytics','ads','security'];w.essentialIds=['security'];
      w.vendorIds[1].purposeIds=['security'];const old=w.didomiFixtureStatus;
      w.didomiFixtureStatus=()=>({...old(),purposes:{...old().purposes,security:{enabled:true}}});
    });
    assert.equal((await readCmpApiConsentSnapshot(page,'didomi'))?.decision,'unknown');
    await page.evaluate(()=>{(window as any).partial=false;(window as any).emit();});
    const after=await readCmpApiConsentSnapshot(page,'didomi');
    assert.equal(after?.decision,'denied');assert.equal(after.eventSequence,1);
    await page.evaluate(()=>{(window as any).essentialIds=['ads','security'];});
    assert.equal(await readCmpApiConsentSnapshot(page,'didomi'),undefined,'essentiality configuration drift cannot reuse a witness');
  });
});

test("missing or malformed essential inventory stays unverifiable",async()=>{
  await fixture(async page=>{
    for(const essential of [null,'security',['security','security'],[true]]){
      await page.evaluate(essential=>(window as any).Didomi.getUserStatus=()=>({purposes:{essential}}),essential);
      assert.equal(await readCmpApiConsentSnapshot(page,'didomi'),undefined);
    }
  });
});
