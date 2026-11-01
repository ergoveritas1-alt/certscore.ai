import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium, type Page} from 'playwright';
import {postAcceptReportProjectionSchema, type PostAcceptFormCapture} from '@certscore/contracts';
import {startPostAcceptFormCapture} from './post-accept-form-capture';
import {projectPostAcceptForms} from '../../../apps/web/lib/scans/post-accept-form-projection';
import {observedControlAssessment} from '../../../apps/web/lib/scans/test-fixtures/observed-control-assessment';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(mode:'healthy'|'child_dom'|'child_visibility'|'main_dom'|'child_dom_two') {
  const start=Date.now(),url='https://frame-progress.test/';
  const listeners=new Map<string,(frame:unknown)=>void>();
  const reads={main:0,child:0,visibility:0,newChild:0};
  const releases:(()=>void)[]=[];
  let releaseVisibility=()=>{},mainChanged=false;
  const snapshot=(main:boolean)=>({pageUrl:main?url:'https://embedded.test/',
    documentToken:main?'72d05164-c49e-491c-9a64-02076fd785ea':'72d05164-c49e-491c-9a64-02076fd785eb',documentReadyState:'complete',
    candidateScanTruncated:false,inspectedFieldCandidateCount:Date.now()-start>=600?1:0,
    rows:Date.now()-start>=600?[{groupKey:'0',structure:'native_form',title:main?'Main contact':'Embedded contact',
      elementType:'input',inputType:'email',label:'Email',required:false,disabled:false,readOnly:false,domOrder:0}]:[]});
  const main={parentFrame:()=>null,isDetached:()=>false,evaluate:async()=>{
    reads.main++;if(mode==='main_dom')return new Promise(resolve=>{releases.push(()=>resolve(snapshot(true)));});return snapshot(true);
  }};
  const child={parentFrame:()=>main,isDetached:()=>false,
    frameElement:async()=>({evaluate:async()=>{reads.visibility++;if(mode==='child_visibility')return new Promise<boolean>(resolve=>{releaseVisibility=()=>resolve(true);});return true;},dispose:async()=>{}}),
    evaluate:async()=>{reads.child++;if(mode==='child_dom'||mode==='child_dom_two')return new Promise(resolve=>{releases.push(()=>resolve(snapshot(false)));});return snapshot(false);}};
  let frames:unknown[]=[main,child,...(mode==='child_dom_two'?[{...child}]:[])];
  const page={on:(name:string,callback:(frame:unknown)=>void)=>listeners.set(name,callback),off:(name:string)=>listeners.delete(name),
    frames:()=>frames,mainFrame:()=>main,isClosed:()=>false,url:()=>mainChanged?url+'new':url} as unknown as Page;
  const abort=new AbortController();
  const capture=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:start,actionDispatchedAtMs:0,windowMs:1100,signal:abort.signal});
  capture.bindMainDocument('original-main-loader');
  return {start,reads,capture,abort,
    navigateMain(){mainChanged=true;listeners.get('framenavigated')?.(main);},
    navigateChild(){listeners.get('framenavigated')?.(child);},
    replaceChild(){frames=[main,{...child,frameElement:async()=>({evaluate:async()=>true,dispose:async()=>{}}),
      evaluate:async()=>{reads.newChild++;return snapshot(false);}}];},
    release(){releases.forEach(release=>release());releaseVisibility();},
  };
}
function reportRows(capture:PostAcceptFormCapture) {
  const projection=postAcceptReportProjectionSchema.parse({contractVersion:'certscore.post_accept_report_projection.v1',
    completedAt:'2026-10-31T12:00:00Z',actionControlProof:{contractVersion:'certscore.consent_action_control_proof.v1',action:'accept',
      observedAtMs:0,accessibleLabel:'Accept all',labelSource:'visible_text',actionSemantics:'direct_label',classifierIntent:'accept',
      classifierConfidence:1,recipeId:'fixture',selectorHint:'#accept',visible:true,enabled:true,uniquelyActionable:true,authorizedTargetSha256:capture.exactTargetSha256},
    evidenceDisposition:'indeterminate',indeterminateReason:'acceptance_not_confirmed',contradictionObserved:false,observationCount:0,
    observationWindowMs:1100,packetSha256:'b'.repeat(64),postAcceptActivity:[],productionProjectable:false,acceptanceExercised:false,
    registrationStatus:'unconfirmed',resolverMethod:'cmp_registry_recipe',status:'unconfirmed',formCapture:capture,
    interactionDiagnostics:{resolver:{snapshots:[],truncated:false},navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:true},
      click:{outcome:'completed',reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}}});
  const result=projectPostAcceptForms({consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:projection});
  assert.equal(projection.registrationStatus,'unconfirmed');
  assert.equal(projection.acceptanceExercised,false);
  return result;
}
for(const mode of ['child_dom','child_visibility','main_dom'] as const) test(`healthy form frames progress despite ${mode}`,async()=>{
  const f=fixture(mode);
  try {
    await pause(1150);const result=f.capture.finish(),report=reportRows(result);
    assert.equal(report.rows.length,1,JSON.stringify(result));
    assert.equal(report.limited,true);assert.equal(result.status,'limited');
    assert.equal(result.window?.terminalSampleCompleted,false);
    assert.ok(result.reasonCodes.includes('window_ended'));
    if(mode==='child_visibility'){assert.equal(f.reads.visibility,1);assert.equal(f.reads.child,0);}
    else assert.equal(mode==='child_dom'?f.reads.child:f.reads.main,1,'pending reads must never overlap or retry');
    const frozen=JSON.stringify(result);f.release();await pause(0);
    assert.equal(JSON.stringify(result),frozen);assert.equal(f.capture.finish(),result);
  }finally{f.capture.finish();f.release();}
});
test('two detached pending children keep their slots without starving the main frame or exceeding three reads',async()=>{
  const f=fixture('child_dom_two');try{await pause(400);f.replaceChild();await pause(750);
    const result=f.capture.finish();assert.equal(reportRows(result).rows.length,1);
    assert.equal(f.reads.child,2);assert.equal(f.reads.newChild,0,'old pending frames still consume the two child slots');
    assert.ok(f.reads.main>=2);assert.equal(result.status,'limited');assert.equal(result.window?.terminalSampleCompleted,false);
    const frozen=JSON.stringify(result);f.release();await pause(0);assert.equal(JSON.stringify(result),frozen);
  }finally{f.capture.finish();f.release();}
});
test('healthy frames preserve complete terminal coverage and bounded cadence',async()=>{
  const f=fixture('healthy');try{await pause(1150);const result=f.capture.finish();
    assert.equal(result.status,'captured',JSON.stringify(result));assert.equal(result.window?.terminalSampleCompleted,true);
    assert.equal(reportRows(result).rows.length,2);assert.ok(f.reads.main<=3&&f.reads.child<=3);
  }finally{f.capture.finish();f.release();}
});
test('healthy frames progress in the confirmed window without reusing pending pre-confirmation proof',async()=>{
  const f=fixture('child_dom');try{await pause(350);const confirmedAt=Date.now()-f.start;f.capture.continueThrough(confirmedAt,800);
    await pause(850);const result=f.capture.finish();assert.equal(result.frames.flatMap(frame=>frame.forms).length,1);
    assert.equal(result.window?.terminalSampleCompleted,false);assert.equal(f.reads.child,1);
    assert.ok(result.frames[0]!.capturedAtMs>=confirmedAt);
  }finally{f.capture.finish();f.release();}
});
test('replacement child cannot receive the old pending read or starve the main frame',async()=>{
  const f=fixture('child_dom');try{await pause(400);f.replaceChild();await pause(750);const result=f.capture.finish();
    assert.equal(reportRows(result).rows.length,2);assert.equal(result.status,'limited');assert.equal(f.reads.child,1);
    assert.ok(f.reads.newChild>=1);assert.equal(result.window?.terminalSampleCompleted,false);
    const frozen=JSON.stringify(result);f.release();await pause(0);assert.equal(JSON.stringify(result),frozen);
  }finally{f.capture.finish();f.release();}
});
test('child navigation rejects its old pending epoch while retaining late main forms',async()=>{
  const f=fixture('child_dom');try{await pause(400);f.navigateChild();await pause(750);const result=f.capture.finish();
    assert.equal(reportRows(result).rows.length,1);assert.equal(f.reads.child,1);assert.equal(result.frames[0]?.frameRef,'accept_frame_0');
    const frozen=JSON.stringify(result);f.release();await pause(0);assert.equal(JSON.stringify(result),frozen);
  }finally{f.capture.finish();f.release();}
});
for(const mode of ['navigate','cancel'] as const)test(`pending child cannot bypass ${mode}`,async()=>{
  const f=fixture('child_dom');try{await pause(400);if(mode==='navigate')f.navigateMain();else f.abort.abort();
    await pause(250);const result=f.capture.finish();assert.deepEqual(result.frames,[]);
    assert.ok(result.reasonCodes.includes(mode==='navigate'?'document_changed':'cancelled'));
    const reads=f.reads.main,frozen=JSON.stringify(result);f.release();await pause(100);
    assert.equal(f.reads.main,reads);assert.equal(JSON.stringify(result),frozen);
  }finally{f.capture.finish();f.release();}
});

