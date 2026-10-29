import assert from "node:assert/strict";
import test from "node:test";
import {resolveCanonicalVendor, resolveVendorObservations, type VendorResolverInput} from "./index";

test("reviewed CMP identity signatures retain canonical provenance and no tracking purpose",()=>{
  for (const [input,vendor] of [
    [{type:"cookie",cookieName:"CookieScriptConsent"},"CookieScript"],
    [{type:"cmp_runtime",domSelector:"#cookiescript_accept"},"CookieScript"],
    [{type:"script",url:"https://cdn.cookie-script.com/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"},"CookieScript"],
    [{type:"cmp_runtime",domSelector:"div.cmplz-buttons button"},"Complianz"],
    [{type:"cmp_runtime",domSelector:".cmplz-cookiebanner"},"Complianz"],
    [{type:"cookie",cookieName:"cookiehub"},"CookieHub"],
    [{type:"cmp_runtime",globalName:"cookiehub"},"CookieHub"],
  ] as Array<[VendorResolverInput,string]>) {
    const r=resolveCanonicalVendor({...input,evidenceId:"retained-marker",evidenceRef:{refId:"ref-marker",eventId:"retained-marker",eventType:"cmp_runtime_probe"}});
    assert.equal(r.status,"resolved",JSON.stringify(input));assert.equal(r.observation?.vendor,vendor);
    assert.equal(r.observation?.purpose,"consent_management");assert.ok(r.observation?.registryAttribution?.ruleIds.length);
    assert.ok(r.observation?.matchedEvidenceRefs.some(ref=>ref.refId==="ref-marker"));
  }
});
test("unbound shared protocol and spoofed provider markers cannot identify a vendor",()=>{
  for (const input of [
    {type:"cookie",cookieName:"euconsent-v2"},{type:"cmp_runtime",storageKey:"euconsent-v2"},
    {type:"cookie",cookieName:"cookieConsent"},{type:"cookie",cookieName:"CookieScriptConsent-copy"},
    {type:"cmp_runtime",domSelector:"#cookiescript_accept-copy"},{type:"cmp_runtime",domSelector:".cmplz-buttons-copy"},
    {type:"cmp_runtime",globalName:"mycookiehubHelper"},
    {type:"script",url:"https://cdn.cookie-script.com.evil.test/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"},
    {type:"script",url:"https://cdn.cookie-script.com/unrelated.js"},
  ] as VendorResolverInput[]) assert.equal(resolveVendorObservations([input]).length,0,JSON.stringify(input));
  assert.equal(resolveCanonicalVendor({type:"cookie",cookieName:"CookieConsent"}).observation?.vendor,"Cookiebot");
});

test("expanded CMP markers resolve one consent-management service with reviewed attribution", () => {
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
    const result = resolveCanonicalVendor({type: "cmp_runtime", domSelector: selector,
      evidenceId: "source-bound-marker", evidenceRef: {refId: "expanded-marker", eventId: "source-bound-marker", eventType: "cmp_runtime_probe"}});
    assert.equal(result.status, "resolved", selector);
    assert.equal(result.observation?.vendor, name === "Shopify Customer Privacy" ? "Shopify" : name, selector);
    assert.equal(result.observation?.purpose, "consent_management");
    assert.ok(result.observation?.registryAttribution?.ruleIds.length);
    assert.ok(result.observation?.matchedEvidenceRefs.some(ref => ref.refId === "expanded-marker"));
    assert.equal(resolveCanonicalVendor({type: "cmp_runtime", domSelector: `${selector}-copy`}).status, "unrecognized", selector);
  }
});

test("shared integration receipts and generic containers do not imply a new named CMP", () => {
  for (const selector of ["div.cn-buttons button", "div.cn-ok a", "div.cc-compliance a", "div.ch2-dialog-actions button", "#ccc",
    "#ppms_cm_unknown", "#wpconsent-unknown", "#shopify-pc__unknown", "div.actions button"]) {
    assert.equal(resolveCanonicalVendor({type: "cmp_runtime", domSelector: selector}).status, "unrecognized", selector);
  }
  assert.notEqual(resolveCanonicalVendor({type: "cookie", cookieName: "ppms_privacy_a855f15c-33d2-4e2d-a1b0-cfe6153206d0"}).observation?.purpose, "consent_management");
  assert.notEqual(resolveCanonicalVendor({type: "cmp_runtime", globalName: "Shopify"}).observation?.purpose, "consent_management");
});
