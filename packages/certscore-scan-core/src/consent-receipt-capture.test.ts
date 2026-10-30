import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import test from 'node:test';
import {chromium,type Page} from 'playwright';
import {postAcceptEvidencePacketSchema,postRefusalEvidencePacketSchema,projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport} from '@certscore/contracts';
import {projectReceiptValue,installConsentReceiptCapture,receiptCaptureToken,retainReceiptCookies,retainReceiptApi} from './consent-receipt-capture.js';
import {runPostAcceptObserver} from './post-accept-observer.js';
import {runPostRefusalObserver} from './post-refusal-observer.js';
import {buildCanonicalPostAcceptActionRecipes} from './post-accept-cmp-recipes.js';
import {buildCanonicalPostRefusalActionRecipes} from './post-refusal-cmp-recipes.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');

test('receipt extraction keeps category facts without raw identifiers, keys, metadata or executable input',()=>{
 const raw='consentid:private-visitor-id,consent:yes,action:yes,necessary:yes,analytics:no,advertisement:no,lastRenewedDate:1790000000000';
 const facts=projectReceiptValue('cookieyes-consent',raw);assert.equal(facts.facts.length,3);assert.equal(facts.omittedFields,4);
 const serialized=JSON.stringify(facts);for(const text of ['private-visitor-id','1790000000000','analytics','consentid'])assert.ok(!serialized.includes(text));
 assert.equal(facts.facts.find(f=>f.pathSha256===hash('analytics'))?.value,'no');
 for(const input of ['analytics:yes,analytics:no','x'.repeat(2049)])assert.equal(projectReceiptValue('cookieyes-consent',input).factsLimited,true);
 const json=projectReceiptValue('unknown-consent',JSON.stringify({analytics:false,advertising:true,id:'someone@example.com',time:123}));
 assert.equal(json.facts.length,2);assert.equal(json.omittedFields,2);assert.ok(!JSON.stringify(json).includes('someone'));
 assert.equal(projectReceiptValue('unknown-consent','{"x":false,"x":true}').factsLimited,true);
 assert.equal(projectReceiptValue('unknown-consent','{x:(()=>true)()}').facts.length,0);
});

function fake(){const page=new EventEmitter() as EventEmitter&{url:()=>string;mainFrame:()=>object;context:()=>object};let url='https://fixture.example/';const frame={},context={};page.url=()=>url;page.mainFrame=()=>frame;page.context=()=>context;return{page:page as unknown as Page,frame,context,navigate:(next=url)=>{url=next;page.emit('framenavigated',frame);}};}
for(const mode of ['stable','navigation','cancel','wrong_frame','wrong_cookie_scope','overflow','cpu_budget','late_reply']as const){
 test(`receipt capture lifecycle and bounds: ${mode}`,t=>{
  const f=fake(),controller=new AbortController(),origin=Date.now()-100;
  const capture=installConsentReceiptCapture(f.page,{scanId:'owned',action:'reject',clockOriginAtEpochMs:origin,signal:controller.signal});
  const token=receiptCaptureToken(f.page)!;capture.dispatch(Date.now());
  if(mode==='cpu_budget'){let clock=0;t.mock.method(performance,'now',()=>clock+=3);}
  const input=mode==='wrong_frame'?{page:()=>f.page}:f.page;
  const current=receiptCaptureToken(input as Page);
  if(mode==='navigation')f.navigate();if(mode==='cancel')controller.abort();
  if(mode==='late_reply')capture.finish({targetSha256:hash('target'),clickOutcome:'completed'});
  for(let i=0;i<(mode==='overflow'||mode==='cpu_budget'?12:1);i++)retainReceiptApi(mode==='navigation'?token:current,'termly',{canonicalState:JSON.stringify([['analytics',i%2===0],['advertising',false],['change'+i,false]]),decision:'denied',eventSequence:i});
  if(mode==='wrong_cookie_scope')retainReceiptCookies(receiptCaptureToken(f.page),[{name:'cookieyes-consent',value:'analytics:no,advertisement:no',domain:'foreign.example',path:'/',expires:-1,httpOnly:false,secure:true,sameSite:'Lax'}],'cookieyes-consent');
  const result=capture.finish({targetSha256:hash('target'),clickOutcome:'completed'});
  if(mode==='late_reply'){assert.equal(result,undefined);return;}
  assert.ok(result);assert.ok(JSON.stringify(result).length<=8192);
  if(['navigation','cancel','wrong_frame'].includes(mode))assert.equal(result.observations.length,0);
  else assert.ok(result.observations.length>0);
  if(mode==='navigation')assert.equal(result.documentStable,false);if(mode==='cancel')assert.equal(result.cancelled,true);
  if(mode==='overflow')assert.equal(result.observationsTruncated,true);if(mode==='cpu_budget')assert.equal(result.processingLimited,true);
  if(mode==='wrong_cookie_scope')assert.equal(result.observations.at(-1)?.available,false);
 });
}

