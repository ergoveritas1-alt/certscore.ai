import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { chromium, type Page } from 'playwright';
import { startPostAcceptFormCapture } from './post-accept-form-capture';

test('bounded Accept sample retains main and embedded forms, local disclosures, and no entered values', async () => {
  const server = createServer((request, response) => {
    response.setHeader('content-type','text/html');
    response.end(request.url === '/embed' ? `<form aria-label="Embedded contact"><input type="email" name="email" value="secret@example.test"><p>We process personal data to handle your request. <a href="/privacy?secret=123">Privacy policy</a></p></form>` : `<button id="accept">Accept</button><script>document.querySelector('button').onclick=()=>{document.body.insertAdjacentHTML('beforeend', '<form aria-label="Main"><input name="name"><textarea>secret-message</textarea></form><iframe src="/embed"></iframe>')}</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}/`;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage(); await page.goto(url);
    const start=Date.now(); await page.click('#accept');
    const capture=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:start,actionDispatchedAtMs:0,windowMs:200});
    await new Promise(resolve=>setTimeout(resolve,250));
    const result=capture.finish();
    assert.equal(result.status,'captured',JSON.stringify(result));
    assert.equal(result.frames.length,2);
    const form=result.frames.flatMap(frame=>frame.forms).find(form=>form.title==='Embedded contact');
    assert.ok(form,JSON.stringify(result));
    assert.match(form.privacyDisclosure?.excerpts[0]?.text??'',/handle your request/);
    assert.equal(form.privacyDisclosure?.excerpts[0]?.links[0]?.url,`${url}privacy`);
    assert.doesNotMatch(JSON.stringify(result),/secret-message|secret@example|secret=123/);
    assert.equal(capture.finish(),result);
    const pending=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:start,actionDispatchedAtMs:0,windowMs:3000});
    const before=performance.now(); const limited=pending.finish();
    assert.ok(performance.now()-before<30,'finish must not await its sample');
    assert.equal(limited.status,'limited'); assert.ok(limited.reasonCodes.includes('window_ended'));
    const changed=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:start,actionDispatchedAtMs:0,windowMs:100});
    await page.reload();
    assert.deepEqual(changed.finish().frames,[]);
    assert.ok(changed.finish().reasonCodes.includes('document_changed'));
    const abort = new AbortController();
    const cancelled = startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,windowMs:200,signal:abort.signal});
    abort.abort();
    assert.deepEqual(cancelled.finish().frames,[]);
    assert.ok(cancelled.finish().reasonCodes.includes('cancelled'));
    const duringClick = startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,windowMs:200,documentChangedBeforeStart:true});
    assert.ok(duringClick.finish().reasonCodes.includes('document_changed'));
    await page.close();
  } finally { await browser.close(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});


test('an unresponsive frame cannot delay finalization or mutate the frozen packet', async () => {
  let started = false;
  let resolveSample: (value: unknown) => void = () => {};
  const frame = { parentFrame: () => null, isDetached: () => false,
    evaluate: () => { started = true; return new Promise(resolve => { resolveSample=resolve; }); } };
  const page = { on: () => {}, off: () => {}, frames: () => [frame], mainFrame: () => frame,
    isClosed: () => false, url: () => 'https://example.test/' } as unknown as Page;
  const capture = startPostAcceptFormCapture({page,exactTargetUrl:'https://example.test/',parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,windowMs:100});
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.equal(started,true);
  const before=performance.now(); const result=capture.finish();
  assert.ok(performance.now()-before<30,'pending evaluate must not be awaited');
  assert.equal(result.status,'limited'); assert.deepEqual(result.frames,[]);
  const frozen=JSON.stringify(result);
  resolveSample({}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(result),frozen);
});

test('sample completion after the deadline remains limited instead of invalidating the Accept packet', async () => {
  const frame = { parentFrame: () => null, isDetached: () => false,
    evaluate: async () => { await new Promise(resolve=>setTimeout(resolve,200)); return {}; } };
  const page = { on: () => {}, off: () => {}, frames: () => [frame], mainFrame: () => frame,
    isClosed: () => false, url: () => 'https://example.test/' } as unknown as Page;
  const capture = startPostAcceptFormCapture({page,exactTargetUrl:'https://example.test/',parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,windowMs:300});
  await new Promise(resolve=>setTimeout(resolve,400));
  const result=capture.finish();
  assert.equal(result.status,'limited'); assert.ok(result.reasonCodes.includes('window_ended'));
  assert.deepEqual(result.frames,[]);
  assert.equal(capture.finish(),result);
});

