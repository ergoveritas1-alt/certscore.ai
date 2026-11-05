import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {POST_ACCEPT_FORM_CAPTURE_MAX_BYTES, postAcceptFormCaptureSchema} from "@certscore/contracts";
import {startPostAcceptFormCapture} from "./post-accept-form-capture";

for (const helpers of ["hidden", "empty"] as const) test(`two delayed form frames survive preceding ${helpers} helpers within three sampling slots`, async () => {
  const server=createServer((request,response)=>{
    response.setHeader("content-type","text/html");
    response.end(request.url==="/" ? `<main></main><iframe ${helpers==="hidden"?"hidden":""} src="/helper-one"></iframe><iframe ${helpers==="hidden"?"hidden":""} src="/helper-two"></iframe><iframe src="/form-one"></iframe><iframe src="/form-two"></iframe>`
      : request.url?.startsWith("/form-") ? `<main></main><script>setTimeout(()=>document.querySelector('main').innerHTML='<form aria-label="${request.url.slice(1)}"><input aria-label="Email" type="email" value="never-retain@example.test"></form>',600)</script>`
      : "<p>Helper with no form</p>");
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const url=`http://127.0.0.1:${address.port}/`;
  const browser=await chromium.launch({headless:true});let finish=()=>{};
  try {
    const page=await browser.newPage();let external=0;
    await page.route("**/*",route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():(external++,route.abort()));
    await page.goto(url,{waitUntil:"load"});assert.equal(page.frames().length,5);
    let active=0,peak=0,total=0;
    // Count full DOM inspections; hidden helpers use only their existing visibility probe.
    for(const frame of page.frames()) {
      const evaluate=frame.evaluate.bind(frame);
      frame.evaluate=(async (...args:Parameters<typeof evaluate>)=>{active++;peak=Math.max(peak,active);total++;
        try{return await evaluate(...args);}finally{active--;}}) as typeof frame.evaluate;
    }
    const started=Date.now();
    const capture=startPostAcceptFormCapture({page,exactTargetUrl:url,parentScanStartedAtMs:started,actionDispatchedAtMs:0,windowMs:1100});
    finish=()=>{capture.finish();};await new Promise(resolve=>setTimeout(resolve,1150));const result=capture.finish();
    assert.equal(result.frames.flatMap(frame=>frame.forms).length,2,JSON.stringify(result));
    assert.deepEqual(result.frames.flatMap(frame=>frame.forms.map(form=>form.title)).sort(),["form-one","form-two"]);
    assert.equal(result.candidateFrameCount,5);assert.equal(result.inspectedFrameCount,3);
    assert.equal(result.status,"limited");assert.ok(result.reasonCodes.includes("capture_limit"));
    assert.equal(result.window?.endedAtMs,1100);assert.ok(result.frames.every(frame=>frame.capturedAtMs<=1100));
    assert.ok(result.frames.length<=3);assert.ok(peak<=3);assert.ok(total<=9,`DOM reads exceeded three slots × three sampling rounds: ${total}`);
    assert.ok(Buffer.byteLength(JSON.stringify(result))<=POST_ACCEPT_FORM_CAPTURE_MAX_BYTES);
    assert.equal(postAcceptFormCaptureSchema.safeParse(result).success,true);
    assert.doesNotMatch(JSON.stringify(result),/never-retain/);assert.equal(external,0);
    const frozen=JSON.stringify(result);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(JSON.stringify(result),frozen);
  } finally {finish();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