for(const action of ['accept','reject']as const)for(const mode of ['valid','unknown_category','missing','mixed','preexisting','terminal']as const){
 test(`${action}: owned ${mode} receipt capture preserves consent and completion`,{timeout:12000},async()=>{
  const expected=action==='accept'?'yes':'no';const receipt=(kind:string)=>`consentid:private-visitor-id,necessary:yes,analytics:${kind},advertisement:${kind}`;
  const before=mode==='preexisting'?receipt(expected):'';
  const after=mode==='unknown_category'?receipt(expected)+',new_category:no':mode==='mixed'?'necessary:yes,analytics:yes,advertisement:no':receipt(expected);
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<section class="cky-consent-container"><p>Choose optional analytics cookies</p><button class="cky-btn-${action}">${action==='accept'?'Accept all':'Reject all'}</button></section><script>
   ${before?`document.cookie=${JSON.stringify('cookieyes-consent='+before+';path=/')};`:''}
   document.querySelector('button').onclick=()=>{document.querySelector('section').hidden=true;${['missing','preexisting'].includes(mode)?'':`setTimeout(()=>document.cookie=${JSON.stringify('cookieyes-consent='+after+';path=/')},${mode==='terminal'?150:0});`}};</script>`);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true});
  try{
   const runtime=process.env.CMP_RECEIPT_RUNTIME_ROOT;
   const run=runtime?(await import(runtime+`/packages/certscore-scan-core/dist/post-${action==='accept'?'accept':'refusal'}-observer.js`))[action==='accept'?'runPostAcceptObserver':'runPostRefusalObserver']:action==='accept'?runPostAcceptObserver:runPostRefusalObserver;
   const recipes=action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
   const packet=await run({browser,url:`http://127.0.0.1:${address.port}/`,scanId:`receipt-${action}-${mode}`,productionProjectable:true,
    interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},recipe:recipes.find(r=>r.cmpId==='CookieYes')!,
    actionSearchTimeoutMs:1500,resultBudgetMs:6000,confirmationTimeoutMs:60,observationWindowMs:500});
   const projection=action==='accept'?projectPostAcceptEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))}):projectPostRefusalEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))});
   assert.equal(projection.execution?.observationCompleted,true);assert.equal(projection.execution?.consentConfirmed,['valid','terminal'].includes(mode));
   if(!process.env.CMP_RECEIPT_EXPECT_LEGACY){
    const capture=packet.consentReceiptCapture;assert.ok(capture,JSON.stringify(packet.confirmationDiagnostics));assert.ok(JSON.stringify(capture).length<=8192);
    assert.ok(!JSON.stringify(capture).includes('private-visitor-id'));assert.ok(capture.observations.length>0);
    if(mode==='valid'||mode==='unknown_category'||mode==='mixed')assert.ok(capture.observations.some((r:{facts:unknown[]})=>r.facts.length>0));
    if(mode==='missing')assert.ok(capture.observations.every((r:{available:boolean})=>!r.available));
    if(mode==='valid'){
     const written=capture.observations.find((r:{source:string;identitySha256?:string})=>r.source==='write'&&r.identitySha256);
     assert.ok(written,'exact setter identity is retained');
     assert.ok(capture.observations.some((r:{source:string;identitySha256?:string;valueSha256?:string})=>r.source==='cookie'&&r.identitySha256===written.identitySha256&&r.valueSha256===written.valueSha256),'same-identity current readback is retained');
    }
    if(mode==='terminal')assert.ok(capture.observations.some((r:{phase:string})=>r.phase==='terminal'));
    const schema=action==='accept'?postAcceptEvidencePacketSchema:postRefusalEvidencePacketSchema;
    for(const mutate of [(c:typeof capture)=>c.scanId='wrong-session',(c:typeof capture)=>c.authorizedTargetSha256=hash('wrong-target'),(c:typeof capture)=>c.frameIdentitySha256=hash('wrong-frame'),(c:typeof capture)=>c.actionDispatchedAtEpochMs++]){
     const changed=structuredClone(packet);mutate(changed.consentReceiptCapture);assert.equal(schema.safeParse(changed).success,false);
    }
    // Removing optional observations cannot change canonical eligibility/scoring.
    const without=structuredClone(packet);delete without.consentReceiptCapture;
    const p=action==='accept'?projectPostAcceptEvidenceForReport({packet:without,packetSha256:hash(JSON.stringify(without))}):projectPostRefusalEvidenceForReport({packet:without,packetSha256:hash(JSON.stringify(without))});
    assert.deepEqual(p.execution,projection.execution);
   }else assert.equal(packet.consentReceiptCapture,undefined);
   if(process.env.CMP_RECEIPT_OUTPUT_DIR){mkdirSync(process.env.CMP_RECEIPT_OUTPUT_DIR,{recursive:true});writeFileSync(`${process.env.CMP_RECEIPT_OUTPUT_DIR}/${action}-${mode}.json`,JSON.stringify(packet,null,2)+'\n');}
   console.log('RECEIPT_RESULT '+JSON.stringify({action,mode,execution:projection.execution,captureRows:packet.consentReceiptCapture?.observations.length??0}));
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}

