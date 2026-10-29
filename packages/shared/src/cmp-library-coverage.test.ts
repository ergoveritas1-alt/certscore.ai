import assert from "node:assert/strict";
import test from "node:test";
import {detectKnownCmps, getKnownCmpActionCapability, isKnownCmpCookieName} from "./known-cmps";

const first = (input: Parameters<typeof detectKnownCmps>[0]) => detectKnownCmps(input)[0]?.canonicalName;
test("retained CookieScript and Complianz controls resolve exact identities without named action grants", () => {
  for (const [selector, expected] of [
    ["#cookiescript_accept", "CookieScript"], ["#cookiescript_reject", "CookieScript"],
    ["#cookiescript_injected", "CookieScript"], ["div.cmplz-buttons button", "Complianz"],
    [".cmplz-cookiebanner", "Complianz"],
  ]) assert.equal(first({domSelectors:[selector!]}), expected);
  assert.equal(first({cookieNames:["CookieScriptConsent"]}), "CookieScript");
  assert.equal(first({cookieNames:["cookiehub"]}), "CookieHub");
  assert.equal(first({jsGlobals:["cookiehub"]}), "CookieHub");
  for (const name of ["CookieScript", "Complianz", "CookieHub"]) for (const action of ["accept", "reject"] as const) {
    assert.equal(getKnownCmpActionCapability(name,action)?.recipeAvailable, false);
    assert.equal(getKnownCmpActionCapability(name,action)?.selectorRegistered, false);
  }
});
test("generic selectors, protocol cookies and lookalikes do not name a CMP", () => {
  for (const selector of ['[data-testid="MicroCookieAcceptButton"]','[data-testid="cookie-accept-all"]',
    'div.consent-banner button', 'div.box__Box-sc-1195mmx-0.consent-banner___StyledBox2-ex570r-2 button',
    '#cookiescript_accept-copy','.cmplz-buttons-example','div.cmplz-unknown button']) {
    assert.deepEqual(detectKnownCmps({domSelectors:[selector]}), [], selector);
  }
  for (const cookie of ["cookieConsent","cookiehub-copy","CookieScriptConsent-copy","euconsent-v2"]) {
    assert.deepEqual(detectKnownCmps({cookieNames:[cookie]}), [],cookie);
  }
  assert.equal(isKnownCmpCookieName("euconsent-v2"),true,"framework cookie remains CMP infrastructure without a guessed provider");
  assert.deepEqual(detectKnownCmps({storageKeys:["euconsent-v2","cookieConsent"]}), []);
  assert.deepEqual(detectKnownCmps({jsGlobals:["__tcfapi","__gpp","mycookiehubHelper","NotCookieScript"]}), []);
});
test("specific existing provider markers survive ambiguity tightening", () => {
  for (const selector of ['#usercentrics-root','[data-testid*=\'uc-\' i]','button[data-testid="uc-accept-all-button"]']) assert.equal(first({domSelectors:[selector]}),"Usercentrics",selector);
  for (const selector of ['[data-termly-part="consent-banner"]',"[id*='termly' i]",'#termly-code-snippet-support']) assert.equal(first({domSelectors:[selector]}),"Termly",selector);
  assert.equal(first({cookieNames:["CookieConsent"]}),"Cookiebot");
  assert.equal(first({cookieNames:["euconsent-v2","didomi_token"]}),"Didomi");
});

// These selectors identify infrastructure only; action eligibility is independently registered.
test("expanded reviewed CMP markers preserve exact identity and passive-only capabilities", () => {
  const cases = [
  [
    "#ccc-notify-accept",
    "CIVIC Cookie Control"
  ],
  [
    "#ccc-notify-reject",
    "CIVIC Cookie Control"
  ],
  [
    "#ccc-recommended-settings",
    "CIVIC Cookie Control"
  ],
  [
    "#ccc-reject-settings",
    "CIVIC Cookie Control"
  ],
  [
    "#ccc-module",
    "CIVIC Cookie Control"
  ],
  [
    "#ccc-notify",
    "CIVIC Cookie Control"
  ],
  [
    "#PiwikPROConsentForm-container",
    "Piwik PRO Consent Manager"
  ],
  [
    "#PiwikPROConsentForm-agree-to-all",
    "Piwik PRO Consent Manager"
  ],
  [
    "#PiwikPROConsentForm-reject-all",
    "Piwik PRO Consent Manager"
  ],
  [
    "#ppms_cm_popup_overlay",
    "Piwik PRO Consent Manager"
  ],
  [
    "#ppms_cm_agree-to-all",
    "Piwik PRO Consent Manager"
  ],
  [
    "#ppms_cm_reject-all",
    "Piwik PRO Consent Manager"
  ],
  [
    "#wpconsent-container",
    "WPConsent"
  ],
  [
    "#wpconsent-accept-all",
    "WPConsent"
  ],
  [
    "#wpconsent-cancel-all",
    "WPConsent"
  ],
  [
    "#wpconsent-preferences-all",
    "WPConsent"
  ],
  [
    "#shopify-pc__banner",
    "Shopify Customer Privacy"
  ],
  [
    "#shopify-pc__banner__btn-accept",
    "Shopify Customer Privacy"
  ],
  [
    "#shopify-pc__banner__btn-decline",
    "Shopify Customer Privacy"
  ],
  [
    ".klaro",
    "Klaro"
  ],
  [
    "#ensAcceptAll",
    "Ensighten Privacy"
  ],
  [
    "#ensRejectAll",
    "Ensighten Privacy"
  ],
  [
    ".ch2-container",
    "CookieHub"
  ],
  [
    ".ch2-dialog",
    "CookieHub"
  ]
] as const;
  for (const [selector, name] of cases) {
    assert.equal(first({ domSelectors: [selector] }), name, selector);
    assert.equal(first({ domSelectors: [`section > div${selector} button`] }), name === "Ensighten Privacy" ? undefined : name);
    assert.deepEqual(detectKnownCmps({ domSelectors: [`${selector}-copy`] }), [], `${selector} prefix collision`);
    for (const action of ["accept", "reject"] as const) {
      assert.equal(getKnownCmpActionCapability(name, action)?.recipeAvailable, false);
      assert.equal(getKnownCmpActionCapability(name, action)?.selectorRegistered, false);
    }
  }
});

test("unresolved short classes and integration cookies cannot borrow a provider identity", () => {
  for (const selector of ["div.cn-buttons button", "div.cn-ok a", "div.cc-compliance a",
    "div.ch2-dialog-actions button", "#ccc", "#ppms_cm_unknown", "#shopify-pc__unknown", "#wpconsent-unknown",
    "div.actions button", "div.button-group button", "#ensAcceptAll-copy"]) {
    assert.deepEqual(detectKnownCmps({ domSelectors: [selector] }), [], selector);
  }
  assert.deepEqual(detectKnownCmps({ cookieNames: ["ppms_privacy_a855f15c-33d2-4e2d-a1b0-cfe6153206d0", "_shopify_essential"] }), []);
});
