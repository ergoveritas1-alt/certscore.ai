import assert from "node:assert/strict";
import test from "node:test";
import { explicitAdvertisingBrowsingAssent, explicitAdvertisingBrowsingAssentV2 } from "./gdpr-narrow-posture";

const purpose = "We use cookies to personalize content and ads. ";
const reverse = "You consent to our cookies if you click “OK” or continue to use our website.";

test("versioned reversed cookie-assent grammar binds its affirmative advertising purpose", () => {
  assert.equal(explicitAdvertisingBrowsingAssent(purpose + reverse), null);
  assert.ok(explicitAdvertisingBrowsingAssentV2(purpose + reverse));
  assert.ok(explicitAdvertisingBrowsingAssentV2("We use cookies for advertising. By continuing to use this site, you agree to our use of cookies."));
});

for (const [name, text] of [
  ["click AND continue", purpose + "You consent to our cookies if you click OK and continue to use our website."],
  ["only after clicking", purpose + "You consent to our cookies if you click OK or continue to use our website only after clicking Accept."],
  ["negation", purpose + "You do not consent to our cookies if you click OK or continue to use our website."],
  ["necessary only", "We use only necessary cookies. " + reverse],
  ["analytics only", "We use cookies for analytics. " + reverse],
  ["conditional advertising", "We use cookies for advertising if you opt in. " + reverse],
  ["quoted example", "For example, " + purpose + reverse],
  ["historical", "Previously, " + purpose + reverse],
  ["policy object", "We use cookies for advertising. By continuing to use this site, you agree to our Cookie Policy."],
  ["terms plus policy", "We use cookies for advertising. By continuing to use this site, you agree to our Terms of Service and our Cookie Policy."],
  ["qualified policy object", "We use cookies for advertising. By continuing to use this site, you agree to our updated Cookie Policy."],
  ["policy applies", "We use cookies for advertising. By continuing to use this site, you agree that our Cookie Policy applies."],
  ["no independently sufficient continuation", purpose + "You consent to our cookies if you click OK. You can continue to use our website without consent."],
  ["inaction", purpose + "By not opting out, you consent to this use."],
  ["close action", purpose + "Closing this banner accepts all cookies."],
  ["beyond bound", "x".repeat(1200) + purpose + reverse],
] as const) test(`v2 excludes ${name}`, () => assert.equal(explicitAdvertisingBrowsingAssentV2(text), null));

test("v1 historical policy-object interpretation is preserved while v2 rejects new promotion", () => {
  const text = "We use cookies for advertising. By continuing to use this site, you agree to our Cookie Policy.";
  assert.ok(explicitAdvertisingBrowsingAssent(text));
  assert.equal(explicitAdvertisingBrowsingAssentV2(text), null);
});
