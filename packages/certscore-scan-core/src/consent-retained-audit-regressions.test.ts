import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

let browser: Browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

for (const [name, html, accept, reject] of [
  ["short Czech heading binds submit input", '<div id="tx_cookies" style="position:fixed;bottom:0"><h3>Nastavení cookies a ochrany soukromí</h3><form id="tx_cookies_accept"><p><input type="submit" value="Povolit vše"></p></form><div hidden>Long hidden cookies explanation</div></div>', true, false],
  ["single inline refusal paragraph", '<section role="dialog" aria-label="Cookies"><p>We use cookies for analytics.</p><p><a href="#refuse">Click Here</a> to Reject All non-essential cookies.</p><button>Accept all</button></section>', true, true],
  ["inline link cannot borrow a sibling link", '<section role="dialog" aria-label="Cookies"><p>We use cookies for analytics.</p><p><a href="#refuse">Click Here</a><a href="/privacy">Learn how to Reject All non-essential cookies.</a></p><button>Accept all</button></section>', true, false],
  ["Motorola inline div with earlier policy links", '<section role="dialog" aria-label="Cookie notice banner"><div>We use cookies and similar technologies to personalize content and ads. View the <a href="/privacy">Privacy Statement</a>. Visit our <a href="/preferences">Cookie Consent Tool</a> to manage your preferences. <a href="#refuse">Click Here</a> to Reject All non-essential cookies.</div></section>', false, true],
  ["hidden adjacent meaning cannot bind a link", '<section role="dialog" aria-label="Cookies"><p>We use cookies for analytics.</p><p><a href="#refuse">Click Here</a><span hidden> to Reject All non-essential cookies.</span></p><button>Accept all</button></section>', true, false],
  ["notification heading cannot bind an input", '<section role="dialog"><h3>Notification settings</h3><input type="submit" value="Povolit vše"></section>', false, false],
  ["Adecco explicit necessary-only instruction", '<section role="dialog"><p>We use cookies. By clicking “Strictly Necessary” you only agree to the storing of strictly necessary cookies on your device. No other cookies will be used.</p><button>STRICTLY NECESSARY</button><button>Accept All</button></section>', true, true],
  ["Sodexo explicit refusal instruction", '<section role="dialog"><p>We use cookies. You are free to refuse them by clicking "essential cookies" without consequence on your access to the site.</p><button>Essential Cookies</button><button>Accept All Cookies</button></section>', true, true],
  ["necessary category heading is not refusal", '<section role="dialog"><p>We use cookies. Essential cookies are always active.</p><button>Essential Cookies</button><button>Accept All Cookies</button></section>', true, false],
] as const) {
  test(`retained audit browser extraction: ${name}`, async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      const rapid = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 2000);
      assert.equal(rapid.acceptControlObserved, accept, JSON.stringify(rapid.controls));
      assert.equal(rapid.rejectControlObserved, reject, JSON.stringify(rapid.controls));
      const geometry = await captureConsentControlGeometry(page, { timeoutMs: 2000 });
      assert.equal(geometry.summary.firstLayerAccept, accept, JSON.stringify(geometry.candidates));
      assert.equal(geometry.summary.firstLayerReject, reject, JSON.stringify(geometry.candidates));
      if (name === "single inline refusal paragraph") {
        assert.equal(rapid.controls.find(c => c.label === "Click Here")?.labelBinding?.text,
          "Click Here to Reject All non-essential cookies.");
        const control = geometry.candidates.find(c => c.label === "Click Here");
        assert.equal(control?.labelBinding?.version, "adjacent_text_node.v1");
        assert.equal(control?.labelBinding?.text, "Click Here to Reject All non-essential cookies.");
      }
    } finally { await page.close(); }
  });
}

for (const [name, style, expected] of [
  ["Nomura one-pixel frame", "height:1px", false],
  ["hidden frame", "height:200px;display:none", false],
  ["visible frame", "height:200px", true],
] as const) {
  test(`child-frame visibility: ${name}`, async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<iframe style="width:600px;${style}" srcdoc="<section><p>We use cookies to support your experience.</p><button style='position:absolute;top:20px'>ACCEPT</button></section>"></iframe>`);
      await page.frames()[1]!.waitForLoadState();
      const result = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 2000);
      assert.equal(result.acceptControlObserved, expected, JSON.stringify(result.controls));
    } finally { await page.close(); }
  });
}
