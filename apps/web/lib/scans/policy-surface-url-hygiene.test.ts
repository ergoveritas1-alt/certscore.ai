import assert from "node:assert/strict";
import test from "node:test";

import { isGenericBrowserCookieHelpUrl } from "./policy-surface-url-hygiene";

test("isGenericBrowserCookieHelpUrl filters Fandango-style Microsoft Edge cookie help false positives", () => {
  assert.equal(
    isGenericBrowserCookieHelpUrl(
      "https://support.microsoft.com/en-us/windows/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use-168dab11-0753-043d-7c16-ede5947fc64d"
    ),
    true
  );
});

test("isGenericBrowserCookieHelpUrl filters common browser vendor cookie help pages", () => {
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.google.com/chrome/answer/95647/cookies?hl=en"), true);
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"), true);
  assert.equal(isGenericBrowserCookieHelpUrl("https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac"), true);
});

test("isGenericBrowserCookieHelpUrl keeps owned cookie policies eligible", () => {
  assert.equal(isGenericBrowserCookieHelpUrl("https://www.fandango.com/policies/cookie-policy"), false);
  assert.equal(isGenericBrowserCookieHelpUrl("https://privacy.microsoft.com/en-us/privacystatement"), false);
});
