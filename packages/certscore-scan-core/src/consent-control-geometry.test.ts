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
  assert.equal(
    artifact.candidates.find((candidate) => candidate.ariaLabel?.startsWith("Cookie settings"))?.presentationType,
    "dedicated_button",
  );
});

test("captures inline Cookie Consent Tool anchors with reduced prominence", async () => {
  const artifact = await captureFixture(`
    <section id="cookie-banner" role="dialog" aria-label="Cookie consent" style="position: fixed; left: 0; top: 0; width: 1000px; padding: 24px; background: black; color: white;">
      <p>
        We use cookies and other technologies. To make choices regarding specific cookies,
        access our <a href="#cookie-consent-tool" style="color: #20bff3;">Cookie Consent Tool</a>.
      </p>
      <button type="button">Reject all non-essential cookies</button>
      <button type="button">Accept all cookies</button>
    </section>
  `);

  const options = findCandidate(artifact, "Cookie Consent Tool");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.decisionStatus, "confirmed_visible");
  assert.equal(options?.presentationType, "inline_link");
  assert.equal(options?.placementType, "first_layer_body");
  assert.equal(options?.layer, "first_layer");
  assert.equal(artifact.summary.firstLayerOptions, true);
});

test("classifies an inline preferences link beside accept and reject as part of the action cluster", async () => {
  const artifact = await captureFixture(`
    <section id="cookie-banner" role="dialog" aria-label="Cookies und Werbeoptionen" style="position: fixed; left: 0; top: 0; width: 1000px; padding: 24px; background: white;">
      <p>Wir verwenden Cookies, um Dienste bereitzustellen und Werbung zu personalisieren.</p>
      <div style="display: flex; align-items: center; gap: 12px;">
        <button type="button">Akzeptieren</button>
        <button type="button">Ablehnen</button>
        <a href="#personalisieren">Personalisieren</a>
      </div>
    </section>
  `);

  const options = findCandidate(artifact, "Personalisieren");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.presentationType, "inline_link");
  assert.equal(options?.placementType, "action_cluster");
  assert.ok(options?.reasons.includes("inline_options_link_grouped_with_first_layer_accept_and_reject"));
});

test("classifies sibling-wrapped inline preferences as one retained consent action cluster", async () => {
  const artifact = await captureFixture(`
    <section id="cookie-banner" role="dialog" aria-label="Cookies and advertising choices" style="position: fixed; left: 0; top: 0; width: 1000px; padding: 24px; background: white;">
      <p>We use cookies to provide services and personalize advertising.</p>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div id="accept-cookie-action"><button type="button">Accept</button></div>
        <div id="decline-cookie-action"><button type="button">Decline</button></div>
        <div id="customise-cookie-action"><a href="#customise">Customise</a></div>
      </div>
    </section>
  `);

  const accept = findCandidate(artifact, "Accept");
  const reject = findCandidate(artifact, "Decline");
  const options = findCandidate(artifact, "Customise");
  assert.notEqual(options?.containerId, accept?.containerId);
  assert.notEqual(options?.containerId, reject?.containerId);
  assert.equal(options?.placementType, "action_cluster");
  assert.ok(options?.reasons.includes("inline_options_link_grouped_with_first_layer_accept_and_reject"));
});

