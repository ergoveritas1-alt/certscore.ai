import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";

let browser: Browser | undefined;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

test("captures IKEA-style OneTrust first-layer accept, reject, and options controls", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
    <style>
      #onetrust-banner-sdk { position: fixed; left: 20px; bottom: 20px; width: 420px; padding: 20px; background: #fbf8f3; }
      #onetrust-button-group button { display: block; width: 100%; margin-top: 8px; }
    </style>
    <div id="onetrust-consent-sdk">
      <section id="onetrust-banner-sdk" role="dialog" aria-label="Hej! You are in control of your cookies.">
        <h2>Hej! You are in control of your cookies.</h2>
        <p>We use cookies. Change your settings or withdraw consent in cookie settings.</p>
        <div id="onetrust-button-group-parent" class="has-reject-all-button">
          <div id="onetrust-button-group">
            <button id="onetrust-accept-btn-handler">Accept</button>
            <button id="onetrust-reject-all-handler">Reject</button>
            <button id="onetrust-pc-btn-handler" aria-label="Cookie settings, Opens the preference center dialog">Cookie settings</button>
          </div>
        </div>
      </section>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "OneTrust");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(
    artifact.candidates.find((candidate) => candidate.ariaLabel?.startsWith("Cookie settings"))?.decisionStatus,
    "confirmed_visible",
  );
});

test("captures Air France-style DOM-present options as clipped rather than first-layer visible", async () => {
  const artifact = await captureFixture(`
    <style>
      #bw-cookie-banner { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.4); }
      #bw-cookie-banner-container { width: 560px; max-height: 360px; overflow: hidden; background: white; }
      .bw-cookie-banner__content { height: 190px; overflow-y: auto; padding: 16px; }
      .spacer { height: 210px; }
      .bw-cookie-banner__button-wrapper { padding: 12px; text-align: right; position: relative; z-index: 2; background: white; }
    </style>
    <div id="bw-cookie-banner" class="bw-cookie-banner-af">
      <div id="bw-cookie-banner-container" role="dialog" aria-label="Air France utilise des cookies">
        <h2>AIR FRANCE UTILISE DES COOKIES</h2>
        <div class="bw-cookie-banner__content">
          <p>Air France utilise des cookies fonctionnels et analytiques. En cliquant sur Accepter, vous consentez. Si vous cliquez sur Refuser, nous n'utiliserons aucun cookie marketing.</p>
          <div class="spacer"></div>
          <button id="change_cookie_settings_btn-link" type="button">Modifier les paramètres des cookies</button>
        </div>
        <div class="bw-cookie-banner__button-wrapper">
          <button id="decline_cookies_btn" type="button">Refuser</button>
          <button id="accept_cookies_btn" type="button">Accepter</button>
        </div>
      </div>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, false);
  const options = findCandidate(artifact, "Modifier les paramètres des cookies");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.decisionStatus, "clipped");
  assert.equal(options?.clippedByScrollableAncestor, true);
});

test("captures Numa-style consentmanager settings and accept without reject", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"></script>
    <div id="cmpbox" class="cmpbox cmpboxWelcomeGDPR" role="dialog" aria-modal="true" style="position: fixed; left: 100px; top: 100px; width: 520px; padding: 24px; background: white;">
      <h1>Datenschutzeinstellungen</h1>
      <p>Wir nutzen Dienste von Drittanbietern und Cookies. Durch Klicken auf Akzeptieren stimmen Sie zu.</p>
      <a class="cmpboxbtn cmpboxbtncustom" role="button" href="#"><span>Einstellungen</span></a>
      <a class="cmpboxbtn cmpboxbtnyes" role="button" href="#"><span>Akzeptieren</span></a>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "Consentmanager");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, true);
});

test("keeps NBC-style hidden OneTrust preference center from counting as first-layer controls", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.cookielaw.org/consent/bf1dbc48/otSDKStub.js"></script>
    <style>.ot-hide { display: none !important; }</style>
    <main><h1>NBC News</h1><a href="/privacy">YOUR PRIVACY CHOICES</a></main>
    <div id="onetrust-consent-sdk">
      <div id="onetrust-pc-sdk" class="otPcCenter ot-hide" role="region" aria-label="Preference center">
        <h2>Your Privacy Choices: Opt-out of sale or sharing of personal information and opt out of targeted ads</h2>
        <section>
          <h3>Manage Preferences:</h3>
          <button class="save-preference-btn-handler">Confirm My Choice</button>
        </section>
      </div>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "OneTrust");
  assert.equal(artifact.summary.firstLayerAccept, false);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, false);
  assert.ok(artifact.candidates.some((candidate) => candidate.decisionStatus === "hidden" || candidate.decisionStatus === "deeper_layer"));
});

test("classifies NBC-style visible Continue button as first-layer accept when consent-by-use text is present", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
    <div id="onetrust-consent-sdk">
      <div id="onetrust-banner-sdk" role="dialog" aria-label="Privacy" style="position: fixed; left: 0; right: 0; bottom: 0; padding: 20px; background: white;">
        <p id="onetrust-policy-text">We and our partners use cookies on this site. By using the site, you consent to these cookies. For more information visit our Cookie Policy.</p>
        <div id="onetrust-button-group">
          <button id="onetrust-accept-btn-handler">Continue</button>
        </div>
      </div>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, false);
  const continueButton = findCandidate(artifact, "Continue");
  assert.equal(continueButton?.actionType, "accept_all");
  assert.equal(continueButton?.decisionStatus, "confirmed_visible");
});

test("captures Ci Media Cloud-style OneTrust accept, reject, and manage controls", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
    <div id="onetrust-consent-sdk">
      <div
        id="onetrust-banner-sdk"
        role="dialog"
        aria-label="Cookie banner"
        style="position: fixed; left: 16px; bottom: 20px; width: 360px; padding: 24px; background: white;"
      >
        <p>By clicking "Accept All," you consent to the use of cookies, tags, pixels, social media plug-ins, and similar technologies. You may block some Cookies by clicking "Decline Non-Essential Cookies" or change your preferences by clicking "Manage Cookies".</p>
        <button id="onetrust-accept-btn-handler">Accept All</button>
        <button id="onetrust-reject-all-handler">Decline Non-Essential Cookies</button>
        <button id="onetrust-pc-btn-handler" aria-label="Manage Cookies, Opens the preference center dialog">Manage Cookies</button>
      </div>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "OneTrust");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
});

test("captures visible first-layer controls inside a bounded iframe", async () => {
  const artifact = await captureFixture(`
    <iframe
      style="position: fixed; inset: 0; width: 100%; height: 100%; border: 0;"
      srcdoc='
        <!doctype html>
        <html>
          <body>
            <div id="guardian-consent" role="dialog" style="position: fixed; left: 200px; top: 80px; width: 560px; padding: 20px; background: white;">
              <h1>Personalised advertising - it&apos;s your choice</h1>
              <p>We use cookies and similar technologies. Please choose an option.</p>
              <button>Accept all</button>
              <button>Reject all and subscribe</button>
            </div>
          </body>
        </html>
      '
    ></iframe>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, false);
  assert.equal(findCandidate(artifact, "Accept all")?.frameContext.frameKind, "child_frame");
});

