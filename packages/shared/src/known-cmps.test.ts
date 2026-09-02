import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_CMP_REGISTRY,
  detectKnownCmps,
  getKnownCmpActionCapability,
  getKnownCmpVendorForHost,
  getKnownCmpVendorName,
  isKnownCmpCookieName,
  isKnownCmpInfrastructureUrl,
  isKnownCmpVendorLabel
} from "./known-cmps";

test("registry includes first-wave CMP vendors", () => {
  const names = KNOWN_CMP_REGISTRY.map((entry) => entry.canonicalName);
  for (const name of [
    "OneTrust",
    "Fides",
    "TrustArc",
    "Usercentrics",
    "Consentmanager",
    "Cookiebot",
    "CookieYes",
    "Orejime",
    "DSGVO All in One / tarteaucitron",
    "BST DSGVO Cookie notice plugin, non-TCF",
    "Sourcepoint",
    "Didomi",
    "Quantcast Choice",
    "Seznam CMP",
    "Google Funding Choices",
    "Termly",
    "Osano",
    "Iubenda",
    "Cookie Information",
    "Transcend"
  ]) {
    assert.ok(names.includes(name), `${name} should be in the known CMP registry`);
  }
  assert.ok(names.includes("Drupal EU Cookie Compliance module, non-TCF"));
  assert.ok(names.includes("Amazon Privacy Preferences"));
  assert.ok(names.includes("OpenAI first-party consent controls"));
});

test("detects OpenAI first-party consent controls only from retained consent markers", () => {
  assert.equal(getKnownCmpVendorName({ urls: ["https://chatgpt.com/"] }), null);
  assert.equal(
    getKnownCmpVendorName({ domSelectors: ["div[class*='_bannerActions']"] }),
    "OpenAI first-party consent controls",
  );
  assert.equal(
    getKnownCmpVendorName({ cookieNames: ["oai_consent_analytics"] }),
    "OpenAI first-party consent controls",
  );
});

test("detects Fides from canonical runtime markers without host inference", () => {
  assert.equal(getKnownCmpVendorName({ urls: ["https://www.nytimes.com/"] }), null);
  assert.equal(getKnownCmpVendorName({ domSelectors: ["#fides-banner"] }), "Fides");
  assert.equal(getKnownCmpVendorName({ cookieNames: ["fides_consent"] }), "Fides");
  assert.equal(getKnownCmpVendorName({ jsGlobals: ["Fides"] }), "Fides");
  assert.equal(isKnownCmpCookieName("fides_consent_tenant_a"), true);
});

test("detects Amazon Privacy Preferences from first-party consent evidence", () => {
  const [detection] = detectKnownCmps({
    urls: ["https://www.amazon.de/privacyprefs/retail/v3/banner?pagePath=%2F"],
    textSnippets: ["Cookies and Advertising Choices"],
  });

  assert.equal(detection?.canonicalName, "Amazon Privacy Preferences");
  assert.equal(detection?.confidence, 0.95);
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "script"));
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "alias" || signal.source === "text"));
});

test("detects Drupal EU Cookie Compliance from first-party runtime markers", () => {
  const [detection] = detectKnownCmps({
    cookieNames: ["cookie-agreed"],
    domSelectors: ["#sliding-popup"],
    jsGlobals: ["drupalSettings.eu_cookie_compliance"],
    urls: ["https://www.example.org/modules/contrib/eu_cookie_compliance/js/eu_cookie_compliance.js"],
  });

  assert.equal(detection?.canonicalName, "Drupal EU Cookie Compliance module, non-TCF");
  assert.equal(detection?.standards.length, 0);
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "global"));
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "script"));
});

test("detects Consentmanager by CDN script, cookies, globals, and labels", () => {
  assert.equal(getKnownCmpVendorForHost("cdn.consentmanager.net"), "Consentmanager");
  assert.equal(
    getKnownCmpVendorName({
      urls: ["https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"]
    }),
    "Consentmanager",
  );
  assert.equal(getKnownCmpVendorName({ cookieNames: ["__cmpconsent123"] }), "Consentmanager");
  assert.equal(getKnownCmpVendorName({ jsGlobals: ["__cmpapi"] }), "Consentmanager");
  assert.equal(isKnownCmpCookieName("__cmpconsentx456"), true);
  assert.equal(isKnownCmpInfrastructureUrl("https://cdn.consentmanager.net/delivery/cmp.php?id=abc123"), true);
  assert.equal(isKnownCmpVendorLabel("Consentmanager CMP"), true);
});