test("reconciles Amazon-style visual labels with transparent actionable inputs before clustering", async () => {
  const artifact = await captureFixture(`
    <style>
      #cookie-banner { position: fixed; left: 0; bottom: 0; width: 1000px; padding: 24px; background: white; }
      .action-row { display: flex; align-items: center; gap: 8px; }
      .a-button { position: relative; display: inline-block; }
      .a-button input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .01; z-index: 20; }
      .a-button-text { display: block; padding: 8px 12px; }
    </style>
    <section id="cookie-banner" role="dialog" aria-label="Cookies and Advertising Choices">
      <p>We use cookies to provide services and personalize advertising.</p>
      <div class="action-row">
        <span class="a-button">
          <input id="accept-control" type="submit" value="Accept" aria-label="Accept">
          <span id="accept-label" class="a-button-text">Accept</span>
        </span>
        <span class="a-button">
          <input id="decline-control" type="submit" value="Decline" aria-label="Decline">
          <span id="decline-label" class="a-button-text">Decline</span>
        </span>
        <a id="customise-control" href="#customise">Customise</a>
      </div>
    </section>
  `);

  const acceptLabel = artifact.candidates.find((candidate) => candidate.selectorHint === "#accept-label");
  const declineLabel = artifact.candidates.find((candidate) => candidate.selectorHint === "#decline-label");
  const options = artifact.candidates.find((candidate) => candidate.selectorHint === "#customise-control");
  assert.equal(acceptLabel?.decisionStatus, "confirmed_visible");
  assert.equal(acceptLabel?.effectiveVisibility, "visible_via_actionable_proxy");
  assert.equal(declineLabel?.decisionStatus, "confirmed_visible");
  assert.equal(declineLabel?.effectiveVisibility, "visible_via_actionable_proxy");
  assert.equal(options?.placementType, "action_cluster");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(
    artifact.summary.limitations.some((limitation) =>
      limitation === "accept_all:Accept:hidden" || limitation === "reject_all:Decline:hidden"
    ),
    false,
  );
});

test("does not promote non-actionable inline preference text into control evidence", async () => {
  const artifact = await captureFixture(`
    <section id="cookie-banner" role="dialog" aria-label="Cookie consent" style="position: fixed; left: 0; top: 0; width: 1000px; padding: 24px; background: white;">
      <p>Cookie Consent Tool</p>
      <button type="button">Reject all cookies</button>
      <button type="button">Accept all cookies</button>
    </section>
  `);

  assert.equal(findCandidate(artifact, "Cookie Consent Tool"), undefined);
  assert.equal(artifact.summary.firstLayerOptions, false);
});

test("retains footer cookie settings anchors as persistent links, not first-layer controls", async () => {
  const artifact = await captureFixture(`
    <main style="height: 900px;"><h1>Example</h1></main>
    <footer style="padding: 24px;">
      <a href="#cookie-settings">Cookie Settings</a>
    </footer>
  `);

  const options = findCandidate(artifact, "Cookie Settings");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.presentationType, "persistent_link");
  assert.equal(options?.placementType, "persistent_surface");
  assert.equal(options?.layer, "footer");
  assert.equal(artifact.summary.firstLayerOptions, false);
});

test("uses the rendered label when aria-label is a localization token", async () => {
  const artifact = await captureFixture(`
    <section role="dialog" aria-modal="true" aria-label="Cookie settings" style="position: fixed; left: 80px; top: 80px; width: 560px; padding: 24px; background: white;">
      <p>We use cookies and similar technologies.</p>
      <button id="reject" aria-label="BUTTONS.REJECT">Decline optional cookies</button>
    </section>
  `);

  const reject = findCandidate(artifact, "Decline optional cookies");
  assert.equal(reject?.ariaLabel, "BUTTONS.REJECT");
  assert.equal(reject?.actionType, "reject_all");
  assert.equal(reject?.decisionStatus, "confirmed_visible");
});

test("resolves aria-labelledby names when a control has no rendered text", async () => {
  const artifact = await captureFixture(`
    <section role="dialog" aria-modal="true" aria-label="Cookie settings" style="position: fixed; left: 80px; top: 80px; width: 560px; padding: 24px; background: white;">
      <p>We use cookies and similar technologies.</p>
      <span id="reject-label">Reject optional cookies</span>
      <button id="reject" aria-labelledby="reject-label"></button>
    </section>
  `);

  const reject = findCandidate(artifact, "Reject optional cookies");
  assert.equal(reject?.actionType, "reject_all");
  assert.equal(reject?.decisionStatus, "confirmed_visible");
});