for(const action of ['accept','reject']as const)for(const mode of ['saved','missing_event','mixed','partial']as const){
 test(`${action}: HubSpot ${mode} retains the existing API category read and event clock`,{timeout:10000},async()=>{
  const granted=action==='accept';
  const server=createServer((_q,r)=>{r.setHeader('content-type','text/html');r.end(`<section id="hs-eu-cookie-confirmation"><p>Choose optional cookies</p><div id="hs-eu-cookie-confirmation-buttons-area"><button id="${granted?'hs-eu-confirmation-button':'hs-eu-decline-button'}">${granted?'Accept':'Decline'}</button></div></section><script>
   let listener;window._hsp={push(command){listener=command[1];listener({categories:{necessary:true,analytics:${!granted},advertisement:${!granted},functionality:${!granted}}});}};
   document.querySelector('button').onclick=()=>{document.querySelector('section').hidden=true;${mode==='missing_event'?'':`listener({categories:{necessary:true,analytics:${granted},advertisement:${mode==='mixed'?!granted:granted},${mode==='partial'?"visitor:'private-visitor-id'":`functionality:${granted}`}}});`}};</script>`);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true});try{
   const runtime=process.env.CMP_RECEIPT_RUNTIME_ROOT;
   const run=runtime?(await import(runtime+`/packages/certscore-scan-core/dist/post-${action==='accept'?'accept':'refusal'}-observer.js`))[action==='accept'?'runPostAcceptObserver':'runPostRefusalObserver']:action==='accept'?runPostAcceptObserver:runPostRefusalObserver;
   const recipes=action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
   const packet=await run({browser,url:`http://127.0.0.1:${address.port}/`,scanId:`receipt-api-${action}-${mode}`,productionProjectable:true,
    interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},recipe:recipes.find(r=>r.cmpId==='HubSpot Consent Banner')!,
    actionSearchTimeoutMs:1500,resultBudgetMs:6000,confirmationTimeoutMs:80,observationWindowMs:400});
   const projection=action==='accept'?projectPostAcceptEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))}):projectPostRefusalEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))});
   assert.equal(projection.execution?.observationCompleted,true);assert.equal(projection.execution?.consentConfirmed,mode==='saved');
   if(!process.env.CMP_RECEIPT_EXPECT_LEGACY){
    const rows=packet.consentReceiptCapture?.observations??[];assert.ok(rows.some((r:{source:string;phase:string})=>r.source==='api'&&r.phase==='baseline'));
    assert.ok(rows.some((r:{source:string;phase:string})=>r.source==='api'&&r.phase==='initial'));
    if(mode==='partial')assert.ok(rows.some((r:{format:string;facts:unknown[];factsLimited:boolean})=>r.format==='api_partial'&&r.facts.length===3&&r.factsLimited));
    else assert.ok(rows.every((r:{facts:unknown[]})=>r.facts.length===3));
    if(mode==='partial'){const partial=rows.find((r:{format:string})=>r.format==='api_partial');assert.equal(partial.apiReadKind,'saved_event');assert.ok(partial.eventSequence>1&&partial.eventObservedAtEpochMs!==undefined);assert.ok(!JSON.stringify(packet.consentReceiptCapture).includes('private-visitor-id'));}
    if(mode==='saved')assert.ok(rows.some((r:{eventSequence:number;eventObservedAtEpochMs?:number})=>r.eventSequence>1&&r.eventObservedAtEpochMs!==undefined));
   }else assert.equal(packet.consentReceiptCapture,undefined);
   if(process.env.CMP_RECEIPT_OUTPUT_DIR){mkdirSync(process.env.CMP_RECEIPT_OUTPUT_DIR,{recursive:true});writeFileSync(`${process.env.CMP_RECEIPT_OUTPUT_DIR}/api-${action}-${mode}.json`,JSON.stringify(packet,null,2)+'\n');}
   console.log('RECEIPT_RESULT '+JSON.stringify({action,mode:'api-'+mode,execution:projection.execution,captureRows:packet.consentReceiptCapture?.observations.length??0}));
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}

