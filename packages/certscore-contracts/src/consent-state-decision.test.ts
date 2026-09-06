import assert from "node:assert/strict";
import test from "node:test";
import { decodeCanonicalConsentDecision as decode } from "./consent-state-decision.js";

test("generic decisions require a whole-state key and exact semantic value", () => {
  assert.equal(decode("consent", "granted"), "granted");
  assert.equal(decode("consent_state", "necessary-only"), "denied");
  for (const [key, value] of [["analytics-consent", "denied"], ["consent", "false"], ["consent", "0"],
    ["receipt", "rejected"], ["consent", "acknowledged"], ["consent", '{"analytics":false}'],
    ["consent", "status:denied,receipt:123"], ["consent", "x".repeat(2049)]]) {
    assert.equal(decode(key!, value!), "unknown", `${key}: ${value?.slice(0, 50)}`);
  }
  assert.equal(decode("registered-cmp-state", "necessary-only", true), "denied");
  assert.equal(decode("registered-cmp-state", "receipt-updated", true), "unknown");
});

test("CookieYes category decisions override receipt and action metadata", () => {
  assert.equal(decode("cookieyes-consent", "consentid:123,consent:yes,action:yes,necessary:yes,analytics:no,advertisement:no"), "denied");
  assert.equal(decode("cookieyes-consent", "analytics:yes,advertisement:yes,functional:yes"), "granted");
  assert.equal(decode("cookieyes-consent", "analytics:no,advertisement:yes"), "mixed");
  for (const value of ["consentid:123,action:yes", "analytics:no", "analytics:no,advertisement:no,custom:no", "analytics:yes,analytics:no,advertisement:no"]) {
    assert.equal(decode("cookieyes-consent", value), "unknown");
  }
});

test("OneTrust ignores always-active groups but rejects unknown and duplicate category identities", () => {
  assert.equal(decode("OptanonConsent", "groups=C0001:1,C0002:0,C0003:0,C0004:0"), "denied");
  assert.equal(decode("OptanonConsent", "groups=C0001:1,C0002:1,C0004:1"), "granted");
  assert.equal(decode("OptanonConsent", "groups=C0001:1,C0002:0,C0004:1"), "mixed");
  for (const value of ["groups=C0001:1", "groups=C0001:1,C0999:0", "groups=C0002:1,C0002:0", "groups=C0002:0&groups=C0004:0"]) {
    assert.equal(decode("OptanonConsent", value), "unknown");
  }
});

test("Cookiebot requires the complete bounded flat category state without duplicate fields", () => {
  assert.equal(decode("CookieConsent", "{stamp:'abc',necessary:true,preferences:false,statistics:false,marketing:false,ver:1}"), "denied");
  assert.equal(decode("CookieConsent", '{"preferences":true,"statistics":true,"marketing":true}'), "granted");
  assert.equal(decode("CookieConsent", '{"preferences":false,"statistics":true,"marketing":false}'), "mixed");
  for (const value of ['{"statistics":false}', '{"preferences":false,"statistics":false,"marketing":false,"marketing":true}',
    '{"preferences":false,"statistics":false,"marketing":false,"extra":{"marketing":true}}',
    '{"preferences":false,"statistics":false,"marketing":false,"\\u006darketing":true}',
    "{preferences:false,statistics:false,marketing:(()=>true)()}"]) {
    assert.equal(decode("CookieConsent", value), "unknown");
  }
});