test("omits composite consent wrappers while retaining their actionable descendants", async () => {
  const artifact = await captureFixture(`
    <section role="dialog" aria-modal="true" aria-label="Cookie settings" style="position: fixed; left: 80px; top: 80px; width: 560px; padding: 24px; background: white;">
      <p>We use cookies and similar technologies.</p>
      <div class="button-row">
        <button type="button">Accept all cookies</button>
        <button type="button">Decline optional cookies</button>
      </div>
    </section>
  `);

  assert.equal(artifact.candidates.some((candidate) => candidate.label === "Accept all cookies Decline optional cookies"), false);
  assert.equal(findCandidate(artifact, "Accept all cookies")?.actionType, "accept_all");
  assert.equal(findCandidate(artifact, "Decline optional cookies")?.actionType, "reject_all");
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

test("captures OneTrust optional-cookie noun-phrase controls as first-layer accept and reject", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
    <div id="onetrust-consent-sdk">
      <section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie settings" style="position: fixed; left: 80px; top: 80px; width: 560px; padding: 24px; background: white;">
        <p>We use cookies to provide necessary site functions and optional cookies for analytics and personalization.</p>
        <div id="onetrust-button-group">
          <button id="onetrust-pc-btn-handler">Manage Cookies</button>
          <button id="onetrust-reject-all-handler">Decline optional cookies</button>
          <button id="onetrust-accept-btn-handler">Accept Optional Cookies</button>
        </div>
      </section>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "OneTrust");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);

  const accept = findCandidate(artifact, "Accept Optional Cookies");
  assert.equal(accept?.actionType, "accept_all");
  assert.equal(accept?.matchedTerm, "accept optional cookies");
  assert.equal(accept?.decisionStatus, "confirmed_visible");

  const reject = findCandidate(artifact, "Decline optional cookies");
  assert.equal(reject?.actionType, "reject_all");
  assert.equal(reject?.matchedTerm, "decline optional cookies");
  assert.equal(reject?.decisionStatus, "confirmed_visible");
});

test("retains Polish consent controls as production geometry evidence", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"></script>
    <div id="cmpbox" class="cmpbox cmpboxWelcomeGDPR" role="dialog" aria-modal="true" style="position: fixed; left: 100px; top: 100px; width: 560px; padding: 24px; background: white;">
      <h1>Dbamy o Twoją prywatność</h1>
      <p>Używamy plików cookie i prosimy o zgodę na personalizację reklam oraz pomiar statystyk.</p>
      <button type="button">USTAWIENIA ZAAWANSOWANE</button>
      <button type="button">Przejdź do serwisu</button>
      <button type="button">AKCEPTUJĘ</button>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, true);

  const accept = findCandidate(artifact, "AKCEPTUJĘ");
  assert.equal(accept?.actionType, "accept_all");
  assert.equal(accept?.matchedLocale, "pl");
  assert.equal(accept?.decisionStatus, "confirmed_visible");

  const options = findCandidate(artifact, "USTAWIENIA ZAAWANSOWANE");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.matchedLocale, "pl");

  const continueToService = findCandidate(artifact, "Przejdź do serwisu");
  assert.equal(continueToService?.actionType, "accept_all");
  assert.equal(continueToService?.matchedLocale, "pl");
  assert.equal(continueToService?.matchStrength, "contextual");
});

test("does not treat generic Dutch settings page chrome as diagnostic consent evidence", async () => {
  const artifact = await captureFixture(`
    <header style="height: 56px; display: flex; gap: 16px; align-items: center;">
      <span>Cookiebeleid en privacy informatie</span>
      <button type="button" aria-label="Zoeken Instellingen Teletekst NPO Start">Instellingen</button>
    </header>
    <main>
      <h1>NOS Nieuws</h1>
      <p>Laatste nieuws, sport en evenementen.</p>
    </main>
    <footer style="margin-top: 1200px;">
      <a href="/privacy">Privacy</a>
      <a href="/cookiebeleid">Cookiebeleid</a>
    </footer>
  `);

  const settingsCandidates = artifact.candidates.filter((candidate) =>
    candidate.label.includes("Instellingen")
  );
  assert.equal(settingsCandidates.some((candidate) => (candidate.diagnosticClassifications?.length ?? 0) > 0), false);
});