test('API observation retention adds no browser operation',async()=>{
 const {readCmpApiConsentSnapshot}=await import('./cmp-api-consent-state.js');const f=fake();let reads=0;
 Object.assign(f.page,{evaluate:async()=>{reads++;return{canonicalState:'[["analytics",false]]',decision:'denied',eventSequence:0};}});
 const capture=installConsentReceiptCapture(f.page,{scanId:'one-read',action:'reject',clockOriginAtEpochMs:Date.now()-10});
 await readCmpApiConsentSnapshot(f.page,'termly');assert.equal(reads,1);capture.finish();
});

test('OneTrust retains the existing configuration and cookie read without another SDK/cookie call',async()=>{
 const {captureOneTrustBaseline}=await import('./onetrust-consent-state.js');const f=fake();let sdkReads=0,cookieReads=0;
 Object.assign(f.page,{evaluate:async()=>{sdkReads++;return[{id:'C0001',status:'always active'},{id:'C0002',status:'active'}];}});
 const context={cookies:async()=>{cookieReads++;return[{name:'OptanonConsent',value:'groups=C0001:1,C0002:0',domain:'fixture.example',path:'/',expires:-1,httpOnly:false,secure:true,sameSite:'Lax'}];}};
 const capture=installConsentReceiptCapture(f.page,{scanId:'onetrust-existing-read',action:'reject',clockOriginAtEpochMs:Date.now()-20});
 const baseline=await captureOneTrustBaseline(context as never,f.page);assert.equal(baseline?.status,'verified');assert.equal(sdkReads,1);assert.equal(cookieReads,1);
 capture.dispatch(Date.now());const result=capture.finish({targetSha256:hash('target'),clickOutcome:'completed'});assert.ok(result);
 assert.equal(result.observations.filter(r=>r.source==='configuration').length,1);assert.equal(result.observations.filter(r=>r.source==='cookie').length,1);
 assert.equal(result.observations.find(r=>r.source==='configuration')?.facts.length,2);
});

