import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { runPostAcceptObserver } from "../packages/certscore-scan-core/src/post-accept-observer";
import { CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE } from "../packages/certscore-scan-core/src/post-accept-cmp-recipes";
import { projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { verifiedPostAcceptFormSnapshots } from "../apps/web/server/scans/form-snapshot-evidence";

async function main(){
// Loopback only. No public-site contact, paid review, submission or deployment.
const outDir=path.resolve("artifacts/post-accept-form-handoff-local");
let submissions=0;
const server=createServer((request,response)=>{
  if(request.method==='POST')submissions++;
  response.setHeader('content-type','text/html');
  response.end(`<style>body{font:16px Arial;margin:24px}form{padding:20px;margin:20px;border:1px solid #bbb;max-width:580px}label{display:block;margin:8px}input{display:block}p{font-size:14px}</style>
    <section aria-label="Cookie and analytics preferences"><p>We use analytics cookies.</p><button data-certscore-consent-action="accept">Accept</button></section>
    <script>document.querySelector('button').onclick=()=>{localStorage.setItem('certscore:analytics-consent:v1','granted');document.querySelector('section').remove();
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend', '<form method="post" aria-label="Contact">'+
        ['First name','Last name','Company','Job title','Business email','Phone','Country','Message'].map((name,i)=>'<label>'+name+'<input name="field'+i+'" type="'+(i===4?'email':'text')+'"></label>').join('')+
        '<p>We use personal data to respond. <a href="/privacy">Privacy policy</a></p></form>'),2450);
      setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form method="post" aria-label="Newsletter"><label>Business email<input type="email"></label><p>Newsletter data is handled under our <a href="/privacy">Privacy policy</a>.</p></form>'),3150);};</script>`);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert.ok(address&&typeof address!=='string');
const browser=await chromium.launch({headless:true});
const originalContext=browser.newContext.bind(browser);
try {
  // Reproduce a browser inventory response arriving after the three-second
  // deadline, while the in-browser field notification is delivered on time.
  browser.newContext=async(...args)=>{
    const context=await originalContext(...args);const newPage=context.newPage.bind(context);
    context.newPage=async()=>{const page=await newPage();const evaluate=page.evaluate.bind(page);
      page.evaluate=(async (...args:any[])=>{const result=await (evaluate as any)(...args);
        if(args[1]?.bindingName)await new Promise(resolve=>setTimeout(resolve,750));return result;}) as typeof page.evaluate;
      return page;};return context;
  };
  const packet=await runPostAcceptObserver({browser,url:`http://127.0.0.1:${address.port}/`,scanId:randomUUID(),
    interactionAuthorization:{authorizationId:'loopback_local_lab',kind:'loopback'},recipe:CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
    actionSearchTimeoutMs:500,confirmationTimeoutMs:500,observationWindowMs:3000,resultBudgetMs:5000,
    productionProjectable:true,formSnapshotReviewer:async()=>({safeForDisplay:true})});
  const verified=verifiedPostAcceptFormSnapshots(packet.formSnapshotCapture);assert.ok(verified);
  assert.equal(packet.acceptanceRegistration.status,'confirmed');assert.equal(submissions,0);
  assert.equal(verified.images.filter(image=>image.bytes).length,2);
  const packetText=JSON.stringify(packet);const sha256=createHash('sha256').update(packetText).digest('hex');
  const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:sha256});
  await mkdir(outDir,{recursive:true});await writeFile(path.join(outDir,'PostAcceptEvidencePacket.json'),packetText);
  await writeFile(path.join(outDir,'Projection.json'),JSON.stringify(projection,null,2));
  await writeFile(path.join(outDir,'Verification.json'),JSON.stringify({scanId:packet.scanId,packetSha256:sha256,
    target:packet.targetUrl,scope:'loopback_fixture_only',submissions,fields:verified.capture.contractVersion==='certscore.post_accept_form_snapshots.v6'
      ?verified.capture.postCaptureInventory.inventory.forms.map(form=>form.fields.length):verified.capture.inventory.forms.map(form=>form.fields.length),
    images:verified.images.map(image=>({formRef:image.snapshot.formRef,status:image.snapshot.status,sha256:image.snapshot.sha256})),
    timing:packet.timing},null,2));
  console.log(JSON.stringify({outDir,images:verified.images.length,submissions,readyAtMs:packet.timing.readyAtMs}));
}finally{browser.newContext=originalContext;await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