test("captures contextual Dutch self-configuration as a first-layer options control", async () => {
  const artifact = await captureFixture(`
    <form id="cookie-banner" role="dialog" style="position: fixed; left: 330px; top: 150px; width: 660px; padding: 24px; background: white;">
      <h1>Cookies</h1>
      <p>Wij gebruiken cookies. Hieronder kun je aangeven of je alles accepteert, weigert of je cookies zelf instelt.</p>
      <button type="submit">Alles accepteren</button>
      <button type="submit">Zelf instellen</button>
    </form>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  const options = findCandidate(artifact, "Zelf instellen");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.matchedLocale, "nl");
  assert.equal(options?.decisionStatus, "confirmed_visible");
});

test("retains Polish long-form consent buttons as production geometry evidence", async () => {
  const artifact = await captureFixture(`
    <script src="https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"></script>
    <div id="rasp_cmp" role="dialog" aria-label="Plansza RODO" style="position: fixed; left: 208px; top: 175px; width: 950px; height: 550px; display: flex; flex-direction: column; padding: 24px; background: white;">
      <div class="cmp-intro_description" style="overflow: auto; height: 350px;">
        <p>Szanowna Użytkowniczko, Szanowny Użytkowniku, zanim klikniesz którykolwiek przycisk prosimy o przeczytanie do końca tej informacji - dotyczy ona Twoich danych osobowych.</p>
        <p>Klikając "Przejdź do serwisu" udzielasz zgody na przetwarzanie Twoich danych osobowych dotyczących Twojej aktywności w Internecie, identyfikatorów urządzenia oraz plików cookie.</p>
        <p>Zgoda jest dobrowolna. Możesz jej odmówić lub ograniczyć jej zakres klikając w "Ustawienia zaawansowane".</p>
        <p>Informacje o celach przetwarzania danych znajdziesz w ustawieniach zaawansowanych, a szczegółową informację o przetwarzaniu danych znajdziesz w polityce prywatności.</p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px;">
        <button type="button" aria-label="Ustawienia zaawansowane">USTAWIENIA ZAAWANSOWANE</button>
        <button type="button" aria-label="Przejdź do serwisu">PRZEJDŹ DO SERWISU</button>
      </div>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, true);

  const options = findCandidate(artifact, "Ustawienia zaawansowane");
  assert.equal(options?.actionType, "manage_preferences");
  assert.equal(options?.matchedLocale, "pl");

  const continueToService = findCandidate(artifact, "Przejdź do serwisu");
  assert.equal(continueToService?.actionType, "accept_all");
  assert.equal(continueToService?.matchedLocale, "pl");
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
  assert.ok(artifact.summary.limitations.includes("cmp_detected_without_visible_first_layer_controls"));
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

test("captures Dailymotion-style Personalise as a first-layer options control", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" aria-label="Data privacy at Dailymotion" style="position: fixed; left: 440px; top: 200px; width: 480px; padding: 32px; background: white;">
      <h1>Data privacy at Dailymotion</h1>
      <p>We and our Partners may use cookies and process personal data for personalised advertising and content measurement.</p>
      <button>Accept</button>
      <button>Personalise</button>
      <button>Continue without accepting</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Personalise")?.actionType, "manage_preferences");
  assert.equal(findCandidate(artifact, "Personalise")?.decisionStatus, "confirmed_visible");
});

test("does not count contextual options words in static banner text as first-layer options", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 260px; top: 160px; width: 620px; padding: 24px; background: white;">
      <h1>Your privacy choices</h1>
      <p tabindex="0">We use cookies and similar technologies to personalise your experience and measure advertising.</p>
      <button>Accept all</button>
      <button>Reject all</button>
    </div>
  `);

  const staticTextCandidate = artifact.candidates.find((candidate) =>
    candidate.tagName === "p" && candidate.label.includes("personalise your experience")
  );
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, false);
  assert.equal(staticTextCandidate, undefined);
});

test("captures Microsoft-style Manage cookies as a first-layer options control", async () => {
  const artifact = await captureFixture(`
    <div style="position: fixed; left: 0; top: 0; right: 0; padding: 20px; background: white;">
      <p>We use optional cookies to improve your experience and display personalized advertising. You may change your selection by clicking Manage Cookies.</p>
      <button>Accept</button>
      <button>Reject</button>
      <button>Manage cookies</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Manage cookies")?.actionType, "manage_preferences");
  assert.equal(findCandidate(artifact, "Manage cookies")?.decisionStatus, "confirmed_visible");
});

test("captures BMW-style Customise as a first-layer options control", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 200px; bottom: 24px; width: 620px; padding: 20px; background: white;">
      <p>We use cookies, including third-party cookies, for analytical purposes and to show you personalised advertising based on your browsing habits.</p>
      <button>Customise</button>
      <button>Reject</button>
      <button>Accept all</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Customise")?.actionType, "manage_preferences");
  assert.equal(findCandidate(artifact, "Customise")?.decisionStatus, "confirmed_visible");
});