test('real loopback main DOM retains a late form while its child DOM read remains pending',async()=>{
  const server=createServer((request,response)=>{
    response.setHeader('content-type','text/html');
    response.end(request.url==='/embed'?'<p>Embedded fixture</p>':'<main></main><iframe src="/embed"></iframe>');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}/`;
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  let release=()=>{},finish=()=>{};
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage();
    let externalRequests=0;
    await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(url).origin){externalRequests++;return route.abort();}return route.continue();});
    await page.goto(url);const child=page.frames().find(frame=>frame.parentFrame());assert.ok(child);
    let childReads=0;
    child.evaluate=async()=>{childReads++;return await new Promise(resolve=>{release=()=>resolve(null);});};
    await page.evaluate(()=>{setTimeout(()=>document.querySelector('main')!.insertAdjacentHTML('beforeend',
      '<form aria-label="Late contact"><input type="email" aria-label="Email"></form>'),600);});
    const start=Date.now(),capture=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:start,actionDispatchedAtMs:0,windowMs:1100});
    finish=()=>{capture.finish();};await pause(1150);const result=capture.finish();
    assert.equal(reportRows(result).rows.length,1,JSON.stringify(result));
    assert.equal(result.frames[0]?.forms[0]?.title,'Late contact');assert.equal(result.status,'limited');
    assert.equal(result.window?.terminalSampleCompleted,false);assert.equal(childReads,1);assert.equal(externalRequests,0);
    const frozen=JSON.stringify(result);release();await pause(0);assert.equal(JSON.stringify(result),frozen);
  } finally {finish();release();await browser?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
