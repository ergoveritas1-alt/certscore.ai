import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { resolveCanonicalVendor } from '@certscore/vendor-resolver';
import { projectPostRefusalEvidenceForReport } from '@certscore/contracts';
import { retainedArticle13SectionEvidenceFromSections } from './scanners/policy-surface-scanner';
import { runPostRefusalObserver, type PostRefusalActionRecipe } from './post-refusal-observer';
import { capturePostAcceptFormInventory } from './post-accept-form-inventory';
import { captureCollectionSurfaceSnapshots } from './collection-surface-snapshots';

const sourceUrl = 'https://sits.example/privacy-policy/';
const sections = [
  { sourceUrl, heading: 'Data Protection Officer', textExcerpt: 'Data Protection Officer Dr. Example Officer, DPO@SITS.EXAMPLE', charStart: 0, charEnd: 100, quality: 'partial' as const, extractionMethod: 'canonical_topic_window' as const },
  { sourceUrl, heading: 'Social network LinkedIn', textExcerpt: "Social network LinkedIn. You can contact the platform operator's data protection officer at https://www.linkedin.com/help/linkedin/ask/TSO-DPO", charStart: 100, charEnd: 300, quality: 'strong' as const, extractionMethod: 'html_table_row' as const },
];
test('governing DPO evidence outranks a structurally strong platform contact', () => {
  const dpo = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl).find(row => row.coverageArea === 'dpo_contact');
  assert.equal(dpo?.signalObserved, 'observed');
  assert.match(dpo?.selectedPolicySectionExcerpt ?? '', /DPO@SITS.EXAMPLE/);
  assert.doesNotMatch(dpo?.selectedPolicySectionExcerpt ?? '', /LinkedIn/);
  assert.equal(retainedArticle13SectionEvidenceFromSections(sections.slice(1), sourceUrl).some(row => row.coverageArea === 'dpo_contact'), false);
});

test('form definitions retain HubSpot attribution without becoming analytics', () => {
  const definition = resolveCanonicalVendor({type:'request', url:'https://forms-eu1.hsforms.com/embed/v3/form/26142091/example-form/json'});
  assert.equal(definition.status, 'resolved');
  if (definition.status !== 'resolved') return;
  assert.equal(definition.observation.product, 'HubSpot Forms');
  assert.equal(definition.observation.purpose, 'infrastructure');
});