test("captures Italian first-layer accept, reject, and options controls", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 120px; top: 120px; width: 620px; padding: 20px; background: white;">
      <p>Usiamo cookie e tecnologie simili per finalita pubblicitarie e per il tracciamento. Puoi gestire le preferenze.</p>
      <button>Accetta</button>
      <button>Rifiuta</button>
      <button>Gestisci preferenze</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accetta")?.actionType, "accept_all");
  assert.equal(findCandidate(artifact, "Rifiuta")?.actionType, "reject_all");
  assert.equal(findCandidate(artifact, "Gestisci preferenze")?.actionType, "manage_preferences");
});

test("does not treat an Italian paid reject-and-subscribe alternative as free reject", async () => {
  const artifact = await captureFixture(`
    <section role="dialog" aria-modal="true" aria-label="Scelte cookie" style="position: fixed; inset: 60px; padding: 24px; background: white;">
      <p>Puoi acconsentire, gestire le preferenze oppure rifiutare sottoscrivendo un abbonamento.</p>
      <button>Accetta e continua</button>
      <button>Preferenze</button>
      <a href="/abbonati">Rifiuta e abbonati</a>
    </section>
  `);

  assert.equal(findCandidate(artifact, "Accetta e continua")?.actionType, "accept_all");
  assert.equal(findCandidate(artifact, "Preferenze")?.actionType, "manage_preferences");
  assert.equal(findCandidate(artifact, "Rifiuta e abbonati")?.actionType, "other");
  assert.equal(artifact.summary.firstLayerReject, false);
});

test("retains Reject and Pay as a payment-conditioned decline rather than free reject", async () => {
  const artifact = await captureFixture(`
    <section role="dialog" aria-modal="true" aria-label="Privacy choices" style="position: fixed; inset: 60px; padding: 24px; background: white;">
      <p>We use cookies and personal data for personalised advertising. You may accept, manage your choices, or reject and pay for access.</p>
      <button>I Accept</button>
      <button>More Options</button>
      <button>Reject and Pay</button>
    </section>
  `);

  const paidDecline = findCandidate(artifact, "Reject and Pay");
  assert.equal(paidDecline?.actionType, "other");
  assert.ok(paidDecline?.classifierReasonCodes.includes("variant_reject_with_payment"));
  assert.equal(paidDecline?.decisionStatus, "confirmed_visible");
  assert.equal(artifact.summary.firstLayerReject, false);
});

test("captures Spanish Didomi pay-or-consent controls rendered as styled elements", async () => {
  const artifact = await captureFixture(`
    <script src="https://sdk.privacy-center.org/loader.js"></script>
    <div id="didomi-host">
      <section
        role="dialog"
        aria-label="Panel de consentimiento de Didomi"
        style="position: fixed; left: 120px; top: 90px; width: 720px; padding: 24px; background: white;"
      >
        <p>Usamos cookies y datos personales para publicidad personalizada, medición y contenido. Puedes configurar cookies o continuar con publicidad.</p>
        <div class="didomi-components-button didomi-button-highlight didomi-accept" tabindex="0">Aceptar y continuar</div>
        <div class="didomi-components-button didomi-button-standard didomi-reject" tabindex="0">Rechazar y pagar</div>
        <div class="didomi-components-button didomi-button-standard didomi-preferences" tabindex="0">Configurar cookies</div>
      </section>
    </div>
  `);

  assert.equal(artifact.summary.cmpDetected, true);
  assert.equal(artifact.summary.cmpName, "Didomi");
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Aceptar y continuar")?.actionType, "accept_all");
  assert.equal(findCandidate(artifact, "Aceptar y continuar")?.decisionStatus, "confirmed_visible");
  assert.equal(findCandidate(artifact, "Rechazar y pagar")?.actionType, "reject_all");
  assert.equal(findCandidate(artifact, "Configurar cookies")?.actionType, "manage_preferences");
});