test('structured capture retains late fields and disclosures through the confirmed window without pixels', async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  try {
    await page.route('https://structured.test/**',route=>route.fulfill({contentType:'text/html',body:`<script>
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form aria-label="Contact"><input name="email" type="email"><p>See our <a href="/privacy">Privacy policy</a></p></form>'),1000);
      setTimeout(()=>document.querySelector('form').insertAdjacentHTML('beforeend','<input name="name">'),1550);
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form aria-label="Newsletter"><input name="newsletter" type="email"></form>'),1900);
      </script>`}));
    await page.goto('https://structured.test/'); const started=Date.now();
    const capture=startPostAcceptFormCapture({page,exactTargetUrl:page.url(),parentScanStartedAtMs:started,actionDispatchedAtMs:0,windowMs:2000});
    await new Promise(resolve=>setTimeout(resolve,400));
    capture.continueThrough(400,2000);
    await new Promise(resolve=>setTimeout(resolve,2100));
    const result=capture.finish();
    assert.equal(result.version,'post_accept_form_capture.v2');
    assert.equal(result.status,'captured',JSON.stringify(result));
    assert.equal(result.window?.terminalSampleCompleted,true);
    assert.deepEqual(result.frames[0]?.forms.map(form=>form.fields.length),[2,1]);
    assert.match(result.frames[0]?.forms[0]?.privacyDisclosure?.excerpts[0]?.text??'',/Privacy policy/);
    assert.ok(result.frames.every(frame=>frame.capturedAtMs<=2400));
    assert.doesNotMatch(JSON.stringify(result),/image\/|base64/);
  } finally {await browser.close();}
});


test('pending terminal samples preserve prior verified frame counts and fields within the frame cap', async () => {
  let calls = 0, release: ((snapshot: unknown) => void) | undefined;
  let terminalStarted: (() => void) | undefined;
  const terminal = new Promise<void>(resolve => {terminalStarted = resolve;});
  const snapshot = {pageUrl:'https://partial.test/', documentToken:'72d05164-c49e-491c-9a64-02076fd785ea', documentReadyState:'complete',
    candidateScanTruncated:false, inspectedFieldCandidateCount:1, rows:[{groupKey:'0',structure:'native_form',elementType:'input',
      inputType:'email',label:'Business email',required:false,disabled:false,readOnly:false,domOrder:0}]};
  const frames = Array.from({length:4},(_,index)=>({parentFrame:()=>null,isDetached:()=>false,
    evaluate:()=>{
      if (index===0 && ++calls===2) {terminalStarted!();return new Promise(resolve=>{release=resolve;});}
      return Promise.resolve(snapshot);
    }}));
  const page = {on:()=>{},off:()=>{},frames:()=>frames,mainFrame:()=>frames[0],isClosed:()=>false,url:()=>snapshot.pageUrl} as unknown as Page;
  const capture = startPostAcceptFormCapture({page,exactTargetUrl:snapshot.pageUrl,parentScanStartedAtMs:Date.now(),actionDispatchedAtMs:0,windowMs:1000});
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([terminal,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("terminal sample did not start")),1500);})]); }
  finally {if(timeout)clearTimeout(timeout);}
  const result = capture.finish();
  assert.equal(result.status,'limited'); assert.ok(result.reasonCodes.includes('capture_limit'));
  assert.ok(result.reasonCodes.includes('window_ended')); assert.ok(!result.reasonCodes.includes('capture_invalid'));
  assert.equal(result.candidateFrameCount,4);assert.equal(result.inspectedFrameCount,3);
  assert.equal(result.frames.length,3);assert.equal(result.frames[0]?.forms[0]?.fields[0]?.label,'Business email');
  assert.equal(result.window?.terminalSampleCompleted,false);
  const frozen = JSON.stringify(result); release!(snapshot); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(result),frozen);
});

test('structured capture binds aria labels and wrapped neighboring notices without borrowing disclosure', async () => {
  const browser = await chromium.launch({headless:true}); const page = await browser.newPage();
  try {
    await page.route('https://wrapped-notice.test/**',route=>route.fulfill({contentType:'text/html',body:`
      <footer><section><div><form aria-label="Newsletter"><span id="email-label">Business email</span><input type="email" aria-labelledby="email-label" name="unhelpful-name" value="private@example.test"></form></div>
        <div><p>Newsletter personal data: <a href="/privacy?secret=x">Privacy policy</a></p></div></section><p>Global footer policy must not be borrowed.</p></footer>
      <section><form aria-label="Other"><input name="other"></form><div><form aria-label="Foreign"><input name="foreign"><p>Foreign personal data notice</p></form></div></section>
      <footer><p>Privacy footer</p></footer>`}));
    await page.goto('https://wrapped-notice.test/'); const started=Date.now();
    const capture=startPostAcceptFormCapture({page,exactTargetUrl:page.url(),parentScanStartedAtMs:started,actionDispatchedAtMs:0,windowMs:300});
    await new Promise(resolve=>setTimeout(resolve,350));const result=capture.finish();
    const newsletter=result.frames[0]?.forms.find(form=>form.title==='Newsletter');
    assert.equal(newsletter?.fields[0]?.label,'Business email');
    assert.match(newsletter?.privacyDisclosure?.excerpts[0]?.text??'',/Newsletter personal data/);
    assert.equal(newsletter?.privacyDisclosure?.excerpts[0]?.links[0]?.url,'https://wrapped-notice.test/privacy');
    assert.equal(result.frames[0]?.forms.find(form=>form.title==='Other')?.privacyDisclosure,undefined);
    assert.doesNotMatch(JSON.stringify(result),/private@example|secret=x|Privacy footer|Global footer/);
  }finally{await browser.close();}
});