test("detects CookieYes by domains and consent cookie", () => {
  assert.equal(getKnownCmpVendorForHost("cdn-cookieyes.com"), "CookieYes");
  assert.equal(getKnownCmpVendorForHost("log.cookieyes.com"), "CookieYes");
  assert.equal(getKnownCmpVendorName({ cookieNames: ["cookieyes-consent"] }), "CookieYes");
  assert.equal(isKnownCmpCookieName("cookieyes-consent"), true);
});

test("does not infer CookieYes from an unrelated generic cky-prefixed class", () => {
  assert.equal(getKnownCmpVendorName({ domSelectors: [".cky-layout-shell"] }), null);
  assert.equal(getKnownCmpVendorName({ urls: ["https://example.test/assets/cky-layout.js"] }), null);
});

test("detects Orejime only from canonical runtime markers", () => {
  assert.equal(getKnownCmpVendorName({ cookieNames: ["orejime"] }), "Orejime");
  assert.equal(getKnownCmpVendorName({ domSelectors: ["div.orejime-Notice"] }), "Orejime");
  assert.equal(getKnownCmpVendorName({ jsGlobals: ["orejimeConfig"] }), "Orejime");
  assert.equal(
    getKnownCmpVendorName({ urls: ["https://example.test/eprivacy/orejime/configuration.js"] }),
    "Orejime",
  );
  assert.equal(getKnownCmpVendorName({ domSelectors: ["#cookie-notice"] }), null);
  assert.equal(getKnownCmpVendorName({ domSelectors: ["div.unrelated-consent-shell"] }), null);
});

test("detects DSGVO All in One and tarteaucitron from exact runtime markers", () => {
  assert.equal(
    getKnownCmpVendorName({
      domSelectors: ["#tarteaucitronRoot"],
      jsGlobals: ["tarteaucitron"],
      urls: ["https://example.test/wp-content/plugins/dsgvo-all-in-one/assets/js/dsgvoaio.js"],
    }),
    "DSGVO All in One / tarteaucitron",
  );
});

test("detects the distinct BST DSGVO Cookie notice plugin from retained runtime markers", () => {
  const [detection] = detectKnownCmps({
    domSelectors: ["a.bst-popup-link"],
    urls: [
      "https://example.test/wp-content/plugins/bst-dsgvo-cookie/includes/js/scripts.js?ver=1.0",
      "https://example.test/wp-content/plugins/bst-dsgvo-cookie/includes/js/bst-message.js?ver=1.0",
    ],
  });

  assert.equal(detection?.canonicalName, "BST DSGVO Cookie notice plugin, non-TCF");
  assert.deepEqual(detection?.standards, []);
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "script"));
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "dom"));
});

test("detects Cookiebot European consent infrastructure", () => {
  assert.equal(getKnownCmpVendorForHost("consent.cookiebot.eu"), "Cookiebot");
  assert.equal(getKnownCmpVendorForHost("consentcdn.cookiebot.eu"), "Cookiebot");
  assert.equal(isKnownCmpInfrastructureUrl("https://consentcdn.cookiebot.eu/uc.js"), true);
});

test("canonical CMP registry owns deterministic reject-control selectors", () => {
  const selectors = new Map(KNOWN_CMP_REGISTRY.map((entry) => [
    entry.canonicalName,
    entry.rejectControlSelectors ?? [],
  ]));
  assert.deepEqual(selectors.get("OneTrust"), [
    "#onetrust-reject-all-handler",
    "#onetrust-banner-sdk.ot-close-btn-link button.onetrust-close-btn-handler.banner-close-button",
  ]);
  assert.deepEqual(selectors.get("Fides"), [
    "#fides-banner button.fides-reject-all-button",
  ]);
  assert.deepEqual(selectors.get("Cookiebot"), [
    "#CybotCookiebotDialogBodyButtonDecline",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
  ]);
  assert.deepEqual(selectors.get("Usercentrics"), [
    'button[data-testid="uc-deny-all-button"]',
    "#uc-cmp-footer #deny",
  ]);
  assert.deepEqual(selectors.get("Google Funding Choices"), [
    "button.fc-cta-do-not-consent",
    'button[aria-label="Do not consent"]:has(.fc-button-label)',
  ]);
  assert.deepEqual(selectors.get("Seznam CMP"), [
    '[data-testid="button-reject"]',
  ]);
});

