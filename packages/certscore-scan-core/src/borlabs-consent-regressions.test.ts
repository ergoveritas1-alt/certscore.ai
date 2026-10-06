import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { readRapidFirstLayerConsentUiObservation, detectConsentUi } from "./scanners/pre-consent-runtime-scanner.js";
import { revealBorlabsDeferredDialog } from "./borlabs-passive-dialog-reveal.js";
import { readCmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

test("Borlabs content-specific unblocking never becomes first-layer Reject through any inventory channel", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<div class="brlbs-cmpnt-content-blocker" style="margin-top:20px">
      <p>HubSpot collects personal data. Read our privacy policy to unblock this content.</p>
      <a role="button" data-borlabs-cookie-accept-service>Accept required service and unblock content</a>
    </div>`);
    const rapid = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1000);
    const full = await detectConsentUi(page, Date.now(), 0);
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(rapid.rejectControlObserved, false);
    assert.equal(full.rejectControlObserved, false);
    assert.equal(geometry.summary.firstLayerReject, false);
    assert.ok(!geometry.candidates.some(candidate => candidate.actionType === "reject_all"));
  } finally { await browser.close(); }
});

test("a configured deferred Borlabs first layer is revealed by scroll without granting consent", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<main style="height:2000px"></main><script>
      window.BorlabsCookie = {Consents:{hasConsent:()=>false}};
      window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true}};
      window.clicks=0;window.addEventListener('click',()=>window.clicks++);
      window.addEventListener('scroll',()=>document.body.insertAdjacentHTML('beforeend',
        '<div class="brlbs-cmpnt-dialog-box-entrance" role="dialog" style="position:fixed;top:50px;background:white">'+
        '<p>We use cookies for marketing. Choose your privacy preferences.</p><button>Accept all</button>'+
        '<button>Accept essential cookies</button><button>Individual preferences</button></div>'),{once:true});
    </script>`);
    assert.equal(await revealBorlabsDeferredDialog(page), true);
    await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'));
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    assert.equal(await page.evaluate(() => (window as any).clicks), 0);
    await page.evaluate(() => { (window as any).borlabsCookieConfig.settings.dialogShowDialogAfterUserInteraction = false; });
    assert.equal(await revealBorlabsDeferredDialog(page), false);
  } finally { await browser.close(); }
});

test("Borlabs confirmation retains complete optional-service state and a fresh saved-consent event", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<script>
      window.grants={cmp:false,analytics:false,replay:false};
      window.BorlabsCookie={Consents:{hasConsent:id=>window.grants[id]}};
      window.borlabsCookieConfig={services:{cmp:{id:'cmp',serviceGroupId:'essential'},
        analytics:{id:'analytics',serviceGroupId:'statistics'},replay:{id:'replay',serviceGroupId:'marketing'}}};
    </script>`);
    const baseline = await readCmpApiConsentSnapshot(page, "borlabs");
    assert.equal(baseline?.eventSequence, 0);
    await page.evaluate(() => { (window as any).grants.cmp = true; window.dispatchEvent(new Event("borlabs-cookie-consent-saved")); });
    const denied = await readCmpApiConsentSnapshot(page, "borlabs");
    assert.equal(denied?.decision, "denied");
    assert.equal(denied?.eventSequence, 1);
    assert.notEqual(denied?.canonicalState, baseline?.canonicalState);
    await page.evaluate(() => { (window as any).grants.analytics = true; });
    assert.equal((await readCmpApiConsentSnapshot(page, "borlabs"))?.decision, "mixed");
    await page.evaluate(() => { (window as any).grants.replay = true; window.dispatchEvent(new Event("borlabs-cookie-consent-saved")); });
    assert.equal((await readCmpApiConsentSnapshot(page, "borlabs"))?.decision, "granted");
    await page.evaluate(() => { (window as any).borlabsCookieConfig.services.replay.id = "mismatch"; });
    assert.equal(await readCmpApiConsentSnapshot(page, "borlabs"), undefined);
  } finally { await browser.close(); }
});