test("captures production consent controls across CJK, RTL, Nordic, Cyrillic, and Indic scripts", async () => {
  const fixtures = [
    { locale: "ja", context: "クッキーと個人情報の利用について同意を選択してください。", accept: "すべて同意する", reject: "すべて拒否する", options: "クッキー設定" },
    { locale: "ar", context: "نستخدم ملفات تعريف الارتباط ونطلب الموافقة لحماية الخصوصية.", accept: "قبول الكل", reject: "رفض الكل", options: "إعدادات ملفات تعريف الارتباط" },
    { locale: "fi", context: "Käytämme evästeitä ja pyydämme suostumusta tietosuojaa varten.", accept: "Hyväksy kaikki", reject: "Hylkää kaikki", options: "Evästeasetukset" },
    { locale: "ru", context: "Мы используем файлы cookie и запрашиваем согласие на обработку персональных данных.", accept: "Принять все", reject: "Отклонить все", options: "Настройки файлов cookie" },
    { locale: "hi", context: "हम गोपनीयता और सहमति के लिए कुकी का उपयोग करते हैं।", accept: "सभी स्वीकार करें", reject: "सभी अस्वीकार करें", options: "कुकी सेटिंग्स" },
  ] as const;

  for (const fixture of fixtures) {
    const artifact = await captureFixture(`
      <div role="dialog" aria-label="cookie consent" style="position: fixed; left: 100px; top: 100px; width: 620px; padding: 24px; background: white;">
        <p>${fixture.context}</p>
        <button type="button">${fixture.options}</button>
        <button type="button">${fixture.reject}</button>
        <button type="button">${fixture.accept}</button>
      </div>
    `);
    assert.equal(artifact.summary.firstLayerAccept, true, `${fixture.locale} accept`);
    assert.equal(artifact.summary.firstLayerReject, true, `${fixture.locale} reject`);
    assert.equal(artifact.summary.firstLayerOptions, true, `${fixture.locale} options`);
    assert.equal(findCandidate(artifact, fixture.accept)?.matchedLocale, fixture.locale);
    assert.equal(findCandidate(artifact, fixture.reject)?.matchedLocale, fixture.locale);
    assert.equal(findCandidate(artifact, fixture.options)?.matchedLocale, fixture.locale);
  }
});

test("does not count Utiq-scoped refusal as first-layer cookie reject", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 120px; top: 80px; width: 760px; padding: 20px; background: white;">
      <h1>Datenschutz und Nutzungserlebnis</h1>
      <p>Mit Tracking und Cookies nutzen. Utiq wird für Werbe- und Analysezwecke eingesetzt.</p>
      <button>ALLE AKZEPTIEREN</button>
      <button>EINSTELLUNGEN</button>
      <a href="/utiq-opt-out">für Utiq jetzt ablehnen</a>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(findCandidate(artifact, "für Utiq jetzt ablehnen")?.actionType, "do_not_sell_share");
});