test("canonical CMP registry owns the fail-closed tarteaucitron necessary-only target", () => {
  const tarteaucitron = KNOWN_CMP_REGISTRY.find((entry) =>
    entry.canonicalName === "DSGVO All in One / tarteaucitron"
  );
  assert.deepEqual(tarteaucitron?.necessaryOnlyControlTargets, [{
    bannerSelector: "#tarteaucitronAlertBig",
    controlSelector: "#tarteaucitronCloseAlert",
    disallowedCheckedSelector:
      "#tarteaucitronRoot input:checked:not(#dsgvoaio-checkbox-essentials)",
    expectedNormalizedLabel: "auswahl speichern",
    requiredCheckedSelector: "#dsgvoaio-checkbox-essentials:checked",
  }]);
});

test("detects Usercentrics service domains", () => {
  assert.equal(getKnownCmpVendorForHost("app.usercentrics.eu"), "Usercentrics");
  assert.equal(getKnownCmpVendorForHost("api.usercentrics.eu"), "Usercentrics");
  assert.equal(getKnownCmpVendorForHost("consent-api.service.consent.usercentrics.eu"), "Usercentrics");
});

test("detects Seznam CMP infrastructure by host, URL, and cookie", () => {
  assert.equal(getKnownCmpVendorForHost("cmp.seznam.cz"), "Seznam CMP");
  assert.equal(getKnownCmpVendorForHost("cmp.seznamzpravy.cz"), "Seznam CMP");
  assert.equal(
    getKnownCmpVendorName({
      urls: ["https://cmp.seznamzpravy.cz/cmp.js"],
      cookieNames: ["sznlbr"],
    }),
    "Seznam CMP",
  );
  assert.equal(isKnownCmpInfrastructureUrl("https://cmp.seznam.cz/static/cmp.js"), true);
  assert.equal(isKnownCmpCookieName("sznlbr"), true);
});

test("detects Transcend and Airgap consent infrastructure", () => {
  assert.equal(getKnownCmpVendorForHost("transcend-cdn.com"), "Transcend");
  assert.equal(getKnownCmpVendorForHost("privacy-center-api.transcend.io"), "Transcend");
  assert.equal(getKnownCmpVendorName({ urls: ["https://cdn.transcend-cdn.com/cm/airgap.js"] }), "Transcend");
  assert.equal(getKnownCmpVendorName({ jsGlobals: ["window.airgap"] }), "Transcend");
});

test("detects Wave 10 CMP infrastructure through canonical CMP definitions", () => {
  assert.equal(getKnownCmpVendorForHost("cookie-cdn.cookiepro.com"), "OneTrust");
  assert.equal(getKnownCmpVendorForHost("cmp.inmobi.com"), "InMobi Choice");
  assert.equal(getKnownCmpVendorForHost("cdn.ketchjs.com"), "Ketch");
  assert.equal(
    getKnownCmpVendorName({ urls: ["https://cmp.inmobi.com/choice/site/choice.js"] }),
    "InMobi Choice",
  );
  assert.equal(
    getKnownCmpVendorName({ urls: ["https://cdn.ketchjs.com/plugins/v1/tcf/stub.js"] }),
    "Ketch",
  );
});

test("classifies CMP infrastructure while preserving attribution signals", () => {
  const [detection] = detectKnownCmps({
    cookieNames: ["OptanonConsent"],
    domains: ["cdn.cookielaw.org"],
    urls: ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"]
  });

  assert.equal(detection?.canonicalName, "OneTrust");
  assert.equal(detection?.isCmpInfrastructure, true);
  assert.equal(detection?.evidenceTreatment, "cmp_infrastructure");
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "cookie" && signal.value === "OptanonConsent"));
  assert.equal(isKnownCmpInfrastructureUrl("https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"), true);
});

test("detects OneTrust tenant-suffixed canonical consent cookies", () => {
  const detection = detectKnownCmps({
    cookieNames: ["OptanonConsent_mUOxXq", "OptanonAlertBoxClosed_mUOxXq"],
  }).find((candidate) => candidate.canonicalName === "OneTrust");

  assert.equal(detection?.canonicalName, "OneTrust");
  assert.ok(detection?.matchedSignals.some((signal) =>
    signal.source === "cookie" && signal.value === "OptanonConsent_mUOxXq"
  ));
});