const recipe: PostRefusalActionRecipe = {
  artifactVersion: 'certscore.post_refusal_action_recipe.v1', recipeId: 'local-review-regression-v1',
  controlSelector: '[data-certscore-consent-action="reject"]', bannerSelector: '#banner',
  confirmation: {kind:'local_storage_equals', key:'decision', expectedValue:'rejected'},
};
for (const analyticsDelay of [100, 550, undefined]) {
test(`Reject keeps loader/form delivery neutral and captures ${analyticsDelay ?? 'no'} ms analytics within its window`, async () => {
  const browser = await chromium.launch({headless:true});
  const original = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await original(...args);
    await context.route(/https:\/\/(?:www\.googletagmanager\.com|forms-eu1\.hsforms\.com|js-eu1\.hs-analytics\.net)\//, route => route.fulfill({status:200, body:'', headers:{'Access-Control-Allow-Origin':'*'}}));
    return context;
  };
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type','text/html');
    res.end(`<section id="banner"><p>We use cookies for analytics.</p><button data-certscore-consent-action="reject">Reject all</button></section><script>
    document.querySelector('button').onclick=()=>{localStorage.setItem('decision','rejected');document.querySelector('#banner').remove();setTimeout(()=>{
    fetch('https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE');
    fetch('https://forms-eu1.hsforms.com/embed/v3/form/26142091/example-form/json');
    },100);${analyticsDelay === undefined ? '' : `setTimeout(()=>fetch('https://js-eu1.hs-analytics.net/analytics/123456.js'),${analyticsDelay});`}
    };window.__tcfapi=()=>{};</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const packet = await runPostRefusalObserver({browser, url:`http://127.0.0.1:${address.port}/`, scanId:'local-review-reject', recipe,
      interactionAuthorization:{authorizationId:'loopback_local_lab',kind:'loopback'}, actionSearchTimeoutMs:1000, confirmationTimeoutMs:500,
      observationWindowMs:800, productionProjectable:true});
    assert.equal(packet.refusalRegistration.status,'confirmed');
    const rows = packet.network.requests;
    assert.equal(rows.find(row=>row.hostname==='forms-eu1.hsforms.com')?.nonEssential,false);
    assert.equal(rows.find(row=>row.hostname==='www.googletagmanager.com')?.nonEssential,false);
    assert.equal(packet.network.postRefusalNonEssentialRequests.length,analyticsDelay === undefined ? 0 : 1);
    if (analyticsDelay !== undefined) {
      assert.equal(packet.network.postRefusalNonEssentialRequests[0]?.purpose,'analytics');
      // Semantic readback can finish at the window boundary after the request
      // was already retained. Both terminal reasons preserve that evidence.
      assert.ok(['non_essential_request_observed','window_elapsed'].includes(packet.timing.observationExitReason!));
    } else {
      assert.equal(packet.timing.observationExitReason,'window_elapsed');
      assert.ok(packet.timing.observationMs >= 800);
      assert.ok(packet.timing.observationMs < 1050,'semantic reads cannot restart the 800 ms window');
    }
    const end = packet.timing.observationEndedAtMs; assert.ok(end !== undefined);
    assert.ok(end <= packet.timing.readyAtMs);
    assert.ok(rows.every(row=>row.startedAtMs <= end));
    const projected = projectPostRefusalEvidenceForReport({packet,packetSha256:'a'.repeat(64)});
    assert.equal(projected.retainedActionTiming?.observationEndedAtMs,end);
    assert.equal(projected.execution?.status,'succeeded_with_confirmation');
    assert.equal(projected.registeredObservationCompletion?.completedAtMs,end);
    if (analyticsDelay === undefined) assert.equal(projected.registeredObservationCompletion?.termination,'window_elapsed');
  } finally { await browser.close(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
}

test('one bounded masked screenshot includes the full form and notice and restores layout', async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1200,height:900}});
  try {
    await page.setContent(`<style>body{margin:0}header{position:fixed;top:0;height:100px;width:100%;background:#111;z-index:10}form{width:680px;margin:160px auto 0;background:white;padding:12px}label{display:block;margin:15px}input,select{display:block;width:600px;height:40px}p{height:30px;background:#00ff00}button{height:40px;background:#ff0000}</style><header>Site navigation</header><form>
      ${Array.from({length:8},(_,i)=>`<label>Field ${i}<input value="private-value-${i}"></label>`).join('')}
      <span id="selection-label">Industry</span><select aria-labelledby="selection-label"><option>private selection</option></select>
      <p>Read our privacy policy before submitting.</p><button>Submit</button></form>`);
    const before = await page.locator('form').boundingBox();
    const inventory = await capturePostAcceptFormInventory(page,Date.now(),[]);
    assert.equal(inventory.forms[0]?.fields.find(field=>field.inputType==='select')?.label,'Industry');
    const snapshots = await captureCollectionSurfaceSnapshots(page,inventory,async()=>({safeForDisplay:true}),undefined,undefined,undefined,
      {maxCropHeight:480,fitFormToCrop:true,hideControlsDuringCapture:true});
    const image = snapshots[0]; assert.equal(image?.status,'available'); assert.ok(image?.data);
    assert.ok(image.height! <= 480); assert.ok(image.width! <= 640);
    assert.deepEqual(await page.locator('form').boundingBox(),before);
    assert.equal(await page.locator('form').evaluate(el=>el.style.getPropertyValue('zoom')),'');
    assert.equal(await page.locator('input').first().inputValue(),'private-value-0');
    const sharp = (await import('sharp')).default;
    const pixels = await sharp(Buffer.from(image.data,'base64')).raw().toBuffer({resolveWithObject:true});
    let green=0, red=0, masked=0;
    for(let i=0;i<pixels.data.length;i+=pixels.info.channels) {
      const [r,g,b]=[pixels.data[i]!,pixels.data[i+1]!,pixels.data[i+2]!];
      if(g>180&&r<80&&b<80) green++;
      if(r>180&&g<80&&b<80) red++;
      if(Math.abs(r-148)<8&&Math.abs(g-163)<8&&Math.abs(b-184)<8) masked++;
    }
    assert.ok(green>100,'privacy area must be in the crop'); assert.ok(red>100,'submit area must be in the crop'); assert.ok(masked>1000,'values remain masked');
    if (process.env.CERTSCORE_LOCAL_REVIEW_PROOF_DIR) {
      await mkdir(process.env.CERTSCORE_LOCAL_REVIEW_PROOF_DIR,{recursive:true});
      await writeFile(`${process.env.CERTSCORE_LOCAL_REVIEW_PROOF_DIR}/full-form-masked.jpg`,Buffer.from(image.data,'base64'));
    }
  } finally { await browser.close(); }
});