test("captures duplicated accessible names on first-layer consent buttons", async () => {
  const artifact = await captureFixture(`
    <div role="dialog" style="position: fixed; left: 120px; top: 120px; width: 620px; padding: 20px; background: white;">
      <p>Your personal data, your options, our responsibility. We and our partners use cookies to store information and personalize advertising.</p>
      <button aria-label="Accept">Accept</button>
      <button aria-label="Deny">Deny</button>
      <button aria-label="Customize">Customize</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accept")?.actionType, "accept_all");
  assert.equal(findCandidate(artifact, "Deny")?.actionType, "reject_all");
  assert.equal(findCandidate(artifact, "Customize")?.actionType, "manage_preferences");
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
              <button>Reject all</button>
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

test("prioritizes known CMP frames when the page contains many unrelated iframes", async () => {
  assert.ok(browser, "browser not initialized");
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.route("**/*", async (route) => {
    if (route.request().url() === "https://cdn.cookielaw.org/cmp-frame.html") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div id="onetrust-consent-sdk"><section id="onetrust-banner-sdk" role="dialog" style="position:fixed;inset:0;background:white">
            <p>We use cookies and similar technologies.</p>
            <button>Accept all</button><button>Reject all</button><button>Cookie settings</button>
          </section></div>
        </body></html>`,
      });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  try {
    const unrelatedFrames = Array.from({ length: 14 }, (_, index) =>
      `<iframe src="https://unrelated.example.test/frame-${index}.html"></iframe>`,
    ).join("");
    await page.setContent(`<!doctype html><html><body>${unrelatedFrames}<iframe src="https://cdn.cookielaw.org/cmp-frame.html"></iframe></body></html>`);
    await page.waitForTimeout(100);
    const artifact = await captureConsentControlGeometry(page);
    assert.equal(artifact.summary.cmpName, "OneTrust");
    assert.equal(artifact.summary.firstLayerAccept, true);
    assert.equal(artifact.summary.firstLayerReject, true);
    assert.equal(artifact.summary.firstLayerOptions, true);
  } finally {
    await page.close();
  }
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

test("classifies deeply nested Borlabs modal controls as first-layer", async () => {
  const wrappers = Array.from({ length: 12 }, () => "<div class=\"brlbs-wrapper\">").join("");
  const closers = "</div>".repeat(12);
  const artifact = await captureFixture(`
    <div id="BorlabsCookieBox" data-borlabs-cookie-consent-required="true">
      ${wrappers}
        <div style="position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.5)">
          <section role="alertdialog" aria-modal="true" aria-label="Data protection preference"
            style="position:absolute;left:360px;top:180px;width:620px;padding:24px;background:white">
            <p>We need your consent to use cookies for analytics and advertising.</p>
            <button>Accept all</button>
            <button>Accept essential cookies</button>
            <button>Individual preferences</button>
          </section>
        </div>
      ${closers}
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Accept all")?.layer, "first_layer");
  assert.equal(findCandidate(artifact, "Accept essential cookies")?.layer, "first_layer");
  assert.equal(findCandidate(artifact, "Individual preferences")?.layer, "first_layer");
});

test("reconciles a confirmed Borlabs control cluster when its outer container is mislayered", async () => {
  const artifact = await captureFixture(`
    <style>
      #BorlabsCookieBox { position: absolute; top: 862px; left: 20px; width: 1200px; height: 34px; }
      #BorlabsCookieBox button { height: 28px; margin-right: 12px; }
    </style>
    <div id="BorlabsCookieBox" data-borlabs-cookie-consent-required="true">
      <span>Cookie consent and privacy preferences</span>
      <button>Accept all</button>
      <button>Accept essential cookies</button>
      <button>Individual preferences</button>
    </div>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(
    findCandidate(artifact, "Accept all")?.reasons.includes(
      "first_layer_reconciled_from_confirmed_modal_control_cluster",
    ),
    true,
  );
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

test("retains consent controls when an unrelated modal is visible at the same time", async () => {
  const artifact = await captureFixture(`
    <style>
      .account-modal {
        position: fixed;
        left: 420px;
        top: 80px;
        width: 520px;
        padding: 24px;
        background: white;
        z-index: 20;
      }
      .cookie-banner {
        position: fixed;
        left: 24px;
        right: 24px;
        bottom: 24px;
        padding: 20px;
        background: #f8f8f8;
        z-index: 30;
      }
      .cookie-banner button { margin-right: 12px; }
    </style>
    <section class="account-modal" role="dialog" aria-label="Sign in">
      <h2>Member sign in</h2>
      <button>Continue with email</button>
    </section>
    <section class="cookie-banner" role="dialog" aria-label="Cookie consent">
      <p>We use cookies for analytics and advertising. Choose your cookie preferences.</p>
      <button>Manage preferences</button>
      <button>Reject all non-required</button>
      <button>Accept all</button>
    </section>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, true);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Continue with email")?.actionType, "other");
});

test("captures Show Purposes as contextual first-layer options", async () => {
  const artifact = await captureFixture(`
    <section
      role="dialog"
      aria-label="Cookie consent"
      style="position: fixed; left: 180px; top: 120px; width: 720px; padding: 24px; background: white;"
    >
      <p>We and our partners use cookies and personal data for advertising purposes.</p>
      <button>Agree</button>
      <button>Show Purposes</button>
    </section>
  `);

  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.summary.firstLayerReject, false);
  assert.equal(artifact.summary.firstLayerOptions, true);
  assert.equal(findCandidate(artifact, "Show Purposes")?.actionType, "manage_preferences");
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
