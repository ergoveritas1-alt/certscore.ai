import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_CMP_REGISTRY,
  detectKnownCmps,
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
    "TrustArc",
    "Usercentrics",
    "Consentmanager",
    "Cookiebot",
    "CookieYes",
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

test("recognizes canonical and alias CMP labels", () => {
  assert.equal(isKnownCmpVendorLabel("CookiePro"), true);
  assert.equal(isKnownCmpVendorLabel("Transcend Consent Management"), true);
  assert.equal(isKnownCmpVendorLabel("Unknown Analytics"), false);
});