for(const provider of ['Iubenda','Consentmanager']as const)for(const action of ['accept','reject']as const){
 test(`${action}: owned ${provider} registered receipt variant retains unsupported input and independent readback`,{timeout:12000},async()=>{
  const key=provider==='Iubenda'?'_iub_cs-1197126':'__cmpconsent78323';
  // Deliberately synthetic JSON tests capture, not a newly supported vendor protocol.
  const value=encodeURIComponent(JSON.stringify({visitor:'private-visitor-id',purposes:{'1':true,'2':false,'3':false,'4':false,'5':false}}));
  const control=provider==='Iubenda'?`<section id="iubenda-cs-banner"><div class="iubenda-cs-opt-group-consent"><button class="iubenda-cs-${action==='accept'?'accept':'reject'}-btn">${action==='accept'?'Accept all':'Reject all'}</button></div></section>`:`<section id="cmpbox"><a href="#" role="button" class="cmpboxbtn${action==='accept'?'yes':'no'}">${action==='accept'?'Accept all':'Reject all'}</a></section>`;
  const server=createServer((_q,r)=>{r.setHeader('content-type','text/html');r.end(control+`<script>document.querySelector('button,a').onclick=e=>{e.preventDefault();document.querySelector('section').hidden=true;document.cookie=${JSON.stringify(key+'='+value+';path=/')};};</script>`);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const browser=await chromium.launch({headless:true});
  try{
   const runtime=process.env.CMP_RECEIPT_RUNTIME_ROOT;
   const run=runtime?(await import(runtime+`/packages/certscore-scan-core/dist/post-${action==='accept'?'accept':'refusal'}-observer.js`))[action==='accept'?'runPostAcceptObserver':'runPostRefusalObserver']:action==='accept'?runPostAcceptObserver:runPostRefusalObserver;
   const recipes=action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
   const packet=await run({browser,url:`http://127.0.0.1:${address.port}/`,scanId:`receipt-variant-${provider}-${action}`,productionProjectable:true,
    interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},recipe:recipes.find(r=>r.cmpId===provider)!,actionSearchTimeoutMs:2000,resultBudgetMs:6000,confirmationTimeoutMs:80,observationWindowMs:400});
   const projection=action==='accept'?projectPostAcceptEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))}):projectPostRefusalEvidenceForReport({packet,packetSha256:hash(JSON.stringify(packet))});
   assert.equal(projection.execution?.observationCompleted,true,JSON.stringify(packet.interactionDiagnostics));assert.equal(projection.execution?.consentConfirmed,false);
   if(!process.env.CMP_RECEIPT_EXPECT_LEGACY){
    const rows=packet.consentReceiptCapture?.observations??[];const written=rows.find((r:{source:string;identitySha256?:string;keySha256:string})=>r.source==='write'&&r.identitySha256&&r.keySha256===hash(key));
    assert.ok(written,'registered receipt variant setter is retained');assert.equal(written.facts.length,5);assert.ok(!JSON.stringify(rows).includes('private-visitor-id'));
    assert.ok(packet.storage.postAction.some((r:{name:string;identityHash?:string;valueHash:string})=>r.name===key&&r.identityHash===written.identitySha256&&r.valueHash===written.valueSha256),'the existing independent post-action snapshot matches exact write identity and value');
   }else assert.equal(packet.consentReceiptCapture,undefined);
   if(process.env.CMP_RECEIPT_OUTPUT_DIR){mkdirSync(process.env.CMP_RECEIPT_OUTPUT_DIR,{recursive:true});writeFileSync(`${process.env.CMP_RECEIPT_OUTPUT_DIR}/variant-${provider}-${action}.json`,JSON.stringify(packet,null,2)+'\n');}
   console.log('RECEIPT_RESULT '+JSON.stringify({provider,action,execution:projection.execution,captureRows:packet.consentReceiptCapture?.observations.length??0}));
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}