test("does not treat generic TCF protocol globals as vendor identity", () => {
  assert.equal(getKnownCmpVendorName({ jsGlobals: ["__tcfapi"] }), null);

  const didomi = detectKnownCmps({
    cookieNames: ["didomi_token"],
    domSelectors: ["#didomi-host"],
    jsGlobals: ["__tcfapi", "Didomi"],
    urls: ["https://sdk.privacy-center.org/sdk/example.js"]
  });
  assert.equal(didomi[0]?.canonicalName, "Didomi");
  assert.equal(didomi.some((detection) => detection.canonicalName === "Consentmanager"), false);

  const oneTrust = detectKnownCmps({
    cookieNames: ["OptanonConsent"],
    domSelectors: ["#onetrust-banner-sdk"],
    jsGlobals: ["__tcfapi", "OneTrust"],
    urls: ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"]
  });
  assert.equal(oneTrust[0]?.canonicalName, "OneTrust");
});

test("recognizes canonical and alias CMP labels", () => {
  assert.equal(isKnownCmpVendorLabel("CookiePro"), true);
  assert.equal(isKnownCmpVendorLabel("Transcend Consent Management"), true);
  assert.equal(isKnownCmpVendorLabel("Unknown Analytics"), false);
});

test("does not infer TrustArc from JavaScript trustedTypes prose", () => {
  assert.equal(getKnownCmpVendorName({
    textSnippets: ["let policy = globalThis.trustedTypes?.createPolicy('safe', rules);"],
  }), null);
  assert.equal(getKnownCmpVendorName({
    textSnippets: ["Privacy preferences are provided by TRUSTe."],
  }), "TrustArc");
  assert.equal(getKnownCmpVendorName({
    urls: ["https://consent.trustarc.com/notice.js"],
  }), "TrustArc");
});

test("detects first-party Borlabs Cookie runtime signals", () => {
  const [detection] = detectKnownCmps({
    domSelectors: ["#BorlabsCookieBox"],
    jsGlobals: ["BorlabsCookie"],
    urls: ["https://example.test/wp-content/plugins/borlabs-cookie/assets/javascript/borlabs-cookie.min.js"],
  });

  assert.equal(detection?.canonicalName, "Borlabs Cookie");
  assert.equal(detection?.confidence, 0.95);
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "global"));
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "dom"));
  assert.ok(detection?.matchedSignals.some((signal) => signal.source === "script"));
});

test("keeps Snowplow analytics identifiers separate from Sourcepoint consent identifiers", () => {
  assert.equal(isKnownCmpCookieName("_sp_id.498b"), false);
  assert.equal(isKnownCmpCookieName("_sp_ses.498b"), false);
  assert.equal(isKnownCmpCookieName("_sp_su"), true);
  assert.equal(isKnownCmpCookieName("_sp_v1_data"), true);
  assert.equal(getKnownCmpVendorName({ cookieNames: ["_sp_user_consent_123"] }), "Sourcepoint");
});

test("attributes cookielawinfo plugin cookies to CookieYes rather than OneTrust", () => {
  assert.equal(getKnownCmpVendorName({ cookieNames: ["cookielawinfo-checkbox-analytics"] }), "CookieYes");
  assert.equal(getKnownCmpVendorName({ cookieNames: ["cookielawinfo-checkbox-necessary"] }), "CookieYes");
  assert.equal(getKnownCmpVendorName({ labels: ["cookielawinfo-checkbox-analytics"] }), null);
});

test("action capability matrix qualifies every target CMP for bounded Accept and Reject", () => {
  for (const canonicalName of [
    "Consentmanager",
    "HubSpot Consent Banner",
    "Ketch",
    "Cookie Information",
    "Iubenda",
    "InMobi Choice",
    "Quantcast Choice",
    "Termly",
    "Transcend",
  ]) {
    assert.equal(getKnownCmpActionCapability(canonicalName, "accept")?.recipeAvailable, true);
    assert.equal(getKnownCmpActionCapability(canonicalName, "reject")?.recipeAvailable, true);
  }
});