test("does not count French privacy-policy links as first-layer options", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 100px; top: 100px; width: 520px; padding: 20px; background: white;">
      <p>Nous utilisons des cookies pour améliorer votre expérience.</p>
      <a href="/privacy">Politique de confidentialité et de gestion des cookies</a>
      <button>Tout refuser</button>
      <button>Tout accepter</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, false);
  assert.equal(
    findCandidate(artifact, "Politique de confidentialité et de gestion des cookies")?.actionType,
    "policy_link",
  );
});

test("counts footer-nested fixed consent banners as first-layer controls", async () => {
  const artifact = await captureFixture(`
    <main><h1>News page</h1></main>
    <footer>
      <section
        id="fides-banner-container"
        style="position: fixed; left: 0; right: 0; bottom: 0; padding: 20px; background: white;"
      >
        <h2>Manage privacy preferences</h2>
        <p>We and our vendors use cookies and similar methods to personalize advertising and analyze traffic.</p>
        <button>Accept all</button>
        <button>Reject all</button>
        <button>Manage preferences</button>
      </section>
    </footer>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
});

test("does not count footer-only Cookie settings as first-layer options", async () => {
  const artifact = await captureFixture(`
    <main><h1>Ordinary page</h1></main>
    <footer>
      <button>Cookie settings</button>
      <a href="/privacy">Privacy policy</a>
    </footer>
  `);

  assert.equal(artifact.summary.firstLayerOptions, false);
  const footerCandidate = findCandidate(artifact, "Cookie settings");
  assert.equal(footerCandidate?.decisionStatus, "footer_or_policy_link");
});

test("retains hidden DOM buttons as candidates without counting them as visible", async () => {
  const artifact = await captureFixture(`
    <div id="onetrust-banner-sdk" role="dialog" aria-label="Cookie banner" style="position: fixed; bottom: 20px; left: 20px; padding: 20px; background: white;">
      <p>We use cookies.</p>
      <button style="display:none">Reject All</button>
      <button>Accept All</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  const reject = findCandidate(artifact, "Reject All");
  assert.equal(reject?.actionType, "reject_all");
  assert.equal(reject?.decisionStatus, "hidden");
});

test("captures visible consent controls inside open shadow roots", async () => {
  const artifact = await captureFixture(`
    <usercentrics-banner></usercentrics-banner>
    <script>
      const host = document.querySelector("usercentrics-banner");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = \`
        <style>
          #banner { position: fixed; left: 24px; bottom: 24px; width: 720px; padding: 24px; background: white; }
          button { width: 180px; margin-right: 12px; }
        </style>
        <section id="banner" role="dialog" aria-label="We value your privacy">
          <p>We use cookies for analytics and advertising. You can change options under Settings.</p>
          <button>Only technically required</button>
          <button>Settings</button>
          <button>Accept All</button>
        </section>
      \`;
    </script>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Only technically required")?.decisionStatus, "confirmed_visible");
  assert.equal(findCandidate(artifact, "Settings")?.decisionStatus, "confirmed_visible");
});

test("classifies observed Ryanair-style agreement labels as accept", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 300px; top: 180px; width: 620px; padding: 24px; background: white;">
      <p>We use cookies to improve your experience and personalize advertising.</p>
      <button>View cookie settings</button>
      <button>No, thanks</button>
      <button>Yes, I agree</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Yes, I agree")?.actionType, "accept_all");
});

test("captures Le Monde-style clickable div consent controls", async () => {
  const artifact = await captureFixture(`
    <style>
      .gdpr-lmd-wall { position: fixed; left: 260px; top: 80px; width: 760px; padding: 24px; background: white; }
      .gdpr-lmd-button { display: block; width: 240px; margin: 12px auto; padding: 12px; text-align: center; background: #026bff; color: white; cursor: pointer; }
      .gdpr-lmd-wall__refuse-link { display: block; text-align: center; margin-bottom: 16px; }
      .gdpr-lmd-settings { background: transparent; color: #333; }
    </style>
    <div class="gdpr-lmd-wall" role="dialog" aria-label="Cookie consent">
      <a class="gdpr-lmd-wall__refuse-link js-gdpr-deny-subscribe" href="#">Reject all cookies</a>
      <p>We use cookies and partners for personalized advertising and audience measurement.</p>
      <div class="gdpr-lmd-button js-gdpr-accept" tabindex="0">Accept</div>
      <span class="gdpr-lmd-button gdpr-lmd-settings js-gdpr-settings" tabindex="0">Cookie settings</span>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accept")?.actionType, "accept_all");
});

test("retains visible label-only accept buttons without recognized containers", async () => {
  const artifact = await captureFixture(`
    <style>
      .gdpr-lmd-wall { position: fixed; left: 260px; top: 80px; width: 760px; padding: 24px; background: white; }
      .gdpr-lmd-button--main { display: block; width: 240px; margin: 12px auto; padding: 12px; background: #026bff; color: white; }
      .gdpr-lmd-wall__refuse-link { display: block; text-align: center; margin-bottom: 16px; }
    </style>
    <footer>
      <div class="gdpr-lmd-wall">
        <a class="gdpr-lmd-wall__refuse-link js-gdpr-deny-subscribe" href="#">Reject all cookies</a>
        <p>We use cookies and similar technologies to gather information and personalize advertising.</p>
        <button class="gdpr-lmd-button gdpr-lmd-button--big gdpr-lmd-button--main">Accept</button>
        <a class="c-explanation__lmi-settings" href="#">Cookie settings</a>
      </div>
    </footer>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accept")?.decisionStatus, "confirmed_visible");
});

test("prioritizes visible consent buttons over hidden navigation controls before capping candidates", async () => {
  const hiddenLinks = Array.from({ length: 80 }, (_, index) =>
    `<a class="ds-link ds-burger-popin__link" href="#">Management ${index}</a>`
  ).join("");
  const artifact = await captureFixture(`
    <style>
      .ds-burger-popin { display: none; }
      .gdpr-lmd-wall { position: fixed; left: 260px; top: 80px; width: 760px; padding: 24px; background: white; }
      .gdpr-lmd-button--main { display: block; width: 240px; margin: 12px auto; padding: 12px; background: #026bff; color: white; }
      .gdpr-lmd-wall__refuse-link { display: block; text-align: center; margin-bottom: 16px; }
    </style>
    <div class="ds-popin ds-burger-popin" role="dialog" aria-modal="true" aria-label="Main menu">
      ${hiddenLinks}
      <a class="ds-link ds-services-popin__link" role="button" href="#">Cookie preferences</a>
    </div>
    <div class="gdpr-lmd-wall">
      <a class="gdpr-lmd-wall__refuse-link js-gdpr-deny-subscribe" href="#">Reject all cookies</a>
      <p>We use cookies and similar technologies to gather information and personalize advertising.</p>
      <button class="gdpr-lmd-button gdpr-lmd-button--big gdpr-lmd-button--main">Accept</button>
      <a class="c-explanation__lmi-settings" href="#">Cookie settings</a>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accept")?.decisionStatus, "confirmed_visible");
});

async function captureFixture(html: string) {
  assert.ok(browser, "browser not initialized");
  const page = await newPage(browser);
  try {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, {
      waitUntil: "domcontentloaded",
    });
    return await captureConsentControlGeometry(page, {
      screenshotArtifactRef: "fixture-screenshot.png",
    });
  } finally {
    await page.close();
  }
}

async function newPage(browserInstance: Browser): Promise<Page> {
  const page = await browserInstance.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://localhost") || route.request().url().startsWith("about:")) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 204,
      body: "",
    });
  });
  return page;
}

function findCandidate(
  artifact: Awaited<ReturnType<typeof captureConsentControlGeometry>>,
  label: string,
) {
  return artifact.candidates.find((candidate) => candidate.label === label || candidate.ariaLabel === label);
}
