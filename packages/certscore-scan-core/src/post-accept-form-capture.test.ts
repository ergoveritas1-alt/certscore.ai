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
